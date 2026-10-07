# Public sample release

The complete source remains on `main`. The Pages workflow checks out the whole
repository, runs the existing reader regression suite, validates a reviewed file
policy, and uploads only its freshly generated artifact. It never edits or removes
source chapters. The existing reader, listening, offline/progress behavior, service
worker and `/library-update.html` are copied unchanged.

For Slow Down, only chapter 1, metadata and the complete table of contents, cover,
and chapter 1's two reading/two large images are published. The other four books
retain every catalog entry, chapter, linked image and cover. Source/output SHA256
hashes are recorded in `/publication-manifest.json`. The deployment job verifies
all excluded paths return 404/410 from HTTP without a service worker, and verifies
all other-book referenced content and the allowed sample files against the manifest.

## Setup and commands

GitHub repository Settings > Pages > Build and deployment > Source must be
**GitHub Actions**. The workflow fails if branch publishing remains selected.
Do not select branch publishing again: that would republish the full source.
The workflow uses only the built-in short-lived token: contents read for checkout,
Pages read for the source check, Pages write and OIDC for the deploy job.
No saved credentials, personal tokens or backend accounts are needed.

Run from a full checkout:

    python -m unittest discover -s scripts -p test_public_site.py -v
    python scripts/build_public_site.py --source . --output /tmp/new-public-site

The output must be fresh and outside the checkout. Missing tracked files, new
unreviewed paths, changed opaque/binary public files, unknown Pilot references,
excluded-body copies, or loss of another book's referenced files stop publication.
New date-named daily brief files are permitted and are still content-scanned.
When adding other legitimate site files, review and update the explicit policy.
The scheduled AI brief job triggers a fresh build through workflow_run because
pushes using GITHUB_TOKEN do not trigger ordinary push workflows.

## Limits and recovery

This is publication minimization, not paid-content security. The repository and
Git history remain public, so full source is still obtainable there. Previously
saved files and old offline book caches are not deleted. The existing update and
recovery flow remains intact. A failed build does not replace the deployed site.
Do not restore branch publishing as a rollback; use a reviewed sample-only artifact.
