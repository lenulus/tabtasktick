#!/bin/bash

# Build script for TabMaster Pro Chrome Extension
# Creates a clean zip file for Chrome Web Store submission

echo "Building TabMaster Pro extension package..."

# Set the output filename
OUTPUT_FILE="tabmaster-pro-extension.zip"

# Remove existing zip if present
if [ -f "$OUTPUT_FILE" ]; then
    echo "Removing existing $OUTPUT_FILE..."
    rm "$OUTPUT_FILE"
fi

# Create zip with only necessary extension files
echo "Creating extension package..."
zip -r "$OUTPUT_FILE" \
    manifest.json \
    background-integrated.js \
    popup/ \
    dashboard/ \
    options/ \
    session/ \
    icons/ \
    lib/*.js \
    lib/*.css \
    lib/test-mode/ \
    lib/domain-categories.json \
    components/*.js \
    components/*.css \
    test-panel/ \
    -x "*.DS_Store" \
    -x "*/.DS_Store" \
    -x "dashboard/tests/*" \
    -x "dashboard/test-*.html" \
    -x "dashboard/verify-*.html" \
    -x "dashboard/package.json" \
    -x "*.backup*" \
    -x "*/node_modules/*"

# Check the size
SIZE=$(ls -lah "$OUTPUT_FILE" | awk '{print $5}')
echo ""
echo "✓ Extension package created: $OUTPUT_FILE"
echo "  Size: $SIZE"
echo ""
echo "The package is ready for:"
echo "  • Chrome Web Store submission"
echo "  • Sideloading via chrome://extensions (Developer mode)"