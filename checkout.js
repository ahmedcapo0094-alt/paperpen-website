/* Paper & Pen V132 - owner-initiated manual payment requests.
 * No automatic license activation, financial charge, coupon reservation, or Firebase rule changes.
 */
import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {getFirestore,doc,getDoc,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const config={apiKey:'AIzaSyDN3BKIFaFOpheKGgJFcjWf0jeKHpXQge4',authDomain:'paper-and-pen-33678.firebaseapp.com',projectId:'paper-and-pen-33678',storageBucket:'paper-and-pen-33678.firebasestorage.app'};
const app=getApps().length?getApp():initializeApp(config);
const auth=getAuth(app), db=getFirestore(app);
const plans={base:{label:'الباقة الأساسية',key:'base'},extra_employee:{label:'إضافة موظف',key:'extraEmployee'},renewal:{label:'التجديد السنوي',key:'renewal'},extra_employee_renewal:{label:'تجديد الموظف الإضافي',key:'extraRenewal'}};
const defaultPrices={base:2300,extraEmployee:500,renewal:700,extraRenewal:200};
const priceFields=['cmsBasePrice','cmsSeatPrice','cmsRenewPrice','cmsSeatRenewPrice'];
let currentPlan=null,currentUser=null,ready=false,prices=null,payment=null,store=null,storeId=null,profile=null,promoCode='',requestedPrice=0,couponStage='',regularBase=2300;
const $=id=>document.getElementById(id);
const money=v=>`${Number(v).toLocaleString('ar-EG')} ج.م`;
const msg=(text,kind='info')=>{const n=$('ppCheckoutMsg');if(!n)return;n.textContent=text;n.dataset.status=kind;n.hidden=!text;};
const safePrice=v=>Number.isSafeInteger(Number(v))&&Number(v)>0&&Number(v)<1000000;
const statusText=s=>s==='approved'?'تم اعتماد الطلب':s==='rejected'?'لم تتم الموافقة على الطلب':'بانتظار مراجعة الدفع';
function build(){
const section=$('pricing');const grid=section?.querySelector('.pricing');if(!grid||$('pp-checkout'))return;
const cardList=[...grid.querySelectorAll('.price')];
Object.keys(plans).forEach((key,i)=>{if(!cardList[i])return;const button=document.createElement('button');button.type='button';button.className='pp-select-plan';button.dataset.plan=key;button.textContent='اختار الباقة وادفع ←';cardList[i].appendChild(button);button.addEventListener('click',()=>select(key));});
const wrap=document.createElement('section');wrap.id='pp-checkout';wrap.hidden=true;wrap.setAttribute('aria-label','طلب دفع الاشتراك');
wrap.innerHTML=`<div class="pp-checkout-panel" dir="rtl">
<div class="pp-checkout-header"><h3>💳 إكمال طلب الدفع — <span id="ppPlanName"></span></h3><button type="button" class="pp-checkout-close" id="ppClose">إغلاق ×</button></div>
<p class="pp-checkout-intro">اختار وسيلة الدفع، حوّل المبلغ، وبعدها ابعتلنا بيانات التحويل للتفعيل.</p>
<div class="pp-checkout-summary"><div class="pp-checkout-stat"><small>سعر الباقة</small><b id="ppBasePrice">—</b></div><div class="pp-checkout-stat"><small>المبلغ المطلوب</small><b id="ppFinalPrice">—</b></div></div>
<div class="pp-checkout-coupon" id="ppCouponBlock"><label for="ppCoupon">كود الخصم (أول اشتراك فقط)</label><input class="pp-checkout-input" id="ppCoupon" autocomplete="off" maxlength="16" placeholder="مثال: FB100" dir="ltr" style="text-align:right"><p class="pp-checkout-note" id="ppCouponInfo">الكود بيتراجع يدويًا قبل اعتماد الخصم لأول 100 محل. ما تحولش مبلغ مخفّض قبل تأكيد أهليتك من الإدارة.</p></div>
<div id="ppLoginRequired" hidden><p class="pp-checkout-message" data-status="info">لازم تدخل بحساب صاحب المحل الأول. هنحتفظ بالباقة اللي اخترتها.</p><div class="pp-checkout-actions"><a class="pp-checkout-submit" href="#web-register" id="ppGoRegister">إنشاء حساب / تسجيل الدخول</a></div></div>
<div id="ppPayForm" hidden>
<div id="ppAccountState" class="pp-checkout-note" aria-live="polite"></div>
<div id="ppPaymentMethods" class="pp-checkout-methods"></div>
<div class="pp-checkout-destination" id="ppPaymentDestination" hidden>التحويل إلى<strong></strong></div>
<label for="ppSender" style="font-weight:900;display:block;margin:11px 0 6px">رقم أو عنوان الحساب اللي حوّلت منه *</label><input id="ppSender" class="pp-checkout-input" required maxlength="100" autocomplete="off" placeholder="بيانات حساب التحويل">
<label for="ppTransferRef" style="font-weight:900;display:block;margin:11px 0 6px">مرجع عملية التحويل (اختياري)</label><input id="ppTransferRef" class="pp-checkout-input" maxlength="90" placeholder="رقم العملية إن وجد">
<p class="pp-checkout-note">احتفظ بإيصال التحويل لحين تأكيد الدفع من الإدارة.</p>
<div class="pp-checkout-actions"><button type="button" class="pp-checkout-submit" id="ppSendRequest">أرسلت التحويل — إرسال طلب المراجعة</button></div>
<p class="pp-checkout-note">هنراجع وصول التحويل ونحدث حالة طلبك.</p>
</div><div id="ppCheckoutMsg" class="pp-checkout-message" aria-live="polite" hidden></div>
</div>`;
section.querySelector('.wrap').appendChild(wrap);
$('ppClose').onclick=()=>{wrap.hidden=true;};
$('ppCoupon').addEventListener('input',()=>{promoCode=$('ppCoupon').value.trim().toUpperCase();updatePrice();});
$('ppSendRequest').addEventListener('click',submit);
}
function updatePrice(){
if(!currentPlan||!prices)return;
const full=prices[plans[currentPlan].key];
const hasCoupon=currentPlan==='base'&&(promoCode==='FB100'||couponStage==='reserved');
requestedPrice=hasCoupon?Math.ceil(regularBase*0.6):full;
$('ppBasePrice').textContent=money(hasCoupon?regularBase:full);
$('ppFinalPrice').textContent=hasCoupon?`${money(requestedPrice)} (بعد تأكيد الحجز)` : money(full);
const info=$('ppCouponInfo');
if(currentPlan!=='base') info.textContent='كود FB100 للباقة الأساسية عند أول اشتراك مدفوع فقط.';
else if(!promoCode && couponStage!=='reserved') info.textContent='FB100: خصم 40% لأول 100 محل، ويُحجز من الإدارة قبل تحويل الفلوس.';
else if(promoCode==='FB100'||couponStage==='reserved') info.textContent='الخصم 40%، ويُسمح بتحويل المبلغ المخفض بعد اعتماد حجز الكود من الإدارة فقط.';
else info.textContent='الكود غير معروف. استخدم FB100 أو امسح الكود.';
$('ppSendRequest').textContent=hasCoupon&&couponStage!=='reserved'?'احجز خصم FB100 — بدون تحويل فلوس':'أرسلت التحويل — إرسال طلب المراجعة';
const isReservation=hasCoupon&&couponStage!=='reserved';
$('ppPayForm')?.classList.toggle('pp-reserving',isReservation);
for(const id of ['ppPaymentMethods','ppPaymentDestination','ppSender','ppTransferRef']){const el=$(id);if(el){const parent=(id==='ppSender'||id==='ppTransferRef')?el:null;if(parent)parent.disabled=isReservation;else if(id==='ppPaymentMethods')el.hidden=isReservation;else if(id==='ppPaymentDestination')el.hidden=isReservation||el.hidden;}}
}

async function loadPublicInfo(){
if(ready)return;
const [siteSnap,paySnap]=await Promise.all([getDoc(doc(db,'appConfig','site_public')),getDoc(doc(db,'appConfig','payment'))]);
const p=siteSnap.exists()?siteSnap.data().pricing||{}:{};
const offer=siteSnap.exists()?siteSnap.data().offer:null;
prices=Object.fromEntries(Object.entries(defaultPrices).map(([key,value])=>[key,Number(p[key]??value)]));
regularBase=prices.base;
if(!Object.values(prices).every(safePrice))throw Error('invalid prices');
const millis=v=>v?.toMillis?.()??(typeof v==='string'?Date.parse(v):0);
const now=Date.now(),start=millis(offer?.startsAt),end=millis(offer?.endsAt),percent=Number(offer?.discountPercent);
if(offer?.enabled===true&&start<=now&&now<end&&Number.isInteger(percent)&&percent>0&&percent<=90)prices.base=Math.ceil(prices.base*(100-percent)/100);
payment=paySnap.exists()?paySnap.data():null;
if(!payment || (!payment.instapayEnabled&&!payment.walletEnabled))throw Error('payment setup unavailable');
ready=true;
}
async function getStore(){
if(!currentUser||!currentUser.emailVerified)throw Error('verify-email');
const p=await getDoc(doc(db,'users',currentUser.uid));
if(!p.exists() || p.data().role!=='owner')throw Error('owner-only');
profile=p.data();storeId=String(profile.storeId||currentUser.uid);
const s=await getDoc(doc(db,'Stores',storeId));if(!s.exists())throw Error('store-not-found');
store=s.data();if(store.ownerUid && store.ownerUid!==currentUser.uid)throw Error('owner-only');
}
function drawMethods(){
const items=[];
if(payment.instapayEnabled===true&&typeof payment.instapayAddress==='string'&&payment.instapayAddress.trim())items.push({value:'instapay',label:'InstaPay',target:payment.instapayAddress.trim()});
if(payment.walletEnabled===true&&typeof payment.walletNumber==='string'&&/^01\d{9}$/.test(payment.walletNumber.trim()))items.push({value:'wallet',label:payment.walletProvider||'محفظة إلكترونية',target:payment.walletNumber.trim()});
const wrap=$('ppPaymentMethods');wrap.replaceChildren();
for(const [i,item] of items.entries()){
 const label=document.createElement('label');label.className='pp-checkout-method';
 const inp=document.createElement('input');inp.type='radio';inp.name='ppPayMethod';inp.value=item.value;inp.checked=i===0;inp.addEventListener('change',drawDestination);
 label.append(inp,document.createTextNode(item.label));wrap.append(label);
}
function drawDestination(){const choice=wrap.querySelector('input:checked');const item=items.find(x=>x.value===choice?.value);$('ppPaymentDestination').hidden=!item;$('ppPaymentDestination').querySelector('strong').textContent=item?.target||'';}
if(items.length===0){msg('وسائل الدفع مش متاحة حاليًا. تواصل مع الإدارة.','error');$('ppPayForm').hidden=true;return;}
drawDestination();
}
async function select(plan){
if(!plans[plan])return;
build();currentPlan=plan;couponStage='';
const box=$('pp-checkout');box.hidden=false;$('ppPlanName').textContent=plans[plan].label;
$('ppCouponBlock').hidden=plan!=='base';$('ppCoupon').value='';promoCode='';msg('');
$('ppPayForm').hidden=true;$('ppLoginRequired').hidden=true;
box.style.scrollMarginTop='110px';box.scrollIntoView({behavior:'smooth',block:'start'});
try{
if(!currentUser){$('ppLoginRequired').hidden=false;msg('سجّل الدخول أو أنشئ حسابك الأول؛ الباقة هتفضل محفوظة.');return;}
await loadPublicInfo();updatePrice();
await getStore();
if(store.licenseStatus==='locked')throw Error('locked');
if(store.activationRequestStatus==='pending'&&store.activationPromoCodeRequested==='FB100'&&plan==='base'){
  if(store.activationPromoStage==='reservation_pending'){msg('طلب حجز خصم FB100 وصل. لازم الإدارة تحجز لك مكان ضمن أول 100 محل قبل تحويل أي مبلغ.','info');return;}
  if(store.activationPromoStage==='reservation_confirmed'){
    couponStage='reserved';promoCode='FB100';$('ppCoupon').value='FB100';$('ppCouponBlock').hidden=true;
    updatePrice();$('ppPayForm').hidden=false;
    $('ppAccountState').textContent=`تم حجز خصم FB100 لحساب ${profile.storeName||store.storeName||'محلك'}. المطلوب ${money(requestedPrice)} فقط. حول المبلغ للوسيلة الموضحة ثم ابعت بيانات التحويل.`;
    drawMethods();return;
  }
  if(store.activationPromoStage==='payment_reported'){msg(`طلب الدفع المخفض رقم ${store.activationRequestCode||'—'} بانتظار مراجعة الإدارة والتحقق من وصول التحويل.`, 'info');return;}
}
if(store.activationRequestStatus==='pending'){
msg(`عندك طلب قائم رقم ${store.activationRequestCode||'—'} — ${statusText(store.activationRequestStatus)}. ما تبعتش تحويل جديد قبل مراجعته.`,'info');return;
}
if(plan==='base'&&store.licenseStatus==='paid')throw Error('already-paid');
if(plan!=='base' && store.licenseStatus!=='paid')throw Error('requires-paid');
if(plan==='extra_employee_renewal'&&Number(store.extraEmployeeSeats||0)<1)throw Error('no-extra-employee');
$('ppPayForm').hidden=false;$('ppAccountState').textContent=`الحساب: ${profile.storeName||store.storeName||'محلك'} — صاحب المحل`;
drawMethods();
}catch(err){console.error('checkout initialization failed',err?.code||err?.message);
const labels={'verify-email':'لازم تؤكد البريد الإلكتروني من رسالة التسجيل قبل طلب الدفع.','owner-only':'الشراء متاح لحساب صاحب المحل فقط.','store-not-found':'بيانات المحل مش مكتملة. ادخل بحساب صاحب المحل أولًا.','locked':'الحساب موقوف ولا يمكن طلب شراء جديد.','already-paid':'الاشتراك الأساسي مفعل بالفعل. اختار تجديد أو إضافة.','requires-paid':'الإضافة أو التجديد متاحين بعد تفعيل الباقة الأساسية.', 'no-extra-employee':'لا يوجد موظف إضافي على اشتراك المحل حاليًا. اختار إضافة موظف أولًا.'};
msg(labels[err?.message]||'تعذر تحميل بيانات الدفع من Firebase. مش هنستقبل طلب غير مكتمل. حاول تاني.','error');
}
}
async function submit(){
const button=$('ppSendRequest');if(button.disabled||!currentUser||!currentPlan||!storeId||!prices||!payment)return;
const sender=$('ppSender').value.trim(),reference=$('ppTransferRef').value.trim();
if(currentPlan==='base'&&promoCode&&promoCode!=='FB100'){msg('كود الخصم غير صحيح.','error');return;}
const couponRequested=currentPlan==='base'&&promoCode==='FB100';
const requestingReservation=couponRequested&&couponStage!=='reserved';
const reportingReserved=couponRequested&&couponStage==='reserved';
if(!requestingReservation&&sender.length<5){msg('اكتب بيانات الحساب اللي حولت منه.','error');return;}
const method=requestingReservation?'':$('ppPaymentMethods').querySelector('input:checked')?.value;
const dest=method==='instapay'?payment.instapayAddress:method==='wallet'?payment.walletNumber:null;
if(!requestingReservation&&!dest){msg('اختار وسيلة دفع متاحة.','error');return;}
const requestCode=`PP-${currentPlan==='base'?'BAS':currentPlan==='extra_employee'?'EMP':currentPlan==='renewal'?'REN':'EREN'}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
button.disabled=true;button.textContent='جاري حفظ الطلب…';msg('');
try{
const storeRef=doc(db,'Stores',storeId);
await runTransaction(db,async tx=>{
 const snap=await tx.get(storeRef);if(!snap.exists())throw Error('store-not-found');
 const st=snap.data();if(st.ownerUid&&st.ownerUid!==currentUser.uid)throw Error('owner-only');
 if(st.licenseStatus==='locked')throw Error('locked');
 if(currentPlan==='base'&&st.licenseStatus==='paid')throw Error('already-paid');
 if(currentPlan!=='base'&&st.licenseStatus!=='paid')throw Error('requires-paid');
 if(st.activationRequestStatus==='pending'&&!reportingReserved)throw Error('pending');
 if(reportingReserved){
   if(st.activationRequestPlan!=='base'||st.activationPromoCodeRequested!=='FB100'||st.activationPromoStage!=='reservation_confirmed')throw Error('unreserved');
   if(Number(st.activationRequestAmountEgp)!==Math.ceil(regularBase*.6))throw Error('price-mismatch');
   tx.update(storeRef,{activationPromoStage:'payment_reported',activationPaymentMethod:method,
     activationPaymentLabel:method==='instapay'?'InstaPay':'محفظة إلكترونية',activationPaymentDestination:dest,
     activationPaymentSender:sender,activationPaymentReference:reference,
     activationPaymentReportedAt:serverTimestamp(),updatedAt:serverTimestamp()});
   return;
 }
 tx.update(storeRef,{
   activationRequestStatus:'pending',activationRequestPlan:currentPlan,
   activationRequestAmountEgp:requestedPrice,activationRequestCode:requestCode,
   activationRequestEmail:currentUser.email||'',activationRequestedAt:serverTimestamp(),
   activationPaymentMethod:requestingReservation?'':method,
   activationPaymentLabel:requestingReservation?'':method==='instapay'?'InstaPay':'محفظة إلكترونية',
   activationPaymentDestination:requestingReservation?'':dest||'',activationPaymentSender:requestingReservation?'':sender,
   activationPaymentReference:requestingReservation?'':reference,
   activationPromoCodeRequested:requestingReservation?'FB100':'',
   activationPromoStage:requestingReservation?'reservation_pending':'',updatedAt:serverTimestamp()
 });
});
$('ppPayForm').hidden=true;
msg(requestingReservation?'تم إرسال طلب حجز خصم FB100. لا تحول فلوس حتى تعتمد الإدارة الحجز، وبعدها افتح الموقع تاني وأكمل دفع السعر المخفض.':
    `تم إرسال طلب الدفع ${reportingReserved?'المخفض':''}. الحالة: بانتظار مراجعة وصول الفلوس والتفعيل.`, 'ok');
}catch(e){console.error('checkout request',e.code||e.message);msg('لم يتم حفظ الطلب. راجع تسجيل الدخول وصلاحيات الحساب، ومتحوّليش مبلغ على خصم غير مؤكد.','error');}
finally{button.disabled=false;updatePrice();}
}

function init(){build();const q=new URLSearchParams(location.search);const selected=q.get('plan');if(selected&&plans[selected])select(selected);
onAuthStateChanged(auth,user=>{currentUser=user;if(currentPlan&&$('pp-checkout')&&!$('pp-checkout').hidden)select(currentPlan);});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();