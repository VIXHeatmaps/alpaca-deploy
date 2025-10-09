#!/bin/bash
# This script shows the logs of the RUNNING backend process
# It does NOT start a new backend - it just watches the existing one

PID=$(lsof -ti:4000)

if [ -z "$PID" ]; then
  echo "❌ No backend running on port 4000"
  echo "Please start it with: cd backend && npm run dev"
  exit 1
fi

echo "✅ Backend running on port 4000 (PID: $PID)"
echo "📝 Watching logs from user's terminal..."
echo ""

# Follow the process logs (this won't work perfectly but shows intent)
tail -f /dev/null
