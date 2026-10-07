#!/usr/bin/env python3
"""Build the whole public site from a complete tracked checkout, without editing it.

This is publication minimization, not DRM. Public Git history and prior copies remain.
Only the explicitly reviewed Pilot paths may be published. New paths fail closed.
"""
import argparse
import hashlib
import json
import pathlib
import re
import shutil
import subprocess

POLICY_PATH = 'scripts/public-site-policy.json'
BUILD_FILES = {
    POLICY_PATH, 'scripts/build_public_site.py', 'scripts/test_public_site.py',
    'scripts/verify_public_origin.py', '.github/workflows/pages.yml',
    'PUBLICATION.md',
}
PILOT = 'slow-down'
SAMPLE = 'library/data/chapters/slow-down-full/chapter-01.json'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def tracked_files(source):
    output = subprocess.check_output(['git', '-C', str(source), 'ls-files', '-z'])
    return set(output.decode().rstrip('\0').split('\0'))

def read_file(root, name):
    p = pathlib.PurePosixPath(name)
    if p.is_absolute() or '..' in p.parts:
        raise ValueError('Unsafe path: ' + name)
    target = root / p
    if any(part.is_symlink() for part in [target, *target.parents] if part != root.parent):
        raise ValueError('Symlink forbidden: ' + name)
    if not target.is_file():
        raise ValueError('Incomplete source: ' + name)
    return target.read_bytes()

def dynamic_brief(path):
    return re.fullmatch(r'ai-briefs/AI_Brief_\d{4}-\d{2}-\d{2}\.html', path) is not None

