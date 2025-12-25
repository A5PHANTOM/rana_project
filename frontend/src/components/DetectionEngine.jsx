import React, { useEffect, useRef } from 'react';

const DetectionEngine = ({ imageRef, classId, teacherId }) => {
    const canvasRef = useRef(null); 
    const lastReportTime = useRef(0);
    const isProcessing = useRef(false);

    useEffect(() => {
        const detectFrame = async () => {
            if (isProcessing.current || !imageRef.current || imageRef.current.naturalWidth === 0) return;

            // 🛑 SAFETY CHECK: Don't even try to detect if we don't know who/where this is
            if (!classId || !teacherId) {
                console.warn("⏳ AI waiting for Class/Teacher ID context...");
                return;
            }

            isProcessing.current = true;
            try {
                // 1. Capture current frame
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = imageRef.current.naturalWidth;
                tempCanvas.height = imageRef.current.naturalHeight;
                tempCanvas.getContext('2d').drawImage(imageRef.current, 0, 0);
                const base64Image = tempCanvas.toDataURL('image/jpeg', 0.9);

                // 2. Send to FastAPI YOLO Engine
                const response = await fetch('http://localhost:8000/api/admin/detect', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image: base64Image })
                });

                const data = await response.json();
                drawOverlay(data.predictions);

                // 3. Violation Check
                const phone = data.predictions.find(p => p.class === 'cell phone' && p.conf > 0.35);
                
                if (phone) {
                    const now = Date.now();
                    // 12-second cooldown to avoid spamming the database
                    if (now - lastReportTime.current > 12000) {
                        lastReportTime.current = now;
                        console.log("🚩 PHONE DETECTED - ATTEMPTING TO LOG...");
                        await reportViolation(phone, base64Image);
                    }
                }
            } catch (err) {
                console.error("AI Cycle Error:", err);
            } finally {
                isProcessing.current = false;
            }
        };

        const interval = setInterval(detectFrame, 700); 
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

    const drawOverlay = (predictions) => {
        const canvas = canvasRef.current;
        if (!canvas || !imageRef.current) return;
        const ctx = canvas.getContext('2d');
        
        canvas.width = imageRef.current.clientWidth;
        canvas.height = imageRef.current.clientHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        predictions.forEach(p => {
            const scaleX = canvas.width / imageRef.current.naturalWidth;
            const scaleY = canvas.height / imageRef.current.naturalHeight;
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