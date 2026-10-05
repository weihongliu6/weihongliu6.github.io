const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const books=JSON.parse(read('library/data/books.json'));
function context(catalogue=books){
  const sandbox={URL,books:catalogue,platform:JSON.parse(read('library/data/platform.json')),storage:{get:()=>null}};
  vm.createContext(sandbox);
  vm.runInContext(read('library/src/components.js').replaceAll('export ',''),sandbox);
  const app=read('library/src/app.js');
  vm.runInContext('const e=escapeHTML;\n'+app.slice(app.indexOf('function appleBooksLink'),app.indexOf('async function render')),sandbox);
  return sandbox;
}
test('five stable records, three complete and two coming; metadata has explicit unknowns',()=>{
  assert.deepEqual(books.map(b=>b.id),['slow-down','slow-shutter','structure','metabolism','renaissance']);
  assert.equal(books.filter(b=>b.status==='complete').length,3);
  assert.equal(books.filter(b=>b.status==='coming').length,2);
  for(const book of books){
    assert.equal(book.publication.metadataVersion,1);
    assert.equal(book.publication.isbn,null);
    assert.equal(book.publication.rights.exclusive,null);
    assert.equal(book.publication.publisher,null);
    for(const chapter of book.chapters||[]) assert.ok(fs.existsSync(path.join(root,'library',chapter.file.split('?')[0])));
  }
});
test('existing Apple and WeRead destinations and reader routes remain available',()=>{
  const c=context();
  for(const book of books){
    const html=c.bookPage(book);
    if(book.appleBooksUrl) assert.ok(html.includes(book.appleBooksUrl));
    if(book.status==='complete') assert.ok(html.includes(`#/read/${book.id}/${book.chapters[0].id}`));
    else assert.ok(html.includes('即将进入数字书房'));
  }
  assert.ok(c.bookPage(books[0]).includes('https://weread.qq.com/web/reader/67632dc0813abbcb8g0156bb'));
  assert.ok(c.home().includes('3 本完整数字书'));
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