def build(source, output, tracked=None):
    source, output = pathlib.Path(source).resolve(), pathlib.Path(output).resolve()
    if output.exists() or source == output or output in source.parents or source in output.parents:
        raise ValueError('Use a fresh output directory outside the source checkout')
    policy = json.loads(read_file(source, POLICY_PATH))
    tracked = tracked_files(source) if tracked is None else set(tracked)
    expected = set(policy['sourceFiles']) | BUILD_FILES
    missing = expected - tracked
    unknown = {p for p in tracked - expected if not dynamic_brief(p)}
    if missing or unknown:
        raise ValueError('Unreviewed/incomplete tracked tree: missing=' + repr(sorted(missing)) + ' unknown=' + repr(sorted(unknown)))
    # Read every tracked file first: a partial snapshot cannot create an artifact.
    inputs = {p: read_file(source, p) for p in sorted(tracked)}
    for p, expected_blob in policy.get('opaqueGitBlobs', {}).items():
        raw = inputs[p]
        actual_blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
        if actual_blob != expected_blob:
            raise ValueError('Opaque file changed; content review required: ' + p)
    excluded = set(policy['excludedPilotFiles'])
    public = set(policy['publicFiles']) | {p for p in tracked if dynamic_brief(p)}
    if public & excluded or set(policy['pilotFiles']) - public:
        raise ValueError('Invalid publication policy')
    for p in public:
        if ('slow-down' in p and p not in policy['pilotFiles']):
            raise ValueError('Unexpected Pilot public path: ' + p)
    books = json.loads(inputs['library/data/books.json'])
    if [b['id'] for b in books] != ['slow-down', 'slow-shutter', 'structure', 'metabolism', 'renaissance']:
        raise ValueError('Book catalog changed; review release policy')
    pilot = books[0]
    if len(pilot['chapters']) != 22 or len(pilot['toc']) != 22 or pilot['commerce']['sampleChapter'] != 'chapter-01':
        raise ValueError('Pilot structure changed')
    if { 'library/' + c['file'] for c in pilot['chapters']} != ({SAMPLE} | {p for p in excluded if p.startswith('library/data/chapters/slow-down-full/')}):
        raise ValueError('Pilot chapter policy differs from catalog')
    chapter = json.loads(inputs[SAMPLE])
    sample_assets = set()
    for block in chapter['blocks']:
        if block['type'] == 'image':
            sample_assets.update('library/' + block[k] for k in ('src', 'fullSrc'))
    if sample_assets != set(policy['pilotFiles']) - {SAMPLE, 'library/assets/covers/slow-down.jpg'}:
        raise ValueError('Sample image policy changed')
    # Detect copies under innocuous aliases, including escaped JSON and HTML.
    # Use long body paragraphs, not headings/TOC text intentionally public.
    fingerprints = set()
    for p in excluded:
        if p.endswith('.json'):
            for block in json.loads(inputs[p]).get('blocks', []):
                text = block.get('text', '')
                if block.get('type') == 'paragraph' and len(text) >= 80:
                    fingerprints.add(text[:80])
    sample_text = inputs[SAMPLE].decode('utf-8')
    fingerprints = {t for t in fingerprints if t not in sample_text}
    for p in sorted(public):
        raw = inputs[p]
        try:
            text = raw.decode('utf-8')
        except UnicodeDecodeError:
            continue
        if p.endswith('.json'):
            text = json.dumps(json.loads(text), ensure_ascii=False)
        if any(t in text for t in fingerprints):
            raise ValueError('Excluded Pilot body content found in public file: ' + p)
    worker = inputs['library/sw.js'].decode('utf-8')
    shell = re.search(r"const SHELL_FILES=\[(.*?)\];", worker, re.S)
    if not shell:
        raise ValueError('Service worker shell declaration changed')
    for entry in re.findall(r"'([^']+)'", shell.group(1)):
        path = entry.split('?')[0]
        path = 'library/index.html' if path == './' else 'library/' + path
        if path not in public:
            raise ValueError('Service worker shell file omitted: ' + path)
    preserved = {}
    for book in books[1:]:
        refs = {'library/' + book['cover']} if book.get('cover') else set()
        for entry in book.get('chapters', []):
            p = 'library/' + entry['file'].split('?')[0]
            refs.add(p)
            data = json.loads(inputs[p])
            for block in data.get('blocks', []):
                if block.get('type') == 'image':
                    refs.update('library/' + block[k] for k in ('src', 'fullSrc') if block.get(k))
        if refs - public:
            raise ValueError('Other book content omitted: ' + repr(sorted(refs - public)))
        preserved[book['id']] = {'chapterCount': len(book.get('chapters', [])), 'metadataSha256': sha(json.dumps(book, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()), 'files': {p: sha(inputs[p]) for p in sorted(refs)}}
    output.mkdir(parents=True)
    for p in sorted(public):
        target = output / p
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(inputs[p])
    try:
        commit = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], stderr=subprocess.DEVNULL).decode().strip()
    except subprocess.CalledProcessError:
        commit = 'fixture'
    manifest = {'version': 1, 'sourceCommit': commit, 'sourceFiles': len(tracked),
                'publicFiles': {p: sha(inputs[p]) for p in sorted(public)},
                'excludedPilotFiles': sorted(excluded), 'pilotFiles': policy['pilotFiles'],
                'preservedBooks': preserved, 'pilotTocEntries': 22,
                'limitation': 'Public repository, Git history, and previously saved copies remain accessible.'}
    # Independent output walk and digest validation, before adding the manifest.
    actual = {p.relative_to(output).as_posix(): sha(p.read_bytes()) for p in output.rglob('*') if p.is_file()}
    if actual != manifest['publicFiles']:
        raise ValueError('Artifact differs from verified source selection')
    (output / 'publication-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    return manifest

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=pathlib.Path, default=pathlib.Path('.'))
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    result = build(args.source, args.output)
    print(json.dumps({'sourceCommit': result['sourceCommit'], 'publicFiles': len(result['publicFiles']), 'excludedPilotFiles': len(result['excludedPilotFiles']), 'preservedBooks': {k: {'chapterCount': v['chapterCount'], 'fileCount': len(v['files'])} for k, v in result['preservedBooks'].items()}}, indent=2))
