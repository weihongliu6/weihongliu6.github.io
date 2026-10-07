#!/usr/bin/env python3
"""Origin HTTP verification: no browser, service worker, cache, or credentials."""
import argparse
import hashlib
import json
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

def get(base, path):
    request = urllib.request.Request(base.rstrip('/') + '/' + urllib.parse.quote(path) + '?publication-check=' + str(time.time_ns()), headers={'Cache-Control': 'no-cache'})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()

def check(base, commit):
    status, body = get(base, 'publication-manifest.json')
    if status != 200:
        raise ValueError('Manifest HTTP ' + str(status))
    manifest = json.loads(body)
    if manifest['sourceCommit'] != commit:
        raise ValueError('Origin is still serving another commit')
    for path in manifest['excludedPilotFiles']:
        status, _ = get(base, path)
        if status not in (404, 410):
            raise ValueError('Excluded Pilot path still reachable: ' + path + ' HTTP ' + str(status))
    # Check every other book chapter/asset and every allowed Pilot file from origin.
    paths = set(manifest['pilotFiles']) | {'library/index.html', 'library/sw.js', 'library-update.html', 'library/data/books.json'}
    for book in manifest['preservedBooks'].values():
        paths.update(book['files'])
    for path in sorted(paths):
        status, body = get(base, path)
        if status != 200 or hashlib.sha256(body).hexdigest() != manifest['publicFiles'][path]:
            raise ValueError('Origin hash mismatch: ' + path + ' HTTP ' + str(status))
    print(json.dumps({'sourceCommit': commit, 'excludedOriginPathsVerified': len(manifest['excludedPilotFiles']), 'exactOriginFilesVerified': len(paths), 'serviceWorkerUsed': False}, indent=2))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', required=True)
    parser.add_argument('--commit', default=None)
    parser.add_argument('--timeout', type=int, default=600)
    args = parser.parse_args()
    commit = args.commit or subprocess.check_output(['git', 'rev-parse', 'HEAD']).decode().strip()
    deadline = time.monotonic() + args.timeout
    while True:
        try:
            check(args.url, commit)
            break
        except (ValueError, OSError) as error:
            if time.monotonic() >= deadline:
                raise
            print(str(error) + '; waiting for origin propagation', flush=True)
            time.sleep(20)
