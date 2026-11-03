import importlib.util,json,tempfile,unittest,hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('builder',Path(__file__).with_name('build_public_site.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Publication(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);self.s=self.root/'src';self.s.mkdir();(self.s/'scripts').mkdir();(self.s/'index.html').write_text('studio');self.p={'reviewedSourceCommit':'fixture','sourceFiles':['index.html','scripts/public-site-policy.json'],'publicFiles':['index.html'],'opaqueGitBlobs':{},'retiredFiles':[],'excludedBodyFingerprints':{'characters':8,'hashes':[]}}
 def runbuild(self,extra=[]):
  (self.s/'scripts/public-site-policy.json').write_text(json.dumps(self.p));return m.build(self.s,self.root/'out',self.p['sourceFiles']+extra)
 def test_build(self):self.assertEqual(len(self.runbuild()['publicFiles']),1)
 def test_missing(self):
  self.p['sourceFiles'].append('absent')
  with self.assertRaises(FileNotFoundError):self.runbuild()
 def test_unknown(self):
  with self.assertRaises(ValueError):self.runbuild(['other'])
 def test_dynamic_brief(self):
  (self.s/'ai-briefs').mkdir();(self.s/'ai-briefs/AI_Brief_2026-11-04.html').write_text('new brief');self.assertEqual(len(self.runbuild(['ai-briefs/AI_Brief_2026-11-04.html'])['publicFiles']),2)
 def test_symlink(self):
  (self.s/'index.html').unlink();(self.s/'index.html').symlink_to('/etc/hosts')
  with self.assertRaises(ValueError):self.runbuild()
 def test_existing_output(self):
  (self.root/'out').mkdir()
  with self.assertRaises(ValueError):self.runbuild()
 def test_fingerprint(self):
  self.p['excludedBodyFingerprints']['hashes']=[hashlib.sha256(b'abcdefgh').hexdigest()];(self.s/'index.html').write_text('ab cd ef gh')
  with self.assertRaises(ValueError):self.runbuild()
 def test_opaque(self):
  self.p['opaqueGitBlobs']['index.html']='0'*40
  with self.assertRaises(ValueError):self.runbuild()
 def test_reader_denied(self):
  (self.s/'library/data').mkdir(parents=True);(self.s/'library/data/books.json').write_text('{}');self.p['sourceFiles'].append('library/data/books.json');self.p['publicFiles'].append('library/data/books.json')
  with self.assertRaises(ValueError):self.runbuild()
