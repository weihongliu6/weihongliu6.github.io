/* Read-only display of recorded page totals; this endpoint never adds a visit. */
(() => {
  'use strict';
  const badge = document.querySelector('[data-visit-paths]');
  if (!badge) return;
  const paths = [...new Set(badge.dataset.visitPaths.split(','))];
  Promise.all(paths.map(async path => {
    const response = await fetch('https://weihongliu.goatcounter.com/counter/' + encodeURIComponent(path) + '.json', {credentials:'omit',referrerPolicy:'no-referrer'});
    if (response.status === 404) return null; // No stored row for this historical alias.
    if (!response.ok) throw new Error('Counter unavailable');
    const data = await response.json();
    const raw = String(data.count ?? '').replace(/,/g,'');
    if (!/^\d+$/.test(raw)) throw new Error('Invalid recorded count');
    return Number(raw);
  })).then(counts => {
    if (counts.every(n => n === null)) return;
    const count = counts.reduce((sum,n) => sum + (n ?? 0),0);
    badge.querySelector('.visit-number').textContent = count.toLocaleString('en-AU');
    badge.hidden = false;
  }).catch(() => { badge.hidden = true; }); // Never substitute a made-up count.
})();
