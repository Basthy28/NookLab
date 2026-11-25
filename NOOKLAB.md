# NookLab Fork Guide

NookLab is maintained as a clean, atomic patch stack on branch `nooklab`, rebased directly on top of `streetwriters/notesnook` (`upstream/master`).

## Patch Stack (`upstream/master..nooklab`)

1. `misc: rebrand fork, URLs, manifests, and red icons to NookLab`
2. `web: add ColorNote-style colored grid view`
3. `web: add expanded second editor toolbar row`
4. `web: force Numpad digit entry when NumLock is off`
5. `web: add bilingual PT-PT and EN autocorrect engine`
6. `web: add 1-page bottom-up service sheet Word copy and A4 print tool`
7. `ci: add automated upstream sync and conflict alert workflow`
8. `mobile: rebrand NookLab Android app, red theme, and self-hosted hosts`
9. `mobile: add ColorNote-style 2-column grid view`
10. `editor: add mobile NookLab toolbar row, autocorrect, and Service Sheet copy`
11. `ci: add signed NookLab Android APK release workflow`

## Automated Upstream Sync, VPS Deploy & Conflict Alerts

`.github/workflows/nooklab-upstream-sync.yml` runs daily at `05:00 UTC`, on code pushes to `nooklab`, and manually via `workflow_dispatch`:

- Fetches `https://github.com/streetwriters/notesnook.git` (`master`).
- On scheduled/manual runs when new upstream commits exist, rebases `nooklab` onto `upstream/master`.
- Runs the NookLab Vitest suite (`cd apps/web && npx vitest run nooklab-`) and `npm run build:web`.
- Exports numbered `.patch` files (`git format-patch`) as a workflow artifact (`nooklab-patches`).
- Only if rebase, tests, and build all succeed, force-pushes `nooklab` (`--force-with-lease`), fast-forwards `master`, automatically deploys `apps/web/build` to the VPS (`https://nooklab.duckdns.org` via `DEPLOY_HOST`/`DEPLOY_USER`/`DEPLOY_SSH_KEY` secrets), and closes any resolved `upstream-conflict` issue.
- If a rebase conflict, post-rebase test/build failure, push rejection, or VPS deploy error occurs, aborts any dirty rebase cleanly and opens (or updates) an `upstream-conflict` GitHub Issue with full details.

## Android APK Release Workflow

`.github/workflows/nooklab-android-build.yml` runs on mobile/editor-mobile pushes to `nooklab` and manually via `workflow_dispatch`:

- Builds `packages/editor-mobile` (`npm run tx mobile:build`), verifies TypeScript (`editor-mobile` + `apps/mobile`), and runs `vitest run nooklab-`.
- Compiles signed release APKs (`NookLab-arm64-v8a.apk` and `NookLab-universal.apk`) using `NOOKLAB_ANDROID_KEYSTORE_B64`, `NOOKLAB_ANDROID_KEY_ALIAS`, and `NOOKLAB_ANDROID_KEY_PASSWORD` secrets, verifies signatures with `apksigner`, and uploads them under the `nooklab-android-apks` artifact.

## Local Helper (`scripts/nooklab-sync.sh`)

```bash
# Check how many commits upstream is ahead and list all NookLab patches
bash scripts/nooklab-sync.sh status

# Export numbered .patch files into ./patches/ (gitignored)
bash scripts/nooklab-sync.sh patches

# Rebase nooklab onto upstream/master locally (creates a timestamped backup branch first)
bash scripts/nooklab-sync.sh sync

# Run NookLab tests + web build
bash scripts/nooklab-sync.sh verify
```
