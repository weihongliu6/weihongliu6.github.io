export const PROGRESS_KEY = 'owner-reader-test:slow-down:v1:progress';
const flatId = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$/;
export class AccessError extends Error { constructor(status) { super('Protected reading unavailable'); this.status = status; } }
export function safeId(value) { if (typeof value !== 'string' || !flatId.test(value)) throw new AccessError(400); return value; }
export function checkedCatalog(data) {
  if (data?.bookId !== 'slow-down' || !Array.isArray(data.sections) || data.sections.length !== 22 || !Array.isArray(data.images) || data.images.length !== 49) throw new AccessError(502);
  const seen = new Set();
  for (const entry of [...data.sections, ...data.images]) {
    safeId(entry.assetId); if (seen.has(entry.assetId)) throw new AccessError(502); seen.add(entry.assetId);
  }
  if (!data.sections.some(c => c.id === 'chapter-01')) throw new AccessError(502);
  const refs = new Set();
  for (const entry of data.images) {
    if (typeof entry.sourceRef !== 'string' || !/^assets\/(books|covers)\/[a-zA-Z0-9/_.-]+\.jpg$/.test(entry.sourceRef) || entry.sourceRef.includes('..') || refs.has(entry.sourceRef)) throw new AccessError(502);
    refs.add(entry.sourceRef);
  }
  return data;
}
export function imageId(catalog, sourceRef) {
  const entry = catalog?.images.find(i => i.sourceRef === sourceRef);
  if (!entry) throw new AccessError(400);
  return safeId(entry.assetId);
}
export function readProgress(storage, catalog) {
  try { const p = JSON.parse(storage.getItem(PROGRESS_KEY)); return catalog.sections.some(s => s.assetId === p?.assetId) && Number.isFinite(p.ratio) && p.ratio >= 0 && p.ratio <= 1 ? {assetId: p.assetId, ratio:p.ratio} : null; } catch { return null; }
}
export function saveProgress(storage, assetId, ratio) { try { storage.setItem(PROGRESS_KEY, JSON.stringify({assetId:safeId(assetId), ratio:Math.max(0,Math.min(1,Number(ratio)||0))})); } catch {} }
export function resetProgress(storage) { try { storage.removeItem(PROGRESS_KEY); } catch {} }
// All content, sessions and URLs are volatile. Storage helpers above accept only position metadata.
export class ProtectedReader {
  constructor(config, {fetcher=fetch, urls=URL, onClear=()=>{}} = {}) {
    this.config=config; this.fetcher=fetcher; this.urls=urls; this.onClear=onClear;
    this.token=null; this.expiry=0; this.catalog=null; this.epoch=0; this.blobs=new Set(); this.pending=new Set(); this.timer=null;
  }
  clearContent() {
    this.epoch++; for (const c of this.pending) c.abort(); this.pending.clear();
    for (const url of this.blobs) this.urls.revokeObjectURL(url); this.blobs.clear(); this.onClear();
  }
  lock() { this.token=null; this.expiry=0; this.catalog=null; clearTimeout(this.timer); this.clearContent(); }
  setSession(token, seconds) {
    this.lock(); if (typeof token !== 'string' || !token || !Number.isFinite(seconds) || seconds <= 0) throw new AccessError(401);
    this.token=token; this.expiry=Date.now()+Math.min(seconds,3600)*1000;
    this.timer=setTimeout(()=>this.lock(), Math.min(seconds,3600)*1000);
  }
  assertCurrent(epoch) { if (epoch !== this.epoch) throw new DOMException('Cancelled', 'AbortError'); }
  async request(url, type='json', {auth=true, method='GET', body, epoch=this.epoch}={}) {
    this.assertCurrent(epoch);
    if (auth && (!this.token || Date.now() >= this.expiry)) { this.lock(); throw new AccessError(401); }
    const controller=new AbortController(); this.pending.add(controller);
    try {
      const response=await this.fetcher(url,{method, signal:controller.signal, cache:'no-store', credentials:'omit', redirect:'error', referrerPolicy:'no-referrer', headers:{apikey:this.config.publicKey,...(auth?{Authorization:`Bearer ${this.token}`} : {}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
      this.assertCurrent(epoch);
      if (!response.ok) { if(auth) this.lock(); throw new AccessError(response.status); }
      const mime=response.headers.get('content-type') || '';
      if (type !== 'none' && !mime.startsWith(type === 'blob' ? 'image/jpeg' : 'application/json')) { if(auth) this.lock(); throw new AccessError(502); }
      const result=type==='none'?null:await response[type](); this.assertCurrent(epoch); return result;
    } finally { this.pending.delete(controller); }
  }
  async validate(epoch=this.epoch) {
    const user=await this.request(`${this.config.projectUrl}/auth/v1/user`, 'json', {epoch});
    if (typeof user.id !== 'string' || !user.id) { this.lock(); throw new AccessError(403); }
    const data=checkedCatalog(await this.request(`${this.config.endpoint}/catalog`, 'json', {epoch}));
    this.assertCurrent(epoch); this.catalog=data; return data;
  }
  async chapter(assetId) {
    this.clearContent(); const epoch=this.epoch;
    const catalog=await this.validate(epoch);
    const section=catalog.sections.find(s=>s.assetId === assetId); if(!section) { this.lock(); throw new AccessError(404); }
    const chapter=await this.request(`${this.config.endpoint}/asset/${safeId(assetId)}`, 'json', {epoch});
    if (chapter.id !== section.id || !Array.isArray(chapter.blocks)) { this.lock(); throw new AccessError(502); }
    return {chapter, catalog, epoch};
  }
  async image(sourceRef, epoch) {
    this.assertCurrent(epoch); const id=imageId(this.catalog,sourceRef);
    const blob=await this.request(`${this.config.endpoint}/asset/${id}`, 'blob', {epoch});
    this.assertCurrent(epoch); const url=this.urls.createObjectURL(blob); this.blobs.add(url); return url;
  }
  async sendLink(email) {
    const normalized=String(email).trim().toLowerCase();
    if (!this.config.loginEnabled || normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new AccessError(403);
    return this.request(`${this.config.projectUrl}/auth/v1/otp?redirect_to=${encodeURIComponent(this.config.redirect)}`, 'none', {auth:false,method:'POST',body:{email:normalized,create_user:false},epoch:this.epoch});
  }
  async logout() {
    const token=this.token; this.lock();
    if(token) { const response=await this.fetcher(`${this.config.projectUrl}/auth/v1/logout?scope=local`, {method:'POST',cache:'no-store',credentials:'omit',redirect:'error',headers:{apikey:this.config.publicKey,Authorization:`Bearer ${token}`}}); if(!response.ok) throw new AccessError(response.status); }
  }
}
