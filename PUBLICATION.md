# Public sample release

The current tracked Pilot source is sample-only. The 72 retired Slow Down paths
are absent from the current tree; the private canonical master and private
reader are managed separately. The Pages workflow runs reader regressions,
validates the reviewed policy, and uploads only a freshly generated artifact.

For Slow Down, chapter 1, metadata, the complete title-only table of contents,
cover, and chapter 1's two reading/two large images remain public. Slow Shutter now retains only chapter 1 and its cover as public payloads; all
nine table-of-contents entries remain. The three remaining books retain every
catalog entry, chapter, linked image and cover. The purchase
preview links to the existing authorized private reader; purchasing is not enabled.
Source/output SHA256 hashes are recorded in `/publication-manifest.json`.

## Setup and commands

Settings > Pages > Build and deployment > Source must be **GitHub Actions**.
The workflow fails if branch publishing is selected. It uses only the built-in
short-lived workflow token; no new credentials or backend configuration is needed.

Run from a clean current checkout:

    node --test scripts/*.test.cjs scripts/*.test.mjs
    python -m unittest discover -s scripts -p test_public_site.py -v
    python scripts/build_public_site.py --source . --output /tmp/new-public-site

The output must be fresh and outside the checkout. Missing tracked files,
unreviewed paths, retired Pilot paths, changed opaque public files, unknown Pilot
references, protected paragraph fingerprints, or loss of another book's content
stop publication. One-way SHA256 fingerprints support checks without requiring
private chapters in Git or test fixtures. These checks detect reviewed known
copies; they are not a general guarantee against transformed or novel leaks.
Date-named daily briefs are permitted and content-scanned. New legitimate site
paths require policy review. The AI brief workflow triggers a fresh build through
workflow_run because GITHUB_TOKEN pushes do not trigger ordinary push workflows.

## Cache migration and limits

The updated library worker removes only locked Pilot request entries from reviewed
library caches, invalidating affected completion markers first. It retains allowed
sample bytes, other-book downloads, historical module graphs, shelves and reading
progress. An affected partial sample can be downloaded again. The update page
states this targeted cleanup. Open documents are not forcibly reloaded.

Cleanup starts when the new worker activates online and retries on subsequent
library fetches and startup messages. Interrupted sweeps are safe to retry. Devices that remain offline
or on an old worker are not remotely erased. Already loaded responses, an old tab
writing a previously fetched response until the next sweep, browser HTTP caches,
exports and external copies are outside this cleanup guarantee.

The public repository history remains accessible, including previously committed
full content. Removing current paths does not erase old commits, forks or saved
copies. Commercial readiness is therefore not established by this migration.
History remediation requires a separate decision and authorization.

## Recovery

A failed build does not replace the deployed site. Keep Pages on Actions. Prefer
a reviewed forward correction that preserves the sample-only tree and protected
content exclusions. Do not restore the old full-content tree or branch publishing
as a rollback. Backend storage, authorization, private APIs and session architecture
are unchanged. Private-reader sessions remain memory-only and refresh requires
login under the existing architecture.


## Slow Shutter review — 2026-10-09

Change: second book `slow-shutter` uses first-chapter-only preview across the
catalogue, reader, narration, saved-progress destinations and offline download.
Chapter 1 is byte-identical to base commit
`9de79bb1b8004ccbc0984bfa15655ac4c117da5a`. Its canonical export has no image
blocks: the nine photographs belong to front matter and later chapters, so none
are added to the sample. Cover, introduction, abstract and all nine TOC entries
remain. Price is null, purchase is preview-only, with no orders or entitlements.
The first-book private-reader entry remains first-book-only. Production Owner
reader, backend grants, TLS/Auth, staging, Resend and payments are untouched.

Backup: `Slow_Shutter_Original_Backup_20261009.zip` contains all 28 original
chapter/asset files plus per-file SHA256 and restore instructions, separately
saved before removals. ZIP integrity and all 28 digests were verified. Recovery
means extracting into a private workspace and verifying SHA256.json; it does not
mean copying full content back into this public tree. No original was destroyed
without a recoverable backup.

Current-source protection: 8 non-sample JSON files and 18 photo variants are
removed, not hidden. Deployment allowlist excludes all 26 paths. Protected
paragraph fingerprints are added to whole-tracked-tree scans; opaque approved
assets stay pinned. Build checks both pilot catalogues and sample images. SW
rejects locked second-book paths before cache/network/download paths, and
invalidates legacy completion markers before targeted byte removal. First-book
sample accessVersion stays unchanged. No bookshelf or progress keys are erased.

Local validation: 63 Node tests passed (including second-book TOC, direct URL,
section/resume/listen bypass, metadata search, progress preservation, download,
legacy/late JSON and image cache removal, first-book and Owner-reader
regressions). 17 Python build tests passed. The minimized artifact contains 543
public paths and excludes 98 protected paths across the two sample books. All
three other books retain their content digests. Local browser launch was blocked
by absent Chromium/WebKit binaries; browser download returned invalid ZIPs.
`Sample preview acceptance` on this PR must pass desktop Chromium and iPhone
WebKit, including direct raw HTTP 404 for all 26 removed second-book paths,
full sample text, responsive layout, title search, no locked narration route,
sample-only offline download, late-cache cleanup and first-book regression.
WebKit device emulation is not a physical iPhone Safari test. Screenshots are
saved in that workflow's evidence artifact. Merge/release remains HOLD until
those browser checks pass and the owner explicitly approves.

History audit: full second-book assets entered public history in `b3a24af`; the
chapter-five label changed in `c8431d6`. Old commit/raw URLs, PR deletion diffs,
forks, clones, archived deployments, CDN/HTTP caches, screenshots, exports and
previously saved/offline devices cannot be revoked by ordinary current-tree
removal. The new worker can clean reviewed CacheStorage only when a device runs
it online; it cannot remotely erase offline devices or already loaded DOM/audio.
No history rewrite or third-party removal request is included. This is current
publication minimization, not confidentiality of the previously public master.

Rollback: before merge, close this PR; production is unchanged. After approved
release, use a reviewed forward fix that keeps the 26 second-book removals,
publication exclusions and SW deny rules. Never revert wholesale to the base
full-book deployment. UI changes may be corrected separately while retaining
sample-only commerce guards. A failed build must leave the previous release in
place; origin verification after deployment checks all excluded URLs without SW.
Extract the separately saved archive for private recovery only. No backend or
production permissions changes are needed.
