#!/bin/bash
# Test script for GASP extension

echo "🧪 Testing GASP Extension"
echo "=========================="
echo ""

# Check if extension is installed
echo "📍 Extension location:"
pwd
echo ""

# Check all required files
echo "📁 Checking files..."
files=("extension.js" "prefs.js" "metadata.json" "lib/logger.js" "lib/panelIndicator.js" "lib/statsDB.js" "lib/gaAPI.js" "lib/notificationManager.js" "lib/recordTracker.js" "lib/dataScheduler.js" "schemas/gschemas.compiled")

all_good=true
for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✓ $file"
    else
        echo "  ✗ $file (missing)"
        all_good=false
    fi
done

echo ""
if [ "$all_good" = true ]; then
    echo "✅ All files present!"
else
    echo "❌ Some files are missing"
    exit 1
fi

echo ""
echo "🔧 Extension info:"
gnome-extensions info gasp@gudlenieks.lv 2>/dev/null || echo "Extension not installed in GNOME Shell yet"

echo ""
echo "💡 To enable the extension:"
echo "   1. Restart GNOME Shell (X11: Alt+F2, type 'r', press Enter)"
echo "   2. Enable: gnome-extensions enable gasp@gudlenieks.lv"
echo "   3. Check logs: journalctl -f -o cat /usr/bin/gnome-shell | grep gasp"
