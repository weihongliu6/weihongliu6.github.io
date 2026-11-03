#!/usr/bin/env python3
"""Post-deployment verification: never download retired reader/body resources."""
import argparse,hashlib,json,time,urllib.request,urllib.error
p=argparse.ArgumentParser();p.add_argument('--url',required=True);p.add_argument('--timeout',type=int,default=600);a=p.parse_args()
base=a.url.rstrip('/')+'/'
manifest=json.load(urllib.request.urlopen(base+'publication-manifest.json'))
for path,digest in manifest['publicFiles'].items():
 data=urllib.request.urlopen(base+path).read()
 if hashlib.sha256(data).hexdigest()!=digest:raise SystemExit('Public artifact differs: '+path)
for path in ['library/data/books.json','library/data/chapters/slow-down/chapter-01.json','reader-test/app.mjs']:
 try:
  r=urllib.request.urlopen(urllib.request.Request(base+path,method='HEAD'))
 except urllib.error.HTTPError as e:
  if e.code in (404,410):continue
  raise
 raise SystemExit('Retired resource still accessible: '+path)
print('Personal site and gateway origin verified')
