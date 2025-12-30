import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import DetectionEngine from '../components/DetectionEngine';

function TeacherDashboardPage() {
    const { token, logout, user } = useAuth();
    const [notifications, setNotifications] = useState([]); 
    const [latestAlert, setLatestAlert] = useState(null); 
    const [sessionInfo, setSessionInfo] = useState(null);
    const [qrInput, setQrInput] = useState('');
    const [error, setError] = useState('');
    const imageRef = useRef(null);
    
    // Persist the socket across re-renders
    const socketRef = useRef(null);

    useEffect(() => {
        if (!token || socketRef.current) return;

        // 🚨 Match the ID to your logged-in session
        const targetId = user?.id || localStorage.getItem('user_id') || "1";
        const wsUrl = `ws://localhost:8000/api/websocket/ws/alerts/${targetId}?token=${token}`;

        // Add a tiny delay to prevent React StrictMode race conditions
        const connectTimer = setTimeout(() => {
            console.log(`📡 Connecting to WebSocket for ID: ${targetId}...`);
            const socket = new WebSocket(wsUrl);
            socketRef.current = socket;

            socket.onopen = () => {
                if (socket === socketRef.current) {
                    console.log("✅ WebSocket Connected Successfully");
                    setError('');
                }
            };

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    setNotifications(prev => [data, ...prev]);
                    setLatestAlert(data);
                    // Play alert sound
                    try {
                        const audio = new Audio('/alert.mp3');
                        audio.volume = 0.6;
                        audio.play().catch(() => {});
                    } catch (e) {}

                    // Browser notification (if permission granted)
                    try {
                        if (window.Notification && Notification.permission === 'granted') {
                            const img = data.image_url || data.image_path || '';
                            const notif = new Notification('Phone Violation Recorded', {
                                body: data.message || data.detail || 'Detection alert',
                                icon: img,
                                image: img,
                            });
                            notif.onclick = () => window.focus();
                        }
                    } catch (e) {}

                    setTimeout(() => setLatestAlert(null), 5000); 
                } catch (e) {
                    console.error("Socket Data Error:", e);
                }
            };

            socket.onerror = (err) => {
                if (socket.readyState !== WebSocket.CLOSED) {
                    console.error("❌ WebSocket Error:", err);
                    setError("Live Alert Connection Failed.");
                }
            };

            socket.onclose = () => {
                console.log("🔌 WebSocket Disconnected");
                if (socketRef.current === socket) socketRef.current = null;
            };
        }, 100);

        return () => {
            clearTimeout(connectTimer);
            if (socketRef.current) {
                // 🚨 Only close if the socket is fully established
                if (socketRef.current.readyState === WebSocket.OPEN) {
                    socketRef.current.close();
                }
                socketRef.current = null;
            }
        };
    }, [token, user]);

    const getImgUrl = (path) => {
        if (!path) return '';
        return path.startsWith('http') ? path : `http://localhost:8000/${path}`;
    };

    const handleSignIn = async (e) => {
        e.preventDefault();
        setError('');
        try {
            const res = await fetch('http://127.0.0.1:8000/api/teacher/sign-in', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ qr_payload: qrInput.trim() }),
            });
            
            if (res.ok) {
                const data = await res.json();
                setSessionInfo(data); 
            } else {
                setError("Invalid QR Code.");
            }
        } catch (err) {
            setError("Backend unreachable.");
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white p-8 font-sans relative">
            {/* ALERT POP-UP */}
            {latestAlert && (
                <div className="fixed top-5 right-5 z-50 animate-pulse bg-red-600 p-4 rounded-lg shadow-2xl border-2 border-white flex items-center gap-4 max-w-sm">
                    {(latestAlert.image_url || latestAlert.image_path || latestAlert.crop_url) && (
                        <img 
                            src={getImgUrl(latestAlert.image_url || latestAlert.image_path || latestAlert.crop_url)} 
                            className="w-16 h-16 object-cover rounded border border-white/50"
                            alt="Evidence"
                        />
                    )}
                    <div>
                        <h4 className="font-bold text-white uppercase text-xs">New Violation!</h4>
                        <p className="text-sm font-semibold">{latestAlert.message || latestAlert.detail}</p>
                    </div>
                </div>
            )}

            <header className="flex justify-between items-center mb-8 border-b border-gray-700 pb-4">
                <h2 className="text-2xl font-bold text-indigo-400">Class Monitor v2.5</h2>
                <div className="text-sm text-gray-400">
                    Teacher: {user?.username || "Admin"}
                    <button onClick={logout} className="ml-4 bg-red-600 px-3 py-1 rounded hover:bg-red-700 transition">Logout</button>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg">
                        <h3 className="font-bold mb-4 text-indigo-300">Room Activation</h3>
                        <form onSubmit={handleSignIn} className="space-y-4">
                            <input 
                                value={qrInput} 
                                onChange={e => setQrInput(e.target.value)} 
                                placeholder="QR Payload UUID" 
                                className="w-full bg-gray-700 p-3 rounded text-sm border border-transparent focus:border-indigo-500 outline-none" 
                            />
                            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 py-3 rounded font-bold transition">
                                Connect to Camera
                            </button>
                        </form>
                        {error && <p className="text-red-500 text-xs mt-3 font-semibold">{error}</p>}
                    </div>

                    <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 h-[550px] flex flex-col shadow-inner">
                        <h3 className="font-bold mb-4 text-red-400 border-b border-gray-700 pb-2">Live Alerts</h3>
                        <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                            {notifications.length === 0 ? (
                                <p className="text-gray-500 italic text-sm text-center mt-10">Listening for detections...</p>
                            ) : (
                                notifications.map((note, idx) => (
                                    <div key={idx} className="bg-gray-900 rounded-lg overflow-hidden border border-red-900/30">
                                        {(note.image_url || note.image_path) && (
                                            <img 
                                                src={getImgUrl(note.image_url || note.image_path)} 
                                                alt="Violation"
                                                className="w-full h-32 object-cover" 
                                            />
                                        )}
                                        <div className="p-3 text-xs">
                                            <p className="text-indigo-400 uppercase font-mono mb-1">
                                                {note.timestamp ? new Date(note.timestamp).toLocaleTimeString() : 'Live'}
                                            </p>
                                            <p className="font-semibold text-gray-200">{note.message || note.detail}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-3 bg-gray-800 rounded-xl p-4 relative border border-gray-700 min-h-[500px] flex items-center justify-center shadow-2xl">
                    {sessionInfo ? (
                        <div className="relative w-full h-full flex items-center justify-center bg-black rounded-lg">
                            <img 
                                ref={imageRef}
                                key={sessionInfo.class_ip}
                                src={`http://${sessionInfo.class_ip}:81/stream`}
                                crossOrigin="anonymous" 
                                className="max-w-full max-h-full block object-contain"
                                alt="Live Feed"
                                onError={() => setError("Camera connection lost.")}
                            />
                            <DetectionEngine 
                                key={`ai-${sessionInfo.class_id}`} 
                                imageRef={imageRef} 
                                classId={sessionInfo.class_id || 1}
                                teacherId={user?.id || 1} 
                            />
                        </div>
                    ) : (
                        <div className="flex flex-col items-center opacity-30 text-gray-500">
                            <span className="text-8xl mb-4">🎥</span>
                            <p className="text-xl font-medium">Class Feed Ready</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default TeacherDashboardPage;