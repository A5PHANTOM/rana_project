import React, { useEffect, useRef } from 'react';

const DetectionEngine = ({ imageRef, classId, teacherId }) => {
    const canvasRef = useRef(null); 
    const lastReportTime = useRef(0);
    const streamWsRef = useRef(null);
    const isProcessing = useRef(false);

    // 🚀 NEW: Connect to stream relay for parallel access
    useEffect(() => {
        if (!classId) return;
        
        const token = localStorage.getItem('token') || localStorage.getItem('access_token');
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const streamUrl = `${protocol}//localhost:8000/api/websocket/ws/stream/${classId}?token=${token}`;
        
        console.log(`📺 Connecting to stream: ${streamUrl}`);
        streamWsRef.current = new WebSocket(streamUrl);
        
        streamWsRef.current.onopen = () => {
            console.log(`✅ Connected to class ${classId} stream`);
        };
        
        streamWsRef.current.onmessage = async (event) => {
            try {
                const frameData = JSON.parse(event.data);
                
                if (frameData.type === 'frame') {
                    // Only swap to base64 frame if no HTTP stream is present
                    if (imageRef.current) {
                        const curSrc = imageRef.current.src || '';
                        const isHttpStream = /^https?:\/\//i.test(curSrc);
                        if (!isHttpStream) {
                            imageRef.current.src = frameData.image;
                        }
                    }

                    // Draw predictions on canvas
                    try {
                        console.log('Stream frame predictions:', (frameData.predictions || []).length);
                    } catch (e) {}
                    drawOverlay(frameData.predictions || []);
                }
            } catch (err) {
                console.error("Stream processing error:", err);
            }
        };
        
        streamWsRef.current.onerror = (error) => {
            console.error(`❌ Stream error for class ${classId}:`, error);
        };
        
        streamWsRef.current.onclose = () => {
            console.log(`📴 Disconnected from class ${classId} stream`);
        };
        
        return () => {
            if (streamWsRef.current) {
                streamWsRef.current.close();
            }
        };
    }, [classId, imageRef]);

    // 🔁 Send frames to the backend for YOLO detection (drives alerts/evidence)
    useEffect(() => {
        if (!classId || !teacherId) return;

        const detectFrame = async () => {
            if (isProcessing.current) return;
            if (!imageRef.current) return;

            const baseEl = imageRef.current;
            const srcW = baseEl.videoWidth || baseEl.naturalWidth || baseEl.clientWidth;
            const srcH = baseEl.videoHeight || baseEl.naturalHeight || baseEl.clientHeight;
            if (!srcW || !srcH) return;

            isProcessing.current = true;
            try {
                // Capture current frame to base64
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = srcW;
                tempCanvas.height = srcH;
                tempCanvas.getContext('2d').drawImage(baseEl, 0, 0, srcW, srcH);
                const base64Image = tempCanvas.toDataURL('image/jpeg', 0.9);

                const response = await fetch('http://localhost:8000/api/admin/detect', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image: base64Image, class_id: classId, teacher_id: teacherId })
                });

                if (!response.ok) {
                    console.error('Detect API error', response.status);
                    const txt = await response.text();
                    console.error('Detect body:', txt);
                }

                const data = await response.json();
                console.log('Detect response predictions:', (data.predictions || []).length, data);
                drawOverlay(data.predictions || [], { srcW, srcH });

                // Violation detection and logging (align threshold with backend)
                const phone = (data.predictions || []).find(p => p.class === 'cell phone' && p.conf > 0.18);
                const now = Date.now();
                const shouldThrottle = (now - lastReportTime.current) > 12000;

                // If backend already saved evidence (evidence_url present), still give UI feedback
                if (data.evidence_url && shouldThrottle) {
                    lastReportTime.current = now;
                    try { alert("🚨 Phone Violation Recorded!"); } catch (e) {}
                } else if (phone && shouldThrottle) {
                    lastReportTime.current = now;
                    console.log("🚩 PHONE DETECTED - ATTEMPTING TO LOG...");
                    await reportViolation(phone, base64Image);
                }
            } catch (err) {
                console.error("AI detect loop error:", err);
            } finally {
                isProcessing.current = false;
            }
        };

        const interval = setInterval(detectFrame, 1000);
        return () => clearInterval(interval);
    }, [classId, teacherId, imageRef]);

    const reportViolation = async (prediction, imagePayload) => {
        try {
            // Get token fresh from storage
            const token = localStorage.getItem('token') || localStorage.getItem('access_token');
            
            const payload = {
                class_id: parseInt(classId),
                teacher_id: parseInt(teacherId),
                detail: `AI Detection: Mobile Phone (${Math.round(prediction.conf * 100)}%)`,
                evidence: imagePayload 
            };

            const response = await fetch('http://localhost:8000/api/admin/report-violation', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                console.log("✅ VIOLATION LOGGED SUCCESSFULLY");
                // Optional: visual feedback for the Admin
                alert("🚨 Phone Violation Recorded!");
            } else {
                const errorBody = await response.json();
                console.error("❌ BACKEND REJECTED REPORT:", errorBody.detail);
            }
        } catch (e) {
            console.error("🚀 NETWORK ERROR ON REPORT:", e);
        }
    };

    const drawOverlay = (predictions, dims) => {
        const canvas = canvasRef.current;
        if (!canvas || !imageRef.current) return;
        const ctx = canvas.getContext('2d');
        const baseEl = imageRef.current;
        const srcW = (dims && dims.srcW) || baseEl.videoWidth || baseEl.naturalWidth || baseEl.clientWidth;
        const srcH = (dims && dims.srcH) || baseEl.videoHeight || baseEl.naturalHeight || baseEl.clientHeight;
        const dispW = baseEl.clientWidth || srcW;
        const dispH = baseEl.clientHeight || srcH;
        if (!srcW || !srcH || !dispW || !dispH) return;

        canvas.width = dispW;
        canvas.height = dispH;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        predictions.forEach(p => {
            const scaleX = canvas.width / srcW;
            const scaleY = canvas.height / srcH;
            const isPhone = p.class === 'cell phone';

            ctx.strokeStyle = isPhone ? '#ff0000' : '#00ff00';
            ctx.lineWidth = 4;
            ctx.strokeRect(p.x * scaleX, p.y * scaleY, p.w * scaleX, p.h * scaleY);
            
            ctx.fillStyle = ctx.strokeStyle;
            ctx.font = "bold 14px monospace";
            ctx.fillText(`${p.class.toUpperCase()}`, p.x * scaleX, (p.y * scaleY) - 10);
        });
    };

    return <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 50 }} />;
};

export default DetectionEngine;