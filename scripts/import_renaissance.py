from pathlib import Path
import fitz, json, re, base64, hashlib, io, sys
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]/'library'; OUT=ROOT/'data/chapters/renaissance'
OUT.mkdir(parents=True,exist_ok=True)
source=Path(sys.argv[1]); doc=fitz.open(source)
sha=hashlib.sha256(source.read_bytes()).hexdigest()
toc=doc.get_toc(); withheld={157:'075',339:'176',340:'177'}
def uri(data): return 'data:image/webp;base64,'+base64.b64encode(data).decode()
def webp(data,maxwidth=1500):
 im=Image.open(io.BytesIO(data)).convert('RGB');im.thumbnail((maxwidth,2100));buf=io.BytesIO();im.save(buf,'WEBP',quality=84);return uri(buf.getvalue()),im.width,im.height
def page_image(page):
 pix=page.get_pixmap(matrix=fitz.Matrix(2.4,2.4),alpha=False)
 return webp(pix.tobytes('png'),1500)
def plain(page):
 return '\n'.join(b[4].strip() for b in sorted(page.get_text('blocks'),key=lambda b:(round(b[1]/4),b[0])) if b[6]==0 and b[1]>45 and b[3]<749)
def links(page):
 return [{'label':page.get_textbox(l['from']).strip() or '原书参考链接','url':l['uri']} for l in page.get_links() if l.get('uri','').startswith(('http://','https://'))]
def join(a,b):
 return a+(' ' if a and b and a[-1].isascii() and a[-1].isalnum() and b[0].isascii() and b[0].isalnum() else '')+b

# Source credits and hyperlinks travel with every artwork, as well as the source appendix.
credits={}
for pg in list(doc)[627:]:
 blocks=sorted(pg.get_text('blocks'),key=lambda b:(round(b[1]/3),b[0]))
 heads=[b for b in blocks if re.search(r'作品图\s*\d{3}',b[4])]
 for j,b in enumerate(heads):
  num=re.search(r'作品图\s*(\d{3})',b[4]).group(1);end=heads[j+1][1] if j+1<len(heads) else 745
  credit=' '.join(c[4].strip() for c in blocks if c[1]>=b[3]-1 and c[1]<end and '来源记录署名' in c[4])
  ll=[{'label':pg.get_textbox(l['from']).strip() or '来源／许可','url':l['uri']} for l in pg.get_links() if l.get('uri','').startswith(('http://','https://')) and b[1]<l['from'].y0<end]
  credits[num]=(credit,ll)

segments=[('front-matter','封面、书名与原书目录',1),('preface','写在重新出发之前',6)]
segments += [('chapter-'+f'{int(re.match(r"第(\d+)",t).group(1)):02d}',t,p) for level,t,p in toc if re.match(r'第\d+章',t)]
segments += [('afterword','后记｜把下一次观看留给自己',413)]
# Keep large reference sections in short, independently loaded units.
refs={414:'现场寻宝地图｜总览与使用说明',514:'附录｜时间轴与现场快查',518:'意大利艺术旅行地点中—意—英对照表',528:'同名与易混淆地点',530:'主要艺术家短传｜阅读说明',601:'艺术家肖像来源记录',604:'人名原文与主要章节',606:'主要艺术作品中—意—英对照表',616:'六个容易混淆的词',617:'继续读什么',618:'艺术与建筑术语对照表',622:'资料来源与出发前查询入口',628:'作品插图来源与页码'}
for level,t,p in toc:
 if 418<=p<=513 and level==2: refs[p]='寻宝地图｜'+t
for p in range(531,601,5):
 names=[t for level,t,page in toc if level==2 and p<=page<min(p+5,601)]
 refs[p]='艺术家短传｜'+(names[0]+'—'+names[-1] if names else str(p))
