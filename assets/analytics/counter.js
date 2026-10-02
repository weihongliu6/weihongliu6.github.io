/* Read recorded totals without incrementing them; only the external entry counts clicks. */
(() => {
  'use strict';
  const endpoint = 'https://weihongliu.goatcounter.com/';
  const requests = new Map();
  function recorded(path) {
    if (!requests.has(path)) requests.set(path, fetch(endpoint + 'counter/' + encodeURIComponent(path) + '.json', {credentials:'omit',referrerPolicy:'no-referrer'}).then(async response => {
      if (response.status === 404) return null; // No recorded row for this alias.
      if (!response.ok) throw new Error('Counter unavailable');
      const data = await response.json();
      const raw = String(data.count ?? '').replace(/,/g,'');
      if (!/^\d+$/.test(raw)) throw new Error('Invalid recorded count');
      return Number(raw);
    }));
    return requests.get(path);
  }
  document.querySelectorAll('[data-visit-paths]').forEach(badge => {
    const inline = badge.classList.contains('nav-count');
    const label = badge.dataset.counterLabel || 'visits';
    const paths = [...new Set(badge.dataset.visitPaths.split(','))];
    Promise.all(paths.map(recorded)).then(counts => {
      if (!inline && counts.every(n => n === null)) return;
      const count = counts.reduce((sum,n) => sum + (n ?? 0),0).toLocaleString('en-AU');
      if (inline) badge.textContent = label + ' ' + count;
      else { badge.querySelector('.visit-number').textContent = count; badge.hidden = false; }
    }).catch(() => {
      if (inline) badge.textContent = label + ' —';
      else badge.hidden = true;
    });
  });
  // This site cannot see visits on the separately hosted StrideLog site.
  // Count only actual, trusted openings of its homepage link, without IDs/storage writes.
  const external = document.querySelector('[data-entry-click="stridelog"]')?.closest('a');
  external?.addEventListener('click', e => {
    if (!e.isTrusted || location.protocol !== 'https:' || location.hostname !== 'weihongliu6.github.io' || window.top !== window || navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
    try {
      const choice = JSON.parse(localStorage.getItem('so-analytics-choice') || 'null');
      if (localStorage.getItem('so-analytics-exclude') === '1' || localStorage.getItem('skipgc') === 't' || sessionStorage.getItem('so-analytics-test') === '1' || (choice?.allowed === false && choice.until > Date.now())) return;
    } catch { return; }
    const query = new URLSearchParams({p:'event/home/entry_open/stridelog',t:'StrideLog homepage link clicks',e:'true',ns:'true'});
    fetch(endpoint + 'count?' + query, {mode:'no-cors',credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',keepalive:true}).catch(() => {});
  });
})();
