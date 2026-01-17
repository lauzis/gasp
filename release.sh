#!/bin/bash

# GNOME Shell Extension Release Script
# Creates a zip file ready for distribution/upload to extensions.gnome.org

set -e

EXTENSION_NAME="gasp@gudlenieks.lv"
OUTPUT_FILE="${EXTENSION_NAME}.zip"

echo "🤖 GASP Release Script"
echo "=========================="

# Recompile schemas
echo "Recompiling schemas..."
glib-compile-schemas schemas/
echo "✓ Schemas compiled"
echo ""

# Remove old zip if exists
if [ -f "$OUTPUT_FILE" ]; then
    echo "Removing old $OUTPUT_FILE"
    rm "$OUTPUT_FILE"
fi

echo "Creating release zip..."

# Create zip with all files except excluded ones
zip -r "$OUTPUT_FILE" . \
    -x "*.git*" \
    -x "release.sh" \
    -x "schemas/gschemas.compiled" \
    -x "git-images/*" \
    -x "*.zip" \
    -x ".idea/*" \
    -x "AGENTS.md" \
    -x "STATUS.md" \
    -x "QUICK_START.md" \
    -x "IMPLEMENTATION_SUMMARY.md" \
    -x "GOOGLE_ANALYTICS_SETUP" \
    -x "DEVELOPMENT.md" \
    -x "CHANGES.md" \
    -x "API_KEY_VS_SERVICE_ACCOUNT.md" \
    -x "API_IMPLEMENTATION.md" \

echo "✅ Release created: $OUTPUT_FILE"
echo ""
echo "Contents:"
unzip -l "$OUTPUT_FILE"
echo ""
echo "📦 Ready for distribution!"
