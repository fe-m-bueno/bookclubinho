# Domain context

The bookclubinho glossary. Every term is defined as the code uses it — when a
name here and a name in the code disagree, one of the two is wrong and worth
fixing.

Created on demand: entries appear when a term genuinely needs to be resolved,
not as an up-front inventory. Decisions worth not re-litigating go into
`docs/adr/`.

---

## Membership

The fact that a user belongs to a **Group**, and with which **role** (`admin` or
`member`). It is the app's most frequent authorization question: practically
every club route starts by answering it.

Membership has three properties the code treats as inseparable:

1. **A `GroupMember` row exists** linking the user and the club.
2. **The club is active** (`Group.is_active`). A soft-deleted club has no
   members for access purposes, even though the `GroupMember` rows remain in the
   table — `soft_delete_group` only flips the flag.
3. **The role satisfies what the operation requires**, when it requires
   anything.

Not belonging and the club not existing are **indistinguishable from the
outside**: both return 404, never 403, so the response never reveals that the
club exists. The 403 only appears once membership has been established and the
role is insufficient — at that point there is nothing left to hide.

`app/services/membership.py` is the only place that answers the question.
`app/core/deps.py` exposes it as a FastAPI dependency for routes with `group_id`
in the path; the services call `resolve` directly. Both are adapters over the
same seam.

**Don't confuse it with:**

- **being in the club** in the counting sense — the 8-member limit looks at
  `len(group.members)`, without going through membership.
- **authorship** — being a message's author is a different thing. Both are
  required: editing a message needs membership *and* authorship.

See: [[Group]], [[GroupMember]] in the domain model in `CLAUDE.md`.

---

## Finishing the book

A reader has finished the book when a **ReadingProgress** snapshot exists with
`progress_type = "finished"` for them in that round. It is a per-reader fact,
not a per-round one — everyone finishes at their own pace.

There are **two paths** to this happening, and both count equally:

1. recording progress at 100% (via the timer or the page form);
2. **submitting the review** — sending a review is, in itself, saying you
   finished.

Finishing has consequences, and they are inseparable from the fact: the day's
streak goes up, the SSE events go out to the club, and the `book_finished`
badges (`first_blood`, `speed_reader`, `bookworm`, `variety`) are re-evaluated.
That is why nobody writes `ReadingProgress` by hand — both paths go through
`app/services/reading_progress.py`, which owns both the fact and its
consequences.

**Don't confuse it with closing the round.** Closing is an admin action, moves
the **Round**'s status to `finished`, and requires at least one review to exist.
A reader can have finished the book in a round that is still open; and a round
can be closed with members who never finished.

See: [[Round]], [[ReadingProgress]] in the domain model in `CLAUDE.md`.
