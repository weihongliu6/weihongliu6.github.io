import { storage } from './storage.js?v=phase2-20260925';
import { escapeHTML as e } from './components.js?v=phase2-20260925';

// Short utterances avoid sending an entire chapter to the speech queue.
export function speechChunks(chapter){
  return [chapter.title,...chapter.blocks.filter(b=>['heading','paragraph'].includes(b.type)).map(b=>b.text)]
    .filter(Boolean).flatMap(text=>text.match(/[^。！？.!?\n]+[。！？.!?]?/g)||[])
    .flatMap(text=>Array.from(text.trim()).join('').match(/[\s\S]{1,160}/gu)||[]).filter(text=>text.trim());
}
export function listenPanel(book,chapter,index){
  return `<details class="listen-panel" id="listen-panel"><summary>听本章 · 设备语音朗读</summary><p class="sample-note">使用设备／浏览器提供的语音，不是录制有声书。语音可能需要联网；锁屏或切换应用可能中断播放。听书位置仅保存在此浏览器。</p><div class="listen-controls"><label>章节 <select id="listen-chapter">${book.chapters.map((c,i)=>`<option value="${e(c.id)}" ${i===index?'selected':''}>${e(c.title)}</option>`).join('')}</select></label><label>语速 <select id="listen-rate">${[0.75,1,1.25,1.5].map(n=>`<option value="${n}" ${n===1?'selected':''}>${n}×</option>`).join('')}</select></label><label>声音 <select id="listen-voice"><option value="">设备默认中文语音</option></select></label></div><div class="listen-controls"><button type="button" id="listen-play">开始／继续朗读</button><button type="button" id="listen-pause" disabled>暂停</button><button type="button" id="listen-stop" disabled>停止</button><button type="button" id="listen-restart">从章首重听</button></div><p id="listen-status" role="status" aria-live="polite"></p></details>`;
}
export function bindListen(book,chapter){
  const panel=document.querySelector('#listen-panel'), play=document.querySelector('#listen-play'), pause=document.querySelector('#listen-pause'), stop=document.querySelector('#listen-stop'), restart=document.querySelector('#listen-restart'), rate=document.querySelector('#listen-rate'), voice=document.querySelector('#listen-voice'), status=document.querySelector('#listen-status');
  document.querySelector('#listen-chapter').onchange=event=>{location.hash=`#/read/${encodeURIComponent(book.id)}/${encodeURIComponent(event.target.value)}?listen=1`;};
  const synth=window.speechSynthesis;
  if(!synth || !window.SpeechSynthesisUtterance){
    [play,pause,stop,restart,rate,voice].forEach(control=>control.disabled=true);
    status.textContent='此浏览器不支持语音朗读，请使用支持此功能的浏览器；仍可正常阅读正文。';
    return ()=>{};
  }
  const chunks=speechChunks(chapter), key=`listening:${book.id}:${chapter.id}`;
  const saved=storage.get(key), edition=book.edition||'sample';
  let position=saved?.edition===edition?Math.max(0,Math.min(chunks.length-1,Number(saved.position)||0)):0;
  position=Math.floor(position);
  let generation=0,active=false,disposed=false,utterance=null;
  const save=()=>storage.set(key,{position,edition});
  const update=message=>{status.textContent=message;play.disabled=active;pause.disabled=!active;stop.disabled=!active;rate.disabled=active;voice.disabled=active;};
  const cancel=()=>{generation++;active=false;synth.cancel();utterance=null;};
  const voices=()=>{
    const chosen=voice.value || storage.get('listen-voice','');
    voice.innerHTML='<option value="">设备默认中文语音</option>'+synth.getVoices().map(v=>`<option value="${e(v.voiceURI)}">${e(v.name)} · ${e(v.lang)}</option>`).join('');
    if([...voice.options].some(v=>v.value===chosen))voice.value=chosen;
  };
  voices();synth.addEventListener('voiceschanged',voices);
  const savedRate=Number(storage.get('listen-rate',1));rate.value=[0.75,1,1.25,1.5].includes(savedRate)?String(savedRate):'1';
  rate.onchange=()=>storage.set('listen-rate',Number(rate.value));
  voice.onchange=()=>storage.set('listen-voice',voice.value);
  const speak=()=>{
    if(disposed)return;
    if(position>=chunks.length){position=0;save();active=false;utterance=null;update('本章朗读完毕，可选择下一章。');return;}
    const token=++generation;
    utterance=new window.SpeechSynthesisUtterance(chunks[position]);
    const chosen=synth.getVoices().find(v=>v.voiceURI===voice.value)||synth.getVoices().find(v=>/^zh[-_]?(CN|Hans)/i.test(v.lang))||synth.getVoices().find(v=>/^zh/i.test(v.lang));
    if(chosen)utterance.voice=chosen;
    utterance.lang=chosen?.lang||'zh-CN';utterance.rate=Number(rate.value);active=true;save();
    utterance.onend=()=>{if(disposed||token!==generation)return;position++;speak();};
    utterance.onerror=()=>{if(disposed||token!==generation)return;cancel();update('朗读暂时不可用，请检查设备语音设置后再试；正文阅读不受影响。');};
    update(`正在朗读 · ${position+1} / ${chunks.length} 段`);
    try { synth.speak(utterance); } catch { cancel();update('无法启动设备语音，请检查浏览器及语音设置后重试。'); }
  };
  play.onclick=()=>{if(disposed||active)return;cancel();speak();};
  // Restart the current short segment on resume: more reliable across mobile engines.
  pause.onclick=()=>{cancel();save();update(`已暂停 · ${position+1} / ${chunks.length} 段；继续时重读当前短段。`);};
  stop.onclick=()=>{cancel();save();update('已停止，保留本章听书位置。');};
  restart.onclick=()=>{cancel();position=0;save();speak();};
  panel.addEventListener('toggle',()=>{if(!panel.open&&active){cancel();save();update('已停止，保留本章听书位置。');}});
  const exit=()=>{cancel();save();};window.addEventListener('pagehide',exit);
  update(chunks.length?`准备就绪 · ${position+1} / ${chunks.length} 段`:'本章暂无可朗读文字。');
  if(!chunks.length)[play,restart].forEach(control=>control.disabled=true);
  return ()=>{disposed=true;exit();synth.removeEventListener('voiceschanged',voices);window.removeEventListener('pagehide',exit);};
}
