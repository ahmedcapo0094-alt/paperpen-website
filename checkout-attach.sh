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
  sed -i 's|</head>|<link rel="stylesheet" href="/checkout.css?v=132-checkout-02">\n</head>|' "$PAGE"
  sed -i 's|</body>|<script type="module" src="/checkout.js?v=132-checkout-02"></script>\n</body>|' "$PAGE"
fi
grep -q 'checkout.js?v=132-checkout' "$PAGE"
test -s public/checkout.js
test -s public/checkout.css
echo 'PaperPen checkout manual-payment and FB100 reservation request flow staged.'
# Approved admin-only live request reminder while the admin page is open.
ADMIN=public/admin/index.html
if [ -s "$ADMIN" ] && ! grep -q '/checkout-admin.js?v=132-checkout' "$ADMIN"; then
  cp checkout-admin.js public/checkout-admin.js
  sed -i 's|</body>|<script type="module" src="/checkout-admin.js?v=132-checkout-02"></script>\n</body>|' "$ADMIN"
fi

# Harden the existing admin's manual approval against client-edited payment amounts.
# Use live CMS prices, not the amount written by a browser, and disallow unsupported plan types.
if [ -s "$ADMIN" ]; then
  sed -i 's/if(\["base","extra_employee","renewal"\].includes(p))/if(["base","extra_employee","renewal","extra_employee_renewal"].includes(p))/' "$ADMIN"
  sed -i '/^  const prompt=plan===/i\  const allowedAmount=plan==="extra_employee"?prices.extraEmployee:plan==="renewal"?prices.renewal:plan==="base"?prices.effectiveBase:null;\n  if(allowedAmount===null){alert("هذه الباقة تحتاج مراجعة تفعيل منفصلة؛ لا تعتمدها كتفعيل أساسي.");return;}\n  if(!Number.isSafeInteger(requestedAmount)||requestedAmount!==allowedAmount){alert("المبلغ المطلوب لا يطابق السعر المعتمد حاليًا. راجع تحويل العميل والسعر الأصلي قبل أي تفعيل.");return;}\n  if(plan==="base"&&s.licenseStatus==="paid"){alert("هذا المحل مشترك بالفعل. راجع نوع الطلب.");return;}\n  if(plan!=="base"&&s.licenseStatus!=="paid"){alert("الإضافة والتجديد يحتاجان اشتراكًا مدفوعًا قائمًا.");return;}' "$ADMIN"
  grep -q 'allowedAmount=plan===' "$ADMIN"
fi

# FB100 manual-admin coupon reservation / activation, quota stored in admin-only siteRevisions.
cp coupon-admin.js public/coupon-admin.js
if [ -s "$ADMIN" ] && ! grep -q 'coupon-admin.js?v=fb100-2' "$ADMIN"; then
  sed -i 's|</body>|<script type="module" src="/coupon-admin.js?v=fb100-2"></script>\n</body>|' "$ADMIN"
fi
test -s public/coupon-admin.js
grep -q 'coupon-admin.js?v=fb100-2' "$ADMIN"
echo 'FB100 admin-only coupon reservation enabled in site build (runtime Firestore role verification required).'

# Clarify the existing Admin queue labels without modifying account entitlements.
if [ -s "$ADMIN" ]; then
  sed -i 's/plan==="renewal"?"طلب تجديد سنوي":"طلب تفعيل جديد"/plan==="renewal"?"طلب تجديد سنوي":plan==="extra_employee_renewal"?"تجديد موظف إضافي":"طلب تفعيل جديد"/g' "$ADMIN"
  sed -i 's/plan==="renewal"?"تأكيد التجديد":"تفعيل مدفوع"/plan==="renewal"?"تأكيد التجديد":plan==="extra_employee_renewal"?"تأكيد تجديد الموظف":"تفعيل مدفوع"/g' "$ADMIN"
fi
# Web bundle warmup only for visitors intentionally opening Flutter Web.
cp web-warmup.js public/web-warmup.js
sed -i 's|</body>|<script defer src="/web-warmup.js?v=132-warmup-01"></script>\n</body>|' "$PAGE"
test -s public/web-warmup.js
echo 'PaperPen V132 web warmup staged; APK, Firebase, and app source untouched.'
