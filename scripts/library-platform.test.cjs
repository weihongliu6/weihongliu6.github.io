const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const books=JSON.parse(read('library/data/books.json'));
function context(catalogue=books){
  const sandbox={URL,isSaved:()=>false,isDownloaded:()=>false,books:catalogue,platform:JSON.parse(read('library/data/platform.json')),storage:{get:()=>null}};
  vm.createContext(sandbox);
  vm.runInContext(read('library/src/components.js').replaceAll('export ',''),sandbox);
  const app=read('library/src/app.js');
  vm.runInContext('const e=escapeHTML;\n'+app.slice(app.indexOf('function appleBooksLink'),app.indexOf('async function render')),sandbox);
  return sandbox;
}
test('five stable records, five complete preview records; metadata has explicit unknowns',()=>{
  assert.deepEqual(books.map(b=>b.id),['slow-down','slow-shutter','structure','metabolism','renaissance']);
  assert.equal(books.filter(b=>b.status==='complete').length,5);
  assert.equal(books.filter(b=>b.status==='coming').length,0);
  for(const book of books){
    assert.equal(book.publication.metadataVersion,1);
    assert.equal(book.publication.isbn,null);
    assert.equal(book.publication.rights.exclusive,null);
    assert.equal(book.publication.publisher,null);
    for(const chapter of book.chapters||[]){
      const exists=fs.existsSync(path.join(root,'library',chapter.file.split('?')[0]));
      assert.equal(exists,!['slow-down','slow-shutter','structure','metabolism','renaissance'].includes(book.id)||chapter.id==='chapter-01');
    }
  }
});
test('existing Apple and WeRead destinations and reader routes remain available',()=>{
  const c=context();
  for(const book of books){
    const html=c.bookPage(book);
    if(book.appleBooksUrl) assert.ok(html.includes(book.appleBooksUrl));
    if(book.status==='complete') assert.ok(html.includes(`#/read/${book.id}/${book.commerce?.mode==='pilot'?book.commerce.sampleChapter:book.chapters[0].id}`));
    else assert.ok(html.includes('即将进入数字书房'));
  }
  assert.ok(c.bookPage(books[0]).includes('https://weread.qq.com/web/reader/67632dc0813abbcb8g0156bb'));
  assert.ok(c.home().includes('5 本数字书开放第一章'));
});
test('sixth book and new external channel render from metadata without code changes',()=>{
  const extra={id:'future-author',title:'A & B',author:'Another Author',status:'coming',publication:{externalEditions:[{channel:'publisher-store',label:'Publisher <store>',url:'https://example.org/book',title:'Other title'}]}};
  const c=context([...books,extra]);
  assert.ok(c.home().includes('6 本书'));
  assert.ok(c.bookPage(extra).includes('https://example.org/book'));
  assert.ok(c.bookPage(extra).includes('Publisher &lt;store&gt;'));
});
test('legacy Apple records work; unsafe structured destinations are excluded',()=>{
  const c=context();
  assert.ok(c.appleBooksLink({id:'old',appleBooksUrl:'https://books.apple.com/au/book/id6757672905'}).includes('id6757672905'));
  assert.equal(c.otherEditionLinks({publication:{externalEditions:[{channel:'test',label:'Bad',url:'javascript:alert(1)'}]}}),'');
});
test('URL-less paperback metadata stays separate from the web edition and renders without a link',()=>{
  const book=books.find(book=>book.id==='renaissance');
  assert.equal(book.status,'complete');
  assert.equal(book.publication.isbn,null);
  assert.equal(book.publication.publisher,null);
  assert.deepEqual(book.publication.externalEditions,[{label:'平装纸书',format:'paperback',isbn:'9781763913608',url:null}]);
  const c=context();
  const html=c.otherEditionLinks(book);
  assert.match(html,/平装纸书 · ISBN 9781763913608/);
  assert.doesNotMatch(html,/<a\b|href=|↗/);
  assert.ok(c.bookPage(book).includes(html));
  const schema=JSON.parse(read('library/data/publication.schema.json')).properties.externalEditions.items;
  assert.ok(!schema.required.includes('url'));
  assert.ok(!schema.required.includes('channel'));
  assert.ok(schema.properties.url.type.includes('null'));
});
test('physical and digital editions without URLs render escaped metadata; only HTTP(S) creates links',()=>{
  const c=context();
  for(const format of ['paperback','epub']){
    for(const url of [undefined,null,'','javascript:alert(1)','data:text/html,bad','https://']){
      const entry={channel:'apple-books',label:'Edition <test>',format,isbn:'9781763913608',url};
      const book={publication:{externalEditions:[entry]}};
      const html=c.otherEditionLinks(book);
      assert.match(html,/Edition &lt;test&gt; · ISBN 9781763913608/);
      assert.doesNotMatch(html,/<a\b|href=|↗/);
      assert.equal(c.appleBooksLink(book),'');
    }
  }
  for(const url of ['https://example.org/book','http://example.org/book']){
    const book={publication:{externalEditions:[{label:'平装纸书',format:'paperback',isbn:'9781763913608',url}]}};
    assert.ok(c.otherEditionLinks(book).includes(`href="${url}"`));
  }
  assert.equal(c.appleBooksLink({appleBooksUrl:'javascript:alert(1)'}),'');
});
test('shelf search, reading filters and listening catalogue do not advertise unavailable books',()=>{
 const c=context();
 assert.equal(c.matchesShelf(books[0],'慢下','readable'),true);
 assert.equal(c.matchesShelf(books[0],'no-such-title','all'),false);
 assert.equal(c.matchesShelf(books[3],'','readable'),true);
 assert.equal(c.matchesShelf({status:'coming'},'','coming'),true);
 c.storage.get=key=>key==='reading:slow-down'?{chapter:books[0].chapters[1].id}:null;
 assert.equal(c.matchesShelf(books[0],'','reading'),true);
 assert.ok(c.shelfTools().includes('#/purchase/slow-down'));
 assert.ok(!c.shelfTools().includes(`#/read/slow-down/${books[0].chapters[1].id}?resume=1`));
 const html=c.listeningHome();
 assert.ok(html.includes('设备语音朗读'));assert.ok(html.includes('?listen=1'));
 assert.ok(html.includes('寻找文艺复兴'));assert.ok(html.includes('人体代谢'));
 c.storage.get=()=>({chapter:'deleted-chapter'});
 assert.equal(c.savedReading(books[0]),null);
});

