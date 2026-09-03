# FitGen — AI Smart Workout & Macro Diet Generator

**An adaptive fitness platform that generates personalised training splits and
macro-based diet plans with AI — while making it structurally impossible for the
AI to invent an exercise, a food, or a calorie figure.**

> **Status: complete.** All planned features are working end to end, verified by
> **578 automated tests** across 14 suites. Not yet deployed — steps are in
> [`SETUP.md`](SETUP.md).

| | |
|---|---|
| **Set it up** | [`SETUP.md`](SETUP.md) — install, seed, first admin, first user |
| **Google sign-in** | [`google-clientid-steps.txt`](google-clientid-steps.txt) |
| **Seeding** | [`seed_steps.txt`](seed_steps.txt) |
| **Full project report** | [`FitGen_Project_Report.md`](FitGen_Project_Report.md) — scope, architecture, and every assumption made |

---

## Contents

- [The problem](#the-problem)
- [What makes it different](#what-makes-it-different)
- [Feature list](#feature-list)
- [Where the AI is — and isn't](#where-the-ai-is--and-isnt)
- [How it works](#how-it-works)
- [Subsystems in detail](#subsystems-in-detail)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [API reference](#api-reference)
- [Testing](#testing)
- [Design notes](#design-notes)
- [Known limitations](#known-limitations)

---

## The problem

A generic workout plan off the internet doesn't know that you train at home with
two dumbbells, that your left knee gives out under load, that you're vegetarian
and allergic to peanuts, or that your goal changed last month from cutting to
building. So it prescribes barbell squats you can't perform, chicken you won't
eat, and a calorie target for the person you used to be.

Asking ChatGPT instead trades one problem for a worse one. A language model will
happily invent an exercise that doesn't exist, cite a YouTube link that 404s, and
state a calorie count that doesn't match its own macros — confidently, with no
way for you to tell.

**FitGen's answer:** use AI for the part that genuinely needs judgement — which
exercises pair well, which foods make a coherent meal — and refuse to let it
anywhere near facts or arithmetic. Every exercise name, muscle group and
nutrition value is read from a verified database. Every calorie is recomputed by
the server. Anything the model invents is discarded before it reaches you.

---

## What makes it different

**1. Grounding is structural, not a prompt request.**
The model is shown a filtered shortlist and may only select from it. Anything
whose identifier isn't on that list is **dropped, never repaired** — silently
substituting a similar exercise would hide the failure. This is enforced in code
after the response arrives, so it holds even when the model ignores instructions.

**2. Safety is a filter, not a suggestion.**
Injuries are applied to the candidate pool *before* the model sees it. An
exercise that loads an injured area is never among the options, so the model
cannot choose it even if asked to.

**3. Arithmetic is never delegated.**
BMR, TDEE, macro splits, portion scaling, training volume, estimated 1RM, body
fat — all deterministic formulas. Identical inputs always produce identical
outputs, and no LLM slip can reach a user's numbers.

**4. It degrades instead of failing.**
When the AI is unavailable or rate-limited, a rule-based engine builds the plan
from the same shortlist, and the UI says which engine produced it. The user gets
a usable plan either way.

**5. It tells you when it compromised.**
Calorie floors that bind, macros that had to be clamped, a protein target it
couldn't quite reach, an injury that emptied a training day — all surfaced in the
interface rather than quietly absorbed.

---

## Feature list

### Accounts and access

- **Google OAuth 2.0 sign-in** — the only method. No passwords stored,
  transmitted or reset anywhere in the system.
- **JWT sessions** with rehydration on reload and automatic sign-out on rejection.
- **Role-based access control** — `user` and `admin`, enforced by middleware on
  every protected route.
- **Admin-managed roles** with an audit trail (who changed what, when) and guards
  against self-lockout.

### Onboarding and profile

- **Six-step wizard** — basics → goal → equipment → diet → injuries → review.
- **Live target preview** before anything is saved.
- **Editable profile**, saved section by section.
- **Smart regeneration triggers** — only plan-relevant changes flag plans as
  stale, and the UI names which field caused it.

### Calculations (all deterministic)

- **BMR** via Mifflin–St Jeor, **TDEE** via activity multipliers,
  goal-adjusted calorie target.
- **Macro split** anchored to bodyweight, with hormonal-health fat floors and a
  minimum-carbohydrate floor.
- **Calorie safety floors** by sex and against BMR, disclosed when they bind.
- **BMI, hydration target, weekly-change and time-to-goal projections.**

### Workout generation

- **Four split types** — Push/Pull/Legs, Upper/Lower, Bro Split, Full Body —
  across 1–7 training days.
- **Equipment filtering** — only movements you can actually perform.
- **Injury-aware substitution** with three severity levels.
- **Adapted and active-recovery days** when injuries eliminate a session.
- **Plan versioning** with full history, provenance, and the profile version each
  plan was built from.
- **Deterministic fallback engine** when the LLM is unavailable.

### Diet generation

- **Meals matched to macro targets**, respecting diet type and allergies.
- **Three-pass deterministic portion scaling** with 10–600 g bounds.
- **Single-meal swap** — regenerate one meal without disturbing the rest.
- **Variance reporting** — the gap between plan and target is shown, not hidden.
- **Grocery list** — aggregated across meals for 1/3/7/14 days, grouped by
  supermarket aisle, quantities rounded up to shoppable amounts.

### Logging and progress

- **Session logging** — sets, reps, load, RPE, duration, notes.
- **Progressive overload** via double progression, with auto-deload on repeated
  failure and a stall reset on flat volume.
- **Pre-filled suggestions** from the progression engine — confirm-and-save.
- **Session history** with per-session detail and delete.
- **Body check-ins** with the Navy-method body-fat estimator.
- **Progress dashboard** — weight, composition, measurements, weekly volume,
  consistency, personal records by estimated 1RM.
- **Gamification** — weighted consistency score, 16 badges, week streaks, all
  derived on read and never stored.

### AI coach

- **RAG chatbot** over a 38-entry curated knowledge base across 6 categories
  (training, form, nutrition, supplements, recovery, safety).
- **Safety triage** — medical, emergency, medication, pregnancy, minor-age and
  disordered-eating questions refused before anything else runs.
- **Grounded answers with citations**, re-verified against what was actually
  retrieved.
- **Voice input** via the Web Speech API.
- **Session restore**, recent-conversation list, and 90-day auto-deletion.
- **Browsable knowledge base** — users can read the entire corpus the coach may
  draw on.

### Reference libraries

- **876 exercises** — search, filter by muscle/equipment/level/category,
  pagination, detail pages with instructions and step images.
- **129 foods** — search, filter by category and diet tag, macros per 100 g.

### Admin

- **Content CRUD** for exercises and foods, with slug immutability and
  delete-blocked-while-referenced.
- **User roles** with audit history.
- **Aggregate analytics** — counts and distributions only, never individual data.

### Output and resilience

- **PDF export** — workout plans, diet plans and grocery lists, print-oriented.
- **Error boundary** per route, so one broken screen never blanks the app.
- **Cold-start indicator** so a sleeping free-tier server reads as a wait, not a
  failure.
- **Responsive** from mobile to desktop; colourblind-validated charts with table
  alternatives.

---

## Where the AI is — and isn't

Seven features involve AI. Four of them are the *only* places a language model
touches the product.

| # | Feature | Approach | What the AI actually decides |
|---|---|---|---|
| 1 | **Workout split generator** | Groq `openai/gpt-oss-120b`, JSON-constrained, grounded to the exercise DB | Which exercises to pick from a pre-filtered shortlist, and their order |
| 2 | **Diet plan generator** | Groq, JSON-constrained, grounded to the food DB | Which foods compose each meal, and rough starting portions |
| 3 | **Single-meal swap** | Groq, single-meal prompt | A replacement meal for one slot |
| 4 | **RAG gym coach** | TF-IDF retrieval + cosine similarity, then Groq over retrieved passages only | How to phrase an answer using supplied passages — nothing else |
| 5 | **Injury-aware substitution** | **Rule-based filtering**, applied before generation | Nothing. The AI never sees an unsafe exercise. |
| 6 | **Adaptive progression** | **Rule-based** double progression | Nothing. Load recommendations are deterministic. |
| 7 | **Voice input** | Web Speech API (browser-native) | Nothing — speech-to-text only, no Groq involved |

### The division of labour

This split is the project's central design decision:

| Decision | Owner | Why |
|---|---|---|
| Which day trains what; how many days | **Code** | Settled convention, not a judgement call |
| Sets / reps / rest by goal | **Code** | Published volume guidelines |
| Which exercises pair, and their order | **AI** | Genuinely subjective — the personalisation value |
| Which foods compose a meal | **AI** | Same |
| Every calorie and macro number | **Code** | Recomputed from the DB; an LLM arithmetic slip cannot reach the user |
| Final portion sizes | **Code** | Scaled deterministically to targets, with bounds |
| Whether an exercise is safe for an injury | **Code** | Safety must be a guarantee, not a suggestion |
| BMR, TDEE, macros, 1RM, body fat | **Code** | Published formulas; determinism matters more than flair |

**AI is used where it adds personalisation value — not as a wrapper around a
chat API.** The system works, with reduced polish, when the AI is switched off
entirely.

---

## How it works

### Architecture

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│  CLIENT  (Vercel)           │         │  SERVER  (Render)            │
│  React 19 · Vite · Tailwind │  HTTPS  │  Node 20 · Express · Mongoose│
│                             │ ──────► │                              │
│  Google Identity Services   │ Bearer  │  JWT auth + RBAC middleware  │
│  15 pages, lazy-split       │  JWT    │  zod validation boundary     │
└─────────────────────────────┘         └───────┬──────────────┬───────┘
                                                │              │
                                    ┌───────────▼───┐   ┌──────▼──────┐
                                    │ MongoDB Atlas │   │  Groq API   │
                                    │ 8 collections │   │ gpt-oss-120b│
                                    │ 876 exercises │   │  optional   │
                                    │ 129 foods     │   └─────────────┘
                                    └───────────────┘
```

Client and server are fully independent — separate `package.json`, separate env
files, separate deploys — and communicate only over HTTP with a Bearer token.

### Sign-in

```
Browser ──Google Identity Services──► Google
        ◄──────── ID token ──────────┘
        ──POST /api/auth/google { credential }──► Server
                                                  verifies signature + aud + exp
                                                  upserts user, signs FitGen JWT
        ◄──────── { token, user } ────────────────┘
        stores the token, sends it as a Bearer header
```

No client secret and no redirect URI — this is the token flow, not the
server-side redirect flow. The server verifies Google's signature and the `aud`
claim itself, so it never trusts the browser's word about who the user is.

A Bearer token in `localStorage` is deliberate rather than a cookie session: the
client and API sit on different registrable domains, where third-party cookie
restrictions make cross-site cookies unreliable. The accepted cost is XSS
exposure, mitigated by React's default escaping and no `dangerouslySetInnerHTML`
anywhere in the codebase.

### The calculation chain

```
BMR → × activity multiplier → TDEE → ± goal adjustment → calories → macro split
```

Every step is a published formula in
[`fitnessCalc.js`](server/src/services/fitnessCalc.js) — no LLM involvement, so
identical inputs always give identical targets. Protein is anchored to bodyweight
(g/kg by goal), fat takes a 25% calorie share subject to a 0.6 g/kg floor, and
carbs absorb the remainder.

Two safety behaviours surface in the UI rather than being hidden:

- **Calorie floors.** Targets never go below 1200/1500 kcal (by sex) or 90% of
  BMR. When a floor binds, the panel says so.
- **Macro clamping.** A large deficit at a heavy bodyweight can drive carbs
  negative. Fat is trimmed toward an absolute 0.4 g/kg floor first, then protein
  as a last resort — and the compromise is reported, with a suggestion to use a
  smaller deficit.

### Plan generation — the four-stage pipeline

Both generators follow the same shape. This is the "hybrid AI + verified data"
principle made concrete:

```
1. RETRIEVE   filter the DB to what's safe and possible for THIS user
              (equipment, injuries, diet type, allergies) — deterministic
2. GENERATE   ask Groq to select and arrange from that shortlist only
3. GROUND     drop anything whose slug isn't in the shortlist
4. FALLBACK   if the LLM is unavailable or unusable, build from the same
              shortlist with a rule-based engine
```

**Stage 3 is what makes "no hallucinated exercises" a guarantee rather than a
hope.** Unknown slugs are dropped, never repaired. Names, muscle groups,
equipment and every nutrition value are read from the database, never from the
model's response.

### The coach — three gates between a question and an answer

```
1. SAFETY TRIAGE   medical, emergency, medication, pregnancy, minors, disordered
                   eating → refused and redirected. No retrieval, no LLM call.
2. RETRIEVAL       cosine similarity over the corpus. Nothing relevant → the
                   assistant says so. The LLM is NEVER CALLED.
3. GROUNDED GEN    Groq sees only the retrieved passages, must cite them, and
                   cited ids are re-checked against what was actually supplied.
```

**Gate 2 is the load-bearing one.** "The chatbot cannot answer outside its
knowledge base" isn't a prompt instruction a model might ignore — **with no
passages there is no request at all.** Verified: an off-topic question returns in
~1 ms having made no API call.

### Adapting over time

```
Profile edit ──► is the changed field plan-relevant?
                     │
          no ────────┴──────── yes
          │                     │
   nothing happens      profileVersion++
                        plans flagged stale, with reasons
                        user regenerates when ready
                        old plan kept as version N, new one N+1
```

Plans are versioned, never overwritten. Both plan pages list previous versions
with date, provenance (AI vs rule-based) and the profile version each was built
from, each expanding to the full read-only plan.

There is deliberately **no "restore"** action: reinstating a plan built for an
outdated profile is a footgun, and regenerating is always the correct move. Every
lookup is scoped by `userId`, so a plan id is not readable by another account —
there's a test asserting exactly that.

---

## Subsystems in detail

<details>
<summary><b>Proving grounding actually defends</b></summary>

"It didn't hallucinate in my test run" is not evidence. So
[`test:grounding`](server/tests/grounding.test.mjs) stubs the LLM and feeds the
generators deliberately hostile responses, asserting none of it survives:

| Injected | Asserted outcome |
|---|---|
| Every slug invented (`Superman_Mega_Press`) | Nothing reaches the plan; falls back, discloses why |
| Half real, half invented | Real picks kept, fabrications stripped |
| A real slug in the **wrong** session | Rejected — each day matches its own target muscles |
| The model lying about name/muscles/equipment | DB values win; the lies never persist |
| The model claiming 99,999 kcal / 500 g protein | Discarded; recomputed from grams × DB values |
| Portions of 500,000 g or −50 g | Clamped to 10–600 g; no negative macros |
| Sets of 999, rest of 99,999 s | Clamped to 2–6 and 30–240 s |
| The same slug repeated | De-duplicated within the session |
| `null`, `{}`, `{sessions:"nope"}` | Falls back rather than throwing |

That last row was a genuine bug this suite caught: a malformed response *shape*
crashed both generators instead of falling back — a 500 instead of a usable plan,
which defeated the never-hard-fail design. Both generators now guard the shape.

</details>

<details>
<summary><b>Injury-aware substitution</b></summary>

[`injuryRules.js`](server/src/services/injuryRules.js) maps each declared injury
area onto the muscle vocabulary the seeded exercise DB actually uses, then
filters by severity **before** the model sees any candidates:

| Severity | Behaviour |
|---|---|
| **severe** | Excluded if the area's muscles are primary *or* secondary, plus heavy barbell compounds for spinal areas (axial loading) |
| **moderate** | Excluded if primary |
| **mild** | Kept, with a caution note attached to the exercise |

The design **over-excludes rather than under-excludes**. A severe injury can rule
out every muscle a session targets — a severe knee leaves a Legs day with nothing
safe. Rather than showing an empty day, the generator widens the search to
whatever *is* safe and relabels the session "(adapted)", or marks it active
recovery if nothing qualifies.

</details>

<details>
<summary><b>Portion scaling</b></summary>

Whole foods can't hit a macro target exactly, so after grounding there are three
deterministic passes:

1. **Calorie scaling** — one global factor, clamped to 0.5–2.2×
2. **Protein shortfall** — raises the most protein-dense items when protein is
   more than 10% short
3. **Protein overshoot** — trims protein-dense items when protein runs more than
   12% over, then restores the released calories through the carb/fat-leaning
   items so the calorie target still holds

Passes 2 and 3 are mutually exclusive. Pass 3 runs in up to 5 rounds, each
cutting a portion by at most half, because a single dominant protein source
(300 g of whey, say) cannot converge in one capped step.

Every portion stays within 10–600 g, so a plan can never say "eat 1.8 kg of
broccoli".

**What pass 3 deliberately won't do.** Only foods above 12 g protein per 100 g
are trimmed — concentrated sources like whey, tofu, paneer and soya. Whole foods
that merely contain protein (yogurt, rice, roti, vegetables) are left alone,
since gutting a bowl of rice to chase a protein number makes for a worse meal.
The consequence is a floor: when much of the day's protein comes from
sub-threshold foods, protein settles a little over target and stops there.
Measured on a vegetarian 3155 kcal plan: **+34% before this pass, +7% after**,
with calories landing within 0.1%.

Any residual is stored in the plan's `variance` and shown in the UI rather than
hidden, and a plan that cannot reach its calorie target because the remaining
foods hit their portion caps says so explicitly.

</details>

<details>
<summary><b>Progression rules</b></summary>

The decision is rule-based and deterministic — identical logs always give the
identical recommendation. An LLM is not involved in choosing a load.
[`progression.js`](server/src/services/progression.js) implements standard double
progression:

| Situation | Recommendation |
|---|---|
| Every set at the top of the rep range | **Add load** — by the equipment's own increment |
| Inside the range | **Add reps** at the same load |
| Some sets below the range | **Repeat** the session |
| Below the range on 2 consecutive sessions | **Deload** ~10% |
| Volume flat across 3 sessions | **Stall reset** — small step back |
| Bodyweight movement at the top of the range | **Add reps**, never load |

Load increments respect equipment rather than applying a flat figure: barbell
lower-body compounds move in 5 kg steps, isolation work in 2.5 kg, dumbbells in
2 kg per hand, and bodyweight movements progress by reps. Suggested loads are
snapped to a liftable value for that equipment.

The logging page pre-fills each exercise with its suggestion, so the normal case
is confirm-and-save. The suggestion is a starting value, never imposed.

</details>

<details>
<summary><b>Session history, and why delete matters</b></summary>

Logged sessions are listed under the form on `/log`, each expanding to the sets
actually recorded. It sits there rather than on a page of its own because that is
where a mistake becomes visible: "did I already log today?" and "what did I put
in yesterday?" are both questions you have while looking at the form.

Deletion is the part that matters. Every figure on the progress dashboard is
derived from these documents, and badges and the consistency score sit on top of
that. A mistyped 600 kg bench press becomes a permanent personal record *and*
permanently awards the "beat a previous best" badge — so with no way to remove a
bad entry, the derived numbers stay wrong forever. The confirmation names exactly
what the deletion will affect rather than asking a generic "are you sure?".

</details>

<details>
<summary><b>Body composition</b></summary>

Navy circumference method (Hodgdon & Beckett, 1984), metric form — needs height,
neck and waist, plus hip for the female formula. Lean/fat mass and
waist-to-height ratio are derived from it.

The estimate is **stored, not recomputed on read**, because it depends on the
user's height and sex *at the time of measurement*; recomputing later against a
changed profile would silently rewrite history. Where inputs are missing, the API
says which ones rather than omitting the figure silently.

A weigh-in updates the profile weight but does **not** bump `profileVersion` —
calorie targets follow current weight, while plans aren't flagged stale on every
check-in, which would make the staleness signal meaningless.

</details>

<details>
<summary><b>Retrieval, and an honest note on "embeddings"</b></summary>

The project brief suggests "embeddings + cosine similarity". Groq is
inference-only and exposes **no embeddings endpoint** (verified against the live
API), and a local neural model would add ~100 MB plus a slow cold start on a
free-tier host. So retrieval uses **TF-IDF term vectors with cosine similarity** —
classical sparse embeddings rather than dense neural ones.

The trade-off is real: lexical retrieval matches words, not meaning. Three things
compensate, and the measured result is good on a corpus this size:

- Each entry carries several **alternate question phrasings**, weighted 3× over
  its prose, because users phrase things as questions.
- A **domain synonym map** expands gym jargon, so "DOMS", "sore" and "soreness"
  all reach the same entry.
- **Light suffix stemming** collapses inflections.

Plus a **coverage requirement** that mattered more than the score floor. "Who won
the 1998 World Cup?" originally matched the free-weights entry at 0.10 — purely
because that entry contains the phrase "real-**world**". A single rare word in
common is a coincidence, not relevance. A hit now needs to overlap on **two or
more distinct query terms**, with a higher-score escape hatch for genuinely
one-word queries. Measured separation: real matches score ≥0.37 with ≥2 overlap;
that false positive was 0.10 with 1.

63 retrieval tests assert the *expected entry ranks first* for realistic
phrasings — including slang ("how do I shred"), abbreviations ("what is DOMS",
"what does RIR mean") and symptom wording ("my lower back hurts after
deadlifts") — and that off-topic questions return nothing at all.

</details>

<details>
<summary><b>Safety triage</b></summary>

Medical questions are refused **before** retrieval, with a redirect to the right
professional. Patterns match on *intent phrases*, not bare keywords, because
"chest" and "pain" are ordinary gym vocabulary — blocking those would make the
assistant useless. So "How do I train chest without a bench?" passes while "I
have chest pain during squats" is refused.

Covered: emergencies, injury diagnosis, medication and PEDs, disordered eating,
pregnancy and postpartum, and users identifying as minors. 18 tests assert both
directions — that each category is caught, and that seven ordinary gym questions
are *not*.

</details>

<details>
<summary><b>Chat history and retention</b></summary>

Exchanges are stored in the **`chatHistory`** collection — pinned explicitly,
since Mongoose would otherwise derive `chatmessages` and disagree with the
project report.

Each document keeps the full **retrieval trace**: every candidate passage and its
cosine score, not just the ones cited. So an answer can be reconstructed months
later — which entries were considered, at what strength, and whether the result
was grounded, refused, or out of scope. That distinction matters: a correct safety
refusal is not a failure, and the flags keep them separable.

The UI restores the active session on reload (the id is kept in `localStorage`;
the messages are re-fetched, so the server stays the source of truth) and lists
recent conversations for resuming or deleting. It is deliberately compact — this
is a chatbot, not a messenger.

**Retention is bounded at 90 days** by a TTL index on `createdAt`, swept
automatically by MongoDB, and the window is stated in the UI rather than applied
silently. TTL needs its own single-field index — the compound `userId + createdAt`
index cannot serve it.

</details>

<details>
<summary><b>Voice input</b></summary>

Web Speech API, browser-native, so no audio upload and no per-request cost.
Support is genuinely uneven (Chrome and Edge yes, Safari partial, Firefox not by
default), so the mic button is **hidden rather than shown-and-broken** when
unsupported, and error codes are translated into plain language (blocked
microphone, no speech detected, offline). `inputMode` is stored per message, so
voice usage is measurable.

</details>

<details>
<summary><b>Editing what the AI is grounded against</b></summary>

Admin CRUD writes to the same `exercises` and `foods` collections the generators
select from, which makes two rules non-negotiable.

**Slugs are immutable.** A slug is the grounding handle: it is stored inside every
generated plan and every workout log. Renaming one would leave those records
pointing at nothing, and because the grounding layer *silently drops* unknown
slugs, the user would simply see a shorter session with no error anywhere. The API
rejects a slug change and the UI disables the field; a rename is a delete plus a
create, deliberately.

**Deletion is refused while anything references the record.** `DELETE` counts the
referring plans and logs first and returns 400 with those counts rather than
cascading. The UI fetches `/usage` *before* asking for confirmation, so an
administrator is told the delete will fail before attempting it, not after.

Foods additionally re-run the seeder's calorie check: stated calories must sit
inside the band the 4/4/9 arithmetic allows, accounting for sources disagreeing
about whether fibre counts toward carbohydrate. A swapped protein/carb column is
caught at the form rather than quietly distorting every plan the food lands in.

</details>

<details>
<summary><b>Why gamification stores nothing</b></summary>

Badges and the consistency score are **derived on every read** from the user's own
logs. Nothing is persisted.

Storing them would mean an award could outlive the evidence for it: delete a
workout log and a stored "10 sessions" badge would remain, or backdate a check-in
and a stored streak would not notice. Deriving is also idempotent — there is no
award job to run, nothing to migrate when a threshold changes, and no path where
two requests double-grant. The cost is recomputation on each request, which is a
handful of aggregates over at most 400 recent logs.

The score is weighted across four components — adherence to plan (40), training
recency (25), week streak (20) and recording check-ins (15) — chosen so that
actually training dominates, and logging alone can't manufacture a good score.
The endpoint also names the component with the largest *weighted headroom* so the
UI can point at one concrete improvement; that is deliberately not the
lowest-scoring component, since 50% of a 40-point weight is a bigger win than 0%
of a 15-point one.

</details>

<details>
<summary><b>Grocery quantities round up</b></summary>

A generated plan specifies grams; shops sell packets. `toPurchaseQuantity` rounds
to practical amounts (to the nearest 10 g below 100 g, 50 g below 1 kg, 250 g
above), always **upward** — a list that leaves you short of an ingredient is worse
than one that buys slightly too much. The UI says so rather than implying the
numbers are exact.

The day count is a control, not an assumption: a plan describes one day intended
to be repeated, so "how many days am I shopping for" is genuinely the user's
choice, and the chosen value appears in the heading so a printed list is never
ambiguous. Ticked items are per-viewer and not persisted — a shopping list is
transient.

The list is derived from the plan on every request, never captured at generation
time, and an open panel refetches whenever the plan changes — a regeneration or a
single meal swap. Stale here would be worse than absent: it is a shopping list
someone might actually shop from. Ticks clear on refetch for the same reason,
since quantities aggregate across the whole plan and swapping one meal can move
the amount beside an item in another.

</details>

<details>
<summary><b>Living inside Groq's free tier</b></summary>

Three separate failures showed up here, each with a different cause and fix.
Worth understanding, because they are the difference between "the AI path works"
and "every plan silently falls back to rule-based".

**1. Rate limit (429) — too many calls.** The workout generator originally made
one Groq call per training day, which exhausted the limit on any 5+ day split. It
now batches every *unique* session into a single request — a 6-day PPL week is 3
unique sessions in 1 call rather than 6 calls.

**2. Request too large (413) — the per-minute token cap.** The free tier allows
**8000 tokens per minute** and counts `prompt_tokens + max_tokens` against it, so
*reserving* output tokens spends budget even if the model never uses them.
Retrying cannot fix a 413. Two changes:

- **Compressed prompts.** Candidates are encoded as `slug|muscles|mechanic` for
  exercises and `slug:kcal/P/C/F` for foods. The display *name* is omitted (the
  slug reads as the name, and the server resolves the real one from the DB), and
  equipment is omitted (every candidate is already filtered to gear the user
  owns). ~60% smaller per line.
- **A budget guard.** [`groqClient.js`](server/src/services/groqClient.js) exports
  `estimateTokens` and `TOKEN_BUDGET`; both generators trim their candidate lists
  until `prompt + max_tokens` fits *before* sending. Sessions are never dropped —
  only shortened — so the week keeps its shape.

**3. "Failed to validate JSON" (400) — reasoning tokens.** `gpt-oss` models emit
internal reasoning tokens that count against `max_tokens`. At default effort they
consumed ~575 of a 780-token completion, truncating the JSON mid-object, which
Groq then rejects. Since every FitGen prompt is a constrained selection from a
supplied list, deep deliberation adds little: `reasoning_effort: 'low'` cut
reasoning from **578 to 29 tokens** with no loss of output quality.

[`test:budget`](server/tests/promptBudget.test.mjs) builds the real prompts for
the worst-case profiles (bro-split over 7 days, 8 meals a day, every equipment
type) and asserts each fits, so a prompt-size regression fails in tests rather
than in production. Measured headroom, worst case: 4557 of 4960.

</details>

<details>
<summary><b>Bundle splitting and failure modes</b></summary>

**Recharts** is ~410 kB and only the progress dashboard needs it, so that route is
`React.lazy`-loaded. The chart chunk (117 kB gzipped) is fetched on first visit to
`/progress`.

**jsPDF** and its optional dependencies are ~400 kB — more than the rest of the
app combined — and most sessions never export anything. Importing it statically
took the initial bundle from 139 kB to 917 kB, so it is fetched on the first
export instead. That makes the export functions async, which is why they run
through `usePdfExport`: the first click has a visible delay worth a busy state,
and a chunk fetch can fail on a poor connection and needs somewhere to report it.

PDFs are deliberately print-oriented — black on white, no brand fills, no images.
A plan gets taken to a gym or a supermarket, often printed on a mono printer, and
the app's dark theme would waste ink and read badly.

**Two failure modes were made visible.** A render error anywhere unmounted the
whole React tree and left a blank page; `ErrorBoundary` now wraps the routes —
inside `<main>`, so the navbar survives — keyed on the pathname, so leaving a
screen that threw clears the error. And a free-tier cold start (30–60 s) exceeded
the 20 s axios timeout, surfacing as "Cannot reach the FitGen server"; the timeout
is now 75 s, and a request in flight beyond 4 s shows a "waking the server"
indicator. Endpoints that are slow *by design* (generation, chat) are excluded, so
the message never misexplains an ordinary AI wait.

</details>

---

## Tech stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite 8, Tailwind CSS v4, React Router 7 |
| **Forms** | React Hook Form |
| **Charts** | Recharts (lazy-loaded) |
| **PDF** | jsPDF (loaded on first export) |
| **Icons** | lucide-react |
| **HTTP** | axios |
| **Auth (client)** | `@react-oauth/google` — Google Identity Services token flow |
| **Backend** | Node 20, Express 4 (ESM), Mongoose 8 |
| **Validation** | zod |
| **Auth (server)** | `google-auth-library`, jsonwebtoken |
| **Hardening** | helmet, cors, morgan, express-rate-limit |
| **Database** | MongoDB Atlas — 8 collections |
| **AI** | Groq API, `openai/gpt-oss-120b` (free tier, optional) |
| **Retrieval** | TF-IDF + cosine similarity, implemented in-project |
| **Voice** | Web Speech API (browser-native) |
| **Exercise data** | `free-exercise-db`, seeded into MongoDB |
| **Tests** | Node's built-in test runner + `mock.module` |

No Passport.js (the token flow doesn't need it), no Nodemailer (no email
authentication), no embeddings service (Groq has none), and no vector database.

---

## Repository layout

```
fitgen/
├── client/                        React 19 + Vite + Tailwind v4  → Vercel
│   ├── src/
│   │   ├── pages/                 15 route components
│   │   ├── components/            15 shared components
│   │   ├── context/               AuthContext
│   │   ├── hooks/                 speech recognition, PDF export
│   │   └── lib/                   api client, PDF generators
│   └── tests/                     PDF generation suite
│
├── server/                        Node + Express + Mongoose      → Render
│   ├── src/
│   │   ├── routes/                54 route definitions
│   │   ├── controllers/           request handling
│   │   ├── services/              13 services — the actual logic
│   │   ├── models/                8 Mongoose schemas
│   │   ├── validation/            zod schemas
│   │   ├── middleware/            auth, RBAC, error handling
│   │   ├── data/                  curated foods + knowledge base
│   │   └── seed/                  seeders
│   └── tests/                     13 suites
│
├── README.md                      ← you are here
├── SETUP.md                       installation and setup
├── FitGen_Project_Report.md       full project report
├── google-clientid-steps.txt      OAuth walkthrough
└── seed_steps.txt                 seeding, incl. production
```

The business logic lives in `server/src/services/` — controllers stay thin, so
every service is unit-testable without HTTP or a database.

---

## API reference

Base URL `/api`. All routes except `/health` and `/auth/google` require
`Authorization: Bearer <jwt>`.

### Auth

| Method | Route | Role | Purpose |
|---|---|---|---|
| GET | `/health` | — | Liveness + DB state (health check) |
| POST | `/auth/google` | — | Exchange a Google ID token for a FitGen JWT |
| GET | `/auth/me` | user | Rehydrate the session |
| POST | `/auth/logout` | user | Acknowledge sign-out |

### Profile and targets

| Method | Route | Role | Purpose |
|---|---|---|---|
| GET | `/profile` | user | Stored profile + computed targets + completeness |
| GET | `/profile/options` | user | Wizard vocabulary (equipment from the seeded DB) |
| POST | `/profile/targets/preview` | user | Compute targets **without saving** |
| PUT | `/profile/onboarding` | user | Complete the wizard |
| PATCH | `/profile` | user | Partial edit; returns `changedFields` |
| POST | `/profile/regeneration/acknowledge` | user | Clear the stale-plan flag |

### Plans

| Method | Route | Role | Purpose |
|---|---|---|---|
| GET | `/plans/status` | user | What plans exist, whether they're stale, is AI available |
| POST | `/plans/workout/generate` | user | Generate a workout split |
| GET | `/plans/workout` | user | Active workout plan |
| GET | `/plans/workout/history` | user | Previous versions (newest first) |
| GET | `/plans/workout/:id` | user | One version, read-only, owner-scoped |
| POST | `/plans/diet/generate` | user | Generate a diet plan |
| GET | `/plans/diet` | user | Active diet plan |
| GET | `/plans/diet/history` | user | Previous versions (newest first) |
| GET | `/plans/diet/:id` | user | One version, read-only, owner-scoped |
| POST | `/plans/diet/meals/:order/swap` | user | Regenerate one meal in place |
| GET | `/plans/diet/grocery` | user | Grocery list (`days`, `format=text`) |

### Logging and progress

| Method | Route | Role | Purpose |
|---|---|---|---|
| POST | `/logs/workout` | user | Log a session (slugs validated against the DB) |
| GET | `/logs/workout` | user | Session history |
| GET | `/logs/workout/:id` | user | One session, owner-scoped |
| DELETE | `/logs/workout/:id` | user | Delete a session |
| POST | `/logs/progress` | user | Body check-in; upserts by day, estimates body fat |
| GET | `/logs/progress` | user | Check-in history |
| DELETE | `/logs/progress/:id` | user | Delete a check-in |
| GET | `/logs/progression/:dayIndex` | user | Next prescription per exercise for a plan day |
| GET | `/logs/dashboard` | user | Everything the progress dashboard renders |
| GET | `/logs/achievements` | user | Consistency score + badges, derived on read |

### Coach

| Method | Route | Role | Purpose |
|---|---|---|---|
| POST | `/chat` | user | Ask the coach (safety → retrieval → grounded generation) |
| GET | `/chat/meta` | user | Scope, starters, knowledge-base size, AI availability |
| GET | `/chat/knowledge` | user | Browse the corpus the coach may use |
| GET | `/chat/history` | user | Conversation history with retrieval traces |
| GET | `/chat/sessions` | user | Conversation list |
| DELETE | `/chat/history` | user | Clear one session, or all |

### Libraries

| Method | Route | Role | Purpose |
|---|---|---|---|
| GET | `/exercises` | user | List + filter (`muscle`, `equipment`, `level`, `category`, `search`, `page`, `limit`) |
| GET | `/exercises/filters` | user | Distinct values for building filter UI |
| GET | `/exercises/:slug` | user | Single exercise |
| GET | `/foods` | user | List + filter (`category`, `dietTag`, `search`, `limit`) |
| GET | `/foods/:slug` | user | Single food |

### Admin

| Method | Route | Role | Purpose |
|---|---|---|---|
| GET | `/admin/stats` | **admin** | Aggregate analytics |
| GET | `/admin/users` | **admin** | User roster — identity and status only |
| PATCH | `/admin/users/:id/role` | **admin** | Grant or revoke the admin role |
| GET | `/admin/users/:id/role-history` | **admin** | Role-change audit trail |
| POST | `/admin/exercises` | **admin** | Create an exercise |
| PATCH | `/admin/exercises/:slug` | **admin** | Edit an exercise (slug immutable) |
| DELETE | `/admin/exercises/:slug` | **admin** | Delete — refused while referenced |
| GET | `/admin/exercises/:slug/usage` | **admin** | Reference counts, checked before deleting |
| POST | `/admin/foods` | **admin** | Create a food |
| PATCH | `/admin/foods/:slug` | **admin** | Edit a food (slug immutable) |
| DELETE | `/admin/foods/:slug` | **admin** | Delete — refused while referenced |
| GET | `/admin/foods/:slug/usage` | **admin** | Reference counts, checked before deleting |

`/admin/stats` returns counts and distributions only. Reading an individual
user's profile, plans or logs is **not** an admin capability — that boundary is a
deliberate RBAC design point, so keep it when extending the admin panel.

---

## Testing

**578 assertions across 14 suites.**

```bash
cd server
npm test                   # all thirteen server suites — 564 assertions
npm run test:calc          # 35 · BMR/TDEE/macro maths, no DB or network needed
npm run test:progression   # 50 · overload, deload, streaks, Navy body fat (pure)
npm run test:retrieval     # 63 · retrieval quality and off-topic rejection (pure)
npm run test:auth          # 20 · auth + RBAC integration
npm run test:profile       # 44 · profile/onboarding integration
npm run test:budget        # 14 · prompt token budgets vs Groq's TPM cap
npm run test:grounding     # 35 · adversarial: injected LLM fabrications
npm run test:chat          # 54 · safety triage, RAG grounding, chat endpoints
npm run test:generation    # 46 · generation engines, incl. live Groq
npm run test:plans         # 49 · plan endpoints, versioning, history, ownership
npm run test:logs          # 53 · logging, progression, check-ins, dashboard
npm run test:adminusers    # 32 · role management: RBAC, guards, audit, privacy
npm run test:phase6        # 69 · content CRUD, grocery lists, gamification

cd client
npm test                   # 14 · PDF generation, pagination, partial plans
```

**What the suites are actually for**

`test:grounding` is the one that matters most to the project's central claim. It
stubs the LLM and injects hostile output — see
[Proving grounding actually defends](#subsystems-in-detail).

`test:generation` runs both engines twice — once with the deterministic fallback
forced, once against the live Groq API (auto-skipped without `GROQ_API_KEY`).
Every exercise and food slug in a generated plan is checked to exist in the
seeded database, and the injury/equipment/diet/allergy constraints are
re-verified against the DB rather than trusted.

`test:plans` uses `forceFallback` so it runs fast without consuming Groq rate
limit, and covers what service tests can't: routing, plan versioning, stale
detection, and the regeneration-flag lifecycle — including that rebuilding only
*one* of the two plans must **not** clear the flag.

`test:calc` is pure: BMR against hand-computed values, macros reconciling with
the calorie target, percentages summing to 100, no macro going negative under an
extreme deficit, safety floors binding *and disclosing themselves*, and identical
inputs always producing identical output.

The **client** suite builds real PDFs under Node with `save()` stubbed, asserting
byte output and page count. Worth a suite because the generators walk deeply
nested plan objects where the characteristic failure is a `TypeError` on an
optional branch — it found exactly that: `variance` has no schema default, so a
diet plan lacking it crashed the whole export. Pagination is asserted too, since
jsPDF has no flow layout and overrunning text is written off the bottom of the
page without erroring.

The integration suites stub **only** Google's signature verification, so routing,
validation, user upsert, JWT issuing, RBAC and change detection are all genuinely
exercised. Every suite creates and deletes its own throwaway accounts, and any
that needs an administrator promotes one directly in the database — so none
depend on your configuration. Where a suite counts administrators it scopes the
count to its own accounts, since the database is shared with your real user.

> Point `MONGO_URI` at a development database, not production.

---

## Design notes

The UI commits to a single dark, high-contrast theme — gym apps are used in low
light, and the volt accent reads as athletic rather than clinical. Type pairs
Anton (condensed poster face, headlines only) with Inter for anything that has to
be read.

Responsiveness uses fluid `clamp()` display type and a shared `.shell` gutter
rather than a breakpoint per size, so layouts hold between the standard stops.
Reduced-motion preferences are respected, focus rings are visible for keyboard
users, and interactive controls carry `aria-pressed` / `aria-expanded` state.

### Chart colours were computed, not chosen by eye

Palettes were selected by running a colourblind-safety validator, and the results
changed the design:

- The **2-colour pair** for lean/fat composition passes every check on *all*
  pairs (worst CVD ΔE 24.8).
- The **3-colour macro palette** passes only on *adjacent* pairs — green and
  orange collapse under deuteranopia (ΔE 2.5). Acceptable for a stacked bar whose
  segments touch and carry direct labels, and it is why **no multi-line chart
  uses three hues**.
- A **5-colour set could not be made safe** inside the dark lightness band at
  all. So multi-metric views are **faceted into single-series small multiples**
  rather than stacking hues. Measurements also differ in magnitude (waist ~86 cm
  vs arm ~36 cm), so one shared axis would have misread regardless.

Every chart ships a "View as table" disclosure, so no information is colour- or
vision-dependent.

---

## Known limitations

Stated plainly here; justified in full in
[`FitGen_Project_Report.md`](FitGen_Project_Report.md) §9.

| Limitation | Detail |
|---|---|
| **Not medically reviewed** | The injury-filtering rules were authored from general training knowledge. No physiotherapist or clinician has reviewed them. The app displays a "not medical advice" disclaimer. |
| **Nutrition data unverified against sources** | The 129 foods are attributed to USDA FoodData Central and IFCT but were transcribed, not programmatically retrieved. The seeder checks internal consistency (4/4/9 arithmetic) — which cannot catch a value that is wrong but self-consistent. |
| **Knowledge base is authored, not cited** | The 38 entries reflect mainstream evidence-based practice (ISSN, ACSM, well-replicated meta-analyses) but are not individually citation-backed and no subject-matter expert has reviewed them. |
| **Retrieval is lexical, not semantic** | TF-IDF matches words, not meaning. A paraphrase using entirely different vocabulary can miss. Mitigated by alternate phrasings, a synonym map and stemming; measured on 63 tests. |
| **One invented constant** | Mifflin–St Jeor defines no sex constant for users selecting "other". The midpoint (−78) is used and **disclosed to the user** in every computed target. |
| **Sign-out is client-side** | JWTs are stateless with no server denylist, so a token stays valid until it expires (7 days). |
| **No browser verification** | The UI was built to a responsive system and reviewed in code, but has not been confirmed in a browser across device widths. Three real interface defects were found only by using the app — none would have been caught by any automated check. |
| **Not deployed** | Deployment steps are written, but the app has not been deployed. |

---

*FitGen — AI Smart Workout & Macro Diet Generator*
