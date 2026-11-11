# Learning log

## 2026-11-11 · tidy: the Play tests on a synthetic route

- **A test's data must be ours to publish, just like its code.** The removed suites were our own
  code, but they ran on points recorded on a photo we have no license for. So the code came back
  and the data didn't: a route of 7 holds on the synthetic wall the repo already paints, with the
  other 33 holds as footholds. It is like rehearsing a play on a bare stage with taped marks: the
  blocking is the same, nobody needs the theatre's permission.
- **Copy the shape, re-record the numbers.** The synthetic route mirrors the old one's structure
  (1S…7F, one start, a deadpoint from 3 to 4, the same failing betas), so most suites came back
  by swapping a fixture. Every number tied to the old geometry (a height, a foothold, a move count)
  was re-read from the referee on the new route, never edited to make a test pass. The trade-off:
  a few checks need a real wall mask and stay out, named in the suite and in follow-up 23.
- **A clean fixture can make a test pass for the wrong reason.** Fresh reviews found eight tests
  that still passed but no longer tested their titles: a smear test that only reached its fall
  branch, hover points left from the old photo, a carry check with nothing before the drop, and an
  out-of-wall part that compared 0 with 0 because every synthetic pull lies flat in the wall. The
  fix each time was to pin the branch or add an input with the missing feature (an invented pull
  with a z part), and, where a loop ran, to assert that it saw each kind of case.

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
