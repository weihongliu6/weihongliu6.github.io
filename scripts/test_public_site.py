import json
import pathlib
import tempfile
import unittest
from build_public_site import BUILD_FILES, POLICY_PATH, SAMPLE, build, sha

class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.tmp.name)
        self.source = self.root / 'source'
        self.source.mkdir()
        self.output = self.root / 'output'
        self.allowed = [SAMPLE, 'library/assets/covers/slow-down.jpg'] + [f'library/assets/books/slow-down-docx/photo-{n:02d}-{variant}.jpg' for n in (1, 2) for variant in ('reading', 'large')]
        self.locked = [f'library/data/chapters/slow-down-full/chapter-{n:02d}.json' for n in range(2,23)]
        self.put(SAMPLE, {'id':'chapter-01','blocks':[{'type':'image', 'src':f'assets/books/slow-down-docx/photo-{n:02d}-reading.jpg','fullSrc':f'assets/books/slow-down-docx/photo-{n:02d}-large.jpg'} for n in (1,2)]})
        for p in self.allowed[1:]:
            self.put(p,b'image bytes')
        books=[{'id':'slow-down','chapters':[{'file':p.removeprefix('library/')} for p in [SAMPLE,*self.locked]],'toc':[{}]*22,'cover':'assets/covers/slow-down.jpg','commerce':{'mode':'pilot','sampleChapter':'chapter-01'}}]
        self.put('library/assets/books/slow-shutter-epub/cover.png', b'cover')
        second_sample='library/data/chapters/slow-shutter-full/chapter-01.json'
        second_locked=[f'library/data/chapters/slow-shutter-full/section-{n}.json' for n in range(8)]
        self.allowed += [second_sample, 'library/assets/books/slow-shutter-epub/cover.png']
        self.locked += second_locked
        self.put(second_sample, {'blocks':[]})
        books.append({'id':'slow-shutter','cover':'assets/books/slow-shutter-epub/cover.png','chapters':[{'file':p.removeprefix('library/')} for p in [second_sample,*second_locked]],'toc':[{}]*9,'commerce':{'mode':'pilot','sampleChapter':'chapter-01'}})
        for name, count in [('structure',15),('metabolism',0),('renaissance',108)]:
            if not count:
                books.append({'id':name,'chapters':[]})
                continue
            directory=name if name=='renaissance' else name+'-full'
            sample=f'library/data/chapters/{directory}/chapter-01.json'
            locked=[f'library/data/chapters/{directory}/section-{n}.json' for n in range(count-1)]
            cover=f'library/assets/covers/{name}.jpg'
            self.allowed += [sample,cover]
            self.locked += locked
            self.put(sample,{'blocks':[]})
            self.put(cover,b'cover')
            books.append({'id':name,'cover':cover.removeprefix('library/'),'chapters':[{'file':p.removeprefix('library/')} for p in [sample,*locked]],'toc':[{}]*count,'commerce':{'mode':'pilot','sampleChapter':'chapter-01'}})
        self.put('library/data/books.json', books)
        self.put('library/index.html', '<html>Original reader</html>')
        self.put('library/sw.js', "const SHELL_FILES=['./','index.html','data/books.json'];")
        self.put('library-update.html', 'original recovery page')
        for p in BUILD_FILES:
            self.put(p, 'build-only')
        self.tracked = {p.relative_to(self.source).as_posix() for p in self.source.rglob('*') if p.is_file()}
        self.policy={'sourceFiles':sorted(self.tracked-BUILD_FILES),'pilotFiles':self.allowed,'excludedPilotFiles':self.locked,'publicFiles':sorted(self.tracked-BUILD_FILES-set(self.locked))}
        self.policy['excludedBodyFingerprints']={'algorithm':'sha256','characters':80,'hashes':[sha(('Locked chapter unique paragraph. '*8)[:80].encode())]}
        self.put(POLICY_PATH,self.policy)

    def tearDown(self):
        self.tmp.cleanup()

    def put(self,path,value):
        p=self.source/path
        p.parent.mkdir(parents=True,exist_ok=True)
        p.write_bytes(value if isinstance(value,bytes) else (json.dumps(value,ensure_ascii=False) if isinstance(value,(dict,list)) else value).encode())

    def run_build(self):
        return build(self.source,self.output,self.tracked)

    def test_only_sample_and_all_other_book_content_preserved(self):
        result=self.run_build()
        self.assertEqual(set(result['preservedBooks']),{'metabolism'})
        self.assertNotIn('slow-shutter',result['preservedBooks'])
        for p in self.policy['publicFiles']:
            self.assertEqual((self.source/p).read_bytes(),(self.output/p).read_bytes())
        for p in self.locked:
            self.assertFalse((self.output/p).exists())
        for p in BUILD_FILES:
            self.assertFalse((self.output/p).exists())

    def test_renaissance_embedded_locked_images_cannot_be_reintroduced(self):
        p='library/data/chapters/renaissance/section-8.json'
        self.put(p, {'blocks':[{'type':'image','src':'data:image/webp;base64,V0VCUA=='}]})
        self.tracked.add(p)
        with self.assertRaisesRegex(ValueError,'Unreviewed'):
            self.run_build()

    def test_missing_tracked_file_fails_before_output(self):
        (self.source/'library/data/chapters/renaissance/chapter-01.json').unlink()
        with self.assertRaisesRegex(ValueError,'Incomplete source'):
            self.run_build()
        self.assertFalse(self.output.exists())

    def test_partial_tracked_tree_fails(self):
        self.tracked.remove('library/data/chapters/renaissance/chapter-01.json')
        with self.assertRaisesRegex(ValueError,'incomplete tracked tree'):
            self.run_build()

    def test_new_pilot_path_fails(self):
        p='library/data/chapters/slow-down-full/new.json'
        self.put(p,{})
        self.tracked.add(p)
        with self.assertRaisesRegex(ValueError,'Unreviewed'):
            self.run_build()

    def test_unknown_source_document_fails(self):
        p='book-full.docx'
        self.put(p,b'new document')
        self.tracked.add(p)
        with self.assertRaisesRegex(ValueError,'Unreviewed'):
            self.run_build()

    def test_body_copied_to_allowed_html_fails(self):
        self.put('library/index.html','Locked chapter unique paragraph. '*8)
        with self.assertRaisesRegex(ValueError,'body content'):
            self.run_build()

    def test_new_daily_brief_is_allowed_but_scanned(self):
        p='ai-briefs/AI_Brief_2026-10-08.html'
        self.put(p,'Daily brief')
        self.tracked.add(p)
        self.run_build()
        self.assertTrue((self.output/p).is_file())

    def test_daily_brief_cannot_smuggle_pilot_body(self):
        p='ai-briefs/AI_Brief_2026-10-08.html'
        self.put(p,'Locked chapter unique paragraph. '*8)
        self.tracked.add(p)
        with self.assertRaisesRegex(ValueError,'body content'):
            self.run_build()

    def test_opaque_file_change_fails(self):
        self.policy['opaqueGitBlobs']={self.allowed[1]:'0'*40}
        self.put(POLICY_PATH,self.policy)
        with self.assertRaisesRegex(ValueError,'Opaque file changed'):
            self.run_build()

    def test_new_image_reference_fails(self):
        data=json.loads((self.source/SAMPLE).read_text())
        data['blocks'][0]['fullSrc']='assets/books/slow-down-docx/photo-03-large.jpg'
        self.put(SAMPLE,data)
        with self.assertRaisesRegex(ValueError,'image policy'):
            self.run_build()

    def test_missing_worker_shell_path_fails(self):
        self.put('library/sw.js', "const SHELL_FILES=['./','not-published.js'];")
        with self.assertRaisesRegex(ValueError,'shell file omitted'):
            self.run_build()

    def test_symlink_fails(self):
        p=self.source/'library/index.html'
        p.unlink()
        p.symlink_to(self.source/'library/sw.js')
        with self.assertRaisesRegex(ValueError,'Symlink'):
            self.run_build()

    def test_locked_source_reintroduction_is_rejected(self):
        p=self.locked[0]
        self.put(p, {'blocks':[]})
        self.tracked.add(p)
        self.policy['sourceFiles'].append(p)
        self.put(POLICY_PATH,self.policy)
        with self.assertRaisesRegex(ValueError,'must not be tracked'):
            self.run_build()

    def test_body_copy_in_build_only_file_is_rejected(self):
        self.put('PUBLICATION.md','Locked chapter unique paragraph. '*8)
        with self.assertRaisesRegex(ValueError,'body content'):
            self.run_build()

    def test_escaped_json_copy_is_rejected(self):
        p='ai-briefs/AI_Brief_2026-10-08.html'
        self.put(p,'&#76;ocked chapter unique paragraph. '+'Locked chapter unique paragraph. '*7)
        self.tracked.add(p)
        with self.assertRaisesRegex(ValueError,'body content'):
            self.run_build()

    def test_existing_output_never_overwritten(self):
        self.output.mkdir()
        with self.assertRaisesRegex(ValueError,'fresh output'):
            self.run_build()

if __name__=='__main__':
    unittest.main()
