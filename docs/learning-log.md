# Learning log

## 2026-11-11 · tidy: neutral names and dead links

- **Old names describe what we removed, so they stay out of public text.** The earlier sample
  photo and its route came from a source that grants no license, and some names carried
  personal details; publishing can't be undone. As links they also lead nowhere here. It is
  like a museum label citing a catalogue number from another museum's closed archive. The fix
  swaps each name for words that stand alone ("the earlier sample route"), and the SPECs that
  keep old results get a history note, so the numbers stay without the names.
- **Change words, not behavior, and make a test prove it.** The plan for this work said tests
  and goldens stay as they are. One test needed an exception: the hub drawing seeds each bay's
  holds from its sample id, so renaming the test's ids redraws 4 goldens. That went in a PR
  apart from the wording, with a check that only the two bay walls' pixels moved, so the golden
  diff can't hide anything else.
- **Two sessions on the same files: take turns.** Another session was rewriting the same
  climber-stance test lines (follow-up 23). Editing them too would have made two conflicting
  versions of one sentence. Waiting for its PR to merge, then renaming the two lines it left,
  cost a short wait and no merge conflict.

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
