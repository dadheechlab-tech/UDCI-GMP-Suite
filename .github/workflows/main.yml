#!/bin/bash
# Double-click on a Mac to build an UNSIGNED .ipa from the Xcode project next
# to this file. Install the result with AltStore/Sideloadly (free Apple ID),
# or use Xcode → Product → Archive → Distribute for a signed TestFlight build.
set -euo pipefail
cd "$(dirname "$0")"
clear
echo "================================================="
echo "  UDCI GMP Suite — build unsigned .ipa"
echo "================================================="
if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "Xcode is required. Install Xcode from the Mac App Store, open it once,"
  echo "then run:  xcode-select --install"
  echo ""; echo "Press Return to close."; read -r _; exit 1
fi
PROJ="$(find . -maxdepth 3 -name '*.xcodeproj' | head -1)"
if [ -z "$PROJ" ]; then
  echo "No .xcodeproj found near this file. Put make-ipa.command inside the"
  echo "folder that contains UDCIGMPSuite.xcodeproj, then try again."
  echo ""; echo "Press Return to close."; read -r _; exit 1
fi
echo "Project: $PROJ"
echo "Building (this fetches nothing; a minute or two)…"
rm -rf build Payload out
xcodebuild -project "$PROJ" -scheme UDCIGMPSuite -configuration Release -sdk iphoneos \
  -derivedDataPath build CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" \
  clean build
APP="$(find build/Build/Products/Release-iphoneos -maxdepth 1 -name '*.app' | head -1)"
mkdir -p Payload out
cp -R "$APP" Payload/
( zip -qr "out/UDCI-GMP-Suite-unsigned.ipa" Payload )
open out 2>/dev/null || true
echo ""
echo "Done →  $(pwd)/out/UDCI-GMP-Suite-unsigned.ipa"
echo ""
echo "Install it on the iPad with AltStore or Sideloadly (free Apple ID),"
echo "or open the project in Xcode and use Archive → Distribute for TestFlight."
echo ""; echo "Press Return to close."; read -r _