for p in range(633,648,5):refs[p]='作品插图来源与页码（续）'
segments += [('reference-'+str(p),t,p) for p,t in sorted(refs.items())]
segments.sort(key=lambda s:s[2]); manifest=[]; stats={'pages':len(doc),'withheldFigures':list(withheld.values()),'sourceSha256':sha,'images':0,'referencePages':0}
for n,(cid,title,start) in enumerate(segments):
 end=segments[n+1][2]-1 if n+1<len(segments) else len(doc); blocks=[]
 for pn in range(start,end+1):
  page=doc[pn-1]; anchor=f'page-{pn}'
  if pn<=5 or pn>=414:
   src,w,h=page_image(page);blocks.append(dict(type='reference-page',src=src,width=w,height=h,alt=f'{title}，原书第{pn}页',caption=f'原书 PDF 第 {pn} 页 · 点击放大',text=plain(page),anchor=anchor,links=links(page)));stats['referencePages']+=1
   continue
  items=sorted(page.get_text('dict')['blocks'],key=lambda b:(round(b['bbox'][1]/3),b['bbox'][0])); page_blocks=[];pending='';last_bottom=None
  def flush():
   global pending
   if pending:page_blocks.append({'type':'paragraph','text':pending,'sourcePage':pn});pending=''
  caption=' '.join(''.join(s['text'] for l in b.get('lines',[]) for s in l['spans']) for b in items if b['type']==0 and any('作品图' in s['text'] for l in b.get('lines',[]) for s in l['spans']))
  for b in items:
   x0,y0,x1,y1=b['bbox']
   if y0<45 or y1>749:continue
   if b['type']==1:
    flush()
    if pn in withheld:
     page_blocks.append({'type':'paragraph','text':f'〔作品图{withheld[pn]}：图片使用授权待确认，数字版暂不展示图片；原书图注保留如下。〕','sourcePage':pn})
    else:
     src,w,h=webp(b['image']);m=re.search(r'作品图(\d{3})',caption);credit,ll=credits.get(m.group(1),('',[])) if m else ('',[])
     page_blocks.append(dict(type='image',src=src,width=w,height=h,alt=caption or f'原书第{pn}页插图',caption=' '.join(filter(None,[caption,credit,'网页图片经压缩。' if credit else ''])),sourcePage=pn));stats['images']+=1
     for l in ll:page_blocks.append(dict(type='link',**l))
    last_bottom=None;continue
   lines=b.get('lines',[]);txt=''
   for l in lines:txt=join(txt,''.join(s['text'] for s in l['spans']).strip())
   if not txt:continue
   size=max(s['size'] for l in lines for s in l['spans']);is_heading=size>=12 or txt.startswith('现场寻宝 ')
   if txt.startswith('作品图') and pn not in withheld:continue
   if is_heading:
    flush();page_blocks.append({'type':'heading','text':txt,'sourcePage':pn});last_bottom=None
   else:
    if last_bottom is not None and y0-last_bottom>9:flush()
    pending=join(pending,txt);last_bottom=y1
  flush()
  if page_blocks:page_blocks[0]['anchor']=anchor
  blocks.extend(page_blocks)
  for l in links(page):blocks.append(dict(type='link',**l))
 chapter={'id':cid,'title':title,'source':{'file':source.name,'format':'pdf','sha256':sha,'pages':list(range(start,end+1)),'label':f'依据作者完整书稿 PDF 第 {start}–{end} 页收录。正文按原页顺序转换；地图、短传及复杂表格保留原页，可展开文字。图075、176、177暂不展示图片，保留图注。'},'blocks':blocks}
 path=OUT/(cid+'.json');path.write_text(json.dumps(chapter,ensure_ascii=False,separators=(',',':')))
 sections=[];seen=set()
 for level,t,p in toc:
  if start<=p<=end and p not in seen and t!=title and not t.startswith('作品插图索引'):
   if cid.startswith('chapter-') and not (level==3 or t.startswith('作品图')):continue
   if cid=='front-matter':continue
   sections.append({'title':t,'anchor':f'page-{p}'});seen.add(p)
 manifest.append({'id':cid,'title':title,'file':'data/chapters/renaissance/'+path.name,'sections':sections,'start':start,'end':end,'bytes':path.stat().st_size})
books=json.loads((ROOT/'data/books.json').read_text());book=next(b for b in books if b['id']=='renaissance')
book.update(author='影子观察',subtitle='沿着意大利的城市、教堂与街巷，遇见散落人间的艺术珍宝',status='complete',edition='renaissance-web-20261006',coverLabel='原书封面',intro='最后，这本书写给所有愿意慢下来的人。愿下一次站在画前时，我们都少一点赶路，多一点辨认；少一点“我看过”的得意，多一点“我还在看”的谦卑。',introSource='原书《写在重新出发之前》',editionSummary='647页书稿 · 7部38章 · 现场寻宝地图、艺术家短传与附录。图075、176、177的图片暂缺，正文及图注保留。',chapters=[{k:m[k] for k in ['id','title','file']} for m in manifest],toc=[{k:m[k] for k in ['id','title','sections']} for m in manifest])
book['publication']['format']='web';book['publication']['contributors']=[{'name':'影子观察','role':'author'}]
(ROOT/'data/books.json').write_text(json.dumps(books,ensure_ascii=False,indent=2)+'\n')
(OUT/'import-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2));stats['sections']=len(manifest);stats['bytes']=sum(m['bytes'] for m in manifest);(OUT/'import-stats.json').write_text(json.dumps(stats,indent=2));print(json.dumps(stats))
