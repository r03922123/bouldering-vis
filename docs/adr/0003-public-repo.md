# ADR-0003: The public repo: one exported commit, and the decisions that still bind it

## Status

Accepted (2026-11-06).

## Date

2026-11-06

## Context

Bouldering Vis goes public as a new repo, built from one exported commit of its private
development repo. Two earlier decisions, ADR-0001 and ADR-0002, set out how. Both stay with the
private history:

- They name the content the release removed, and personal details. Publishing can't be undone,
  and an accepted ADR is not edited, so neither can be cleaned up and shipped.
- The earlier sample photos, and the data recorded on them, came from a source that grants no
  license. The samples now are the owner's own photos.
- Some tests ran on data recorded on the earlier sample photo. That data stays private, and the
  private repo is archived after the release, so a test left there would run nowhere.

This ADR restates, in neutral words, the decisions that still bind the public repo. (e), (h) and
(j) are new, and so are parts of (b) and (f).

## Decision

- **(a) License.** Apache-2.0, plus a NOTICE that credits the datasets behind
  `src/data/clip-probe.json` and keeps protobuf.js's notice, since the browser build bundles it.
- **(b) One exported commit.** The public repo starts with one initial commit, authored with the
  GitHub noreply address. The export copies only what an allowlist of exact paths and narrow globs
  names; a file it doesn't list stays private. The export tool, the allowlist and its profile stay
  private too.
- **(c) Own photos and videos, no metadata.** Every photo and video the public repo ships, now or
  later, is the owner's own, with all EXIF, XMP and IPTC metadata removed. This includes the Learn
  photos and Wall 1's later content in (f). The synthetic test images that
  `scripts/make-synthetic-fixtures.ts` renders are not photos in this sense:
  `tests/fixtures/wall-exif6.jpg` keeps its one EXIF Orientation tag, because a test reads it.
- **(d) Never ships:** the earlier sample photos or any data recorded on them; the private
  held-out set, which the hold-data scripts skip cleanly when its files are absent; the Kaggle
  indoor hold set (CC BY-SA 4.0) or anything trained on it. libvips is never bundled or vendored.
- **(e) Tests move to a synthetic route.** Tests that ran on data recorded on the earlier photo
  move to a synthetic route on the committed synthetic wall (`tests/fixtures/wall-landscape.*`),
  or to invented points where a test needs only a pose or a few contact points, so they ship and
  run in public CI. The few checks that need real data come back once Wall 1's level is recorded
  on the owner's photo.
- **(f) Wall 1's level and the Learn photos can come later.** Both may land after the release, in
  the public repo. Until then Wall 1 opens in Tag (`LEVELS` in `src/app/playWall.ts`) and Learn
  shows no photos, as ADR-0001 already allowed.
- **(g) Neutral words.** Public docs say "the earlier sample wall" or "the earlier sample photo"
  for the content the release removed, and call the held-out set "a private held-out set from an
  unseen gym". A private tool is named by what it does plus "(private)", never by its path. No
  public file links into the private working folders.
- **(h) Two pages move to `scripts/`.** The level recorder and the hold-embedding page leave the
  private working folder, because public tools need them: `scripts/hold-data/embed.mjs` drives the
  hold-embedding page, and the level recorder is how Wall 1's level gets recorded. This narrows
  the earlier rule that everything in that folder stays private.
- **(i) Protected main.** After the release, main is protected: every change is a PR that passes
  the required checks.
- **(j) The private record stays private.** ADR-0001, ADR-0002 and the learning log stay with the
  private history. The public repo starts its own learning log at the release.

## Alternatives Considered

### Ship ADR-0001 and ADR-0002 as they are

- Pros: one record, nothing restated.
- Cons: they name the removed source and personal details.
- Rejected: publishing can't be undone.

### Edit them in place, then ship them

- Pros: the numbering and the cross-links stay.
- Cons: the record would no longer show what was accepted, and when.
- Rejected: accepted ADRs aren't edited.

### Re-pin the tests on Wall 1's recorded level before the release

- Pros: the tests keep real geometry.
- Cons: the release would wait on a real-model recording session.
- Rejected: the synthetic route needs no recording, and it keeps the 1536 × 1152 frame the tests
  use.

### Export without those tests

- Pros: no test changes before the release.
- Cons: after the archive, a test that stays private runs nowhere.
- Rejected: the checks would be lost for good.

## Consequences

- Public ADR numbers start at 0003, and this ADR says why. Public docs point here, not to
  ADR-0001 or ADR-0002.
- Until Wall 1's level is recorded, public CI has no real-data regression check of the referee.
  The synthetic route holds the cases the tests pin, so a referee change that only shows on real
  geometry could pass until then.
- The learning log's old entries stay private. Context lives in the SPECs, this ADR and `docs/`,
  not in commit messages or PR threads.
- Until the release, a PR that adds, renames or deletes a shipped file also updates the private
  allowlist. A file that is missed breaks the exported build, and that build is checked before
  anything is public.
