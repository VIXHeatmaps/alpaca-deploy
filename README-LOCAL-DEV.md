# Local Development Setup

## Quick Start

To run the entire app locally with all services:

```bash
./start-dev.sh
```

This starts:
- **Frontend** on http://localhost:5173
- **Backend** on http://localhost:4000
- **Indicator Service** on http://localhost:8001

Press `Ctrl+C` to stop all services.

---

## First Time Setup

### 1. Install Dependencies

```bash
# Frontend
cd frontend && npm install && cd ..

# Backend
cd backend && npm install && cd ..

# Indicator Service
cd indicator-service && pip3 install -r requirements.txt && cd ..
```

### 2. Configure Environment

Add your Discord OAuth credentials to `backend/.env`:
```bash
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_CLIENT_SECRET=your_client_secret_here
```

(The `.env` file is already created - just fill in the values)

### 3. Start All Services

```bash
./start-dev.sh
```

---

## Troubleshooting

**"Permission denied" error?**
```bash
chmod +x start-dev.sh
```

**Port already in use?**
- Kill processes on ports 5173, 4000, or 8001
- Or change ports in the respective config files

**Can't login?**
- Make sure Discord OAuth credentials are set in `backend/.env`
- Frontend needs `VITE_API_BASE=http://localhost:4000` in `frontend/.env`

---

## Architecture

- **Frontend**: React + Vite + ReactFlow
- **Backend**: Node + Express + JWT auth
- **Indicator Service**: Python + FastAPI (calculates technical indicators)
