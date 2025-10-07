#!/bin/bash

# Start all three services for local development

echo "🚀 Starting Alpaca Deploy local development environment..."
echo ""

# Check if we're in the right directory
if [ ! -f "start-dev.sh" ]; then
    echo "❌ Error: Please run this script from the alpaca-deploy directory"
    exit 1
fi

# Start indicator service (Python)
echo "📊 Starting indicator service (port 8001)..."
cd indicator-service
python3 app.py &
INDICATOR_PID=$!
cd ..

# Wait a moment for indicator service to start
sleep 2

# Start backend (Node/Express)
echo "🔧 Starting backend (port 4000)..."
cd backend
npm run dev &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to start
sleep 2

# Start frontend (Vite)
echo "🎨 Starting frontend (port 5173)..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ All services started!"
echo ""
echo "📍 Frontend:  http://localhost:5173"
echo "📍 Backend:   http://localhost:4000"
echo "📍 Indicator: http://localhost:8001"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Wait for Ctrl+C and cleanup
trap "echo ''; echo '🛑 Stopping all services...'; kill $INDICATOR_PID $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT

# Keep script running
wait
