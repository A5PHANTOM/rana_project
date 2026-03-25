from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from ultralytics import YOLO
import os
import cv2
import numpy as np
import base64
import uuid
from datetime import datetime
from sqlmodel import Session

from database import engine
from app.db.models import AuditLog
from app.api.websocket import notifier

# Import your route modules
from app.api import auth, admin, teacher, websocket

app = FastAPI(title="Discipline Monitor API")

# --- 🚀 YOLOv8 Initialization (Mac M2 Optimized) ---
# Using the Nano model for maximum FPS on Apple Silicon
model = YOLO('yolov8n.pt') 

PHONE_CLASS_ID = 67
PERSON_CLASS_ID = 0


def _box_iou(a, b):
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)
    inter_w = max(0.0, inter_x2 - inter_x1)
    inter_h = max(0.0, inter_y2 - inter_y1)
    inter = inter_w * inter_h
    if inter <= 0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _dedupe_phone_boxes(candidates, iou_threshold=0.45):
    """Simple NMS-style dedupe to keep the strongest overlapping phone boxes."""
    if not candidates:
        return []

    kept = []
    for cand in sorted(candidates, key=lambda p: p["conf"], reverse=True):
        cand_box = (cand["x"], cand["y"], cand["x"] + cand["w"], cand["y"] + cand["h"])
        overlaps = False
        for existing in kept:
            existing_box = (
                existing["x"], existing["y"],
                existing["x"] + existing["w"],
                existing["y"] + existing["h"]
            )
            if _box_iou(cand_box, existing_box) >= iou_threshold:
                overlaps = True
                break
        if not overlaps:
            kept.append(cand)
    return kept

# --- 📁 Static Files (Evidence Storage) ---
# Ensure the folder exists and is mounted so Flutter can load images
os.makedirs("uploads/evidence", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# --- 🌐 CORS Middleware ---
# Allows your React Admin panel to communicate with the FastAPI server
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
] 

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    # Allow private-network/dev origins so frontend opened from another
    # device (e.g., http://192.168.x.x:5173) can call this API.
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?$",
    allow_credentials=True, 
    allow_methods=["*"], 
    allow_headers=["*"], 
)

