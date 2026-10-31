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
