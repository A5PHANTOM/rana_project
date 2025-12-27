from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status
from typing import Dict, Any, Union

router = APIRouter()

class NotificationManager:
    def __init__(self):
        # Dictionary mapping identifiers (Teacher ID or Room UUID) to WebSockets
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, identifier: str, websocket: WebSocket):
        await websocket.accept()
        # Ensure identifier is stored as a string for consistent lookup
        self.active_connections[str(identifier)] = websocket
        print(f"📡 WebSocket Linked to ID: {identifier}")

    def disconnect(self, identifier: str):
        sid = str(identifier)
        if sid in self.active_connections:
            del self.active_connections[sid]
            print(f"❌ Connection {sid} closed.")

    async def send_alert(self, teacher_id: Union[int, str], message: Any):
        """
        Broadcasts the violation to the specific Teacher AND the Admin dashboard (ID 1).
        """
        target_sid = str(teacher_id)
        admin_sid = "1"  # Hardcoded Admin ID as per your logs

        # 1. Send to the Teacher assigned to the room
        await self._attempt_send(target_sid, message)

        # 2. 🚨 THE ADMIN MIRROR: Ensures Admin (User 1) receives the live update
        if target_sid != admin_sid:
            await self._attempt_send(admin_sid, message)

    async def _attempt_send(self, sid: str, message: Any):
        if sid in self.active_connections:
            try:
                await self.active_connections[sid].send_json(message)
                print(f"✅ Alert pushed to {sid}")
            except Exception as e:
                print(f"⚠️ Socket error for {sid}: {e}")
                self.disconnect(sid)
        else:
            # This is the log you saw earlier; it means that ID is not currently connected
            print(f"ℹ️ {sid} is offline. Live feed skipped for this ID.")

notifier = NotificationManager()



@router.websocket("/ws/alerts/{identifier}")
async def websocket_endpoint(
    websocket: WebSocket, 
    identifier: str, 
    token: str = Query(None) 
):
    # 🚨 SECURITY CHECK: Critical to avoid 403 errors in React/Flutter
    if not token or token in ["null", "undefined"]:
        print(f"🚫 Rejecting {identifier}: Handshake missing or invalid token.")
        await websocket.accept()
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Successful handshake
    await notifier.connect(identifier, websocket)
    try:
        while True:
            # Keep-alive heartbeat to prevent Mac M2 networking timeouts
            await websocket.receive_text()
    except WebSocketDisconnect:
        notifier.disconnect(identifier)