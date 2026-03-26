# DMMD Setup Instructions (New System)

This guide helps you run the full project (backend + frontend) on a new machine.

## 1. Prerequisites

Install these first:

- Python 3.10+ (3.12 recommended)
- Node.js 18+ and npm
- Git

Optional but recommended:

- macOS/Linux terminal with bash or zsh

## 2. Clone / Copy Project

Place the project folder on the new system so the structure looks like:

- backend/
- frontend/
- requirements.txt

## 3. Backend Setup (FastAPI)

From project root:

```bash
cd backend
python3 -m venv ../myvenv
source ../myvenv/bin/activate
pip install --upgrade pip
pip install -r ../requirements.txt
```

## 4. Frontend Setup (Vite + React)

From project root:

```bash
cd frontend
npm install
```

## 5. Run Backend

From project root:

```bash
cd backend
source ../myvenv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Backend URL:

- http://localhost:8000
- On LAN: http://<your-machine-ip>:8000

## 6. Run Frontend

In a second terminal:

```bash
cd frontend
npm run dev -- --host 0.0.0.0 --port 5173
```

Frontend URL:

- http://localhost:5173
- On LAN: http://<your-machine-ip>:5173

## 7. Camera + Phone Setup

The project supports both camera types:

- ESP32-CAM style IP only (example: 192.168.4.1)
- Android IP Webcam style host:port (example: 192.168.8.174:8080)

In class setup, save camera IP/host for each class.

Notes:

- If using Android IP Webcam app, make sure stream endpoint serves /shot.jpg.
- Keep phone and laptop on same Wi-Fi.

## 8. QR Scanner Notes

- Live camera scanning in browser may require HTTPS on mobile browsers.
- If live camera scan is blocked, use Scan QR from Photo.
- Photo scan fallback is built in.

## 9. Evidence / Uploads

Evidence files are stored under backend/uploads/evidence.

If migrating existing data, copy these too:

- backend/database.db (if present)
- backend/uploads/

## 10. Common Troubleshooting

### Backend dependency errors

Run:

```bash
source myvenv/bin/activate
pip install -r requirements.txt
```

### Frontend cannot reach backend

- Ensure backend runs on port 8000.
- Ensure frontend runs on port 5173.
- Ensure both devices are on same network for LAN usage.

### Camera scan not working on mobile

- Mobile browser may block live camera on HTTP.
- Use Scan QR from Photo, or run frontend over HTTPS.

### Port already in use

Change one of the ports:

```bash
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
npm run dev -- --host 0.0.0.0 --port 5174
```

## 11. Quick Start (After First-Time Setup)

Terminal 1:

```bash
cd backend
source ../myvenv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Terminal 2:

```bash
cd frontend
npm run dev -- --host 0.0.0.0 --port 5173
```

## 12. Optional Production Build

```bash
cd frontend
npm run build
npm run preview -- --host 0.0.0.0 --port 5173
```

Backend can still run with uvicorn (or behind a reverse proxy for production).
