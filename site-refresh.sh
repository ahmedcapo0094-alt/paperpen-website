#!/bin/sh
set -eu
# Adds only a landing page presentation layer over the immutable V132 release.
# No Firebase, login, licensing, APK, or Flutter Web files are modified.
PAGE=public/index.html
[ -s "$PAGE" ] || { echo 'Missing PaperPen landing'; exit 1; }
mkdir -p public/media
base64 -d site-assets/paperpen-real-interface.b64 > public/media/paperpen-real-interface.webp
[ -s public/media/paperpen-real-interface.webp ] || exit 1
cp site-refresh.css public/site-refresh.css

# Target only the approved hero, preserving original links, signup, and CMS.
sed -i \
  -e 's|<span id="platformKicker" class="download-kicker">ورقة وقلم على Android وiPhone والويب</span>|<a id="platformKicker" class="download-kicker trial-launch" href="#web-register"><span class="trial-main">🎁 تجربة مجانية</span><span class="trial-limit">3 أيام أو 5 أجهزة</span></a>|' \
  -e 's|<h1 id="platformHeadline">شغّل ورقة وقلم من أي موبايل</h1>|<h1 id="platformHeadline">📱 ورقة وقلم <span>Web + Android</span></h1><h2 class="hero-pocket">🔥 الباترينة في جيبك!!!</h2>|' \
  -e 's|<p id="platformCopy">على Android: افتح البرنامج من الويب أو حمّل APK. على iPhone: افتح نسخة الويب مباشرة من Safari. نفس الحساب والبيانات يعملان على كل الأجهزة.</p>|<p id="platformCopy">نفس حسابك وبيانات محلك على الموبايل والويب.</p>|' \
  -e 's|<div class="promo-card"><img src="media/promo-1.webp" alt="ورقة وقلم - صورة 1" loading="lazy"></div>|<div class="promo-card"><img src="media/paperpen-real-interface.webp" alt="واجهة ورقة وقلم الحقيقية - سعر اليوم والشراء والبيع والمخزون والتقارير" loading="lazy"></div>|' \
  -e '/if(kicker) kicker.textContent=/d' \
  -e '/if(headline) headline.textContent=/d' \
  -e '/if(copy) copy.textContent=/d' \
  "$PAGE"
# Keep heading and primary CTA in the original markup for mobile and desktop.
sed -i 's|</head>|<link rel="stylesheet" href="/site-refresh.css?v=132-20261101b">\n</head>|' "$PAGE"
grep -q 'الباترينة في جيبك' "$PAGE"
grep -q 'paperpen-real-interface.webp' "$PAGE"
grep -q 'href="#web-register"' "$PAGE"
echo 'PaperPen V132 landing refresh staged.'