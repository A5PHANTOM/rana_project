from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from ultralytics import YOLO
import os
import cv2
import numpy as np
import base64

from app.api import auth, admin, teacher, websocket

app = FastAPI(title="Discipline Monitor API")

# --- 🚀 YOLOv8 Initialization (Mac M2 Optimized) ---
# Load YOLOv8 Nano (n) - the fastest version for real-time use
model = YOLO('yolov8n.pt') 

# --- Static Files (Evidence Storage) ---
os.makedirs("uploads/evidence", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# --- CORS Middleware ---
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
# We put this here or in admin.py. This receives the base64 frame from React.
@app.post("/api/admin/detect")
async def detect_objects(data: dict):
    try:
        header, encoded = data['image'].split(",", 1)
        nparr = np.frombuffer(base64.b64decode(encoded), np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        # 🚀 IMPROVEMENT 1: Increase imgsz to 640. 
        # This makes the AI "squint" harder to see smaller objects.
        # device='mps' ensures your M2 GPU still runs this at 30+ FPS.
        results = model.predict(frame, conf=0.20, imgsz=640, device='mps', verbose=False)

        predictions = []
        for r in results:
            for box in r.boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                cls_id = int(box.cls[0])
                conf = float(box.conf[0])
                label = model.names[cls_id]

                # 🚀 IMPROVEMENT 2: Priority filtering.
                # Only include phones, or common misclassifications like 'remote'.
                # A phone is class 67 in standard COCO dataset.
                target_classes = ['cell phone', 'remote', 'book'] 
                
                if label in target_classes:
                    predictions.append({
                        "x": x1, "y": y1, "w": x2-x1, "h": y2-y1,
                        "class": "cell phone" if label == 'remote' else label, # Fix misclassification
                        "conf": conf
                    })

        return {"predictions": predictions}
    except Exception as e:
        return {"error": str(e), "predictions": []}

# --- Include Routers ---
app.include_router(auth.router, prefix="/api/auth")
app.include_router(admin.router, prefix="/api/admin") 
app.include_router(teacher.router, prefix="/api/teacher") 
app.include_router(websocket.router)

@app.get("/")
def read_root():
    return {"message": "Discipline Monitor API is running with YOLOv8 (MPS Optimized)"}