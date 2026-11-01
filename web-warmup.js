/* Paper & Pen V132 web warm-up: no APK or Flutter rebuild.
 * Helps browser cache the existing web bundle before a deliberate Web click.
 */
(()=>{'use strict';
  if(!document.querySelector('.web-app-link'))return;
  const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  if(connection?.saveData||/2g/.test(connection?.effectiveType||''))return;
  let started=false;
  const warm=()=>{
    if(started)return;
    started=true;
    const paths=['/app/main.dart.js','/app/canvaskit/chromium/canvaskit.wasm'];
    for(const path of paths){
      const link=document.createElement('link');
      link.rel='prefetch';
      link.href=path;
      if(path.endsWith('.js'))link.as='script';
      else {link.as='fetch';link.type='application/wasm';link.crossOrigin='anonymous';}
      document.head.appendChild(link);
    }
  };
  document.querySelectorAll('.web-app-link').forEach(link=>{
    link.addEventListener('pointerenter',warm,{once:true,passive:true});
    link.addEventListener('focus',warm,{once:true,passive:true});
    link.addEventListener('touchstart',warm,{once:true,passive:true});
  });
  // Idle warmup only on reliably fast connections, not on slow/mobile data.
  if(connection?.type==='wifi'||(connection?.effectiveType==='4g'&&Number(connection?.downlink)>=8)){
    const later=()=>{const idle=window.requestIdleCallback;idle?idle(warm,{timeout:9000}):setTimeout(warm,4500);};
    if(document.readyState==='complete')later();else addEventListener('load',later,{once:true});
  }
})();