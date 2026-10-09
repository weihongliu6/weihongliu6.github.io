// Update without reloading open documents; retire only locked Pilot caches.
const BUILD='samples-20261009-3';
const header=document.querySelector('.site-header');
const notice=document.createElement('p');
notice.id='library-update-status';notice.className='offline-status';
notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
const text=document.createElement('span'), link=document.createElement('a');
link.href='/library-update.html';link.textContent='检查阅读应用更新';
notice.append(text,document.createTextNode(' · '),link);header.after(notice);
text.textContent='阅读应用版本 '+BUILD;
if('serviceWorker' in navigator){
 const check=()=>{
  const controller=navigator.serviceWorker.controller;if(!controller)return;
  controller.postMessage({type:'RETIRE_PILOT_CACHES'});
  const channel=new MessageChannel();
  const timeout=setTimeout(()=>{channel.port1.close();},3000);
  channel.port1.onmessage=event=>{
   clearTimeout(timeout);channel.port1.close();
   if(event.data?.type==='LIBRARY_BUILD'&&event.data.build!==BUILD){
    text.textContent='新版已准备好。当前页面不会自动刷新；完成阅读后，可检查更新并重新打开书房。';
   }
  };
  controller.postMessage({type:'LIBRARY_BUILD'},[channel.port2]);
 };
 navigator.serviceWorker.addEventListener('controllerchange',check);
 check();
}
