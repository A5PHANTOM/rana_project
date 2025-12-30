from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status
from typing import Dict, List, Any, Union
import json
import asyncio
from collections import deque
import base64
import httpx

from sqlmodel import Session, select
from database import engine
from app.db.models import Class

router = APIRouter()

class StreamRelay:
    """
    Handles parallel access to ESP32 stream.
    One connection to ESP32, multiple viewers.
    """
    def __init__(self, buffer_size=4):
        self.current_frame = None
        self.subscribers: List[asyncio.Queue] = []
        self.buffer_size = buffer_size
        self.esp32_connected = False
    
    async def subscribe(self) -> asyncio.Queue:
        """Subscribe a client to the stream"""
        queue = asyncio.Queue(maxsize=self.buffer_size)
        self.subscribers.append(queue)
        print(f"🔗 New subscriber added. Total subscribers: {len(self.subscribers)}")
        return queue
    
    async def unsubscribe(self, queue: asyncio.Queue):
        """Remove a subscriber"""
        if queue in self.subscribers:
            self.subscribers.remove(queue)
            print(f"🔓 Subscriber removed. Remaining: {len(self.subscribers)}")
    
    async def broadcast_frame(self, frame_data: Any):
        """Broadcast a frame to all subscribers"""
        self.current_frame = frame_data
        disconnected = []
        
        if not self.subscribers:
            print(f"⚠️ No subscribers for this relay. Frame discarded.")
            return
        
        print(f"📡 Broadcasting to {len(self.subscribers)} subscribers")
        
        for i, queue in enumerate(self.subscribers):
            try:
                queue.put_nowait(frame_data)
                print(f"  ✅ Sent to subscriber {i+1}")
            except asyncio.QueueFull:
                # Client is too slow, skip this frame for them
                print(f"  ⏭️  Subscriber {i+1} too slow, skipped frame")
            except Exception as e:
                print(f"  ❌ Error sending to subscriber {i+1}: {e}")
                disconnected.append(queue)
        
        # Clean up disconnected queues
        for queue in disconnected:
            await self.unsubscribe(queue)

# Global stream relay instance (one per ESP32/class)
stream_relays: Dict[str, StreamRelay] = {}
pull_tasks: Dict[str, asyncio.Task] = {}

def get_stream_relay(class_id: str) -> StreamRelay:
    """Get or create a relay for a specific class"""
    if class_id not in stream_relays:
        stream_relays[class_id] = StreamRelay()
    return stream_relays[class_id]

async def _get_class_ip(class_id: str) -> Union[str, None]:
    try:
        with Session(engine) as session:
            db_class = session.exec(select(Class).where(Class.id == int(class_id))).first()
            return db_class.esp32_ip if db_class else None
    except Exception:
        return None

async def _pull_snapshots_loop(class_id: str):
    relay = get_stream_relay(class_id)
    print(f"🧵 Snapshot puller started for class {class_id}")
    async with httpx.AsyncClient(timeout=httpx.Timeout(5.0, connect=3.0)) as client:
        while True:
            try:
                # If no subscribers, wait a bit and retry
                if not relay.subscribers:
                    await asyncio.sleep(2.0)
                    continue

                ip = await _get_class_ip(class_id)
                if not ip:
                    await asyncio.sleep(2.0)
                    continue

                # Try /capture endpoint for single JPEG snapshot
                url = f"http://{ip}:81/capture"
                resp = await client.get(url)
                if resp.status_code == 200 and resp.content:
                    b64 = base64.b64encode(resp.content).decode('ascii')
                    frame = {
                        "type": "frame",
                        "class_id": class_id,
                        "image": f"data:image/jpeg;base64,{b64}",
                        "predictions": []
                    }
                    await relay.broadcast_frame(frame)
                    await asyncio.sleep(0.5)
                else:
                    await asyncio.sleep(1.0)
            except asyncio.CancelledError:
                print(f"🧵 Snapshot puller cancelled for class {class_id}")
                break
            except Exception as e:
                print(f"⚠️ Snapshot puller error for class {class_id}: {e}")
                await asyncio.sleep(2.0)
    print(f"🧵 Snapshot puller stopped for class {class_id}")

def ensure_snapshot_puller(class_id: str):
    task = pull_tasks.get(class_id)
    if task is None or task.done():
        pull_tasks[class_id] = asyncio.create_task(_pull_snapshots_loop(class_id))

