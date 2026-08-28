# Sejuk Sejuk Service — Operations System

An internal operations tool for an air-conditioner service company: admin creates an order,
a technician completes it in the field, a manager reviews it, and a manager can ask questions
about the data in plain English.

- **Live demo:** _<https://sejuk-ops-one.vercel.app/>_
- **Repo:** _<https://github.com/tzk0809/sejuk-ops>_
- **Sign in:** no password. Pick a user on `/switch-role` — Aminah (admin), Kamal (manager),
  or Ali / John / Bala / Yusoff (technicians).

---

## What I built

| Module | Status |
|---|---|
| **1 — Admin portal**, order submission and assignment | ✅ |
| **2 — Technician portal**, mobile-first job completion with uploads | ✅ |
| **3 — WhatsApp notification** on job completion | ✅ |
| **AI — Operations query window** | ✅ |
| Bonus — KPI dashboard | ❌ not built |
| Optional advanced AI challenges | ❌ not built |

Plus, beyond the brief: a **database-enforced state machine** (orders move only through legal
transitions, applied by a Postgres trigger), a **full audit trail**, **deny-all RLS**, and
**36 seeded orders** driven through that real state machine so the demo data could not have
arisen any other way.

**Not built, deliberately:** there is no manager review UI. `reviewed` / `rejected` / `closed`
are reachable only via SQL. The state machine supports them and the seed exercises them; the
screens were cut for time. This is the largest gap in the submission and I would rather name it
than have it found.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.3.3, App Router |
| UI | React 19, Tailwind v4, shadcn/ui |
| Database | Supabase (Postgres) |
| Files | Supabase Storage, private bucket + signed URLs |
| Validation | zod v4, shared client and server |
| AI | Google Gemini (`@google/genai`) |
| Tests | `node:test` — no framework installed |
| Deploy | Vercel |

**Why Next.js over Vite:** the AI module needs an API key held server-side. A Vite build is
static files handed to the browser, so any call from it ships the key to the client. Next.js
server code and the UI are one project, one deploy, and `process.env` there never reaches the
browser.

---

## Architecture decisions

### 1. The application cannot write `orders.status`

Status changes happen by inserting a row into `actions`. A Postgres trigger validates the move
against a table of legal transitions and applies it; a second trigger raises if `status` changes
any other way.

**Why:** with three call sites able to write status there are three places to get it wrong, and
nothing stops a fourth appearing. Here an illegal move raises instead of silently corrupting
state, `status` and `completed_at` are written in one statement so they cannot drift, and the
audit trail the brief asks for is produced by the mechanism rather than by remembering to log it.

**Cost:** triggers are invisible from TypeScript. When a status does not change, the answer is in
a migration file, not the app. Worth it for a state machine this central; not for ordinary logic.

### 2. RLS is deny-all, and there is no browser-side database client

Supabase publishes every table over PostgREST and the anon key ships in the browser bundle. With
RLS off, anyone viewing source could `POST /rest/v1/orders` and bypass every rule the app
enforces.

RLS is enabled on all three tables with **no policies** — deny-all — plus an explicit `REVOKE`.
Every query runs in server code with the service role key. There is deliberately no browser
Supabase client.

**Rejected:** RLS policies keyed to the role switcher. With no real auth, `auth.uid()` is null and
any role a policy reads is supplied by the client. A policy the client satisfies by lying is worse
than no policy, because the dashboard then reports the table as protected.

### 3. Enums where code branches, `text + check` where humans manage

`status`, `role` and `action_type` are native Postgres enums — the trigger's `CASE` is a literal
list of them, so a value in the database but not in that `CASE` is a bug, and rigidity is the
point. A typo like `status = 'inprogress'` raises instead of silently returning zero rows.

`service_type` is `text + check`, because adding a service line is business data, not a code
change. In production it becomes a lookup table.

### 4. Dates are formatted in one pinned timezone

Every timestamp is `timestamptz`, so Postgres returns UTC. Vercel runs UTC; a dev machine here
does not. `src/lib/time.ts` owns `Asia/Kuala_Lumpur` as a business fact, and `format.ts` consumes
it — so the same instant renders identically on a server, a laptop and a technician's phone. General rule of thumb is storing at db is always UTC.

This turns out to matter far more than formatting. See the AI section.

### 5. An order can exist before anyone is assigned to it

`assigned_tech` is **nullable**. An order starts as `new` with no technician, and becomes
`assigned` when an admin picks one.

