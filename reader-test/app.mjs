import {CONFIG} from './config.mjs';
import {ProtectedReader, readProgress, saveProgress, resetProgress} from './core.mjs';
const $=id=>document.getElementById(id);
let positions;
try { positions=window.localStorage; } catch { positions={getItem:()=>null,setItem:()=>{},removeItem:()=>{}}; }
let catalog=null, current=null, navigation=0, fontSize=21, rendered=false;
const say=text=>{$('status').textContent=text;};
function clearView(){
  rendered=false; window.speechSynthesis?.cancel(); $('content').replaceChildren(); $('toc').replaceChildren();
  $('reader').hidden=true; $('position').textContent=''; $('previous').disabled=true; $('next').disabled=true;
  $('logout').hidden=!reader.token; $('login-panel').hidden=Boolean(reader.token);
  if(!reader.token) say('尚未登录，或登录已过期。请使用新的邮箱登录链接。');
}
const reader=new ProtectedReader(CONFIG,{onClear:clearView});
function renderToc(){
  $('toc').replaceChildren();
  for(const section of catalog.sections){const li=document.createElement('li'), button=document.createElement('button');button.textContent=section.title;button.type='button';if(section.assetId===current)button.setAttribute('aria-current','true');button.onclick=()=>openChapter(section.assetId);li.append(button);$('toc').append(li);}
}
function showReader(){
  $('login-panel').hidden=true; $('logout').hidden=false; $('reader').hidden=false; renderToc();
  $('resume').hidden=!readProgress(positions,catalog);
}
function handleError(error, generation){
  if(error.name==='AbortError' || generation !== navigation)return;
  reader.lock(); catalog=null;
  say(error.stage==='reading'?'邮箱身份已验证，但完整阅读授权未通过。本页会话与内容已清空；可返回数字书房阅读第一章试读。':error.status===401?'登录已过期，请重新登录。':error.status===404?'当前账号没有可用阅读授权，或内容暂不可用。':'未能安全读取内容。页面已清空，请重新登录后重试。');
}
async function openChapter(assetId, ratio=0){
  const generation=++navigation; current=assetId;
  say('正在核验授权并载入章节…');
  try{
    const result=await reader.chapter(assetId);if(generation!==navigation)return;
    catalog=result.catalog; const {chapter,epoch}=result;
    const fragment=document.createDocumentFragment(), title=document.createElement('h1'); title.textContent=chapter.title; fragment.append(title);
    const images=[];
    for(const block of chapter.blocks){
      if(block.type==='image'){
        const figure=document.createElement('figure'), img=document.createElement('img'), caption=document.createElement('figcaption');
        img.alt=typeof block.alt==='string'?block.alt:'';img.decoding='async';
        if(Number.isInteger(block.width)&&block.width>0&&Number.isInteger(block.height)&&block.height>0){img.width=block.width;img.height=block.height;}
        caption.textContent=typeof block.caption==='string'?block.caption:'';figure.append(img,caption);fragment.append(figure);images.push([img,block.src]);
      }else if(block.type==='paragraph'||block.type==='heading'){
        if(block.type==='heading'&&block.text===chapter.title)continue;
        const el=document.createElement(block.type==='heading'?'h2':'p');el.textContent=typeof block.text==='string'?block.text:'';fragment.append(el);
      }
    }
    reader.assertCurrent(epoch);$('content').replaceChildren(fragment);showReader();
    const index=catalog.sections.findIndex(s=>s.assetId===assetId);
    $('position').textContent=`第 ${index+1} / ${catalog.sections.length} 个条目 · ${chapter.title}`;
    $('previous').disabled=index===0;$('next').disabled=index===catalog.sections.length-1;
    // Images are fetched only by their exact catalog mapping, never by source paths.
    for(const [img,ref] of images){const url=await reader.image(ref,epoch);reader.assertCurrent(epoch);img.src=url;}
    reader.assertCurrent(epoch);rendered=true;saveProgress(positions,assetId,ratio);
    $('content').focus({preventScroll:true});
    requestAnimationFrame(()=>{if(generation===navigation&&rendered)window.scrollTo(0,ratio*Math.max(0,document.documentElement.scrollHeight-innerHeight));});
    say('授权已核验。本节只在当前页面中读取。');
  }catch(error){handleError(error,generation);}
}
async function authenticate(){
  const generation=++navigation;say('正在核验邮箱身份与阅读授权…');
  try{catalog=await reader.validate();if(generation!==navigation)return;showReader();say('已登录。可以从第一章开始，也可以选择目录中的任一条目。');}
  catch(error){handleError(error,generation);}
}
$('login-form').onsubmit=async event=>{
  event.preventDefault();
  const action=event.submitter===$('signup')?'signup':'login';
  $('login').disabled=true;$('signup').disabled=true;
  try{await reader.sendLink($('email').value,action);say(action==='signup'?'注册请求已提交，请检查邮箱并完成验证。普通读者身份不自动获得书籍阅读授权。':'登录请求已提交，请检查邮箱并在这个浏览器中打开一次性链接。');}
  catch{say(CONFIG.loginEnabled?'无法提交注册 / 登录请求，请确认邮箱或稍后重试。':'测试页尚未开放登录，请等待部署验证完成。');}
  finally{$('login').disabled=!CONFIG.loginEnabled;$('signup').disabled=!CONFIG.loginEnabled;}
};
$('start').onclick=()=>openChapter(catalog.sections.find(s=>s.id==='chapter-01').assetId);
$('resume').onclick=()=>{const p=readProgress(positions,catalog);if(p)openChapter(p.assetId,p.ratio);};
$('reset').onclick=()=>{resetProgress(positions);$('resume').hidden=true;say('此测试的阅读位置已清除，公开书库的记录不受影响。');};
for(const [id,delta] of [['previous',-1],['next',1]])$(id).onclick=()=>{const index=catalog.sections.findIndex(s=>s.assetId===current),section=catalog.sections[index+delta];if(section)openChapter(section.assetId);};
$('logout').onclick=async()=>{++navigation;catalog=null;current=null;try{await reader.logout();say('已退出，页面内容已清空。');}catch{say('本页已退出并清空。服务器退出未能确认；已签发的令牌可能持续有效至过期。');}};
for(const [id,delta] of [['smaller',-1],['larger',1]])$(id).onclick=()=>{fontSize=Math.max(16,Math.min(30,fontSize+delta));document.documentElement.style.setProperty('--size',`${fontSize}px`);};
function storePosition(){if(rendered&&current)saveProgress(positions,current,scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight));}
window.addEventListener('scroll',storePosition,{passive:true});
window.addEventListener('pagehide',()=>{storePosition();++navigation;reader.lock();catalog=null;});
window.addEventListener('offline',()=>{storePosition();++navigation;reader.lock();catalog=null;say('网络已断开，页面内容已清空。重新联网后请再次登录。');});
window.addEventListener('pageshow',event=>{if(event.persisted){++navigation;reader.lock();catalog=null;say('返回页面后需要重新登录，未恢复书稿缓存。');}});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){storePosition();++navigation;reader.clearContent();}
  else if(reader.token){const p=catalog&&readProgress(positions,catalog);if(p)openChapter(p.assetId,p.ratio);else authenticate();}
});
// Managed Auth callback: discard refresh tokens, remove the entire fragment immediately.
function consumeCallback(){
  const params=new URLSearchParams(location.hash.slice(1));
  const token=params.get('access_token'), seconds=Number(params.get('expires_in'));
  if(location.hash||location.search)history.replaceState(null,'',location.pathname);
  $('login').disabled=!CONFIG.loginEnabled;$('signup').disabled=!CONFIG.loginEnabled;
  if(token){try{reader.setSession(token,seconds);authenticate();}catch{say('登录链接已失效，请重新发送。');}}
  else say(CONFIG.loginEnabled?'请输入邮箱注册 / 登录。第一章试读可从数字书房进入；完整阅读仍需有效授权。':'测试页尚未开放登录。部署和授权验证完成后才会启用。');
}
consumeCallback();
