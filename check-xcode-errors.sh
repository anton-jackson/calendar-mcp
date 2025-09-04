#!/bin/bash

# Quick Xcode error checker
echo "🔍 Checking Xcode project for errors..."

cd macos

# Build and capture errors
xcodebuild -project PublicCalendarMCP.xcodeproj -scheme PublicCalendarMCP build 2>&1 | \
grep -E "(error:|warning:)" | \
head -20

echo ""
echo "💡 To see all errors in Xcode:"
echo "   1. Press Cmd+5 (Issue Navigator)"
echo "   2. Press Cmd+B to build"
echo "   3. Look for red error icons"