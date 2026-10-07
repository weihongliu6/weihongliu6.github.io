import { isSaved, isDownloaded, mountLibraryApp, initLibraryApp } from './offline.js?v=pilot-20261007-1';
import { storage } from './storage.js?v=phase2-20260925';
import { escapeHTML as e, bookURL, readURL, cover, tocItems, listeningChapters, firstListeningChapter, chapterListenURL, pilotCommerce, purchaseURL, purchaseLabel, canAccessChapter, chapterURL } from './components.js?v=pilot-20261007-1';
import { renderReader, bindReader } from './reader.js?v=pilot-20261007-1';

const main=document.querySelector('#main');
const themeButton=document.querySelector('#theme-toggle');
const viewer=document.querySelector('#image-viewer');
let platform={name:'Shadow Library Platform',version:'1'}, books=[], cleanup=()=>{}, renderVersion=0;
const chapterCache=new Map();
document.querySelector('.skip-link').onclick=event=>{event.preventDefault();main.focus();main.scrollIntoView();};
function setTheme(theme){
  document.documentElement.dataset.theme=theme;
  themeButton.innerHTML=theme==='dark'?'日间阅读 <span aria-hidden="true">☀</span>':'夜间阅读 <span aria-hidden="true">◐</span>';
  themeButton.setAttribute('aria-pressed',String(theme==='dark'));
  themeButton.setAttribute('aria-label',theme==='dark'?'切换为浅色模式':'切换为深色模式');
  document.querySelector('meta[name="theme-color"]').content=theme==='dark'?'#1d2522':'#f6f3ec';
  storage.set('theme',theme);
}
setTheme(storage.get('theme',matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));
themeButton.onclick=()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
document.querySelector('#close-image').onclick=()=>viewer.close();
viewer.addEventListener('click',event=>{if(event.target===viewer) viewer.close();});
main.addEventListener('click',event=>{
  const button=event.target.closest('[data-image]');
  if(!button) return;
  const image=document.querySelector('#full-image'); image.src=button.dataset.image;image.alt=button.dataset.alt;
  document.querySelector('#image-caption').textContent=button.dataset.caption;
  viewer.showModal();
  window.ShadowAnalytics?.event('photo_enlarge', 'book-illustration');
});