**Why:** work does not arrive at the same rate that people are free to do it. On a Monday morning
an admin may take twenty calls before deciding who goes where, and the alternative — requiring a
technician at creation — would force that decision at the worst possible moment, or invite a
placeholder technician who then owns jobs nobody is actually doing. Taking the order is one job;
assigning it is another, done later and often by someone else.

It also makes the backlog a queryable fact rather than a convention: unassigned work is
`assigned_tech is null`, which is what an admin's landing view filters on. There are three such
orders in the seed.

**Cost:** every query that joins the technician has to tolerate a null, and the order list renders
"Unassigned" rather than a name. That is a small price for a state the business genuinely has.

### 6. Technicians are deactivated, never deleted

`assigned_tech` is `on delete restrict`. A hard delete that would orphan completed jobs fails
loudly instead of silently nulling history — `on delete set null` would have destroyed exactly the
data the AI module reports on.

### 7. Completing a job is one database call — but uploading files is not (Module 2)

Completion is two writes: save what the technician recorded, and log the completed action that moves the state machine and stamps completed_at. Split across two supabase-js calls, a failure between them leaves work_done saved on a job still showing In Progress — the technician believes they submitted, and the manager never sees it in the review queue.

So both happen inside one Postgres function, complete_job(), which gives one implicit transaction. Same reasoning as create_order().

Files are deliberately outside that transaction. Each upload is appended to order_docs as it lands, rather than being held and written at submit. A technician who uploads five photos on a bad connection and then loses signal keeps the five photos; the alternative orphans them in storage with nothing in the database pointing at them.

The two decisions look inconsistent and are the same principle: make the unit of atomicity match the unit the user thinks they completed. Submitting a job is one act. Uploading five photos is five.

> supabase/migrations/0007_complete_job.sql

### 8. WhatsApp: a deep link now, automation in production (Module 3)

The brief asks for "a deep-link URL with a pre-filled message", and that is what I built.
`wa.me/<phone>?text=<message>` opens WhatsApp with the message composed but unsent — a human taps
send.

**The trade I took is setup cost.** The WhatsApp Business Cloud API needs a Meta business account,
business verification, a WhatsApp Business Account with a registered number, and a message
template submitted for approval — a lead time measured in days, plus per-conversation pricing.
That is disproportionate for a two-day build, and the brief did not ask for it.

**In production I would automate it anyway**, and the reasons are specific rather than general:

1. **The message needs no human judgment.** Every field in it — customer name, order number,
   technician name, completion time — is already in the row. There is nothing for a person to
   decide, so a person in the loop adds nothing but delay.
2. **Completion cannot be an accidental tap in this design.** A job reaches `job_done` only after
   an explicit "Start job", a filled completion form, and a submit. The usual argument for a human
   confirmation — "make sure the customer isn't told about something that didn't happen" — has no
   failure to guard against here.
3. **Technicians are optimised for speed, and this costs them.** Module 2 is built so a job can be
   closed quickly on a phone. The deep link then interrupts exactly that: switch to WhatsApp, tap
   send, switch back, at the moment they most want to be done.

So the human in the loop is not a safety feature here. It is the price of not having the API.

**Given a deep link, the message is derived from the row, not fired once.**
`customerCompletionMessage(order)` returns `null` unless the order has a `completed_at` and an
assigned technician — so it cannot exist for an unfinished job, and it can always be rebuilt for a
finished one. Nothing is stored, nothing queued, nothing can be half-sent. (What that buys the
technician in practice is in the UI/UX section.)

The message carries the customer's name, order number, technician name and time — not the address
or the amount. A WhatsApp message is a permanent copy on someone's phone, so it should point at
the system rather than duplicate it.

**Costs I accepted:** nothing is sent unless a technician taps; the customer sees the technician's
personal number, not a company one; and the system cannot know whether the message went. That last
one is why there is no `notified_at` column — recording the tap and calling the order *notified*
would claim a fact the system does not have.

**The production shape** is the Cloud API sent from a **transactional outbox**: a row written in
the same transaction as the completion, drained by a worker with retries, reconciled against
delivery webhooks. The technician taps nothing, and `notified_at` finally means something the
system actually knows.

---

## UI / UX decisions

Treated as an internal operations tool, not a product: the people using it are at work, using it
repeatedly, and want to be finished. Nothing here is styled specifically (Could be improved)

### Two interfaces, not one responsive layout

Admins are at desks; technicians are on a phone, outdoors, possibly on a ladder. Those are
different jobs, so they get different routes — `/orders` (a dense table with filters and sort) and
`/jobs` (a short stack of cards).

