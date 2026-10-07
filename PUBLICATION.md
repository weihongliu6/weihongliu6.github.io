# Public sample release

The current tracked Pilot source is sample-only. The 72 retired Slow Down paths
are absent from the current tree; the private canonical master and private
reader are managed separately. The Pages workflow runs reader regressions,
validates the reviewed policy, and uploads only a freshly generated artifact.

For Slow Down, chapter 1, metadata, the complete title-only table of contents,
cover, and chapter 1's two reading/two large images remain public. The other four
books retain every catalog entry, chapter, linked image and cover. The purchase
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