function appleBooksLink(book, className = 'text-link'){
  const entry=externalEditions(book).find(entry=>entry.channel==='apple-books' && hasEditionURL(entry.url));
  const url=entry?.url || book.appleBooksUrl;
  if(!hasEditionURL(url)) return '';
  return url ? `<a class="${className}" data-analytics-book="${e(book.id)}" href="${e(url)}" target="_blank" rel="noopener noreferrer" title="在新标签页打开 / Opens in a new tab">Apple Books ↗</a>` : '';
}
function hasEditionURL(url){
  try { return typeof url==='string' && ['https:','http:'].includes(new URL(url).protocol); } catch { return false; }
}
// A verified edition can exist before a public destination is available.
function externalEditions(book){
  return (book.publication?.externalEditions || []).filter(entry=>entry && typeof entry==='object');
}
function otherEditionLinks(book){
  return externalEditions(book).map(entry=>{
    if(hasEditionURL(entry.url)){
      if(entry.channel==='apple-books') return '';
      return `<div class="book-actions"><a class="resume-link" href="${e(entry.url)}" target="_blank" rel="noopener noreferrer">${e(entry.label)} ↗</a></div>${entry.title && entry.title!==book.title?`<p class="sample-note">${e(entry.label)}版题名：《${e(entry.title)}》，与本站《${e(book.title)}》为同一作品。</p>`:''}`;
    }
    const details=[entry.format?e(entry.label || entry.format):'',entry.isbn?`ISBN ${e(entry.isbn)}`:''].filter(Boolean);
    return details.length?`<p class="sample-note">${details.join(' · ')}</p>`:'';
  }).join('');
}
function canRead(book){ return ['sample','complete'].includes(book?.status); }
function sampleChapter(book){ return book.chapters?.find(chapter=>chapter.id===book.commerce?.sampleChapter) || book.chapters?.[0]; }
function abstractBlock(book){
  if(!pilotCommerce(book)) return `<div class="intro-excerpt"><p>${e(book.intro)}</p><small>摘自${e(book.introSource)}</small></div>`;
  return `<section class="book-abstract" aria-labelledby="book-abstract-title"><p class="eyebrow">ABOUT THIS BOOK</p><h2 id="book-abstract-title">本书摘要</h2><p>${e(book.commerce.abstract || book.intro)}</p></section>`;
}
function home(){
  return `<section class="library-hero"><div><p class="eyebrow">SHADOW LIBRARY</p><h1>数字书房</h1><p class="hero-invitation">在书页之间，留一点时间给自己。</p></div><a class="shelf-listen-link" href="#/listen"><span aria-hidden="true">◖◗</span> 听书<span class="listen-link-caption">设备语音朗读</span></a></section>
    ${shelfTools()}
    <section class="collection" aria-labelledby="collection-title"><div class="section-label"><h2 id="collection-title">书架 <span>THE COLLECTION</span></h2><span>${books.length} 本书 <span class="fine-divider">/</span> 一间书房</span></div><div class="bookshelf">${books.map((book,i)=>`<article class="book-card" data-book-id="${e(book.id)}"><a class="book-cover-link" href="${bookURL(book.id)}" aria-label="打开《${e(book.title)}》${canRead(book)?(book.status==='complete'?'，可在线阅读':'，可阅读样章'):'，即将进入数字书房'}"><div class="book-object">${cover(book)}<span class="book-spine" aria-hidden="true"></span></div></a><div class="book-caption"><div class="book-meta"><span class="book-number">${String(i+1).padStart(2,'0')}</span><span class="book-status ${canRead(book)?'available':''}">${canRead(book)?(pilotCommerce(book)?'第一章开放':book.status==='complete'?'完整数字版':'样章开放'):'即将进入数字书房'}</span></div><h3><a href="${bookURL(book.id)}">${e(book.title)}</a></h3>${canRead(book)?'<a class="text-link" href="'+bookURL(book.id)+'">在线阅读 / Read Online <span aria-hidden="true">→</span></a>':''}${appleBooksLink(book)}</div></article>`).join('')}</div></section>
    <section class="library-note"><span class="note-symbol" aria-hidden="true">〔</span><div><h2>从一本书，慢慢开始。</h2><p>现有 ${books.filter(book=>book.status==='complete'&&!pilotCommerce(book)).length} 本完整数字书可在线阅读。<br>更多作品将逐步进入书房。</p></div><a href="${bookURL('slow-down')}">在线阅读 / Read Online <span aria-hidden="true">↗</span></a></section>`;
}
function bookPage(book){
  if(!canRead(book)) return `<section class="coming-page"><a class="back-link" href="#/">← 返回书架</a><div class="coming-cover book-object">${cover(book,true)}</div><p class="eyebrow">THE COLLECTION</p><h1>${e(book.title)}</h1><p class="coming-label">即将进入数字书房</p><p>本书的数字阅读内容尚未收录。</p>${book.appleBooksTitle?`<p class="sample-note">Apple Books 版题名：《${e(book.appleBooksTitle)}》</p>`:''}${appleBooksLink(book,'primary-link')}${otherEditionLinks(book)}<a class="primary-link" href="#/">返回数字书房 <span aria-hidden="true">→</span></a></section>`;
  const last=storage.get(`reading:${book.id}`);
  const validLast=last && book.chapters.some(c=>c.id===last.chapter);
  return `<div class="book-page"><a class="back-link" href="#/">← 返回书架</a><section class="book-intro"><div class="book-display"><div class="book-object">${cover(book,true)}</div><span class="cover-credit">${e(book.coverLabel || '已出版版本封面')}</span></div><div class="book-details"><p class="eyebrow">${pilotCommerce(book)?'第一章开放阅读':book.status==='complete'?'完整数字版':'第一本开放样章'} <span class="fine-divider">/</span> ${String(books.findIndex(entry=>entry.id===book.id)+1).padStart(2,'0')}</p><h1>${e(book.title)}</h1><p class="book-subtitle">${e(book.subtitle)}</p><p class="author">${e(book.author)} <span>著</span></p>${abstractBlock(book)}<div class="book-actions"><a class="primary-link" href="${pilotCommerce(book)?readURL(book.id,sampleChapter(book).id):readURL(book.id,book.chapters[0].id)}">${pilotCommerce(book)?'开始阅读 / Start Reading':'在线阅读 / Read Online'} <span aria-hidden="true">→</span></a>${pilotCommerce(book)?`<a class="purchase-link" href="${purchaseURL(book)}">${purchaseLabel(book)}</a>`:''}<a class="resume-link" href="${listeningURL(book)}">听书 · 语音朗读</a>${appleBooksLink(book,'resume-link')}${validLast?`<a class="resume-link" href="${chapterURL(book,last.chapter)}${canAccessChapter(book,last.chapter)?'?resume=1':''}">继续上次阅读 <span>${Math.max(0,Math.min(100,((book.chapters.findIndex(c=>c.id===last.chapter)+Math.max(0,Math.min(1,Number(last.fraction)||0)))/book.chapters.length*100).toFixed(0)))}%</span></a>`:''}</div>${otherEditionLinks(book)}<p class="sample-note">${book.editionSummary?e(book.editionSummary):(book.status==='complete'?'前言、双语作者说明、18 章正文及结语 · 24 幅摄影作品。':'目前开放 3 节样章。目录来自原书，其他章节待收录。')}</p></div></section><section id="toc" class="contents-section"><div class="section-label"><h2>目录 <span>CONTENTS</span></h2><span>${book.status==='complete'?'完整目录':'原书目录 · 样章先行'}</span></div><ol class="book-toc">${tocItems(book)}</ol></section></div>`;
}
function savedReading(book){
  const saved=storage.get(`reading:${book.id}`);
  return canRead(book) && book.chapters?.some(c=>c.id===saved?.chapter) ? saved : null;
}
function listeningURL(book){
  return chapterListenURL(book,firstListeningChapter(book));
}
function shelfTools(){
  const recent=books.filter(book=>savedReading(book));
  return `<section class="shelf-tools" aria-label="找书与继续阅读"><div class="shelf-search"><div class="search-field"><label class="sr-only" for="book-search">搜索书名、作者、章节</label><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input id="book-search" type="search" placeholder="搜索书名、作者、章节" autocomplete="off"></div><label class="sr-only" for="book-filter">阅读状态</label><select id="book-filter"><option value="all">全部书籍</option><option value="mine">我的书架</option><option value="downloaded">已下载 · 离线可读</option><option value="readable">可在线阅读</option><option value="reading">继续阅读</option><option value="coming">待收录</option></select><p id="shelf-results" role="status" aria-live="polite"></p></div>${recent.length?`<section class="continue-reading" aria-labelledby="continue-title"><div class="continue-heading"><h2 id="continue-title">继续阅读</h2><span>阅读位置保存在此浏览器</span></div><div class="continue-grid">${recent.map(book=>{
    const saved=savedReading(book);
    const index=book.chapters.findIndex(chapter=>chapter.id===saved.chapter);
    const percent=Math.round((index+Math.max(0,Math.min(1,Number(saved.fraction)||0)))/book.chapters.length*100);
    return `<a class="continue-card" href="${chapterURL(book,saved.chapter)}${canAccessChapter(book,saved.chapter)?'?resume=1':''}"><div class="continue-cover">${cover(book)}</div><div class="continue-info"><h3>${e(book.title)}</h3><p>${e(book.chapters[index].title)}</p><div class="continue-progress"><progress max="100" value="${percent}" aria-label="${e(book.title)}阅读进度"></progress><span>${percent}%</span></div><span class="continue-action">继续阅读</span></div></a>`;
  }).join('')}</div></section>`:''}</section>`;
}
function matchesShelf(book,query='',filter='all'){
  const text=[book.title,book.subtitle,book.author,...(book.chapters||[]).map(c=>c.title),...(book.publication?.contributors||[]).map(c=>c.name)].join(' ').toLowerCase();
  return text.includes(query.trim().toLowerCase()) && (filter==='all' || filter==='mine'&&isSaved(book.id) || filter==='downloaded'&&isDownloaded(book.id) || filter==='readable'&&canRead(book) || filter==='reading'&&!!savedReading(book) || filter==='coming'&&!canRead(book));
}
function bindShelf(){
  const search=document.querySelector('#book-search'), filter=document.querySelector('#book-filter');
  if(!search||!filter)return;
  const update=()=>{let count=0;document.querySelectorAll('.book-card[data-book-id]').forEach(card=>{const book=books.find(b=>b.id===card.dataset.bookId);card.hidden=!matchesShelf(book,search.value,filter.value);if(!card.hidden)count++;});document.querySelector('#shelf-results').textContent=count?(search.value||filter.value!=='all'?`找到 ${count} 本书`:''):'没有匹配的书籍，请换个关键词或筛选条件。';};
  search.oninput=update;filter.onchange=update;update();
}
function listeningHome(){
  return `<section class="listening-home"><a class="back-link" href="#/">← 返回书架</a><p class="eyebrow">LISTEN & READ</p><h1>让文字，读给你听。</h1><p>从序言、引言或第一章开始，也可以选择目录中的任意章节。</p><p class="sample-note">设备语音朗读 · 非录制有声书。锁屏或切换应用可能中断播放。</p><div class="listening-books">${books.filter(canRead).map(book=>`<article><h2>${e(book.title)}</h2><p>${listeningChapters(book).length} 节可朗读</p><a class="primary-link" href="${listeningURL(book)}">从${e(firstListeningChapter(book).title)}开始听</a><details class="listen-chapter-list"><summary>选择章节</summary><ol>${listeningChapters(book).map(chapter=>`<li><span>${e(chapter.title)}</span><a class="chapter-listen-link" href="${chapterListenURL(book,chapter)}" aria-label="听《${e(chapter.title)}》，从本章开始">听本章</a></li>`).join('')}</ol></details><a class="text-link" href="${bookURL(book.id)}">查看书籍与目录</a></article>`).join('')}</div></section>`;
}
async function render(){
  let analyticsSuccess=true;
  const version=++renderVersion;cleanup();cleanup=()=>{};
  if(viewer.open) viewer.close();
  const hash=location.hash.slice(1)||'/';
  const [path,query]=hash.split('?');
  const parts=path.split('#')[0].split('/').filter(Boolean).map(decodeURIComponent);
  const [page,id,chapterId]=parts;
  const book=books.find(b=>b.id===id);
  document.body.classList.remove('is-reading');
  if(!page) document.querySelector('#shelf-link').setAttribute('aria-current','page');
  else document.querySelector('#shelf-link').removeAttribute('aria-current');
  try{
    if(!page){main.innerHTML=home();document.title='影子观察 · 数字书房 | '+platform.name;}
    else if(page==='listen'){main.innerHTML=listeningHome();document.title='听书 · 数字书房';}
    else if(page==='book'&&book){main.innerHTML=bookPage(book);document.title=`${book.title} · 数字书房`;}
    else if(page==='purchase'&&book&&pilotCommerce(book)){main.innerHTML=`<section class="purchase-page"><a class="back-link" href="${bookURL(book.id)}">← 返回书籍</a><p class="eyebrow">SHADOW LIBRARY · PILOT</p><h1>购买《${e(book.title)}》完整版</h1><p>第一章已开放阅读，后续章节尚未开放。</p><div class="purchase-card"><strong>${purchaseLabel(book)}</strong><p>这是购买预览页。正式购买尚未开放，目前不会收取任何款项，也不会产生订单或解锁记录。</p><button type="button" disabled>PayPal · 即将开放</button></div><a class="primary-link" href="/reader-test/">已有授权？登录私密阅读</a> <a class="primary-link" href="${readURL(book.id,sampleChapter(book).id)}">返回第一章</a></section>`;document.title=`购买完整版 · ${book.title}`;}
    else if(page==='read'&&canRead(book)){
      // Guard before reading memory, network, listening or saved-progress paths.
      if(pilotCommerce(book) && !canAccessChapter(book,chapterId)){location.replace(purchaseURL(book));return;}
      const index=book.chapters.findIndex(c=>c.id===chapterId);
      if(index<0) throw Error('没有找到这个章节。');
      if(new URLSearchParams(query).get('listen')==='1' && !listeningChapters(book).some(chapter=>chapter.id===chapterId)){
        location.hash=listeningURL(book);return;
      }
      const entry=book.chapters[index];
      if(!chapterCache.has(entry.file)){
        const response=await fetch(entry.file);if(!response.ok) throw Error('章节暂时无法打开。');
        chapterCache.set(entry.file,await response.json());
      }
      if(version!==renderVersion) return;
      document.body.classList.add('is-reading');
      main.innerHTML=renderReader(book,chapterCache.get(entry.file),index);
      document.title=`${entry.title} · ${book.title}`;
      window.scrollTo(0,0);cleanup=bindReader(book,chapterCache.get(entry.file),index,new URLSearchParams(query).get('resume')==='1',new URLSearchParams(query).get('section'),new URLSearchParams(query).get('from')==='start');
    } else throw Error('这个页面尚未收录。');
  }catch(error){if(version!==renderVersion)return;analyticsSuccess=false;main.innerHTML=`<section class="empty-state"><h1>暂时无法打开</h1><p>${e(error.message)}</p><a class="primary-link" href="#/">返回书架 →</a></section>`;}
  if(!page) bindShelf();
  mountLibraryApp(books);
  const listenLink=document.querySelector('#listen-link');
  if(page==='listen')listenLink.setAttribute('aria-current','page');else listenLink.removeAttribute('aria-current');
  if(analyticsSuccess) window.ShadowAnalytics?.bookPage(book?.id, page==='read'?chapterId:null);
  main.focus({preventScroll:true});
  if(page!=='read') window.scrollTo(0,0);
  if(page==='read' && new URLSearchParams(query).get('listen')==='1'){const panel=document.querySelector('#listen-panel');if(panel){panel.open=true;panel.scrollIntoView({block:'start'});}}
  if(hash.endsWith('#toc')) document.querySelector('#toc')?.scrollIntoView();
}
try{
  // Platform branding must not make the existing book catalogue unavailable.
  try { const response=await fetch('data/platform.json?v=1'); if(response.ok) platform={...platform,...await response.json()}; } catch { /* use static identity */ }
  const response=await fetch('data/books.json?v=pilot-20261007-1');if(!response.ok) throw Error('书架资料加载失败');
  books=await response.json();
  window.addEventListener('hashchange',render);
  await render();void initLibraryApp(books);
}catch(error){main.innerHTML='<section class="empty-state"><h1>书房还没有打开</h1><p>书架资料暂时无法载入。</p><p>请刷新页面重试。</p></section>';}

