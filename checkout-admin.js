/* Paper & Pen V132 - administrator-only, live checkout notifications.
   Listening requires an active platform-admin Firebase account. This never
   changes Firestore data, account permissions, payments, or licenses.
   OS alerts work while the admin page is running; closed-tab push requires
   separately configured server-side Firebase Cloud Messaging. */
import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {getFirestore,collection,doc,getDoc,onSnapshot,query,where} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const config={apiKey:'AIzaSyDN3BKIFaFOpheKGgJFcjWf0jeKHpXQge4',authDomain:'paper-and-pen-33678.firebaseapp.com',projectId:'paper-and-pen-33678',storageBucket:'paper-and-pen-33678.firebasestorage.app'};
const app=getApps().length?getApp():initializeApp(config);
const auth=getAuth(app), db=getFirestore(app);
const $=id=>document.getElementById(id);
const state={userId:null,unsub:null,version:0,initialized:false,seen:new Map(),pending:[],enabled:false,worker:null,error:''};
function prefKey(){return 'pp_admin_alerts_optin_v1_'+(state.userId||'none');}
function safeRead(key){try{return localStorage.getItem(key);}catch{return null;}}
function safeWrite(key,val){try{localStorage.setItem(key,val);}catch{}}
function setStatus(text){const n=$('ppAlertsStatus');if(n)n.textContent=text;}
function planName(data){
  const plan=String(data.activationRequestPlan||'');
  return plan==='base'?'اشتراك أساسي':plan==='renewal'?'تجديد سنوي':plan==='extra_employee'?'موظف إضافي':plan==='extra_employee_renewal'?'تجديد موظف إضافي':'طلب اشتراك';
}
function stageName(data){
  const stage=String(data.activationPromoStage||'');
  if(stage==='reservation_pending')return 'حجز خصم FB100';
  if(stage==='reservation_confirmed')return 'بانتظار تحويل الخصم';
  if(stage==='payment_reported')return 'تم الإبلاغ عن التحويل';
  return 'بانتظار مراجعة الدفع';
}
function sig(id,data){
  return JSON.stringify([id,String(data.activationRequestCode||''),String(data.activationPromoStage||''),String(data.activationPaymentReportedAt?.seconds||''),String(data.activationRequestStatus||'')]);
}
function showStoreRequests(){
  const storesTab=document.querySelector('[data-admin-tab="stores"]');
  if(storesTab&&!storesTab.classList.contains('active'))storesTab.click();
  const field=$('search');if(field&&field.value){field.value='';field.dispatchEvent(new Event('input',{bubbles:true}));}
  const pending=document.querySelector('.stat[data-filter="pending"]');if(pending)pending.click();
  const heading=$('pendingCount')?.closest('.stats') || $('stores');
  if(heading){heading.style.scrollMarginTop='110px';heading.scrollIntoView({behavior:'smooth',block:'start'});}
  $('ppAlertsPanel')?.setAttribute('hidden','');
}
function updateUI(){
  const count=state.pending.length;
  const total=$('ppAlertsCount');if(total){total.textContent=String(count);total.hidden=count===0;}
  const heading=$('ppAlertsHeading');if(heading)heading.textContent=`طلبات تحتاج مراجعة (${count})`;
  const list=$('ppAlertsList');
  if(list){
    list.replaceChildren();
    if(!count){const p=document.createElement('p');p.className='pp-alerts-empty';p.textContent='مفيش طلبات دفع معلقة حاليًا.';list.appendChild(p);}
    else state.pending.slice(0,12).forEach(item=>{
      const card=document.createElement('button');card.type='button';card.className='pp-alerts-item';
      const title=document.createElement('strong');title.textContent=item.store;
      const sub=document.createElement('small');sub.textContent=item.plan+' • '+item.stage+(item.amount?' • '+item.amount+' ج.م':'');
      card.append(title,sub);card.addEventListener('click',showStoreRequests);list.appendChild(card);
    });
    if(count>12){const more=document.createElement('p');more.className='pp-alerts-empty';more.textContent=`وفيه ${count-12} طلبات تانية في قائمة العملاء.`;list.appendChild(more);}
  }
  if(state.error)setStatus('تعذّر مزامنة التنبيهات: راجع اتصال Firebase وصلاحيات الإدارة.');
  else if(!state.enabled)setStatus('التنبيهات الفورية داخل اللوحة شغالة. تقدر تفعّل إشعارات الموبايل والاهتزاز.');
  else if(!('Notification' in window))setStatus('التنبيهات داخل اللوحة شغالة؛ المتصفح لا يدعم إشعارات النظام.');
  else if(Notification.permission==='granted')setStatus('الإشعارات مفعّلة وقت فتح لوحة الإدارة. الإشعارات بعد إغلاقها تحتاج ربط Push مستقل.');
  else if(Notification.permission==='denied')setStatus('المتصفح حظر الإشعارات؛ تقدر تفتحها من إعدادات الموقع. تنبيهات اللوحة مستمرة.');
  else setStatus('اضغط تفعيل لمنح المتصفح إذن إشعارات الموبايل.');
  const toggle=$('ppAlertsEnable');if(toggle){toggle.textContent=state.enabled?'إيقاف إشعارات الموبايل':'تفعيل إشعارات الموبايل';}
}
function makeUI(){
  if($('ppAlertsCenter'))return;
  const top=document.querySelector('#adminView .top');
  if(!top)return;
  const center=document.createElement('div');center.id='ppAlertsCenter';
  const bell=document.createElement('button');bell.type='button';bell.id='ppAlertsBell';bell.className='pp-alerts-bell';
  bell.setAttribute('aria-label','فتح تنبيهات الدفع');bell.setAttribute('aria-expanded','false');
  bell.append(document.createTextNode('🔔'));
  const badge=document.createElement('span');badge.id='ppAlertsCount';badge.className='pp-alerts-badge';badge.hidden=true;bell.appendChild(badge);
  center.appendChild(bell);
  const panel=document.createElement('section');panel.id='ppAlertsPanel';panel.className='pp-alerts-panel';panel.hidden=true;
  panel.setAttribute('aria-label','تنبيهات طلبات الدفع');
  const head=document.createElement('div');head.className='pp-alerts-head';
  const title=document.createElement('h2');title.id='ppAlertsHeading';title.textContent='طلبات تحتاج مراجعة';
  const close=document.createElement('button');close.type='button';close.className='pp-alerts-close';close.textContent='×';close.setAttribute('aria-label','إغلاق التنبيهات');close.onclick=()=>{panel.hidden=true;bell.setAttribute('aria-expanded','false');};
  head.append(title,close);panel.appendChild(head);
  const list=document.createElement('div');list.id='ppAlertsList';list.className='pp-alerts-list';panel.appendChild(list);
  const status=document.createElement('p');status.id='ppAlertsStatus';status.className='pp-alerts-status';status.setAttribute('role','status');panel.appendChild(status);
  const actions=document.createElement('div');actions.className='pp-alerts-actions';
  const enable=document.createElement('button');enable.id='ppAlertsEnable';enable.type='button';enable.className='pp-alerts-enable';enable.onclick=enableAlerts;
  const test=document.createElement('button');test.type='button';test.className='pp-alerts-secondary';test.textContent='جرّب الاهتزاز';test.onclick=testAlert;
  const view=document.createElement('button');view.type='button';view.className='pp-alerts-secondary';view.textContent='عرض طلبات الدفع';view.onclick=showStoreRequests;
  actions.append(enable,test,view);panel.appendChild(actions);
  center.appendChild(panel);
  const logout=$('logoutBtn');if(logout)top.insertBefore(center,logout);else top.appendChild(center);
  bell.onclick=()=>{panel.hidden=!panel.hidden;bell.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)updateUI();};
  updateUI();
}
async function registerWorker(){
  if(!('serviceWorker' in navigator)||!('Notification' in window))return null;
  if(state.worker)return state.worker;
  try{state.worker=await navigator.serviceWorker.register('/admin/pp-admin-notify-sw.js',{scope:'/admin/'});return state.worker;}
  catch(err){console.warn('PaperPen notification worker unavailable',err?.message);return null;}
}
async function displaySystemNotice(title,body,tag){
  if(!state.enabled||!('Notification' in window)||Notification.permission!=='granted')return;
  const worker=await registerWorker();if(!worker)return;
  try{await worker.showNotification(title,{body,tag,icon:'/assets/logo.png',vibrate:[180,110,180],data:{url:'/admin/#payment-requests'},renotify:false});}
  catch(err){console.warn('PaperPen system notification unavailable',err?.message);}
}
function vibrate(){try{if(typeof navigator.vibrate==='function'&&document.visibilityState==='visible')navigator.vibrate([180,110,180]);}catch{}}
async function enableAlerts(){
  if(!state.userId)return;
  if(state.enabled){state.enabled=false;safeWrite(prefKey(),'off');updateUI();return;}
  state.enabled=true;safeWrite(prefKey(),'on');
  vibrate();
  if('Notification' in window){
    try{
      // Permission must be requested directly from a user click, not on page load.
      const result=await Notification.requestPermission();
      if(result==='granted')await registerWorker();
    }catch(err){console.warn('Browser notification permission not granted',err?.message);}
  }
  updateUI();
}
async function testAlert(){
  if(!state.userId)return;
  vibrate();
  if(state.enabled){await displaySystemNotice('ورقة وقلم — اختبار التنبيهات','ده اختبار فقط، مش طلب دفع حقيقي.','pp-test-alert');}
  setStatus('تم اختبار التنبيه. لو مفيش اهتزاز، جرّب Chrome على أندرويد وتأكد من إعدادات الاهتزاز والسماح بإشعارات الموقع.');
}
function clear(){
  state.version+=1;state.unsub?.();state.unsub=null;state.initialized=false;state.seen.clear();state.pending=[];state.userId=null;state.enabled=false;state.error='';
  $('ppAlertsCenter')?.remove();
  $('ppAdminNewRequest')?.remove();
}
function process(snap){
  if(!state.userId)return;
  const current=new Map();const list=[];
  snap.forEach(docSnap=>{
    const d=docSnap.data();current.set(docSnap.id,sig(docSnap.id,d));
    list.push({id:docSnap.id,store:String(d.storeName||'محل بدون اسم'),stage:stageName(d),plan:planName(d),amount:Number(d.activationRequestAmountEgp||0)});
  });
  list.sort((a,b)=>a.store.localeCompare(b.store,'ar'));
  if(state.initialized&&!snap.metadata.fromCache){
    const updated=[];
    for(const entry of list){
      const previous=state.seen.get(entry.id);
      const now=current.get(entry.id);
      if(previous!==now)updated.push(entry);
    }
    if(updated.length){
      // No financial details or customer names in the Android lock-screen alert.
      const latest=updated[0];const name=latest.stage==='تم الإبلاغ عن التحويل'?'بلاغ تحويل جديد':'طلب دفع أو خصم جديد';
      displaySystemNotice('🔔 ورقة وقلم — '+name,`${updated.length} طلب يحتاج مراجعة في لوحة الإدارة`,'pp-payment-'+Date.now());
      if(state.enabled)vibrate();
      const panel=$('ppAlertsPanel');if(panel?.hidden){const n=$('ppAlertsBell');n?.classList.add('pp-alerts-pulse');}
    }
  }
  state.seen=current;state.pending=list;state.initialized=true;state.error='';updateUI();
}
onAuthStateChanged(auth,async user=>{
  clear();if(!user||user.isAnonymous)return;
  const version=state.version;
  try{
    const admin=await getDoc(doc(db,'platformAdmins',user.uid));
    if(version!==state.version||auth.currentUser?.uid!==user.uid||admin.data()?.active!==true)return;
    state.userId=user.uid;state.enabled=safeRead(prefKey())==='on';
    makeUI();
    if(state.enabled&&('Notification' in window)&&Notification.permission==='granted')registerWorker();
    state.unsub=onSnapshot(query(collection(db,'Stores'),where('activationRequestStatus','==','pending')),process,err=>{
      console.warn('PaperPen realtime admin requests',err?.code||err?.message);
      state.error=String(err?.code||'unknown');updateUI();
    });
    const heading=document.getElementById('ppAlertsBell');heading?.addEventListener('click',()=>heading.classList.remove('pp-alerts-pulse'));
    if(location.hash==='#payment-requests')showStoreRequests();
  }catch(err){console.warn('PaperPen admin alert setup failed',err?.code||err?.message);}
});