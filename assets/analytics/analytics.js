/* Shadow Observer analytics v1 — 2026-10-02. No visitor ID or fingerprint. */
(() => {
  'use strict';
  if (window.ShadowAnalytics) return;
  const KEY = 'so-analytics-';
  let local,session;
  try { local=window.localStorage; session=window.sessionStorage; } catch {
    local=session={getItem:()=>null,setItem:()=>{}};
  }
  const safeStore = (storage, key, value) => {
    try { if (value === undefined) return storage.getItem(KEY + key); storage.setItem(KEY + key, value); return value; } catch { return null; }
  };
  const read = key => safeStore(local, key);
  const write = (key, value) => safeStore(local, key, value);
  const params = new URLSearchParams(location.search);
  if (params.get('analytics') === 'test') safeStore(session, 'test', '1');
  if (params.get('analytics') === 'exclude') write('exclude', '1');
  const test = safeStore(session, 'test') === '1';
  const production = location.protocol === 'https:' && location.hostname === 'weihongliu6.github.io';
  const blocked = () => !production || read('exclude') === '1' || (() => {try{return local.getItem('skipgc')==='t';}catch{return false;}})() || navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.top !== window;
  let choice;
  try { choice = JSON.parse(read('choice') || 'null'); } catch {}
  let consent = !!(choice?.allowed && choice.until > Date.now());
  let sourceUsed = false;
  let current = null, rendered = '', lastInput = 0, activeMs = 0, lastTick = performance.now(), maxDepth = 0;
  const memory = new Set();
  let manifest = {}, diagnostic, log;
  const ready = fetch('/assets/analytics/pages.json', {credentials:'omit'}).then(r => r.ok ? r.json() : {}).then(v => manifest = v).catch(() => {});
  function showLog(payload) {
    if (!log) return;
    const item = document.createElement('li'); item.textContent = JSON.stringify(payload); log.append(item);
  }
  function emit(path, title, event = true, referrer = '') {
    if (!consent || document.visibilityState !== 'visible') return false;
    const payload = {p:path, t:title, e:event ? 'true' : '', ns:'true', r:referrer};
    if (test) { showLog(payload); return true; }
    if (blocked()) return false;
    // Official /count pixel protocol, deliberately omitting q, s and all identifiers.
    // no_session prevents GoatCounter's IP + User-Agent grouping, including per-event.
    const url = new URL('https://weihongliu.goatcounter.com/count');
    Object.entries(payload).forEach(([k,v]) => { if (v) url.searchParams.set(k,v); });
    fetch(url, {method:'GET', mode:'no-cors', credentials:'omit', referrerPolicy:'no-referrer', cache:'no-store', keepalive:true}).catch(() => {});
    return true;
  }
  function once(key) {
    const now = Date.now();
    if (memory.has(key)) return false;
    const seen = Number(safeStore(session, (test ? 'test-event:' : 'event:') + key));
    if (seen && now-seen < 30*60*1000) return false;
    memory.add(key); safeStore(session, (test ? 'test-event:' : 'event:') + key, String(now)); return true;
  }
  function event(name, item = '') {
    if (!consent || !current || document.visibilityState !== 'visible' || (!test && blocked())) return;
    const allowed = ['book_open','chapter_start','article_open','article_depth_75','gallery_open','photo_enlarge','music_play_start','download_click','external_reading_click','external_music_click','navigation'];
    if (!allowed.includes(name)) return;
    // Callers supply only known content IDs, never arbitrary URL/query/form values.
    const path = `event/${current.section}/${name}/${current.path.slice(1)}${item ? '/' + item : ''}`;
    if (once(path)) emit(path, `${current.section} · ${name} · ${current.title}`);
  }
  function source() {
    const campaigns = ['newsletter','instagram','facebook','youtube','wechat','linkedin','studio','book-launch','music-launch'];
    const values = ['utm_source','utm_medium','utm_campaign'].map(k => params.get(k)).filter(v => campaigns.includes(v));
    if (values.length) return 'campaign:' + values.join('/');
    try { const r = new URL(document.referrer); return r.hostname !== location.hostname && ['https:','http:'].includes(r.protocol) ? r.origin : ''; } catch { return ''; }
  }
  function dailyBrowser() {
    const day = new Date().toISOString().slice(0,10);
    const name = test ? 'test-day' : 'day';
    if (read(name) !== day && write(name,day) === day) emit('metric/daily_browser', 'Estimated daily browsers (UTC; consented; not people)');
  }
  function page(info) {
    if (!info || !manifest[info.key]) return;
    const base = manifest[info.key];
    current = {...base, ...info};
    if (!consent || document.visibilityState !== 'visible' || (!test && blocked()) || rendered === current.path) return;
    rendered = current.path; activeMs = 0; maxDepth = 0; lastInput = 0; lastTick = performance.now();
    dailyBrowser();
    emit(current.path, `[${current.section}] ${current.title}`, false, sourceUsed ? '' : source());
    sourceUsed = true;
    // Coarse layout category only, never exact screen size or hardware characteristics.
    emit(`metric/device/${matchMedia('(max-width: 767px)').matches ? 'mobile' : matchMedia('(max-width: 1023px)').matches ? 'tablet' : 'desktop'}`, 'Page views by viewport class');
    if (current.kind === 'article') event('article_open');
    if (current.kind === 'gallery') event('gallery_open');
    if (current.kind === 'book') event('book_open');
    if (current.kind === 'chapter') event('chapter_start');
  }
  function staticPage() {
    let key = location.pathname;
    if (key.endsWith('/')) key += 'index.html';
    if (key === '/library/index.html') return; // The reader reports successful render, never shell/loading views.
    const info = manifest[key];
    if (info) page({key,...info});
  }
  const api = window.ShadowAnalytics = {
    event,
    bookPage(book, chapter) {
      ready.then(() => {
        const key = '/library/index.html';
        const books = manifest[key]?.books || {};
        if (!book) page({key,path:'/books/',title:'数字书房',section:'books',kind:'index'});
        else if (books[book] && (!chapter || books[book].chapters.includes(chapter))) page({key,path:'/books/'+book+(chapter?'/chapter/'+chapter:''), title:books[book].title+(chapter?' · '+chapter:''),section:'books',kind:chapter?'chapter':'book'});
      });
    },
    musicIntent(track) { api.musicTrack = track; api.musicUntil = performance.now()+10000; },
    musicAutomatic() { api.musicUntil = 0; },
    musicTrack: null, musicUntil:0
  };
  function remember(allowed) {
    consent = allowed; write('choice', JSON.stringify({allowed,until:Date.now()+180*86400000}));
    panel.hidden = true;
    if (allowed) { if(current) page(current); else staticPage(); }
    else { rendered=''; memory.clear(); }
  }
  let panel;
  function preferences() {
    const style = document.createElement('style');
    style.textContent = 'body.is-reading #so-privacy{padding-bottom:80px}#so-privacy{font:14px/1.6 system-ui,sans-serif;text-align:center;padding:12px;color:inherit}#so-privacy button{font:inherit;color:inherit;background:none;border:0;text-decoration:underline;cursor:pointer}#so-consent{box-sizing:border-box;position:fixed;bottom:16px;left:16px;z-index:10000;width:min(420px,calc(100vw - 32px));padding:18px;background:#fff;color:#222;border:1px solid #ddd;border-radius:12px;box-shadow:0 4px 24px #0002;font:14px/1.6 system-ui,sans-serif;text-align:left}#so-consent[hidden]{display:none}#so-consent p{margin:0 0 12px}#so-consent button{font:inherit;cursor:pointer;padding:8px 12px;margin:4px;border:1px solid #888;border-radius:6px;background:#f8f8f8;color:#222}#so-consent a{color:#254d41}#so-debug{font:12px/1.5 monospace;padding:12px;overflow-wrap:anywhere;background:#fff6ca;color:#222;position:relative;z-index:1}';
    document.head.append(style);
    const footer = document.createElement('div'); footer.id='so-privacy';
    footer.innerHTML = '<button type="button">隐私与统计 / Privacy & analytics</button>';
    footer.querySelector('button').onclick = () => { panel.hidden=false; };
    document.body.append(footer);
    panel = document.createElement('section'); panel.id='so-consent'; panel.setAttribute('aria-label','Optional analytics / 可选统计');
    panel.innerHTML = '<p><strong>可选访问统计 · Optional analytics</strong><br>帮助我们了解哪些作品更受关注。只统计页面及操作，不记录身份或使用指纹识别。<br>Help us understand visits and interactions, without identifying you or fingerprinting. Your choice is saved on this browser for 6 months.</p><p><a href="/privacy.html">详情 / Details</a></p><button type="button" data-choice="yes">允许 / Allow</button><button type="button" data-choice="no">拒绝 / Decline</button>';
    panel.querySelector('[data-choice=yes]').onclick=()=>remember(true);
    panel.querySelector('[data-choice=no]').onclick=()=>remember(false);
    panel.hidden = !!(choice && choice.until > Date.now()) || (!test && blocked());
    document.body.append(panel);
    if (test) {
      diagnostic=document.createElement('details'); diagnostic.id='so-debug';diagnostic.open=true;
      diagnostic.innerHTML='<summary>TEST ONLY — no data sent to GoatCounter</summary><ol></ol>';
      log=diagnostic.querySelector('ol');document.body.append(diagnostic);
      if(production) {
        const verify=document.createElement('button');verify.type='button';verify.textContent='Send one labelled TEST event to verify delivery';
        verify.onclick=()=>{
          if(verify.disabled)return; verify.disabled=true;
          const url=new URL('https://weihongliu.goatcounter.com/count');
          url.search=new URLSearchParams({p:'test/verification/2026-10-02',t:'TEST ONLY — analytics delivery verification',e:'true',ns:'true'}).toString();
          fetch(url,{mode:'no-cors',credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',keepalive:true}).then(()=>verify.textContent='TEST request sent; confirm in private dashboard').catch(()=>{verify.textContent='TEST request failed';});
        };diagnostic.append(verify);
      }
    }
    if (location.pathname === '/privacy.html') {
      document.querySelector('#exclude-browser')?.addEventListener('click', () => { write('exclude','1'); document.querySelector('#exclusion-status').textContent='This browser is excluded / 此浏览器已排除'; });
      document.querySelector('#include-browser')?.addEventListener('click', () => { write('exclude','0'); document.querySelector('#exclusion-status').textContent='Exclusion removed; your consent choice still applies / 已取消排除，仍遵循统计同意选项'; });
      const status=document.querySelector('#exclusion-status'); if(status) status.textContent=read('exclude')==='1'?'This browser is excluded / 此浏览器已排除':'This browser is not excluded / 此浏览器未排除';
    }
  }
  function interaction(e) {
    if (!e.isTrusted) return;
    lastInput=performance.now();
  }
  ['pointerdown','keydown','wheel','touchstart'].forEach(n => document.addEventListener(n,interaction,{passive:true,capture:true}));
  document.addEventListener('click', e => {
    if (!e.isTrusted || !current) return;
    const a=e.target.closest('a[href]');
    if (a) {
      let u;try {u=new URL(a.href,location.href);}catch{return;}
      if (!['http:','https:'].includes(u.protocol)) return;
      if (a.hasAttribute('download') || /\.(pdf|epub|zip|mp3|m4a|wav)$/i.test(u.pathname)) {
        const resource=manifest.__resources?.[u.pathname];
        if (resource) event('download_click',resource);
      } else if (u.origin !== location.origin) {
        const music=['open.spotify.com','music.apple.com','music.youtube.com','music.amazon.com.au','xhslink.com','suno.com','www.youtube.com','youtu.be'];
        const reading=['books.apple.com','weread.qq.com','www.amazon.com','www.amazon.com.au'];
        if(current.section==='music' && music.includes(u.hostname)) event('external_music_click',u.hostname);
        if(current.section==='books' && reading.includes(u.hostname)) event('external_reading_click',a.dataset.analyticsBook || u.hostname);
      } else {
        let target=u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname;
        const next=manifest[target];
        if(next && next.section!==current.section) event('navigation',next.section);
        if(/\.(jpg|jpeg|png|webp)$/i.test(u.pathname) && current.section==='photography') event('photo_enlarge','full-resolution');
      }
    }
    const image=e.target.closest('#heroImg');
    if(image && document.querySelector('#lb.open')) event('photo_enlarge','hero');
  });
  document.addEventListener('playing', e => {
    if (!(e.target instanceof HTMLAudioElement) || !api.musicTrack || performance.now()>api.musicUntil) return;
    api.musicUntil=0;
    event('music_play_start',api.musicTrack);
  },true);
  document.addEventListener('scroll', () => {
    if (!current || current.kind!=='article') return;
    const article=document.querySelector('article');if(!article)return;
    const rect=article.getBoundingClientRect();
    maxDepth=Math.max(maxDepth,Math.min(1,Math.max(0,(innerHeight-rect.top)/rect.height)));
  },{passive:true});
  setInterval(() => {
    const now=performance.now(), dt=Math.min(1000,now-lastTick);lastTick=now;
    if (!consent || current?.kind!=='article' || document.visibilityState!=='visible' || !document.hasFocus() || !lastInput || now-lastInput>30000) return;
    activeMs+=dt;
    if(test && diagnostic) diagnostic.dataset.activeSeconds=String(Math.floor(activeMs/1000));
    if(activeMs>=30000 && maxDepth>=.75) event('article_depth_75');
  },1000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&current)page(current);});
  ready.then(() => { preferences(); staticPage(); });
})();
