/* FB100 controlled manual redemption – Paper & Pen V132.
 * Only active platformAdmins may reserve and redeem vouchers.
 * The cap lives in a Firestore document writable only by the admin role.
 * No customer may reserve or redeem a slot directly.
 */
import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {getFirestore,doc,collection,getDoc,getDocs,setDoc,addDoc,query,where,limit,runTransaction,serverTimestamp,Timestamp,onSnapshot} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
const config={apiKey:'AIzaSyDN3BKIFaFOpheKGgJFcjWf0jeKHpXQge4',authDomain:'paper-and-pen-33678.firebaseapp.com',projectId:'paper-and-pen-33678',storageBucket:'paper-and-pen-33678.firebasestorage.app'};
const app=getApps().length?getApp():initializeApp(config),auth=getAuth(app),db=getFirestore(app);
const ROOT=doc(db,'siteRevisions','promo_FB100');
let adminReady=false;
const approvedBasePrice=p=>Number(p?.pricing?.base??2300);
const validPrice=p=>Number.isSafeInteger(p)&&p>0&&p<1000000;
const oldApprove=window.approveRequest;
function safeMessage(e){console.warn('FB100 action denied',e?.code||e?.message);alert(e?.message==='sold-out'?'انتهى عدد الـ100 حجز لخصم FB100. لا تطلب من العميل تحويل مبلغ الخصم.':e?.message==='stale-price'?'السعر تغيّر. راجع السعر وأعد طلب الحجز قبل تحويل فلوس.':'لم يكتمل الإجراء. راجع صلاحيات مدير المنصة وحالة الطلب، ولا تعتمد الدفع قبل التحقق.');}
async function verifyAdmin(){const u=auth.currentUser;if(!u||u.isAnonymous)return false;const s=await getDoc(doc(db,'platformAdmins',u.uid));return s.exists()&&s.data().active===true;}
async function reserve(storeId){
 if(!confirm('تأكيد حجز مقعد واحد من عرض FB100 لأول 100 محل؟ بعد الحجز فقط سيظهر للعميل مبلغ الخصم للتحويل.'))return;
 try{
 await runTransaction(db,async tx=>{
   const storeRef=doc(db,'Stores',storeId),voucherRef=doc(db,'siteRevisions',`promo_FB100_${storeId}`),priceRef=doc(db,'appConfig','site_public');
   const [st,root,voucher,publicDoc]=await Promise.all([tx.get(storeRef),tx.get(ROOT),tx.get(voucherRef),tx.get(priceRef)]);
   if(!st.exists())throw Error('missing-store');
   const s=st.data(),full=approvedBasePrice(publicDoc.data());
   if(!validPrice(full)||s.licenseStatus==='paid'||s.licenseStatus==='locked'||s.activationRequestStatus!=='pending'
      ||s.activationRequestPlan!=='base'||s.activationPromoCodeRequested!=='FB100'||s.activationPromoStage!=='reservation_pending')throw Error('ineligible');
   if(voucher.exists()||s.activationPromoRedeemedAt)throw Error('duplicate-store');
   const used=Number(root.data()?.usedCount||0),redeemed=Number(root.data()?.redeemedCount||0);
   if(!Number.isSafeInteger(used)||!Number.isSafeInteger(redeemed)||used<redeemed||used>=100)throw Error('sold-out');
   const discounted=Math.ceil(full*0.6);
   if(Number(s.activationRequestAmountEgp)!==discounted)throw Error('stale-price');
   tx.set(ROOT,{code:'FB100',discountPercent:40,maxRedemptions:100,usedCount:used+1,
     redeemedCount:redeemed,updatedAt:serverTimestamp()},{merge:true});
   tx.set(voucherRef,{code:'FB100',storeId,requestCode:s.activationRequestCode,
     originalEgp:full,discountedEgp:discounted,status:'reserved',reservedAt:serverTimestamp(),reservedBy:auth.currentUser.uid});
   tx.update(storeRef,{activationPromoStage:'reservation_confirmed',activationPromoCodeReserved:'FB100',
     activationRequestAmountEgp:discounted,activationPromoReservedAt:serverTimestamp(),updatedAt:serverTimestamp()});
 });
 alert('تم حجز الخصم بنجاح. العميل يفتح الموقع ويحوّل المبلغ المخفض، وبعد وصول الفلوس راجع طلبه للتفعيل.');
 document.getElementById('refreshBtn')?.click();
 }catch(e){safeMessage(e);}
}
async function recordReferral(s,id){
 const code=String(s.referralCode||'').trim().toUpperCase();
 if(!/^AM[0-9]{4,}$/.test(code))return;
 const agent=await getDoc(doc(db,'agents',code));if(!agent.exists()||agent.data().active===false)return;
 const commissionRef=doc(db,'commissions',`customer_${id}`);
 if((await getDoc(commissionRef)).exists())return;
 const prev=await getDocs(query(collection(db,'commissions'),where('agentCode','==',code),where('type','==','customer_activation'),limit(1)));
 await setDoc(commissionRef,{type:'customer_activation',agentCode:code,storeId:id,storeName:s.storeName||'',ownerEmail:s.activationRequestEmail||'',amountEgp:300,status:'due',createdAt:serverTimestamp(),paidAt:null});
 const by=String(agent.data().recruitedBy||'').trim().toUpperCase();
 if(prev.empty&&/^AM[0-9]{4,}$/.test(by)){
 const recruiter=await getDoc(doc(db,'agents',by));if(recruiter.exists()&&recruiter.data().active!==false){
 const ref=doc(db,'commissions',`recruit_${code}`);if(!(await getDoc(ref)).exists())await setDoc(ref,{type:'recruitment_bonus',agentCode:by,recruitedAgentCode:code,amountEgp:500,status:'due',createdAt:serverTimestamp(),paidAt:null});
 }}
}
async function finalize(storeId){
 if(!confirm('هل راجعت حساب الدفع وتأكدت فعلًا من استلام مبلغ الاشتراك المخفض؟ سيتم التفعيل سنويًا وتسجيل استخدام واحد من FB100.'))return;
 let source=null;
 try{
 await runTransaction(db,async tx=>{
   const storeRef=doc(db,'Stores',storeId),voucherRef=doc(db,'siteRevisions',`promo_FB100_${storeId}`),priceRef=doc(db,'appConfig','site_public');
   const [st,root,voucher,publicDoc]=await Promise.all([tx.get(storeRef),tx.get(ROOT),tx.get(voucherRef),tx.get(priceRef)]);
   if(!st.exists()||!root.exists()||!voucher.exists())throw Error('missing-reservation');
   const s=st.data(),v=voucher.data(),config=publicDoc.data(),full=approvedBasePrice(config),discounted=Math.ceil(full*.6);
   if(s.licenseStatus==='paid'||s.licenseStatus==='locked'||s.activationRequestStatus!=='pending'
      ||s.activationRequestPlan!=='base'||s.activationPromoCodeRequested!=='FB100'||s.activationPromoStage!=='payment_reported'
      ||!String(s.activationPaymentSender||'').trim()||v.status!=='reserved'||v.requestCode!==s.activationRequestCode
      ||v.discountedEgp!==discounted||Number(s.activationRequestAmountEgp)!==discounted||!validPrice(full))throw Error('ineligible');
   const used=Number(root.data().usedCount),redeemed=Number(root.data().redeemedCount||0);
   if(!Number.isSafeInteger(used)||!Number.isSafeInteger(redeemed)||used>100||redeemed>=used)throw Error('quota-error');
   const expiry=new Date();expiry.setFullYear(expiry.getFullYear()+1);
   tx.update(storeRef,{licenseStatus:'paid',licenseActivatedAt:serverTimestamp(),licenseExpiresAt:Timestamp.fromDate(expiry),
     includedEmployeeSeats:1,firstYearPriceEgp:discounted,annualRenewalPriceEgp:Number(config?.pricing?.renewal??700),
     extraEmployeeSeatPriceEgp:Number(config?.pricing?.extraEmployee??500),extraEmployeeAnnualRenewalPriceEgp:Number(config?.pricing?.extraRenewal??200),
     activationRequestStatus:'approved',activationReviewedAt:serverTimestamp(),activationPromoStage:'redeemed',
     activationPromoRedeemedAt:serverTimestamp(),updatedAt:serverTimestamp()});
   tx.update(voucherRef,{status:'redeemed',redeemedAt:serverTimestamp(),redeemedBy:auth.currentUser.uid});
   tx.update(ROOT,{redeemedCount:redeemed+1,updatedAt:serverTimestamp()});
   source=s;
 });
 alert('تم تفعيل المحل بخصم 40% وتسجيله ضمن أول 100 محل بنجاح.');
 try{
   await addDoc(collection(db,'commissions'),{type:'admin_action',actionType:'activation_payment',label:'تفعيل ورقة وقلم بخصم FB100',storeId,amountEgp:Math.ceil(approvedBasePrice((await getDoc(doc(db,'appConfig','site_public'))).data())*.6),adminEmail:auth.currentUser?.email||'',createdAt:serverTimestamp(),promoCode:'FB100'});
   await recordReferral(source,storeId);
 }catch(logErr){console.warn('Activation succeeded; commission log needs review',logErr?.code||logErr?.message);alert('التفعيل نجح؛ لكن سجل العمليات/عمولات المندوبين يحتاج مراجعة من الإدارة.');}
 document.getElementById('refreshBtn')?.click();
 }catch(e){safeMessage(e);}
}
// One existing extra employee seat's annual renewal is a manual invoice, not
// a new store license or an additional seat. Admin only, after verifying money.
async function approveExtraEmployeeRenewal(id){
  if(!await verifyAdmin())throw Error('owner-only-admin');
  const storeRef=doc(db,'Stores',id),configRef=doc(db,'appConfig','site_public');
  const [before,cfg]=await Promise.all([getDoc(storeRef),getDoc(configRef)]);
  const preview=before.data(),price=Number(cfg.data()?.pricing?.extraRenewal??200);
  if(!before.exists()||!validPrice(price))throw Error('invalid-renewal-price');
  if(preview.activationRequestPlan!=='extra_employee_renewal'||preview.activationRequestStatus!=='pending')throw Error('invalid-request');
  if(!confirm('هل تأكدت من وصول '+price+' ج.م لتجديد موظف إضافي واحد؟ لن يتغير عدد المقاعد ولا مدة الاشتراك الأساسي.'))return;
  await runTransaction(db,async tx=>{
    const [snapshot,pricingDoc]=await Promise.all([tx.get(storeRef),tx.get(configRef)]);
    if(!snapshot.exists())throw Error('store-not-found');
    const st=snapshot.data();
    const expected=Number(pricingDoc.data()?.pricing?.extraRenewal??200);
    if(!validPrice(expected)||st.licenseStatus!=='paid'||st.activationRequestStatus!=='pending'||
       st.activationRequestPlan!=='extra_employee_renewal'||Number(st.extraEmployeeSeats||0)<1||
       Number(st.activationRequestAmountEgp)!==expected||
       !String(st.activationPaymentSender||'').trim()||
       !['instapay','wallet'].includes(st.activationPaymentMethod)||st.activationPromoCodeRequested)throw Error('invalid-renewal-request');
    tx.update(storeRef,{
      extraEmployeeRenewalLastPaidAt:serverTimestamp(),
      extraEmployeeRenewalPayments:Number(st.extraEmployeeRenewalPayments||0)+1,
      extraEmployeeAnnualRenewalPriceEgp:expected,
      activationRequestStatus:'approved',
      activationReviewedAt:serverTimestamp(),
      updatedAt:serverTimestamp()
    });
  });
  try{
    await addDoc(collection(db,'commissions'),{
      type:'admin_action',actionType:'extra_employee_renewal_payment',
      label:'تجديد موظف إضافي واحد',storeId:id,amountEgp:price,
      adminEmail:auth.currentUser?.email||'',createdAt:serverTimestamp()
    });
  }catch(error){console.warn('Renewal confirmed; audit entry requires review',error?.code||error?.message);}
  alert('تم إثبات سداد تجديد موظف إضافي واحد دون تغيير مدة اشتراك المحل أو عدد المقاعد.');
  document.getElementById('refreshBtn')?.click();
}

