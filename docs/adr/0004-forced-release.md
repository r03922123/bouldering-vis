# ADR-0004: The release was cut by hand, without the allowlist tool

## Status

Accepted (2026-11-11).

## Date

2026-11-11

## Context

ADR-0003 (b) planned the public repo as one commit made by an export tool: it copies only the
paths an allowlist names, scans every file, and writes nothing if a check fails. On 2026-11-11
the tool was unfinished and had no allowlist, and the private repo's CI minutes were at 90% of
the month's quota. The owner chose to release that day.

The earlier sample photo was still in the private tree (as the E2E test photo) and in its
history. Pull-request refs keep old commits on GitHub even after a history rewrite, so making
that repo public would have published the photo whatever was deleted first.

## Decision

- **A new repo, one commit, made by hand.** The tree of the private repo's last reviewed commit
  was copied, then these were removed: the earlier sample photo and every file recorded on it
  (levels, betas, wall blobs, foot-band blobs), the private working folders, the private
  decision records and learning log, the scripts that fetched the photo's source site, the
  export tool itself, and the 32 test files that read the removed data.
- **Checks run on that tree before anything was public:** both type-checks, lint, the build,
  1437 unit tests, a scan for emails, home-folder paths, tokens and keys, and a photo-metadata
  scan. The repo was then pushed while private, its tree checked for the photo's blob, and only
  then made public. CI passed on the first public commit.
- **Added at the release:** `LICENSE` (Apache-2.0) and `NOTICE`, as ADR-0003 (a) requires.
- **Everything else in ADR-0003 still binds this repo.**

## Alternatives Considered

### Make the private repo public after a history rewrite

- Rejected: pull-request refs keep the old commits, so the photo would stay reachable.

### Finish the export tool first

- Rejected by the owner: it was several PRs away, and the release was wanted the same day.

## Consequences

- A denylist made this tree, not an allowlist, so a private file the removal missed could have
  shipped. The scans above found none, but they had no list of personal strings to look for.
- The removed tests leave no public check on the referee over a recorded level or on the Play
  E2E flows until they return on the synthetic route (follow-up 23 in `docs/ARCHITECTURE.md`).
- Old names and links to files this repo lacks remain in SPECs, docs and comments
  (follow-up 24).
