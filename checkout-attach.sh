#!/bin/sh
set -eu
# Extends the existing V132 landing with manual-owner checkout. Safe: no rules, auth, app, or API changes.
mkdir -p public
cp checkout.js public/checkout.js
cp checkout.css public/checkout.css
PAGE=public/index.html
[ -s "$PAGE" ] || exit 2
# Insert above closing body so the existing signup and CMS remain untouched.
if ! grep -q '/checkout.js?v=132-checkout' "$PAGE"; then
  sed -i 's|</head>|<link rel="stylesheet" href="/checkout.css?v=132-checkout-01">\n</head>|' "$PAGE"
  sed -i 's|</body>|<script type="module" src="/checkout.js?v=132-checkout-01"></script>\n</body>|' "$PAGE"
fi
grep -q 'checkout.js?v=132-checkout' "$PAGE"
test -s public/checkout.js
test -s public/checkout.css
echo 'PaperPen checkout presentation and manual-request flow ready; promo remains gated pending server-side authorization.'
# Approved admin-only live request reminder while the admin page is open.
ADMIN=public/admin/index.html
if [ -s "$ADMIN" ] && ! grep -q '/checkout-admin.js?v=132-checkout' "$ADMIN"; then
  cp checkout-admin.js public/checkout-admin.js
  sed -i 's|</body>|<script type="module" src="/checkout-admin.js?v=132-checkout-01"></script>\n</body>|' "$ADMIN"
fi