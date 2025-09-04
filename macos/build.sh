#!/bin/bash

# Build script for Public Calendar MCP macOS app
# Run this after Xcode is installed

set -e

echo "🔨 Building Public Calendar MCP macOS App..."

# Check if Xcode is installed
if ! command -v xcodebuild &> /dev/null; then
    echo "❌ Xcode is not installed or xcodebuild is not in PATH"
    echo "Please install Xcode from the Mac App Store first"
    exit 1
fi

# Generate app icons
echo "🎨 Generating app icons..."
if [ -f "./generate_icons.sh" ]; then
    ./generate_icons.sh
else
    echo "⚠️  Icon generation script not found, skipping..."
fi

# Build the project
echo "📦 Building project..."
xcodebuild -project PublicCalendarMCP.xcodeproj \
           -scheme PublicCalendarMCP \
           -configuration Release \
           -derivedDataPath ./build \
           build

echo "✅ Build completed successfully!"
echo "📍 App location: ./build/Build/Products/Release/PublicCalendarMCP.app"

# Optional: Run tests
if [ "$1" = "--test" ]; then
    echo "🧪 Running tests..."
    xcodebuild -project PublicCalendarMCP.xcodeproj \
               -scheme PublicCalendarMCP \
               -destination 'platform=macOS' \
               test
    echo "✅ Tests completed!"
fi

echo ""
echo "🚀 To run the app:"
echo "   open ./build/Build/Products/Release/PublicCalendarMCP.app"
echo ""
echo "🧪 To run with tests:"
echo "   ./build.sh --test"