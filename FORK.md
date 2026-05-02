# Fork notes

This repository is a fork.

- **Fork (origin):** https://github.com/mingdaoai/opencode — pushable, holds local
  patches and feature branches.
- **Upstream (canonical):** https://github.com/anomalyco/opencode — the
  authoritative repository. Originally hosted at `sst/opencode`; the org was
  renamed/transferred to `anomalyco`. The old `sst/opencode` URL still resolves
  via GitHub's rename redirect, but the canonical location is `anomalyco`.

The default branch in this project is `dev` (not `main`).

## Remotes

```
origin    https://github.com/mingdaoai/opencode      (your fork)
upstream  https://github.com/anomalyco/opencode      (canonical)
```

If `git remote -v` doesn't match, fix it:

```sh
git remote set-url origin   https://github.com/mingdaoai/opencode
git remote set-url upstream https://github.com/anomalyco/opencode
```

## Pulling changes from upstream

Bring `upstream/dev` into your local `dev`:

```sh
git fetch upstream
git checkout dev
git merge upstream/dev          # or: git rebase upstream/dev
```

Then mirror the result to your fork's `dev` so it stays in sync:

```sh
git push origin dev
```

If your fork's `dev` has diverged from local `dev` (e.g. it was created from a
snapshot of upstream and never updated), reset it to match upstream rather than
force-pushing local work over it:

```sh
git fetch upstream
git push origin upstream/dev:dev    # fast-forwards origin/dev to upstream/dev
```

## Local patches

Some commits on local `dev` are not in upstream and are kept intentionally —
e.g. the model-loading fix `f48e97353 fix(tui): defer --model arg application
until providers load`. Preserve these when merging or rebasing from upstream.

## Working on changes

Do feature work on a branch off `dev`, push to `origin`, and (when ready) open a
PR against `anomalyco/opencode` if you want it merged upstream:

```sh
git checkout -b fix/my-change dev
# ...edit, commit...
git push -u origin fix/my-change
gh pr create --repo anomalyco/opencode --base dev
```

Never push to `upstream` — you don't have rights there, and the workflow above
doesn't need it.
