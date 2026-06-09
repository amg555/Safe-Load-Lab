#!/bin/bash

echo ""
echo "========================================"
echo "  Safe Load Lab - Web UI Launcher"
echo "========================================"
echo ""
echo "Starting web UI..."
echo "Open your browser to: http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

cd "$(dirname "$0")/ui"
npm start
