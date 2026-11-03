#!/usr/bin/env python3
"""Build the personal site; no dual-platform book content pipeline."""
import argparse,hashlib,html,json,re,subprocess
from pathlib import Path
POLICY='scripts/public-site-policy.json'
def build(source,output,tracked=None):
 source,output=Path(source).resolve(),Path(output).resolve()
 if output.exists(): raise ValueError('Output must be new; never overwrite an artifact')
 p=json.loads((source/POLICY).read_text())
 if tracked is None: tracked=subprocess.check_output(['git','-C',str(source),'ls-files','-z']).decode().strip('\0').split('\0')
 expected=set(p['sourceFiles']);actual=set(tracked)
 dynamic=lambda x:bool(re.fullmatch(r'ai-briefs/AI_Brief_\d{4}-\d{2}-\d{2}\.html',x))
 if expected-actual or any(not dynamic(x) for x in actual-expected):raise ValueError('Unreviewed or missing source paths')
 public=set(p['publicFiles'])|{x for x in actual if dynamic(x)};data={}
 fingerprints=p['excludedBodyFingerprints'];bad=set(fingerprints['hashes']);width=fingerprints['characters']
 for name in sorted(actual):
  path=Path(name)
  if path.is_absolute() or '..' in path.parts:raise ValueError('Unsafe source path')
  f=source/path
  if any(x.is_symlink() for x in [f,*f.parents]):raise ValueError('Symlinks forbidden')
  d=f.read_bytes();data[name]=d
  if name in p['opaqueGitBlobs']:
   oid=hashlib.sha1(b'blob '+str(len(d)).encode()+b'\0'+d).hexdigest()
   if oid!=p['opaqueGitBlobs'][name]:raise ValueError('Unreviewed opaque file: '+name)
  try:text=d.decode('utf-8')
  except UnicodeDecodeError:continue
  variants=[text,html.unescape(text)]
  if name.endswith('.json'):
   try:variants.append(json.dumps(json.loads(text),ensure_ascii=False))
   except ValueError:pass
  variants += [''.join(text.split()) for text in variants]
  for text in variants:
   compact=text
   if any(hashlib.sha256(compact[i:i+width].encode()).hexdigest() in bad for i in range(max(0,len(compact)-width+1))):raise ValueError('Controlled body fingerprint detected')
 for name in public:
  if name not in data:raise ValueError('Missing public file')
  if name.startswith(('library/data/','library/assets/','library/src/')) or (name.startswith('reader-test/') and name!='reader-test/index.html'):raise ValueError('Reader resources forbidden')
 output.mkdir(parents=True)
 hashes={}
 for name in sorted(public):
  f=output/name;f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(data[name]);hashes[name]=hashlib.sha256(data[name]).hexdigest()
 try:commit=subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],stderr=subprocess.DEVNULL).decode().strip()
 except subprocess.CalledProcessError:commit=p['reviewedSourceCommit']+'+gateway-candidate'
 manifest={'sourceCommit':commit,'publicFiles':hashes,'retiredFiles':p['retiredFiles'],'architecture':'personal-site-and-navigation-only'}
 (output/'publication-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 return manifest
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('--source',required=True);a.add_argument('--output',required=True);x=a.parse_args();build(x.source,x.output)