The alternative was one page that reflows. Rejected: it would have forced one information density
on both, and a technician does not need a sortable eight-column table — they need the next job and
the customer's address. (As what the requirement wants, technicians value speed)

### The field view is built around what a technician actually does next

The job card leads with the customer's address, and the two primary actions are **tap to call**
(`tel:`) and **tap for directions** (Google Maps) — the two things someone does before they arrive.
Interactive targets are 44px (`h-11`), which is the minimum that is reliably tappable with a thumb.

### Blocked access explains itself instead of redirecting

Five routes guard themselves, and none of them silently bounce you elsewhere. A silent redirect
teaches the user nothing and looks like a bug — you clicked a link and landed somewhere else with
no explanation. Each block names the role required, says why, and offers the route you *can* use.

This is the affordance. The actual restriction is in the query, so a technician who edits the URL
still gets only their own rows.

### Filters live in the URL, and run in Postgres

Filtering, search and sort are `searchParams`, resolved server-side. Client-side filtering would
have been quicker to build at this data volume, but the URL version means a filtered view is
shareable, the back button behaves, and a reload does not throw the state away.

One decision that fell out of it: a role's default filter is applied **at sign-in**, not on every
parameter-less visit. Applying it on every visit meant clicking "Orders" while viewing Closed
silently snapped you back to the default — the nav link could never show an unfiltered list.
Landing and filtering are different questions, so they became different functions.

### The assistant floats rather than occupying a page

The question a manager asks is nearly always prompted by something they are already looking at.
A separate route costs them the list they were reading and returns them to the top of it. (quick access)

Inside the panel, the prose answer and the table beneath it come from **two different sources** —
the sentence is the model's phrasing, the table is rendered from the returned rows. If the model
ever miscounts, the authoritative list is directly below it.

### UX considerations for WhatsApp notification (Module 3)

Once a job is completed successfully, a success banner appears at the top of the screen prompting the technician to notify the customer, with a prominent Open WhatsApp button.

But a banner is a moment. It shows once, and an accidental dismissal would cost the only chance to send that message. So recently completed jobs each carry their own notify button, giving the technician a second route to the same action.

---
## How AI was integrated

The brief asks for an assistant that answers "through **controlled queries**" and does "not rely
on unrestricted access to the entire database." I read that as two separate claims, and the whole
design follows from separating them:

> **The model does not author the database access, and the model has no connection to the
> database at all.**

There are two jobs in "AI over a database", and neither needs database access:

| | Job A | Job B |
|---|---|---|
| In | English question | Structured result |
| Out | Which query, which parameters | An English sentence |

The database sits **between** them, in ordinary TypeScript. That gap is the architecture.

### The flow

```
1. authorize     managers only, from the session cookie
2. validate      question is bounded text (3–300 chars)
3. interpret     LLM #1 → intent, parsed by zod        ← NO DATABASE ACCESS
4. run           one of three hand-written queries     ← NO MODEL OUTPUT,
                 except two validated parameters
5. format        deterministic answer from the rows
6. narrate       LLM #2 rephrases step 5               ← NO DATABASE ACCESS
```

Steps 3 and 6 are the only places a model appears. Step 4 is the only place the database appears.
They never overlap — which is what makes the query surface **finite and enumerable**, in one file:
`src/lib/ai/queries.ts`.

### Rejected: text-to-SQL

Text-to-SQL means the model writes the database query itself. The alternative — what I built —
hands it a menu: it picks one of three operations, fills in parameters, and my code runs the query.

The question that decides it is **can you write down everything it might do?** With a fixed set,
yes: three functions in one file. With text-to-SQL, no.

It can be hardened — read-only role, statement timeout, forced `LIMIT` — and it is a real
production pattern. But hardening stops the model reading the wrong table or hanging the database.
It does nothing about the failure that actually matters: a sensible-looking query that returns a
confidently wrong number. `WHERE status = 'job_done'` is exactly such a query — it is the one I
wrote myself, and it answers "0 jobs" for a week that had ten. I caught it because there were only
three queries to check.

**With text-to-SQL you have to trust every query the model invents. With a fixed set, you only
have to check three — once — and you can test them.**

### Rejected: RAG

RAG means storing data as text, finding the passages that *sound most like* the question, and
handing those to the model to answer from. It exists for data you cannot query — PDFs, wikis,
support tickets — where there is no `WHERE` clause to write, so approximate matching is the only
option available.