# --- 🧠 AI Detection Endpoint ---
@app.post("/api/admin/detect")
async def detect_objects(data: dict):
    """
    Receives frame from ESP32, runs YOLOv8 detection, 
    broadcasts to all connected admin/teacher WebSockets
    """
    try:
        # Normalize class_id to string so relay keys match subscriber connections
        class_id = str(data.get('class_id', 'default'))  # Which classroom
        print(f"\n🎬 [/api/admin/detect] Received frame for class: {class_id}")
        
        header, encoded = data['image'].split(",", 1)
        nparr = np.frombuffer(base64.b64decode(encoded), np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        # 🛠️ ESP32-friendly preprocessing: boost contrast & mild sharpen
        # Improves small-object visibility from compressed streams
        try:
            lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
            cl = clahe.apply(l)
            limg = cv2.merge((cl, a, b))
            frame = cv2.cvtColor(limg, cv2.COLOR_LAB2BGR)
            frame = cv2.addWeighted(frame, 1.15, cv2.GaussianBlur(frame, (0, 0), 1.0), -0.15, 0)
        except Exception:
            pass

        # Pass 1: detect only people and phones on full frame.
        results = model.predict(
            frame,
            conf=0.14,
            iou=0.45,
            imgsz=1280,
            classes=[PERSON_CLASS_ID, PHONE_CLASS_ID],
            agnostic_nms=True,
            max_det=120,
            device='mps',
            verbose=False
        )

        person_boxes = []
        phone_candidates = []
        total_boxes = 0
        h_img, w_img = frame.shape[:2]

        for r_idx, r in enumerate(results):
            for bidx, box in enumerate(r.boxes):
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                cls_id = int(box.cls[0])
                conf = float(box.conf[0])
                total_boxes += 1
                print(
                    f"  [box] result:{r_idx} box:{bidx} cls:{cls_id} "
                    f"conf:{conf:.3f} coords:{x1:.1f},{y1:.1f},{x2:.1f},{y2:.1f}"
                )

                if cls_id == PERSON_CLASS_ID:
                    person_boxes.append((x1, y1, x2, y2, conf))
                elif cls_id == PHONE_CLASS_ID:
                    phone_candidates.append({
                        "x": x1,
                        "y": y1,
                        "w": x2 - x1,
                        "h": y2 - y1,
                        "class": "cell phone",
                        "conf": conf,
                    })

        person_count = len(person_boxes)

        # Pass 2: zoom into person regions to recover small/partial phones.
        # This improves recall when phone size is too small in the full frame.
        if person_boxes:
            persons_for_roi = sorted(
                person_boxes,
                key=lambda p: (p[2] - p[0]) * (p[3] - p[1]),
                reverse=True
            )[:6]

            for px1, py1, px2, py2, _ in persons_for_roi:
                pw = px2 - px1
                ph = py2 - py1
                ex = 0.28
                ey = 0.28
                rx1 = int(max(0, px1 - pw * ex))
                ry1 = int(max(0, py1 - ph * ey))
                rx2 = int(min(w_img, px2 + pw * ex))
                ry2 = int(min(h_img, py2 + ph * ey))

                if rx2 - rx1 < 40 or ry2 - ry1 < 40:
                    continue

                roi = frame[ry1:ry2, rx1:rx2]
                try:
                    roi_results = model.predict(
                        roi,
                        conf=0.08,
                        iou=0.50,
                        imgsz=960,
                        classes=[PHONE_CLASS_ID],
                        agnostic_nms=True,
                        max_det=15,
                        device='mps',
                        verbose=False
                    )
                    for rr in roi_results:
                        for box in rr.boxes:
                            bx1, by1, bx2, by2 = box.xyxy[0].tolist()
                            conf = float(box.conf[0])
                            gx1 = float(rx1 + bx1)
                            gy1 = float(ry1 + by1)
                            gx2 = float(rx1 + bx2)
                            gy2 = float(ry1 + by2)
                            phone_candidates.append({
                                "x": gx1,
                                "y": gy1,
                                "w": gx2 - gx1,
                                "h": gy2 - gy1,
                                "class": "cell phone",
                                "conf": min(0.99, conf * 0.96),
                            })
                except Exception as roi_err:
                    print(f"  ⚠️ ROI phone pass error: {roi_err}")

        # Filter tiny boxes and dedupe overlapping detections.
        min_area = 0.00012 * w_img * h_img
        phone_candidates = [
            p for p in phone_candidates
            if (p["w"] * p["h"]) >= min_area and p["conf"] >= 0.10
        ]
        predictions = _dedupe_phone_boxes(phone_candidates, iou_threshold=0.45)

        print(f"  Detection produced {total_boxes} raw boxes; filtered to {len(predictions)} phone predictions")

        # 🚀 BROADCAST to all connected WebSocket clients watching this class
        frame_data = {
            "type": "frame",
            "class_id": class_id,
            "image": data['image'],  # base64 image
            "predictions": predictions
        }
        
        from app.api.websocket import get_stream_relay
        relay = get_stream_relay(class_id)
        print(f"  Broadcasting to relay... (subscribers: {len(relay.subscribers)})")
        await relay.broadcast_frame(frame_data)

        # 🔔 AUTO-NOTIFY & SAVE EVIDENCE when phone detected
        # Lower alert threshold to 0.25 to improve recall on partial views
        phone = next((p for p in predictions if p.get("class") == 'cell phone' and p.get("conf", 0) > 0.18), None)
        if phone:
            try:
                teacher_id = data.get('teacher_id', '1')
                # Save evidence: full frame and cropped phone region
                os.makedirs("uploads/evidence", exist_ok=True)
                # Full frame
                filename = f"auto_{uuid.uuid4().hex[:8]}.jpg"
                full_path = os.path.join("uploads/evidence", filename)
                encoded = data['image'].split(",", 1)[1] if "," in data['image'] else data['image']
                with open(full_path, "wb") as f:
                    f.write(base64.b64decode(encoded))
                db_path = f"uploads/evidence/{filename}"

                # Crop phone region
                try:
                    x, y, w, h = int(phone["x"]), int(phone["y"]), int(phone["w"]), int(phone["h"])
                    h_img, w_img = frame.shape[:2]
                    x0 = max(0, x)
                    y0 = max(0, y)
                    x1 = min(w_img, x + w)
                    y1 = min(h_img, y + h)
                    crop = frame[y0:y1, x0:x1]
                    crop_name = f"auto_crop_{uuid.uuid4().hex[:8]}.jpg"
                    crop_path = os.path.join("uploads/evidence", crop_name)
                    cv2.imwrite(crop_path, crop)
                    crop_db_path = f"uploads/evidence/{crop_name}"
                except Exception:
                    crop_db_path = None
                # Log to DB
                with Session(engine) as session:
                    log = AuditLog(
                        class_id=int(class_id) if class_id.isdigit() else None,
                        detail="AI Detection: Mobile Phone",
                        evidence_url=db_path,
                        timestamp=datetime.utcnow()
                    )
                    session.add(log)
                    session.commit()

                # Push alert to teacher and admin mirror
                await notifier.send_alert(teacher_id, {
                    "message": "🚨 AI Detection: Mobile Phone",
                    "detail": "AI Detection: Mobile Phone",
                    "image_url": f"http://localhost:8000/{db_path}",
                    "image_path": f"http://localhost:8000/{db_path}",
                    "crop_url": f"http://localhost:8000/{crop_db_path}" if crop_db_path else None,
                    "timestamp": datetime.utcnow().isoformat(),
                    "class_id": class_id
                })
                print("  ✅ Auto alert and evidence saved")
            except Exception as log_err:
                print(f"  ⚠️ Auto-log failed: {log_err}")

        # 🔔 Suspicious activity (simple heuristic): overcrowding
        if person_count >= 6:
            try:
                teacher_id = data.get('teacher_id', '1')
                await notifier.send_alert(teacher_id, {
                    "message": "⚠️ Suspicious: Overcrowding detected",
                    "detail": f"Detected {person_count} people in frame",
                    "timestamp": datetime.utcnow().isoformat(),
                    "class_id": class_id
                })
                print("  ⚠️ Suspicious activity alert sent (overcrowding)")
            except Exception as sus_err:
                print(f"  ⚠️ Suspicious alert failed: {sus_err}")

        return {"predictions": predictions, "broadcast": True, "evidence_url": f"http://localhost:8000/{db_path}" if phone else None}
    except Exception as e:
        print(f"❌ Detect error: {e}")
        return {"error": str(e), "predictions": []}

# --- 🔌 Include Routers ---
# Standard API routes
app.include_router(auth.router, prefix="/api/auth")
app.include_router(admin.router, prefix="/api/admin") 
app.include_router(teacher.router, prefix="/api/teacher") 

# 🚨 THE FIX: Mounting the WebSocket router with the prefix matched in Flutter
# This resolves the "Not Upgraded to WebSocket" error.
app.include_router(websocket.router, prefix="/api/websocket")

@app.get("/")
def read_root():
    return {"message": "Discipline Monitor API is running with YOLOv8 (MPS Optimized)"}