# Learning log

## 2026-11-11 · tidy: the public release

- **Publishing can't be undone, so the cut happens before the push.** Deleting a file from a
  repo's history is like tearing a page out of a book that has already been photocopied: every
  pull request keeps its own copy. So the release started a new repo from one clean commit
  instead of cleaning the old one.
- **Check where it is still reversible.** The new repo was pushed while private and its tree
  checked for the photo; only then did it go public. The order costs a few minutes and turns
  the one irreversible step into the last one.
- **A denylist is weaker than an allowlist.** Removing what we knew was private (a denylist)
  was fast, but anything we didn't think of would ship. The planned tool lists what may ship
  instead. ADR-0004 records the trade-off, and the scans that stood in for the allowlist.
