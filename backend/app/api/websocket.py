from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Any

router = APIRouter()

# Manager to track which Teacher is connected to which WebSocket
class NotificationManager:
    def __init__(self):
        # Dictionary mapping teacher_id -> websocket connection
        self.active_connections: Dict[int, WebSocket] = {}

    async def connect(self, teacher_id: int, websocket: WebSocket):
        await websocket.accept()
        # Ensure we store the ID as an int to match incoming reports
        self.active_connections[int(teacher_id)] = websocket
        print(f"📡 Teacher {teacher_id} connected for live alerts.")

    def disconnect(self, teacher_id: int):
        tid = int(teacher_id)
        if tid in self.active_connections:
            del self.active_connections[tid]
            print(f"❌ Teacher {tid} disconnected.")

    async def send_alert(self, teacher_id: int, message: Any):
        """
        Sends a JSON alert. If the teacher is offline, it fails silently 
        to prevent 500 errors in the main API.
        """
        tid = int(teacher_id)
        if tid in self.active_connections:
            try:
                # 🚨 THE CRITICAL FIX: Send as JSON, not Text
                await self.active_connections[tid].send_json(message)
                print(f"✅ Live alert sent to Teacher {tid}")
            except Exception as e:
                print(f"⚠️ Error sending socket: {e}")
                self.disconnect(tid)
        else:
            # Prevents the backend from crashing if teacher is not logged in
            print(f"ℹ️ Teacher {tid} is offline. Alert saved to DB only.")

# Global instance to be used by other routers
notifier = NotificationManager()

@router.websocket("/ws/alerts/{teacher_id}")
async def websocket_endpoint(websocket: WebSocket, teacher_id: int):
    # Standard connection handling
    await notifier.connect(teacher_id, websocket)
    try:
        while True:
            # Keep the connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        notifier.disconnect(teacher_id)