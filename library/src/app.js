import { storage } from './storage.js';
import { escapeHTML as e, bookURL, readURL, cover, tocItems } from './components.js';
import { renderReader, bindReader } from './reader.js';

const main=document.querySelector('#main');
const themeButton=document.querySelector('#theme-toggle');
const viewer=document.querySelector('#image-viewer');
let books=[], cleanup=()=>{}, renderVersion=0;
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
});

function home(){
  return `<section class="library-hero"><div class="eyebrow"><span class="tiny-line"></span> SHADOW OBSERVER <span class="fine-divider">/</span> PERSONAL LIBRARY</div><h1>影子观察<span class="title-dot"> · </span>数字书房</h1><p class="english-subtitle">A Personal Library of Photography, Art, Medicine &amp; Life</p><p class="hero-invitation">在书页之间，留一点时间给自己。</p></section>
    <section class="collection" aria-labelledby="collection-title"><div class="section-label"><h2 id="collection-title">书架 <span>THE COLLECTION</span></h2><span>五本书 <span class="fine-divider">/</span> 一间书房</span></div><div class="bookshelf">${books.map((book,i)=>`<article class="book-card"><a class="book-cover-link" href="${bookURL(book.id)}" aria-label="打开《${e(book.title)}》${book.status==='sample'?'，可阅读样章':'，即将进入数字书房'}"><div class="book-object">${cover(book)}<span class="book-spine" aria-hidden="true"></span></div></a><div class="book-caption"><div class="book-meta"><span class="book-number">${String(i+1).padStart(2,'0')}</span><span class="book-status ${book.status==='sample'?'available':''}">${book.status==='sample'?'样章开放':'即将进入数字书房'}</span></div><h3><a href="${bookURL(book.id)}">${e(book.title)}</a></h3>${book.status==='sample'?'<a class="text-link" href="'+bookURL(book.id)+'">走进这本书 <span aria-hidden="true">→</span></a>':''}</div></article>`).join('')}</div></section>
    <section class="library-note"><span class="note-symbol" aria-hidden="true">〔</span><div><h2>从一本书，慢慢开始。</h2><p>《慢下来看见世界》的前言、作者说明与第一章，现已开放阅读。<br>其余作品将逐步进入书房。</p></div><a href="${bookURL('slow-down')}">打开样章 <span aria-hidden="true">↗</span></a></section>`;
}
function bookPage(book){
  if(book.status!=='sample') return `<section class="coming-page"><a class="back-link" href="#/">← 返回书架</a><div class="coming-cover book-object">${cover(book,true)}</div><p class="eyebrow">THE COLLECTION</p><h1>${e(book.title)}</h1><p class="coming-label">即将进入数字书房</p><p>本书的数字阅读内容尚未收录。</p><a class="primary-link" href="#/">返回数字书房 <span aria-hidden="true">→</span></a></section>`;
  const last=storage.get(`reading:${book.id}`);
  const validLast=last && book.chapters.some(c=>c.id===last.chapter);
  return `<div class="book-page"><a class="back-link" href="#/">← 返回书架</a><section class="book-intro"><div class="book-display"><div class="book-object">${cover(book,true)}</div><span class="cover-credit">已出版版本封面</span></div><div class="book-details"><p class="eyebrow">第一本开放样章 <span class="fine-divider">/</span> 01</p><h1>${e(book.title)}</h1><p class="book-subtitle">${e(book.subtitle)}</p><p class="author">${e(book.author)} <span>著</span></p><div class="intro-excerpt"><p>${e(book.intro)}</p><small>摘自${e(book.introSource)}</small></div><div class="book-actions"><a class="primary-link" href="${readURL(book.id,book.chapters[0].id)}">开始阅读 <span aria-hidden="true">→</span></a>${validLast?`<a class="resume-link" href="${readURL(book.id,last.chapter)}?resume=1">继续上次阅读 <span>${Math.max(0,Math.min(100,Number(last.percent)||0))}%</span></a>`:''}</div><p class="sample-note">目前开放 3 节样章。目录来自原书，其他章节待收录。</p></div></section><section id="toc" class="contents-section"><div class="section-label"><h2>目录 <span>CONTENTS</span></h2><span>原书目录 · 样章先行</span></div><ol class="book-toc">${tocItems(book)}</ol></section></div>`;
}
async function render(){
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
    if(!page){main.innerHTML=home();document.title='影子观察 · 数字书房';}
    else if(page==='book'&&book){main.innerHTML=bookPage(book);document.title=`${book.title} · 数字书房`;}
    else if(page==='read'&&book?.status==='sample'){
      const index=book.chapters.findIndex(c=>c.id===chapterId);
      if(index<0) throw Error('没有找到这个样章。');
      const entry=book.chapters[index];
      if(!chapterCache.has(entry.file)){
        const response=await fetch(entry.file);if(!response.ok) throw Error('样章暂时无法打开。');
        chapterCache.set(entry.file,await response.json());
      }
      if(version!==renderVersion) return;
      document.body.classList.add('is-reading');
      main.innerHTML=renderReader(book,chapterCache.get(entry.file),index);
      document.title=`${entry.title} · ${book.title}`;
      window.scrollTo(0,0);cleanup=bindReader(book,chapterCache.get(entry.file),index,new URLSearchParams(query).get('resume')==='1');
    } else throw Error('这个页面尚未收录。');
  }catch(error){main.innerHTML=`<section class="empty-state"><h1>暂时无法打开</h1><p>${e(error.message)}</p><a class="primary-link" href="#/">返回书架 →</a></section>`;}
  main.focus({preventScroll:true});
  if(page!=='read') window.scrollTo(0,0);
  if(hash.endsWith('#toc')) document.querySelector('#toc')?.scrollIntoView();
}
try{
  const response=await fetch('data/books.json');if(!response.ok) throw Error('书架资料加载失败');
  books=await response.json();await render();
  window.addEventListener('hashchange',render);
}catch(error){main.innerHTML='<section class="empty-state"><h1>书房还没有打开</h1><p>请通过本地预览服务器打开本站。可运行项目中的「启动书房.command」，或依 README 的步骤启动。</p><p>若已启动服务器，请刷新页面重试。</p></section>';}