window.approveRequest=async id=>{
 if(!adminReady){alert('برجاء تسجيل الدخول بحساب مدير المنصة أولًا.');return;}
 try{
 const snap=await getDoc(doc(db,'Stores',id));if(!snap.exists()){alert('المحل غير موجود.');return;}
 const s=snap.data();if(s.activationRequestPlan==='extra_employee_renewal')return await approveExtraEmployeeRenewal(id);if(s.activationPromoCodeRequested!=='FB100')return oldApprove?.(id);
 if(s.activationPromoStage==='reservation_pending')return reserve(id);
 if(s.activationPromoStage==='reservation_confirmed'){alert('الكود اتحجز. استنى العميل يحول المبلغ ويبلّغنا من الموقع قبل التفعيل.');return;}
 if(s.activationPromoStage==='payment_reported')return finalize(id);
 alert('حالة الطلب غير صالحة للتفعيل. راجع تفاصيل العميل.');
 }catch(e){safeMessage(e);}
};
let stopListening=null;
async function cancelReservation(storeId){
 if(!confirm('إلغاء حجز الخصم لهذا المحل وإعادة المقعد للعرض؟ لا تعمل ده لو العميل حول فلوس بالفعل.'))return;
 try{
 await runTransaction(db,async tx=>{
  const storeRef=doc(db,'Stores',storeId),voucherRef=doc(db,'siteRevisions',`promo_FB100_${storeId}`);
  const [st,voucher,root]=await Promise.all([tx.get(storeRef),tx.get(voucherRef),tx.get(ROOT)]);
  if(!st.exists()||!voucher.exists()||!root.exists())throw Error('missing reservation');
  const s=st.data(),v=voucher.data(),used=Number(root.data().usedCount),redeemed=Number(root.data().redeemedCount||0);
  if(s.activationPromoStage!=='reservation_confirmed'||s.activationRequestStatus!=='pending'||v.status!=='reserved'||v.requestCode!==s.activationRequestCode||used<=redeemed)throw Error('not-cancellable');
  tx.update(ROOT,{usedCount:used-1,updatedAt:serverTimestamp()});
  tx.delete(voucherRef);
  tx.update(storeRef,{activationRequestStatus:'rejected',activationPromoStage:'cancelled',activationPromoCodeReserved:'',activationReviewedAt:serverTimestamp(),updatedAt:serverTimestamp()});
 });
 alert('تم إلغاء الحجز ورجوع المقعد إلى عدد الأماكن المتاحة.');
 document.getElementById('refreshBtn')?.click();
 }catch(e){safeMessage(e);}
}
async function drawPanel(entries){
 let box=document.getElementById('ppFb100Panel');
 if(!box){box=document.createElement('section');box.id='ppFb100Panel';box.setAttribute('dir','rtl');
 box.style.cssText='margin:14px 0;padding:16px;border-radius:16px;background:#eaffff;border:2px solid #00bcb9;color:#062b45;';
 const target=document.getElementById('stores')||document.body;target.parentElement.insertBefore(box,target);}
 let countText='عدد المقاعد: غير متاح';
 try{const c=(await getDoc(ROOT)).data()||{};countText=`المحجوز من 100: ${Number(c.usedCount||0)} — المفعّل المدفوع: ${Number(c.redeemedCount||0)}`;}
 catch(e){console.warn('Coupon counter unavailable',e?.code);}
 box.replaceChildren();
 const h=document.createElement('h3');h.textContent='🎟️ عرض FB100 — خصم 40%';box.appendChild(h);
 const details=document.createElement('p');details.textContent=countText;box.appendChild(details);
 const active=entries.filter(x=>x.activationRequestStatus==='pending');
 if(!active.length){const p=document.createElement('p');p.textContent='مفيش طلبات كوبون معلقة حاليًا.';box.appendChild(p);return;}
 active.forEach(s=>{
  const row=document.createElement('div');row.style.cssText='border-top:1px solid #a1d5db;padding:12px 2px;display:flex;gap:9px;flex-wrap:wrap;align-items:center';
  const title=document.createElement('strong');title.textContent=`${s.storeName||s.id}: ${s.activationPromoStage==='reservation_pending'?'بانتظار الحجز':s.activationPromoStage==='reservation_confirmed'?'الخصم محجوز — بانتظار تحويل العميل':s.activationPromoStage==='payment_reported'?'العميل أبلغ بالتحويل — راجع استلام الفلوس':'تحتاج مراجعة'}`;row.appendChild(title);
  const b=document.createElement('button');b.type='button';b.className='btn teal';b.textContent=s.activationPromoStage==='reservation_pending'?'احجز الخصم':s.activationPromoStage==='payment_reported'?'راجع الدفع وفعّل':'الحجز قائم';b.disabled=s.activationPromoStage==='reservation_confirmed';b.onclick=()=>window.approveRequest(s.id);row.appendChild(b);
  if(s.activationPromoStage==='reservation_confirmed'){
    const c=document.createElement('button');c.type='button';c.className='btn ghost';c.textContent='إلغاء الحجز وإرجاع المكان';c.onclick=()=>cancelReservation(s.id);row.appendChild(c);
  }
  box.appendChild(row);
 });
}
onAuthStateChanged(auth,async()=>{
 adminReady=false;stopListening?.();stopListening=null;document.getElementById('ppFb100Panel')?.remove();
 try{adminReady=await verifyAdmin();if(adminReady){
  stopListening=onSnapshot(query(collection(db,'Stores'),where('activationPromoCodeRequested','==','FB100')),snap=>{
    const rows=snap.docs.map(d=>({id:d.id,...d.data()}));drawPanel(rows).catch(e=>console.warn('Coupon panel unavailable',e?.code||e?.message));
  },e=>console.warn('Coupon requests unavailable',e?.code||e?.message));
 }}catch(e){console.warn('FB100 admin role read failed',e?.code||e?.message);}
});