That premise does not hold here. This data is a Postgres table with typed columns and indexes.
`completed_at` is a timestamp, `assigned_tech` is a foreign key, `service_type` is a constrained
value. Using RAG would mean flattening all of that into text and searching it approximately — to
do worse what the database already does exactly.

The questions are also the wrong shape. Every one is a counting question — how many, who did the
most, list the jobs in this window — and counting needs a **boundary**: everything matching a
rule, and nothing else. Similarity search gives a *ranking*, not a boundary: the ten rows that
sound closest. So "how many jobs were completed today?" retrieves ten similar-sounding rows and
counts those. If three were completed, it answers ten. If forty were, it still answers ten. It is
right only by coincidence.

Where RAG *would* fit is where the structure runs out. `problem_desc` and `work_done` are free
prose — the only columns in this schema a query cannot reach into — and "which jobs mentioned a
compressor fault?" is a genuine similarity question. That is a search feature, not a reporting one.

**RAG is what you reach for when your data is not queryable. Mine is a table.**

### The security boundary, in four parts

1. **The key.** `GEMINI_API_KEY` is read in server-only code, no `NEXT_PUBLIC_` prefix.
   `import 'server-only'` makes an accidental client import a build error.
2. **The query surface.** The model emits a name and an args object; both are parsed by zod; an
   unrecognised value is a rejection, not a fallthrough. **Model output is untrusted input** — the
   same treatment as a request body off the internet, because that is what it is.
3. **Authorization**, which is not the same thing. Checked in the server action, and again in
   `runQuery`. The AI layer must not become a second, unscoped read path.
4. **Exfiltration.** Results go to Google, so **the projection is part of the control**. Every
   query names its columns. No query in this module can return a customer name, phone, address,
   price, payment, document, admin note or technician remark — because none of them are selected.

A prompt injection can therefore, at most, make the model pick a different one of three operations
with different parameters. The blast radius is bounded by design, not by the model's compliance.

### Two answering layers

`formatAnswer()` builds the answer deterministically from the query result. `narrate()` asks the
model to rephrase **that sentence** — it never receives rows, so there is no arithmetic left to get
wrong. If the model fails or times out, the deterministic answer ships and the UI says so.

**The prose layer is decorative. Delete it and the system still answers correctly, just less
fluently.** Every number in every answer came out of Postgres.

---

## What types of AI queries are supported

| Operation | Example |
|---|---|
| `LIST_JOBS` | *"What jobs did Ali complete last week?"* |
| `COUNT_JOBS` | *"How many jobs were completed today?"* |
| `RANK_TECHNICIANS` | *"Which technician completed the most jobs this week?"* |

Each can be filtered by **technician name**, **service type**, and one **period** from a closed
list: `TODAY`, `THIS_WEEK`, `LAST_WEEK`, `THIS_MONTH`, `ALL_TIME`.

**The model never sees or computes a date.** It picks a period word; the server resolves it into
two absolute instants. Handing date arithmetic to something that does not know today's date — or
that the company is in Malaysia — is how you get a confident wrong number.

Anything outside this is refused with a sentence saying what *can* be asked. An unknown technician
returns a structured "I don't know that person, here are the ones on record" — **not** "Ali
completed 0 jobs", which is the same failure wearing a plausible answer.

---

## Two bugs worth reporting

Both would have shipped a confident wrong number, and both were found by checking against real
data rather than by reading the code.

**"Completed" is not a status.** My first design filtered on `status = 'job_done'`. But status
moves on when a manager reviews the job. Measured against the seed:

| Window | Rows with `completed_at` | With `status = 'job_done'` |
|---|---|---|
| Last week, 17–23 Aug | **10** (7 closed, 3 reviewed) | **0** |

So *"What jobs did Ali complete last week?"* — the brief's own example — would have answered
**"0 jobs"** when the answer is three. The predicate is now `completed_at` within the window.

**"Today" is a Malaysian day.** `completed_at` is an instant; "today" is a calendar box, and a
calendar needs a place. Malaysia is UTC+8, so anything completed between 16:00 and 23:59 UTC is
already tomorrow in Kuala Lumpur. On the seeded data:

> *"How many jobs were completed today?"* — **3** in Malaysia, **1** in UTC.

The bug hides all morning, appears in the evening — exactly when technicians finish their last job
— and only in production, because a dev machine here is already on Malaysian time. The same bug
was in my own `seed.sql` verification query, which reported "today: 1" beneath a comment claiming
3.

---

## Testing

