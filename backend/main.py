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

        # Performance: tuned for better recall on phone backs/sides
        # - imgsz 960 for higher resolution crops
        # - conf 0.15 to keep more candidates
        # - classes=None (let model output everything; we filter manually)
        # Revert to stable baseline that worked previously: nano model, reasonable conf
        # Improve phone detection accuracy:
        # - focus on COCO class 67 (cell phone) to avoid spurious labels
        # - use larger input size (960) for better small-object detection
        # - lower confidence to catch partially visible phones
        # - enable augmentation (TTA) for better recall
        # First pass: higher resolution + mild TTA to improve small-object recall
        results = model.predict(
            frame,
            conf=0.12,
            iou=0.45,
            imgsz=1280,
            agnostic_nms=True,
            max_det=100,
            augment=True,
            device='mps',
            verbose=False
        )

        predictions = []
        person_count = 0
        total_boxes = 0

        def collect_predictions(results_obj):
            nonlocal person_count, total_boxes
            local_preds = []
            for r_idx, r in enumerate(results_obj):
                for bidx, box in enumerate(r.boxes):
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    label = model.names[int(box.cls[0])]
                    conf = float(box.conf[0])
                    print(f"  [box] result:{r_idx} box:{bidx} label:{label} conf:{conf:.3f} coords:{x1:.1f},{y1:.1f},{x2:.1f},{y2:.1f}")
                    total_boxes += 1

                    if label == 'person':
                        person_count += 1

                    # Keep cell phone and close proxies
                    target_classes = ['cell phone', 'remote', 'book']
                    if label in target_classes:
                        local_preds.append({
                            "x": x1, "y": y1, "w": x2-x1, "h": y2-y1,
                            "class": 'cell phone' if label == 'remote' else label,
                            "conf": conf
                        })
            return local_preds

        predictions = collect_predictions(results)

        # Fallback pass: target cell phone class with tuned thresholds
        if len(predictions) == 0:
            print("  ℹ️ No phone detected in first pass; running focused fallback...")
            results_fb = model.predict(
                frame,
                conf=0.10,
                iou=0.55,
                imgsz=1280,
                classes=[67],
                agnostic_nms=True,
                max_det=100,
                augment=True,
                device='mps',
                verbose=False
            )
            predictions = collect_predictions(results_fb)

        # Heuristic fallback: detect bright rectangular phone screens if YOLO missed
        if len(predictions) == 0:
            try:
                print("  🔎 Running screen heuristic fallback...")
                h_img, w_img = frame.shape[:2]
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                # Emphasize bright areas (phone screens)
                _, thr = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)
                thr = cv2.morphologyEx(thr, cv2.MORPH_OPEN, np.ones((3,3), np.uint8))
                contours, _ = cv2.findContours(thr, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                best = None
                for cnt in contours:
                    x, y, w, h = cv2.boundingRect(cnt)
                    area = w * h
                    if area < 0.004 * w_img * h_img:  # skip tiny blobs
                        continue
                    ar = w / float(h)
                    if 0.35 <= ar <= 0.75 or 1.3 <= ar <= 2.2:  # portrait or landscape phone-ish
                        # check fill ratio
                        roi = thr[max(0,y):min(h_img,y+h), max(0,x):min(w_img,x+w)]
                        fill = float(cv2.countNonZero(roi)) / max(1, roi.size)
                        if fill > 0.55:  # mostly bright
                            score = fill * (area / (w_img*h_img))
                            if best is None or score > best[0]:
                                best = (score, x, y, w, h)
                if best is not None:
                    _, x, y, w, h = best
                    predictions.append({
                        "x": float(x), "y": float(y), "w": float(w), "h": float(h),
                        "class": 'cell phone', "conf": 0.35
                    })
                    print("  ✅ Screen heuristic produced a phone candidate")
            except Exception as hf_err:
                print(f"  ⚠️ Heuristic fallback error: {hf_err}")

        print(f"  Detection produced {total_boxes} raw boxes; filtered to {len(predictions)} predictions")

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