/* Minimal, scoped OS notification helper for /admin/ only.
   No Firebase background push, request interception, or caching. */
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const url=new URL('/admin/#payment-requests',self.location.origin).href;
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing=windows.find(w=>w.url.startsWith(self.location.origin+'/admin/'));
    if(existing){await existing.focus();if('navigate' in existing)await existing.navigate(url);}
    else await self.clients.openWindow(url);
  })());
});