- **`supabase/tests/state_machine_test.sql`** — 24 assertions on the trigger: every legal
  transition, illegal ones raising, `orders.status` refusing a direct write, `completed_at`
  cleared on rejection. Wrapped in `begin`/`rollback`, so it is re-runnable and leaves nothing.
- **`src/lib/time.test.ts`** — 9 assertions on the date resolver. `npm test`, no framework
  installed: Node runs TypeScript directly and ships `node:test`.
- **`TEST-PLAN.md`** — 175 manual rows, each with the exact expected result so a disagreement is a
  finding rather than an opinion. (Manual testing)

**Both suites were mutation-checked.** Passing assertions prove something ran; they do not prove
any assertion *could* fail. So each rule was deliberately broken and the suite re-run, with the
expected failures written down first.

That found a real bug — in the SQL harness, not the schema: a statement that should have raised
succeeded instead, and the *next* step then crashed with an unrelated error, so a broken rule
reported the wrong failure in the wrong place. Every expect-raise assertion now fails on its own
terms.

The date suite is pinned to a clock **inside the divergence window** (`2026-08-27T16:56Z` — a real
`completed_at`). That choice is load-bearing: a clock eight hours earlier would let every label
assertion pass under a UTC implementation, and half the suite would prove nothing.

---

## Challenges and assumptions

**Assumptions**
- **One country, one timezone.** Malaysia is UTC+8 throughout, so a single constant is correct.
  A business operating across timezones would store a zone name per branch and resolve every date
  question against that branch's zone — "how many jobs today" would then have a different answer
  per branch rather than one company-wide answer.
- **"Last week" means the previous Monday–Sunday**, not the trailing seven days. Every answer
  prints the window it used, so the reader can check that reading.

**Simplified deliberately** — known to be untrue in the real business, and cut for scope
  jobs" means, so it is a modelling decision, not just a migration.
- **One technician per job.** The brief says "40+ technician teams"; `assigned_tech` is a single
  uuid, so a job belongs to a person rather than a crew.
- **No scheduling.** Real operations plan jobs for a date and time. Orders here record only when
  they were created and completed, which is why the technician view is "my open jobs" rather than
  "today's jobs".

**Challenges**
- **Breaking the work down.** The hardest part of this build was not any single feature — it was
  the number of small decisions each one hides. Every screen became a chain of choices about the
  data model, the failure cases, and what to leave out, and holding that across four modules
  stretched me. I know there are things I missed. That is my biggest takeaway from this
  assessment, and the part I would most like to see done well by a team that does it daily.
- **Uploads are shaped by the device, not by the desktop default.** iPhones produce `.heic` photos
  and `.mov` video, and Chrome on Windows reports an *empty* MIME type for `.heic` because Windows
  does not map the extension. A MIME-only check would have silently rejected most real field
  photos. The fix is an extension fallback beside the MIME check, with both listed in `accept` so
  the picker does not grey the files out.
- **Free-tier AI quota is 20 requests per model per day.** One question costs two calls, capping
  the feature at ten questions a day. Since the quota is *per model*, the two calls now use two
  different models, which doubles the budget for free.

---

## Limitations

### Of the AI implementation

- **Three operations only.** No trends, no period-over-period comparison, no "why", no revenue —
  pricing is deliberately outside the projection.
- **The period vocabulary is a closed list.** "In June" cannot be expressed. Extending it is one
  enum value and one `case` — but not by the model, at runtime, which is the point.
- **No conversation memory.** Each question is independent; *"and what about John?"* will not work.
- **20 requests per model per day** on the free tier. A demo key, not a production one.
- **No rate limiting or cost cap of my own.** A manager holding the return key costs money.
- **~2–3 seconds per answer**, two sequential model calls. Dropping the phrasing step would nearly
  halve it.
- **Order numbers, service types, completion timestamps and technician first names are sent to
  Google.** Customer and payment data never is, by construction.
- **`formatAnswer` has no unit test.** It is pure and trivially testable; every branch has been
  exercised by hand, but nothing would catch a regression. The clearest gap in this module.
- **On `RANK_TECHNICIANS`, the phrasing model frequently returns the deterministic sentence
  unchanged** — so the second call sometimes costs a request and changes nothing.

### Of the system

- **Authentication is a cookie holding a user id.** The app knows who you *say* you are. Server
  role checks catch bugs, not attackers. With real auth this becomes a signed session and the
  same checks become a genuine boundary.
