#!/bin/bash

# Script to generate app icons for Public Calendar MCP
# This creates placeholder icons with the calendar symbol

ICON_DIR="PublicCalendarMCP/Assets.xcassets/AppIcon.appiconset"

# Create a temporary SVG icon
cat > temp_icon.svg << 'EOF'
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#007AFF;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#5856D6;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Background circle -->
  <circle cx="256" cy="256" r="240" fill="url(#grad1)" stroke="#FFFFFF" stroke-width="8"/>
  
  <!-- Calendar body -->
  <rect x="156" y="180" width="200" height="180" rx="20" ry="20" fill="#FFFFFF" stroke="none"/>
  
  <!-- Calendar header -->
  <rect x="156" y="180" width="200" height="40" rx="20" ry="20" fill="#FF3B30"/>
  <rect x="156" y="200" width="200" height="20" fill="#FF3B30"/>
  
  <!-- Calendar rings -->
  <rect x="186" y="160" width="8" height="40" rx="4" ry="4" fill="#666666"/>
  <rect x="218" y="160" width="8" height="40" rx="4" ry="4" fill="#666666"/>
  <rect x="286" y="160" width="8" height="40" rx="4" ry="4" fill="#666666"/>
  <rect x="318" y="160" width="8" height="40" rx="4" ry="4" fill="#666666"/>
  
  <!-- Calendar grid -->
  <line x1="176" y1="240" x2="336" y2="240" stroke="#E5E5E7" stroke-width="1"/>
  <line x1="176" y1="270" x2="336" y2="270" stroke="#E5E5E7" stroke-width="1"/>
  <line x1="176" y1="300" x2="336" y2="300" stroke="#E5E5E7" stroke-width="1"/>
  <line x1="176" y1="330" x2="336" y2="330" stroke="#E5E5E7" stroke-width="1"/>
  
  <line x1="206" y1="220" x2="206" y2="350" stroke="#E5E5E7" stroke-width="1"/>
  <line x1="236" y1="220" x2="236" y2="350" stroke="#E5E5E7" stroke-width="1"/>
  <line x1="266" y1="220" x2="266" y2="350" stroke="#E5E5E7" stroke-width="1"/>
  <line x1="296" y1="220" x2="296" y2="350" stroke="#E5E5E7" stroke-width="1"/>
  <line x1="326" y1="220" x2="326" y2="350" stroke="#E5E5E7" stroke-width="1"/>
  
  <!-- Some calendar events -->
  <circle cx="191" cy="255" r="4" fill="#34C759"/>
  <circle cx="251" cy="285" r="4" fill="#FF9500"/>
  <circle cx="281" cy="315" r="4" fill="#007AFF"/>
  
  <!-- MCP indicator -->
  <circle cx="380" cy="180" r="24" fill="#34C759" stroke="#FFFFFF" stroke-width="3"/>
  <text x="380" y="188" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#FFFFFF">AI</text>
</svg>
EOF

# Function to generate PNG from SVG
generate_png() {
    local size=$1
    local filename=$2
    
    if command -v rsvg-convert >/dev/null 2>&1; then
        rsvg-convert -w $size -h $size temp_icon.svg -o "$ICON_DIR/$filename"
    elif command -v inkscape >/dev/null 2>&1; then
        inkscape -w $size -h $size temp_icon.svg -o "$ICON_DIR/$filename"
    elif command -v convert >/dev/null 2>&1; then
        convert -background transparent -size ${size}x${size} temp_icon.svg "$ICON_DIR/$filename"
    else
        echo "Warning: No SVG converter found. Please install rsvg-convert, inkscape, or ImageMagick"
        echo "Creating placeholder file for $filename"
        touch "$ICON_DIR/$filename"
    fi
}

# Generate all required icon sizes
echo "Generating app icons..."

generate_png 16 "icon_16x16.png"
generate_png 32 "icon_16x16@2x.png"
generate_png 32 "icon_32x32.png"
generate_png 64 "icon_32x32@2x.png"
generate_png 128 "icon_128x128.png"
generate_png 256 "icon_128x128@2x.png"
generate_png 256 "icon_256x256.png"
generate_png 512 "icon_256x256@2x.png"
generate_png 512 "icon_512x512.png"
generate_png 1024 "icon_512x512@2x.png"

# Clean up
rm temp_icon.svg

echo "Icon generation complete!"
echo "Icons saved to: $ICON_DIR"