class NotificationManager:
    def __init__(self):
        # Maps user_id strings to a LIST of active WebSocket connections
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, identifier: str, websocket: WebSocket):
        await websocket.accept()
        sid = str(identifier)
        if sid not in self.active_connections:
            self.active_connections[sid] = []
        
        self.active_connections[sid].append(websocket)
        print(f"📡 WebSocket Linked: ID {sid} | Devices connected: {len(self.active_connections[sid])}")

    async def disconnect(self, identifier: str, websocket: WebSocket):
        sid = str(identifier)
        if sid in self.active_connections:
            if websocket in self.active_connections[sid]:
                self.active_connections[sid].remove(websocket)
            
            # Clean up empty keys to save memory
            if not self.active_connections[sid]:
                del self.active_connections[sid]
        print(f"❌ Device removed for ID: {sid}")

    async def send_alert(self, teacher_id: Union[int, str], message: Any):
        """
        Broadcasts to the Teacher's devices AND the Admin's devices simultaneously.
        """
        target_sid = str(teacher_id)
        admin_sid = "1"  # Hardcoded Admin ID

        # 1. Send to all devices logged in as the assigned Teacher
        await self._broadcast_to_id(target_sid, message)

        # 2. Mirror to all devices logged in as Admin (if different)
        if target_sid != admin_sid:
            await self._broadcast_to_id(admin_sid, message)

    async def _broadcast_to_id(self, sid: str, message: Any):
        if sid in self.active_connections:
            # We create a copy of the list to iterate over to avoid 
            # 'RuntimeError: dictionary changed size during iteration'
            for connection in list(self.active_connections[sid]):
                try:
                    await connection.send_json(message)
                    print(f"✅ Alert pushed to {sid}")
                except Exception as e:
                    print(f"⚠️ Socket stale for {sid}, cleaning up: {e}")
                    await self.disconnect(sid, connection)
        else:
            print(f"ℹ️ {sid} is offline. Live feed skipped for this ID.")

notifier = NotificationManager()

# 🚀 NEW: WebSocket for receiving ESP32 stream (parallel access)
@router.websocket("/ws/stream/{class_id}")
async def websocket_stream_endpoint(
    websocket: WebSocket,
    class_id: str,
    token: str = Query(None)
):
    """
    Admin and Teacher connect here to watch the live class stream.
    Multiple clients can connect simultaneously to the same class_id.
    ESP32 pushes frames to /api/admin/detect, which broadcasts via StreamRelay.
    """
    # Allow anonymous stream viewing when no token provided (helps local testing)
    if not token or token in ["null", "undefined"]:
        print(f"⚠️ Stream opened without token for class {class_id} (testing mode)")
    
    await websocket.accept()
    relay = get_stream_relay(class_id)
    stream_queue = await relay.subscribe()
    ensure_snapshot_puller(class_id)
    
    print(f"📺 Stream Viewer Connected to class {class_id} | Total viewers: {len(relay.subscribers)}")
    
    try:
        # Send the last frame if available
        if relay.current_frame:
            print(f"  📤 Sending cached frame to new viewer")
            await websocket.send_json(relay.current_frame)

        # Listen for new frames from the relay
        while True:
            try:
                print(f"  ⏳ Waiting for frame... (viewers: {len(relay.subscribers)})")
                frame_data = await asyncio.wait_for(stream_queue.get(), timeout=30.0)
                print(f"  📤 Sending frame to viewer")
                await websocket.send_json(frame_data)
            except asyncio.TimeoutError:
                # Keep the socket alive and continue waiting for frames
                try:
                    await websocket.send_json({"type": "keepalive", "class_id": class_id})
                except Exception:
                    pass
                continue
    except WebSocketDisconnect:
        await relay.unsubscribe(stream_queue)
        print(f"📺 Stream Viewer Disconnected from class {class_id} | Remaining: {len(relay.subscribers)}")
    except Exception as e:
        print(f"⚠️ Stream error for class {class_id}: {e}")
        await relay.unsubscribe(stream_queue)

@router.websocket("/ws/alerts/{identifier}")
async def websocket_endpoint(
    websocket: WebSocket, 
    identifier: str, 
    token: str = Query(None) 
):
    # DEV MODE: allow missing/placeholder tokens; do not accept here,
    # NotificationManager.connect() performs the accept exactly once.
    if not token or token in ["null", "undefined", "", "dev"]:
        print(f"⚠️ Alerts WebSocket opened without valid token for {identifier} (dev mode)")

    await notifier.connect(identifier, websocket)
    
    try:
        while True:
            # Keep the connection open and listen for pong/heartbeats
            await websocket.receive_text()
    except WebSocketDisconnect:
        await notifier.disconnect(identifier, websocket)