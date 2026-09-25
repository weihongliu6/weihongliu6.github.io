import { storage } from './storage.js?v=phase2-20260925';
import { escapeHTML as e, bookURL, readURL, tocItems, contentBlocks } from './components.js?v=phase2-20260925';

export function renderReader(book, chapter, index, resume = false) {
  const list = book.chapters;
  const full = book.status==='complete';
  const readingLabel = full?'阅读进度':'样章阅读进度';
  const previous = list[index - 1], next = list[index + 1];
  const titleText=chapter.title.replace(/\s/g,'');
  let firstBody=0;
  while(chapter.blocks[firstBody]?.type==='heading' && titleText.includes(chapter.blocks[firstBody].text.replace(/\s/g,''))) firstBody++;
  return `<div class="reading-track" aria-hidden="true"><span id="reading-track-fill"></span></div>
    <div class="reader-layout">
      <aside class="reader-aside"><a class="back-link" href="${bookURL(book.id)}">← 书籍与目录</a><details class="reader-toc" ${matchMedia('(min-width: 1050px)').matches ? 'open' : ''}><summary>本书目录 <span aria-hidden="true">＋</span></summary><p class="aside-title">${e(book.title)}</p><ol>${tocItems(book,chapter.id)}</ol></details></aside>
      <div class="reader-main">
        <div class="reader-toolbar"><a href="${bookURL(book.id)}">${e(book.title)}</a><div class="font-tools" role="group" aria-label="字号设置"><button type="button" id="font-smaller" aria-label="减小字号">A−</button><output id="font-size" aria-live="polite"></output><button type="button" id="font-larger" aria-label="增大字号">A＋</button></div></div>
        <article class="reading-content" id="reading-content"><header class="chapter-header"><p class="eyebrow">${full?'在线阅读':'阅读样章'} <span class="fine-divider">/</span> ${String(index+1).padStart(2,'0')} — ${String(list.length).padStart(2,'0')}</p><h1>${e(chapter.title)}</h1><p class="chapter-byline">${e(book.author)} <span>·</span> 原书文字与图片</p></header><div class="chapter-body">${contentBlocks(chapter.blocks.slice(firstBody))}</div><div class="source-note">${chapter.source.label?e(chapter.source.label):chapter.source.format==='docx'?'正文与图注依据作者确认版本收录。':`本节来自已出版 EPUB 第 ${chapter.source.pages[0]}–${chapter.source.pages.at(-1)} 页。仅调整网页段落与版式，未改写原文。`}</div></article>
        <nav class="chapter-nav" aria-label="章节导航">${previous ? `<a href="${readURL(book.id,previous.id)}"><small>← 上一章</small><span>${e(previous.title)}</span></a>` : `<button disabled type="button"><small>← 上一章</small><span>${full?'已是本书起点':'已是样章起点'}</span></button>`}${next ? `<a href="${readURL(book.id,next.id)}"><small>下一章 →</small><span>${e(next.title)}</span></a>` : `<a href="${bookURL(book.id)}#toc"><small>${full?'全书已读完':'样章已读完'} ✓</small><span>返回目录</span></a>`}</nav>
        <a class="reader-library-link" href="#/">← 返回数字书房</a>
      </div>
    </div>
    <div class="reading-status"><span>${readingLabel} <strong id="progress-text">0%</strong></span><progress id="reading-progress" max="100" value="0" aria-label="${readingLabel}"></progress><span>${index+1} / ${list.length} 节</span></div>`;
}

export function bindReader(book, chapter, index, restore, sectionAnchor = null) {
  let size = Number(storage.get('font-size', 21));
  if (!Number.isFinite(size)) size=21;
  size = Math.max(17, Math.min(29, size));
  const smaller=document.querySelector('#font-smaller'), larger=document.querySelector('#font-larger');
  const saved=storage.get(`reading:${book.id}`);
  let frame, cancelled=false;
  const updateProgress=()=>{
    if(cancelled) return;
    const article=document.querySelector('#reading-content');
    if (!article) return;
    const start=article.offsetTop;
    const range=Math.max(1,article.offsetHeight-window.innerHeight+130);
    const fraction=Math.min(1,Math.max(0,(window.scrollY-start+80)/range));
    const percent=Math.round((index+fraction)/book.chapters.length*100);
    document.querySelector('#progress-text').textContent=`${percent}%`;
    document.querySelector('#reading-progress').value=percent;
    document.querySelector('#reading-track-fill').style.width=`${percent}%`;
    storage.set(`reading:${book.id}`,{chapter:chapter.id,fraction,percent,edition:book.edition||'sample'});
  };
  const applyFont=()=>{
    document.documentElement.style.setProperty('--reading-size',`${size}px`);
    document.querySelector('#font-size').textContent=`${size}`;
    smaller.disabled=size<=17;larger.disabled=size>=29;
    storage.set('font-size',size); requestAnimationFrame(updateProgress);
  };
  smaller.onclick=()=>{size=Math.max(17,size-2);applyFont();};
  larger.onclick=()=>{size=Math.min(29,size+2);applyFont();};
  // Apply style before any progress write; saved position remains available for restoration.
  applyFont();
  const onScroll=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(updateProgress);};
  window.addEventListener('scroll',onScroll,{passive:true});
  window.addEventListener('resize',onScroll);
  for(const img of document.querySelectorAll('.chapter-body img')) img.addEventListener('load',onScroll,{once:true});
  const restorePosition=()=>{
    if(cancelled) return;
    if(sectionAnchor){
      document.getElementById(sectionAnchor)?.scrollIntoView();
    } else if(restore && saved?.chapter===chapter.id){
      const article=document.querySelector('#reading-content');
      const fraction=Math.min(1,Math.max(0,Number(saved.fraction)||0));
      window.scrollTo(0,article.offsetTop-80+fraction*Math.max(1,article.offsetHeight-window.innerHeight+130));
    }
    updateProgress();
  };
  // Intrinsic dimensions reserve image space. Do not await off-screen lazy images:
  // they may not load until scrolling, which would prevent anchor/resume restoration.
  requestAnimationFrame(restorePosition);
  return ()=>{cancelled=true;cancelAnimationFrame(frame);window.removeEventListener('scroll',onScroll);window.removeEventListener('resize',onScroll);};
}
