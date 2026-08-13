# Product & Goals — The Product Vision

## What is bookclub?

Bookclub is a social book club web app, built for small groups of friends who like reading together, discussing books, and turning reading into a shared ritual.

It is not a public review platform like Goodreads. It is not a solo reading app. It is a closed space for a specific group of people who care what each other is reading, and want to talk about it.

---

## The problem we solve

Book clubs have existed for decades, but their digital experience is still a mess. Groups use an unstructured WhatsApp group, a spreadsheet to record who read what, a Google Form for voting, a Zoom call to get everyone together.

It is a collage of tools nobody built to work together. The result: rituals that should be fun become friction. Bookclub solves that in one place.

---

## Product vision

An app with the personality of a group of reader friends and the fluidity of a modern messaging app.

The chat's aesthetic and functional reference is iMessage: bubbles, message grouping, emoji reactions, typing indicators. The gamification reference is Spotify Wrapped and Duolingo: streaks, badges, dramatic reveals, collective celebration.

The palette is warm and welcoming. `#F8DFBF` (warm sand) in light mode, `#30261D` (deep brown) in dark mode. Not another soulless white and gray app.

---

## Who uses it

Primary user: groups of 3 to 8 adult friends who already have an informal book club, or wanted one but gave up over the logistical friction.

Profile: readers who use modern social apps, are comfortable with technology, but also don't want to configure anything. They want to open it, see the round's book, record that they read 40 pages today, and send a message in the chat. In under 30 seconds.

---

## Main features

### Rounds and book voting
Each cycle of the club is a round. Members nominate books with an optional 280-character pitch, vote with one vote each, and the app reveals the result with a dramatic animation. In a tie, fate decides, and the app says so with personality. Book search uses the Hardcover API (GraphQL) for rich metadata, covers, authors, page counts.

### iMessage-style chat
A rich chat inside each group, with support for formatted text via Tiptap, images, GIFs, X/Twitter embeds, chapter and page markers that also record progress, quotes with a page reference that go to the Hall of Quotes, spoilers that blur based on the reader's progress, emoji reactions, and typing indicators. Realtime via SSE (Server-Sent Events) over Redis Streams.

### Progress tracking and streaks
Users record progress by page, chapter, or percentage. The app computes global daily streaks and resets them after a day without reading. Milestones at 7, 14, 30, 60, and 100 days unlock badges and celebrations. A floating reading timer records active sessions with a visible stopwatch that survives page navigation.

### Reviews with personality
When they finish a book, a member fills in a review in 6 steps: a 0-to-5-star rating, fun binary questions (did you cry? were you turned on? did you find it heavy?), an honest review, and a funny one-liner. Reviews stay locked until you submit yours, so they don't color the opinion of anyone who hasn't finished.

### Full gamification
14 badges with varied conditions: speed reader, crybaby, hot take, night owl, founder, and others. A Hall of Quotes with voting on the group's best lines in a Pinterest-style layout. A per-group leaderboard covering books read, average rating, streak, and reading time. Aggregate stats: genres, rating distribution, "63% of the group cried."

### Annual wrapped
An Instagram Stories and Spotify Wrapped-style experience: animated slides with the group's highlights of the year. Each slide is shareable as an image. Generated on demand, regenerable.

### Meetings
Scheduling for in-person, virtual, or hybrid meetings, with RSVPs (Going / Maybe / Not going), Google Calendar integration via a pre-filled link, and .ics export for any calendar app.

### Email notifications
Transactional, via Resend: magic link, meeting reminders 24h and 1h ahead, a nearly-finished alert when someone passes 80%, a post digest, a badge earned, a wrapped ready. All configurable per user preference.

---

## What the product is NOT

- Not a public social network. No feeds, no followers, no discovering strangers' groups.
- Not a solo reading app. No personal library or wishlist.
- Not a Goodreads clone. No public reviews or ratings for external display.
- Not for large groups. An 8-member limit by design, to preserve intimacy.

---

## Product goals

### Goal 1 — Reduce the friction of keeping a club active
**Metric:** % of groups that complete at least 3 rounds in their first 6 months.

The biggest problem with book clubs is attrition. The vote disappears into WhatsApp, nobody remembers who is on which page, the meeting never gets scheduled. Bookclub makes those rituals natural and automatic: the round is visible, progress is public within the group, the meeting has a reminder.

### Goal 2 — Create a sense of belonging and collective identity
**Metric:** % of members who return to the app at least 3x a week during an active round.

The annual wrapped, the badges, the hall of quotes, the group stats: they are all mechanisms for the group to feel it has a shared history. "Our group read 14 books in 2024 and 71% cried at the third one" is an identity.

### Goal 3 — Make the review the most fun moment of the cycle
**Metric:** % of members who submit a review after finishing the book. Target: over 85%.

Reviews on traditional platforms are work. On Bookclub, it's a mini-ceremony: funny questions, a one-liner to rib the group, a collective reveal. The format has enough personality to encourage participation even from people who don't like writing.

### Goal 4 — Keep streaks a habit, not an anxiety
**Metric:** average streak among active members. % of users with a streak longer than 7 days.

Streaks exist to create consistency, not guilt. The design is intentional: the app never sends a "your streak is about to break" notification, it only celebrates when you record something. Streak broken? Start over at 1, no drama.

### Goal 5 — Zero friction in setup
**Metric:** average time from signup to the first message sent in a group's chat.

Onboarding in 3 steps: profile, genres, join or create a group. Magic link so there's no password to remember. An 8-character invite code with a QR code. Nobody should need a tutorial to get started.
