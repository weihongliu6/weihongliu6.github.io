export const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const bookURL = id => `#/book/${encodeURIComponent(id)}`;
export const readURL = (id, chapter) => `#/read/${encodeURIComponent(id)}/${encodeURIComponent(chapter)}`;
export function cover(book, large = false) {
  return book.cover
    ? `<img class="cover-img" src="${escapeHTML(book.cover)}" alt="《${escapeHTML(book.title)}》现有封面" ${large ? 'fetchpriority="high"' : ''} decoding="async">`
    : `<div class="cover-placeholder"><span class="placeholder-label">封面待确认</span><span class="placeholder-title">${escapeHTML(book.title)}</span><span class="placeholder-foot">数字书房 · 暂用占位<br>非正式封面</span></div>`;
}
export function tocItems(book, current = '') {
  return book.toc.map((entry, index) => {
    if(!entry.id) return `<li class="toc-pending"><span class="toc-num">${String(index+1).padStart(2,'0')}</span><span>${escapeHTML(entry.title)}</span><span class="toc-state">待收录</span></li>`;
    const sections=entry.sections?.length ? `<details class="toc-sections"><summary>小节 · ${entry.sections.length}</summary><ol>${entry.sections.map(section=>`<li><a href="${readURL(book.id,entry.id)}?section=${encodeURIComponent(section.anchor)}">${escapeHTML(section.title)}</a></li>`).join('')}</ol></details>` : '';
    return `<li><a href="${readURL(book.id,entry.id)}" ${current===entry.id?'aria-current="page"':''}><span class="toc-num">${String(index+1).padStart(2,'0')}</span><span>${escapeHTML(entry.title)}</span><span class="toc-state">${current===entry.id?'正在阅读':'可阅读 →'}</span></a>${sections}</li>`;
  }).join('');
}
export function contentBlocks(blocks) {
  return blocks.map(block => {
    if (block.type === 'heading') return `<h2${block.anchor?` id="${escapeHTML(block.anchor)}"`:""}>${escapeHTML(block.text)}</h2>`;
    if (block.type === 'paragraph') return `<p>${escapeHTML(block.text)}</p>`;
    if (block.type === 'image') return `<figure><button class="image-button" type="button" data-image="${escapeHTML(block.fullSrc || block.src)}" data-caption="${escapeHTML(block.caption || '')}" data-alt="${escapeHTML(block.alt || '')}" aria-label="放大图片${block.caption ? '：'+escapeHTML(block.caption) : ''}"><img src="${escapeHTML(block.src)}" alt="${escapeHTML(block.alt || '')}" ${block.width&&block.height?`width="${Number(block.width)}" height="${Number(block.height)}"`:""} loading="lazy" decoding="async"><span class="enlarge" aria-hidden="true">查看大图 ↗</span></button>${block.caption ? `<figcaption>${escapeHTML(block.caption)}</figcaption>` : ''}</figure>`;
    return '';
  }).join('');
}
