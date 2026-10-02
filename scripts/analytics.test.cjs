const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
const code=fs.readFileSync('assets/analytics/analytics.js','utf8');const manifest=JSON.parse(fs.readFileSync('assets/analytics/pages.json','utf8'));
async function boot({url='https://weihongliu6.github.io/',consent=true,storage=new Map(),hidden=false,dnt=false}={}){
 if(consent)storage.set('so-analytics-choice',JSON.stringify({allowed:true,until:Date.now()+86400000}));
 const requests=[],handlers={},timers=[];let now=100,focused=true;const nodes=new Map();
 function node(){return {dataset:{},children:[],style:{},hidden:false,append(...x){this.children.push(...x)},setAttribute(){},addEventListener(){},querySelector(s){if(!nodes.has(s))nodes.set(s,node());return nodes.get(s)}};}
 const local={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 const document={visibilityState:hidden?'hidden':'visible',referrer:'https://example.org/story?email=private@example.org#secret',head:node(),body:node(),createElement:node,querySelector:s=>nodes.get(s)||null,hasFocus:()=>focused,addEventListener:(n,f)=>(handlers[n]??=[]).push(f)};
 const location=new URL(url); const window={localStorage:local,sessionStorage:local};window.top=window;
 const context=vm.createContext({window,document,location,navigator:{doNotTrack:dnt?'1':'0'},URL,URLSearchParams,Date,performance:{now:()=>now},innerHeight:800,matchMedia:q=>({matches:false}),setInterval:f=>timers.push(f),HTMLAudioElement:class{},fetch:async(u,options)=>{if(u==='/assets/analytics/pages.json')return{ok:true,json:async()=>manifest};requests.push({u:String(u),options});return{};},console});
 vm.runInContext(code,context);await new Promise(setImmediate);
 return {requests,handlers,nodes,storage,context,document,window,runAgain:()=>vm.runInContext(code,context),tick(ms=1000){now+=ms;timers.forEach(f=>f())},focus(v){focused=v},fire(type,e={}){(handlers[type]||[]).forEach(f=>f(e))},payloads:()=>requests.map(r=>Object.fromEntries(new URL(r.u).searchParams))};
}
test('consent denied, local/preview origins, owner exclusion and DNT send nothing',async()=>{
 for(const options of [{consent:false},{url:'http://localhost:5174/'},{url:'https://preview.example.org/'},{dnt:true},{storage:new Map([['so-analytics-exclude','1']])}]) assert.equal((await boot(options)).requests.length,0);
});
test('privacy: no query/referrer parameters, no fingerprints, credentials omitted',async()=>{
 const b=await boot({url:'https://weihongliu6.github.io/index.html?email=secret&token=private&utm_campaign=secret'});
 const page=b.payloads().find(p=>!p.e);assert.equal(page.p,'/');assert.equal(page.r,'https://example.org');
 for(const r of b.requests){assert.equal(r.options.credentials,'omit');assert.equal(r.options.referrerPolicy,'no-referrer');assert(!/secret|private|email|token|1920/.test(r.u));assert.equal(new URL(r.u).searchParams.get('ns'),'true');}
});
test('one page view when script reinitialises; only one daily browser across pages',async()=>{
 const b=await boot();b.runAgain();assert.equal(b.payloads().filter(p=>!p.e).length,1);
 const second=await boot({storage:b.storage,url:'https://weihongliu6.github.io/works.html'});assert(!second.payloads().some(p=>p.p==='metric/daily_browser'));
});
test('successful book/chapter routes, same-route rerender and refresh deduplication',async()=>{
 const b=await boot({url:'https://weihongliu6.github.io/library/'});assert.equal(b.requests.length,0);
 b.window.ShadowAnalytics.bookPage('slow-down','chapter-01');await new Promise(setImmediate);
 b.window.ShadowAnalytics.bookPage('slow-down','chapter-01');await new Promise(setImmediate);
 assert.equal(b.payloads().filter(p=>!p.e).length,1);assert.equal(b.payloads().filter(p=>p.p.includes('chapter_start')).length,1);
 b.window.ShadowAnalytics.bookPage('unknown','private-query');await new Promise(setImmediate);assert.equal(b.payloads().filter(p=>!p.e).length,1);
 const fresh=await boot({storage:b.storage,url:'https://weihongliu6.github.io/library/'});fresh.window.ShadowAnalytics.bookPage('slow-down','chapter-01');await new Promise(setImmediate);
 assert.equal(fresh.payloads().filter(p=>!p.e).length,1);assert.equal(fresh.payloads().filter(p=>p.p.includes('chapter_start')).length,0);
});
test('hidden arrival waits for visibility; no duplicate visibility view',async()=>{
 const b=await boot({hidden:true});assert.equal(b.requests.length,0);b.document.visibilityState='visible';b.fire('visibilitychange');b.fire('visibilitychange');assert.equal(b.payloads().filter(p=>!p.e).length,1);
});
test('article threshold needs 75% depth and 30 seconds of recent visible focused activity',async()=>{
 const b=await boot({url:'https://weihongliu6.github.io/articles/deep-winter.html'});b.nodes.set('article',{getBoundingClientRect:()=>({top:-100,height:1000})});b.fire('scroll');
 for(let i=0;i<40;i++)b.tick();assert(!b.payloads().some(p=>p.p.includes('depth_75')));
 b.fire('pointerdown',{isTrusted:true});for(let i=0;i<20;i++)b.tick();b.focus(false);for(let i=0;i<40;i++)b.tick();assert(!b.payloads().some(p=>p.p.includes('depth_75')));
 b.focus(true);b.fire('pointerdown',{isTrusted:true});for(let i=0;i<15;i++)b.tick();assert.equal(b.payloads().filter(p=>p.p.includes('depth_75')).length,1);
});
test('audio requires explicit intent plus playing; autoplay and repeat playing excluded',async()=>{
 const b=await boot({url:'https://weihongliu6.github.io/music-player.html'});const audio=vm.runInContext('new HTMLAudioElement()',b.context);
 b.fire('playing',{target:audio});assert(!b.payloads().some(p=>p.p.includes('music_play_start')));
 b.window.ShadowAnalytics.musicIntent('track-01');b.fire('playing',{target:audio});b.fire('playing',{target:audio});assert.equal(b.payloads().filter(p=>p.p.includes('music_play_start')).length,1);
 b.window.ShadowAnalytics.musicIntent('track-02');b.window.ShadowAnalytics.musicAutomatic();b.fire('playing',{target:audio});assert.equal(b.payloads().filter(p=>p.p.includes('music_play_start')).length,1);
});
