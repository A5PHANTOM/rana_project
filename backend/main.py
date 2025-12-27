from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from ultralytics import YOLO
import os
import cv2
import numpy as np
import base64

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
    try:
        header, encoded = data['image'].split(",", 1)
        nparr = np.frombuffer(base64.b64decode(encoded), np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        # Performance: conf=0.20 and imgsz=640 for better accuracy on small phones
        # device='mps' uses the Mac M2 GPU for hardware acceleration
        results = model.predict(frame, conf=0.20, imgsz=640, device='mps', verbose=False)

        predictions = []
        for r in results:
            for box in r.boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                label = model.names[int(box.cls[0])]
                conf = float(box.conf[0])

                # Filtering for cell phones and similar objects
                target_classes = ['cell phone', 'remote', 'book'] 
                
                if label in target_classes:
                    predictions.append({
                        "x": x1, "y": y1, "w": x2-x1, "h": y2-y1,
                        "class": "cell phone" if label == 'remote' else label,
                        "conf": conf
                    })

        return {"predictions": predictions}
    except Exception as e:
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