import React, { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';
import { useAuth } from '../hooks/useAuth';
import DetectionEngine from '../components/DetectionEngine';
import { API_ROOT, WS_ROOT, UPLOADS_ROOT } from '../config/network';
import { playAlarmSound } from '../utils/alarmSound';

function TeacherDashboardPage() {
    const { token, logout, user } = useAuth();
    const [notifications, setNotifications] = useState([]); 
    const [latestAlert, setLatestAlert] = useState(null); 
    const [sessionInfo, setSessionInfo] = useState(null);
    const [qrInput, setQrInput] = useState('');
    const [error, setError] = useState('');
    const [scannerOpen, setScannerOpen] = useState(false);
    const [scannerError, setScannerError] = useState('');
    const imageRef = useRef(null);
    const scanVideoRef = useRef(null);
    const scanCanvasRef = useRef(null);
    const scanUploadRef = useRef(null);
    const scannerStreamRef = useRef(null);
    const scannerTimerRef = useRef(null);
    
    // Persist the socket across re-renders
    const socketRef = useRef(null);

    const stopScanner = () => {
        if (scannerTimerRef.current) {
            clearInterval(scannerTimerRef.current);
            scannerTimerRef.current = null;
        }

        if (scannerStreamRef.current) {
            scannerStreamRef.current.getTracks().forEach(track => track.stop());
            scannerStreamRef.current = null;
        }

        if (scanVideoRef.current) {
            scanVideoRef.current.srcObject = null;
        }

        setScannerOpen(false);
    };

    const startScanner = async () => {
        setError('');
        setScannerError('');

        console.log('🎥 Camera detection:', {
            hasMediaDevices: !!navigator.mediaDevices,
            hasGetUserMedia: !!navigator.mediaDevices?.getUserMedia,
            isSecureContext: window.isSecureContext,
            protocol: window.location.protocol,
        });

        if (!navigator.mediaDevices?.getUserMedia) {
            console.warn('❌ getUserMedia not available');
            setScannerError('📸 Camera not available in this browser/context. Switching to photo scan...');
            // Auto-fallback to photo upload
            setTimeout(() => {
                if (scanUploadRef.current) {
                    scanUploadRef.current.click();
                }
            }, 500);
            return;
        }

        // On many mobile browsers, getUserMedia requires HTTPS for non-localhost origins.
        if (!window.isSecureContext && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127')) {
            console.warn('❌ Insecure context detected');
            setScannerError('🔒 HTTPS required for camera on mobile. Using photo scan instead...');
            setTimeout(() => {
                if (scanUploadRef.current) {
                    scanUploadRef.current.click();
                }
            }, 500);
            return;
        }

        try {
            console.log('🎬 Requesting camera access...');
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' } },
                audio: false,
            });

            console.log('✅ Camera stream obtained');
            scannerStreamRef.current = stream;
            setScannerOpen(true);

            // Wait for modal/video to render before attaching stream.
            setTimeout(async () => {
                if (!scanVideoRef.current) {
                    console.warn('⚠️ Video ref not available');
                    return;
                }

                scanVideoRef.current.srcObject = stream;
                await scanVideoRef.current.play();
                console.log('▶️ Video playback started');

                scannerTimerRef.current = setInterval(async () => {
                    try {
                        if (!scanVideoRef.current || scanVideoRef.current.readyState < 2) return;
                        const video = scanVideoRef.current;
                        const canvas = scanCanvasRef.current;
                        if (!canvas) return;

                        const width = video.videoWidth || 0;
                        const height = video.videoHeight || 0;
                        if (!width || !height) return;

                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d', { willReadFrequently: true });
                        if (!ctx) return;
                        
                        ctx.drawImage(video, 0, 0, width, height);
                        const imageData = ctx.getImageData(0, 0, width, height);
                        const decoded = jsQR(imageData.data, width, height, { inversionAttempts: 'attemptBoth' });
                        if (decoded?.data) {
                            console.log('✅ QR Detected from camera:', decoded.data);
                            const qrValue = decoded.data.trim();
                            setQrInput(qrValue);
                            stopScanner();
                            
                            // Auto-submit after stopping scanner
                            setTimeout(() => {
                                handleSignIn({ preventDefault: () => {} });
                            }, 200);
                        }
                    } catch (scanErr) {
                        // Ignore transient frame errors and keep scanning.
                    }
                }, 220);
            }, 0);
        } catch (camErr) {
            console.error('❌ Camera access error:', camErr);
            setScannerError(`Camera error: ${camErr.name}. Using photo scan instead...`);
            stopScanner();
            // Auto-fallback to photo upload on error
            setTimeout(() => {
                if (scanUploadRef.current) {
                    scanUploadRef.current.click();
                }
            }, 500);
        }
    };

    const handleUploadScan = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setScannerError('');
        try {
            const objectUrl = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    if (!canvas) {
                        setScannerError('Scanner canvas unavailable. Please retry.');
                        URL.revokeObjectURL(objectUrl);
                        return;
                    }

                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d', { willReadFrequently: true });
                    if (!ctx) {
                        setScannerError('Could not initialize canvas context.');
                        URL.revokeObjectURL(objectUrl);
                        return;
                    }

                    ctx.drawImage(img, 0, 0, img.width, img.height);
                    const imageData = ctx.getImageData(0, 0, img.width, img.height);
                    console.log(`📸 Scanning photo: ${img.width}x${img.height}`);
                    
                    const decoded = jsQR(imageData.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });

                    if (decoded?.data) {
                        console.log('✅ QR Decoded:', decoded.data);
                        const qrValue = decoded.data.trim();
                        setQrInput(qrValue);
                        stopScanner();
                        
                        // Auto-submit after a short delay to ensure state is updated
                        setTimeout(() => {
                            handleSignIn({ preventDefault: () => {} });
                        }, 200);
                    } else {
                        setScannerError('QR not detected in photo. Try a clearer/closer image.');
                    }
                } finally {
                    URL.revokeObjectURL(objectUrl);
                }
            };
            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                setScannerError('Could not read image. Please try another photo.');
            };
            img.src = objectUrl;
        } catch (e) {
            console.error('Photo scan error:', e);
            setScannerError('Photo scan failed. Please try again.');
        } finally {
            event.target.value = '';
        }
    };

    useEffect(() => {
        return () => {
            stopScanner();
        };
    }, []);

    useEffect(() => {
        if (!token || socketRef.current) return;

        // 🚨 Match the ID to your logged-in session
        const targetId = user?.id || localStorage.getItem('user_id') || "1";
        const wsUrl = `${WS_ROOT}/api/websocket/ws/alerts/${targetId}?token=${token}`;

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

                    // 🚨 Play alarm sound for phone violations
                    if (data.message?.includes('Phone') || data.detail?.includes('Phone')) {
                        playAlarmSound();
                    }

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
        if (path.startsWith('http://localhost:8000') || path.startsWith('http://127.0.0.1:8000')) {
            return path.replace(/^https?:\/\/(localhost|127\.0\.0\.1):8000/i, UPLOADS_ROOT.replace('/uploads', ''));
        }
        return path.startsWith('http') ? path : `${UPLOADS_ROOT}/${String(path).replace(/^\/+/, '').replace(/^uploads\//, '')}`;
    };

    const handleSignIn = async (e) => {
        e.preventDefault();
        setError('');
        try {
            const res = await fetch(`${API_ROOT}/teacher/sign-in`, {
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
                            <button
                                type="button"
                                onClick={startScanner}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 py-3 rounded font-bold transition"
                            >
                                Scan QR with Camera
                            </button>
                            <button
                                type="button"
                                onClick={() => scanUploadRef.current?.click()}
                                className="w-full bg-cyan-600 hover:bg-cyan-700 py-3 rounded font-bold transition"
                            >
                                Scan QR from Photo
                            </button>
                            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 py-3 rounded font-bold transition">
                                Connect to Camera
                            </button>
                        </form>
                        <input
                            ref={scanUploadRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={handleUploadScan}
                        />
                        {error && <p className="text-red-500 text-xs mt-3 font-semibold">{error}</p>}
                        {scannerError && <p className="text-amber-400 text-xs mt-2 font-semibold">{scannerError}</p>}
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
                                key={sessionInfo.class_id}
                                // The actual pixels will be provided via the WebSocket
                                // stream handled by DetectionEngine. We keep src empty
                                // so we don't hit cross-origin issues with phone IP cameras.
                                src=""
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

            {scannerOpen && (
                <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
                    <div className="w-full max-w-md bg-gray-800 border border-gray-700 rounded-xl p-4 shadow-2xl">
                        <h4 className="font-bold text-indigo-300 mb-3">Scan Room QR</h4>
                        <p className="text-xs text-gray-400 mb-3">Point your camera at the room QR code. It will auto-fill when detected.</p>
                        <video
                            ref={scanVideoRef}
                            className="w-full rounded-lg bg-black border border-gray-600"
                            muted
                            playsInline
                        />
                        <div className="grid grid-cols-2 gap-3 mt-4">
                            <button
                                type="button"
                                onClick={stopScanner}
                                className="bg-gray-600 hover:bg-gray-500 py-2 rounded font-semibold"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={startScanner}
                                className="bg-indigo-600 hover:bg-indigo-700 py-2 rounded font-semibold"
                            >
                                Restart Scan
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={() => scanUploadRef.current?.click()}
                            className="w-full mt-3 bg-cyan-700 hover:bg-cyan-600 py-2 rounded font-semibold"
                        >
                            Use Photo Instead
                        </button>
                    </div>
                </div>
            )}
            <canvas ref={scanCanvasRef} className="hidden" />
        </div>
    );
}

export default TeacherDashboardPage;