- **No manager review UI**, as above.
- **Technicians are identified by name.** `users.id` is a uuid — correct for foreign keys, useless
  to a human — so the assistant resolves names instead, and names are neither unique nor stable.
  Two technicians called Ali produce an ambiguity prompt the interface cannot resolve, because
  there is nothing to disambiguate *with*.

  The fix is the split the schema already uses for orders: keep the uuid as identity, add a
  `staff_code` for human reference. Entered rather than generated — unlike `order_no`, a real
  company's employee numbers exist before the row does, so it is business data like
  `service_type`, not something this system should invent. Not built: it touches the schema, the
  seed, the technician picker and the assistant, and the demo data has no collisions. It is the
  missing half of a pattern the rest of the schema follows.
- **Re-completing a rejected job overwrites the first attempt's detail.** What survives is the
  `actions` row proving a rejection happened. The fuller fix is a separate completions table.
- **WhatsApp is a deep link, so nothing sends until a human taps** — and the system cannot know
  whether they did. Recording the click as "notified" was rejected: it would report a fact the
  system does not have.
- **`final_amount` is a generated column**, so editing a quoted price on a closed order silently
  recomputes a historical invoice value.

---

## Running it locally

```bash
npm install
cp .env.example .env.local      # add Supabase URL, service role key, GEMINI_API_KEY
npm run dev
```

Then, in the Supabase SQL Editor, run `supabase/migrations/0001` … `0008` in order, followed by
`supabase/seed.sql`.

```bash
npm test    # date resolver, 9 assertions
```

---

## Self-assessment

**Easiest:** Module 1. A form, validation and an insert — the work was in the data model beneath
it, not the screen.

**Hardest:** the AI module, and I had never integrated an LLM before.

Wiring up the API was not the hard part — that took an afternoon. The hard part was that I could
not tell whether the design was *right*. In modules 1 to 3, "right" is visible: the form saves the
row, the link opens WhatsApp, you look and you know. Here it was an argument — structured intent
over text-to-SQL over RAG — and you cannot run an argument to find out if it works.

What made that worse is how this module fails. A wrong query does not crash. Filtering completions
on `status = 'job_done'` — the predicate I first designed — would have answered "Ali completed 0
jobs last week": a clean, confident, well-formatted sentence, and completely wrong. In the other modules the system
tells you when you are wrong. Here it only tells you if you go looking: working through edge cases
deliberately, and checking every answer against rows I had counted myself.

The first move was the hardest part of all — a blank page with no obvious shape, which none of the
other modules had. What got me through it was breaking the problem down, listing the approaches
that actually exist, and reasoning each one against what the brief demanded, rather than picking
the one I had seen most often.

**What I would change in production**

- **Real authentication, first** — everything else leans on it. A signed session instead of a
  cookie holding a user id, and RLS policies keyed on `auth.uid()` so the rules enforced in server
  code are enforced a second time at the data layer.
- **WhatsApp through the Cloud API**, sent from a transactional outbox and reconciled against
  delivery webhooks — the technician taps nothing, and `notified_at` becomes a fact rather than a
  guess.
- **A `staff_code` on `users`**, so a technician has a stable handle that is not their name.
- **A completions table**, so a rejected-and-redone job keeps both attempts instead of overwriting
  the first.
- **A `service_types` lookup table**, so adding a service line is an insert rather than a migration.
- **Pagination on the order list.** `listOrders` has no `LIMIT` — every row matching the filters is
  fetched, serialised and rendered, and the "N orders" heading is the length of that array. At 36
  seeded orders it is invisible; at five branches doing fifty jobs a day it is tens of thousands of
  rows in a single response. Filters and search hide the problem rather than solve it, because "All
  statuses" is one click away. It fits the existing pattern — the filters already live in
  `searchParams`, so the page belongs there too — and it should be keyset rather than `OFFSET`,
  since `OFFSET` still walks every row it skips.
- **Branches, crews and scheduling** — the three things the brief describes that this build does
  not model.
- **A paid AI tier and a rate limit**, since the free quota caps the assistant at roughly twenty
  questions a day.

**How I used AI while building:** heavily, and in two modes. For code it was a pair — I specified
each unit, it wrote a first version, and I reviewed and corrected. The mode that mattered more was
adversarial: writing a design down and having it attacked before any code existed. That is how the
`status = 'job_done'` bug surfaced, before the query layer was written. Every factual claim it made
was checked against the real database, and several were wrong — including a model recommendation
that turned out to take 39 seconds per call, and a test expectation that was simply incorrect.
`Decisions_Logs.md` records those arguments as they happened, including the ones I lost.
