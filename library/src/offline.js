// Device-local library. No accounts, payment entitlements or cloud storage.
import { escapeHTML as e } from './components.js?v=renaissance-20261006';
const PREFIX='shadow-library-book-v1-';
const marker=new URL('offline-complete',new URL('../',import.meta.url)).href;
let catalogue=[], downloaded=new Map(), job=null, ready=false, installEvent=null, message='正在准备离线阅读…';
export const isSaved=id=>{try{return JSON.parse(localStorage.getItem('shadow-library:my-books')||'[]').includes(id);}catch{return false;}};
export const isDownloaded=id=>downloaded.has(id);
const installed=()=>matchMedia('(display-mode: standalone)').matches || navigator.standalone===true;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installEvent=event;refresh();});
window.addEventListener('appinstalled',()=>{installEvent=null;refresh();});
window.addEventListener('online',refresh);window.addEventListener('offline',refresh);
window.addEventListener('storage',()=>{refresh();filterChanged();});
window.addEventListener('beforeunload',event=>{if(job){event.preventDefault();event.returnValue='';}});
function filterChanged(){document.querySelector('#book-filter')?.dispatchEvent(new Event('change'));}
function save(id,value){
  const ids=catalogue.filter(b=>isSaved(b.id)).map(b=>b.id);
  localStorage.setItem('shadow-library:my-books',JSON.stringify(value?[...new Set([...ids,id])]:ids.filter(x=>x!==id)));
}
async function scan(){
  downloaded=new Map();
  for(const name of await caches.keys()){
    if(!name.startsWith(PREFIX))continue;
    const cache=await caches.open(name), record=await cache.match(marker);
    if(!record){const created=Number(name.match(/-(\d{13})-/)?.[1]);if(created&&Date.now()-created>86400000)await caches.delete(name);continue;}
    const data=await record.json();
    const keys=new Set((await cache.keys()).map(r=>r.url));
    if(Array.isArray(data.urls)&&data.urls.every(url=>keys.has(url)))downloaded.set(data.id,{...data,name});
  }
}
function controls(book){
  const saved=isSaved(book.id), info=downloaded.get(book.id), active=job?.id===book.id;
  return `<div class="local-book-controls"><button type="button" data-local-save="${e(book.id)}" aria-pressed="${saved}">${saved?'✓ 已加入书架':'＋ 加入我的书架'}</button>${book.chapters?.length?`<button type="button" data-local-download="${e(book.id)}" ${!ready || (job&&!active)?'disabled':''}>${active?'取消下载':info?'删除离线副本':'↓ 离线下载'}</button><small data-download-state>${active?e(job.progress):info?`已离线保存 · ${(info.bytes/1048576).toFixed(1)} MB`:'尚未下载'}</small>`:''}</div>`;
}
export function mountLibraryApp(books){
  catalogue=books;
  const hero=document.querySelector('.library-hero');
  if(hero&&!document.querySelector('#local-library'))hero.insertAdjacentHTML('afterend',`<section id="local-library" class="local-library" aria-label="免费阅读应用"><div><p class="eyebrow">YOUR PERSONAL LIBRARY</p><h2>把书房，带在身边。</h2><p>免费安装 · 本地书架 · 离线阅读</p><p class="local-summary"></p></div><div class="local-install"><button type="button" id="install-library">安装阅读应用</button><button type="button" id="show-my-books">打开我的书架</button><details id="install-help"><summary>安装与保存说明</summary><p>iPhone / iPad：在 Safari 打开，使用“分享 → 添加到主屏幕”。Android / 电脑：使用浏览器菜单中的“安装应用”；若没有此选项，可继续在网页阅读。</p><p>书架和下载仅保存在当前设备的浏览器中，不会自动同步。请等下载完成再关闭页面。系统清理、隐私模式或清除网站数据可能移除书籍，可联网后重新下载。听书依赖设备语音，离线时不保证可用。</p></details></div></section>`);
  document.querySelectorAll('.book-card[data-book-id]').forEach(card=>{
    if(!card.querySelector('.local-book-controls'))card.querySelector('.book-caption').insertAdjacentHTML('beforeend',controls(books.find(b=>b.id===card.dataset.bookId)));
  });
  const id=decodeURIComponent((location.hash.match(/^#\/book\/([^?/#]+)/)||[])[1]||'');
  const book=books.find(b=>b.id===id), details=document.querySelector('.book-details, .coming-page');
  if(book&&details&&!details.querySelector('.local-book-controls'))details.insertAdjacentHTML('beforeend',controls(book));
  refresh();
}
function refresh(){
  document.querySelectorAll('[data-local-save]').forEach(button=>{
    const book=catalogue.find(b=>b.id===button.dataset.localSave);
    if(book){
      const fresh=document.createElement('div');fresh.innerHTML=controls(book);
      const replacements=fresh.querySelectorAll('button,small');
      button.closest('.local-book-controls').querySelectorAll('button,small').forEach((node,index)=>{
        const next=replacements[index];node.textContent=next.textContent;
        if(node.tagName==='BUTTON'){node.disabled=next.disabled;if(next.hasAttribute('aria-pressed'))node.setAttribute('aria-pressed',next.getAttribute('aria-pressed'));}
      });
    }
  });
  const summary=document.querySelector('.local-summary');
  if(summary)summary.textContent=`${navigator.onLine?'在线':'当前离线'} · 我的书架 ${catalogue.filter(b=>isSaved(b.id)).length} 本 · 已下载 ${downloaded.size} 本`;
  const button=document.querySelector('#install-library');
  if(button){button.textContent=installed()?'已安装到此设备':installEvent?'免费安装阅读应用':'安装阅读应用';button.disabled=installed();}
  const status=document.querySelector('#offline-status');if(status)status.textContent=message;
}
function safeURL(path){
  const url=new URL(path,new URL('../',import.meta.url));
  if(url.origin!==location.origin || !url.pathname.startsWith(new URL('../',import.meta.url).pathname))throw Error('书籍包含暂不支持离线保存的外部文件。');
  return url.href;
}
async function download(book){
  if(job)return;
  const name=PREFIX+book.id+'-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  const controller=new AbortController();job={id:book.id,controller,progress:'准备下载…'};refresh();
  try{
    const cache=await caches.open(name), urls=new Set(), assets=new Set();let bytes=0,done=0;
    async function put(path){
      const url=safeURL(path);if(urls.has(url))return;
      const response=await fetch(url,{signal:controller.signal,cache:'reload',headers:{'X-Library-Download':'1'}});
      if(!response.ok)throw Error('部分文件未能下载，请联网后重试。');
      bytes+=(await response.clone().blob()).size;
      await cache.put(url,response.clone());urls.add(url);return response;
    }
    for(const chapter of book.chapters){
      const response=await put(chapter.file), data=await response.json();
      for(const block of data.blocks||[])for(const key of ['src','fullSrc'])if(block[key]&&!block[key].startsWith('data:'))assets.add(block[key]);
      job.progress=`章节 ${++done}/${book.chapters.length}`;refresh();
    }
    if(book.cover)assets.add(book.cover);done=0;
    for(const asset of assets){await put(asset);job.progress=`图片 ${++done}/${assets.size} · ${(bytes/1048576).toFixed(1)} MB`;refresh();}
    controller.signal.throwIfAborted();
    await cache.put(marker,new Response(JSON.stringify({id:book.id,urls:[...urls],bytes,savedAt:Date.now()}),{headers:{'Content-Type':'application/json'}}));
    try{save(book.id,true);}catch{/* Download remains usable when localStorage is blocked. */}
    await scan();message=`《${book.title}》已下载，断网后也可以阅读。`;
    navigator.storage?.persist?.().catch(()=>{});
  }catch(error){
    await caches.delete(name);
    message=error.name==='AbortError'?'已取消下载；未完成的文件已清理。':error.name==='QuotaExceededError'?'设备空间不足，请删除一些离线书籍后重试。':`下载未完成：${error.message}`;
  }finally{job=null;refresh();filterChanged();}
}
export async function initLibraryApp(books){
  catalogue=books;
  document.querySelector('.site-header').insertAdjacentHTML('afterend','<p id="offline-status" class="offline-status" role="status" aria-live="polite"></p>');
  document.addEventListener('click',async event=>{
    const target=event.target.closest('button');if(!target)return;
    try{
      if(target.id==='install-library'){
        if(installEvent){const prompt=installEvent;installEvent=null;await prompt.prompt();await prompt.userChoice;refresh();}
        else{const help=document.querySelector('#install-help');help.open=true;help.scrollIntoView({block:'nearest'});}
      }
      if(target.id==='show-my-books'){const select=document.querySelector('#book-filter');select.value='mine';filterChanged();select.scrollIntoView({block:'center'});}
      if(target.dataset.localSave){save(target.dataset.localSave,!isSaved(target.dataset.localSave));refresh();filterChanged();}
      if(target.dataset.localDownload){
        const id=target.dataset.localDownload;
        if(job?.id===id){job.controller.abort();return;}
        if(downloaded.has(id)){
          for(const name of await caches.keys()){if(!name.startsWith(PREFIX))continue;const record=await (await caches.open(name)).match(marker);if(record&&(await record.json()).id===id)await caches.delete(name);}await scan();message='离线副本已删除，书架和阅读进度保留。';refresh();filterChanged();
        }else if(ready&&!job)await download(books.find(b=>b.id===id));
      }
    }catch{message='无法保存到此设备，请检查浏览器的网站存储设置。';refresh();}
  });
  if(!isSecureContext || !('serviceWorker' in navigator) || !('caches' in window)){
    message='此浏览器暂不支持离线保存，仍可在线阅读。';refresh();return;
  }
  try{
    const registration=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
    // Do not leave the UI waiting indefinitely if installation fails.
    await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('安装超时')),20000))]);
    await scan();ready=true;message='离线阅读已准备好：选择书籍，点击“离线下载”。';
    if(registration.waiting)message='阅读应用有更新，关闭所有书房窗口后重新打开即可更新。';
  }catch{message='离线阅读暂未准备好，请联网后刷新重试。';}
  refresh();filterChanged();
}
