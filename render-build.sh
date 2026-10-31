#!/bin/sh
set -eu
ARCHIVE=/tmp/paperpen-site.zip
ASSET_URL="https://github.com/ahmedcapo0094-alt/paperpen-website/releases/download/v132-render-1/PaperPen_V132_Render_Web_Assets.zip"
EXPECTED_SHA="26177a2560164792ebcc6f5b2726e6f61b08ba92835b2c21ffc819f029c65c8e"
echo "Downloading the approved PaperPen V132 static website archive..."
curl -fLSs --retry 3 --connect-timeout 30 "$ASSET_URL" -o "$ARCHIVE"
echo "$EXPECTED_SHA  $ARCHIVE" | sha256sum -c -
rm -rf public
mkdir -p public
unzip -qq "$ARCHIVE" -d public
test -s public/index.html
test -s public/admin/index.html
test -s public/app/index.html
test ! -e public/downloads/paper-and-pen.apk
echo "PaperPen V132 static website prepared. APK stays on AWS."

sed -i '/android-download-link/s/ target="_blank" rel="noopener noreferrer"//g' public/index.html

sed -i 's|src="https://unpkg.com/@zxing/library@0.19.1" type="application/javascript"|src="https://unpkg.com/@zxing/library@0.19.1" type="application/javascript" async|' public/app/index.html
sed -i 's|<link rel="manifest" href="manifest.json">|<link rel="manifest" href="manifest.json"><link rel="preload" href="main.dart.js" as="script"><link rel="preconnect" href="https://www.gstatic.com" crossorigin>|' public/app/index.html
sed -i '/^_flutter.loader.load({/,$c\_flutter.loader.load();' public/app/flutter_bootstrap.js

# Approved Nov 1, 2026 V132 presentation-only update (does not alter Flutter/Firebase/APK).
sh site-refresh.sh
