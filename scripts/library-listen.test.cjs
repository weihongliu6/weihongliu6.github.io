const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const chapter={id:'chapter-01',title:'第一章',blocks:[{type:'paragraph',text:'这是第一句。这是第二句。'},{type:'image',alt:'不要朗读图片路径',src:'secret.jpg'}]};
const book={id:'test',edition:'v1',chapters:[chapter]};
function boot(supported=true){
 const nodes=new Map(),saved=new Map(),spoken=[],listeners={};let cancels=0;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='listen-rate'?'1':'',disabled:false,open:true,options:[],textContent:'',addEventListener(name,fn){this[name]=fn;}});return nodes.get(id);};
 const synth={cancel(){cancels++},speak(u){spoken.push(u)},getVoices:()=>[{voiceURI:'zh',name:'中文',lang:'zh-CN'}],addEventListener(n,f){listeners[n]=f},removeEventListener(n){delete listeners[n]}};
 const window={...(supported?{speechSynthesis:synth,SpeechSynthesisUtterance:class{constructor(text){this.text=text}}}:{}),addEventListener(n,f){listeners[n]=f},removeEventListener(n){delete listeners[n]}};
 const c={pilotCommerce:b=>b?.id==='slow-down'&&b?.commerce?.mode==='pilot',canAccessChapter:(b,id)=>!b.commerce||id===b.commerce.sampleChapter,purchaseURL:b=>'#/purchase/'+b.id,window,document:{querySelector:s=>node(s.slice(1))},location:{hash:''},storage:{get:(k,d=null)=>saved.has(k)?saved.get(k):d,set:(k,v)=>saved.set(k,v)},e:s=>String(s).replaceAll('<','&lt;')};vm.createContext(c);
 vm.runInContext(fs.readFileSync('library/src/listen.js','utf8').replace(/^import .*;\n/gm,'').replaceAll('export ',''),c);
 return {c,node,saved,spoken,listeners,get cancels(){return cancels;},cleanup:c.bindListen(book,chapter)};
}
test('narration starts only on user action, pauses and resumes current segment, cancels stale callbacks',()=>{
 const b=boot();assert.equal(b.spoken.length,0);
 b.node('listen-play').onclick();assert.equal(b.spoken.length,1);assert.equal(b.spoken[0].lang,'zh-CN');
 b.spoken[0].onend();assert.equal(b.spoken.length,2);
 const stale=b.spoken[1];b.node('listen-pause').onclick();assert.equal(b.node('listen-play').disabled,false);
 stale.onend();assert.equal(b.spoken.length,2);
 b.node('listen-play').onclick();assert.equal(b.spoken[2].text,stale.text);
 b.cleanup();b.spoken[2].onend();assert.equal(b.spoken.length,3);assert.deepEqual(Object.keys(b.listeners),[]);
});
test('chapter end, stop, restart, voice errors and unsupported browsers remain usable',()=>{
 const b=boot();b.node('listen-play').onclick();
 for(let i=0;i<3;i++)b.spoken[i].onend();
 assert.match(b.node('listen-status').textContent,/完毕/);assert.equal(b.node('listen-play').disabled,false);
 b.node('listen-restart').onclick();assert.equal(b.spoken.at(-1).text,'第一章');
 b.node('listen-stop').onclick();assert.match(b.node('listen-status').textContent,/已停止/);
 b.node('listen-play').onclick();b.spoken.at(-1).onerror();assert.equal(b.node('listen-play').disabled,false);assert.match(b.node('listen-status').textContent,/不可用/);
 b.cleanup();
 const unsupported=boot(false);assert.equal(unsupported.node('listen-play').disabled,true);assert.match(unsupported.node('listen-status').textContent,/不支持/);unsupported.cleanup();
});
test('speech chunks exclude images and split long text; chapter selection does not auto-play',()=>{
 const b=boot();const chunks=b.c.speechChunks({...chapter,blocks:[...chapter.blocks,{type:'paragraph',text:'字'.repeat(500)}]});
 assert(chunks.every(s=>s.length<=160));assert(!chunks.join('').includes('secret.jpg'));
 b.node('listen-chapter').onchange({target:{value:'chapter-02'}});assert.equal(b.c.location.hash,'#/read/test/chapter-02?listen=1&from=start');assert.equal(b.spoken.length,0);b.cleanup();
});
