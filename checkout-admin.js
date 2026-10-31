/* Existing admin approval stays authoritative. This adds only an open-tab pending-request alert. */
import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {getFirestore,collection,doc,getDoc,onSnapshot,query,where} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
const config={apiKey:'AIzaSyDN3BKIFaFOpheKGgJFcjWf0jeKHpXQge4',authDomain:'paper-and-pen-33678.firebaseapp.com',projectId:'paper-and-pen-33678',storageBucket:'paper-and-pen-33678.firebasestorage.app'};
const app=getApps().length?getApp():initializeApp(config),auth=getAuth(app),db=getFirestore(app);
let unsub=null,loaded=false,last=0;
function remove(){unsub?.();unsub=null;loaded=false;last=0;document.getElementById('ppAdminNewRequest')?.remove();}
function alertNew(number){
let node=document.getElementById('ppAdminNewRequest');if(!node){
node=document.createElement('aside');node.id='ppAdminNewRequest';node.setAttribute('role','status');
node.style.cssText='position:fixed;bottom:14px;right:14px;left:14px;max-width:440px;margin:auto;background:#06344d;color:white;z-index:9998;border:2px solid #0fd5d0;border-radius:18px;padding:17px;font-weight:800;box-shadow:0 8px 30px #001e3580;text-align:center';
const txt=document.createElement('span');txt.id='ppAdminNewRequestText';node.appendChild(txt);
const btn=document.createElement('button');btn.type='button';btn.textContent='تحديث طلبات العملاء';btn.style.cssText='display:block;margin:9px auto 0;padding:10px 16px;background:#5ce9e6;color:#073449;border:0;border-radius:11px;font:inherit;font-weight:900';
btn.onclick=()=>{document.getElementById('refreshBtn')?.click();node.remove();};node.appendChild(btn);
document.body.appendChild(node);
}
node.querySelector('#ppAdminNewRequestText').textContent=`🔔 ${number} طلب دفع جديد بانتظار المراجعة`;
}
onAuthStateChanged(auth,async user=>{
remove();if(!user)return;
try{
const adm=await getDoc(doc(db,'platformAdmins',user.uid));if(adm.data()?.active!==true)return;
unsub=onSnapshot(query(collection(db,'Stores'),where('activationRequestStatus','==','pending')),snap=>{
if(!loaded){last=snap.size;loaded=true;return;}
if(snap.size>last)alertNew(snap.size-last);
last=snap.size;
},err=>console.warn('Admin payment notification unavailable',err.code));
}catch(e){console.warn('Admin alert permission unavailable',e.code);}
});