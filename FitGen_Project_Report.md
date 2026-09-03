# FitGen — AI Smart Workout & Macro Diet Generator

**Project Report**

---

## At a glance

| | |
|---|---|
| **Project** | FitGen — adaptive AI fitness planning platform |
| **Status** | All planned features implemented and verified |
| **Verification** | 578 automated assertions across 14 test suites |
| **Architecture** | React SPA + Node/Express REST API + MongoDB Atlas |
| **AI provider** | Groq (`openai/gpt-oss-120b`), free tier — optional at runtime |
| **Core principle** | AI personalises; verified data and deterministic formulas supply every fact and figure |
| **Seeded data** | 876 exercises · 129 foods · 38 knowledge-base entries |
| **Deployment** | Steps written; not yet deployed |

**Companion documents**

| Document | Contents |
|---|---|
| [`README.md`](README.md) | What the system does, how it works, API reference |
| [`SETUP.md`](SETUP.md) | Installation, seeding, administrator and user setup |
| [`google-clientid-steps.txt`](google-clientid-steps.txt) | Google OAuth client-ID walkthrough |
| [`seed_steps.txt`](seed_steps.txt) | Seeding procedure, including production |

---

## Contents

| § | Section |
|---|---|
| 1 | [Project Overview](#1-project-overview) |
| 2 | [Tech Stack](#2-tech-stack) |
| 3 | [System Architecture Principle](#3-system-architecture-principle) |
| 4 | [Authentication & Authenticity Strategy](#4-authentication--authenticity-strategy) |
| 5 | [Priority Features](#5-priority-features-must-have--core-scope) |
| 6 | [List of AI Features](#6-list-of-ai-features) |
| 7 | [Phase-Wise Feature Roadmap](#7-phase-wise-feature-roadmap) |
| 8 | [Explicitly Excluded Features](#8-explicitly-excluded--deprioritized-features-with-reasoning) |
| 9 | [Assumptions, Deviations & Limitations](#9-assumptions-deviations--limitations) |
| 10 | [Viva / Presentation Talking Points](#10-vivapresentation-talking-points) |
| 11 | [MongoDB Collections](#11-mongodb-collections) |

**Section 9 in detail** — the analytical core of this report:

| § | Subject |
|---|---|
| 9.1 | [Deviations from the original specification](#91-deviations-from-the-original-specification) |
| 9.2 | [Deterministic calculation parameters](#92-deterministic-calculation-parameters) |
| 9.3 | [Injury-filtering logic — the most significant assumption](#93-injury-filtering-logic--the-most-significant-assumption) |
| 9.4 | [Nutrition data provenance](#94-nutrition-data-provenance) |
| 9.5 | [Training-structure assumptions](#95-training-structure-assumptions) |
| 9.6 | [Diet-generation assumptions](#96-diet-generation-assumptions) |
| 9.7 | [Progression and body-composition assumptions](#97-progression-and-body-composition-assumptions) |
| 9.8 | [Data-visualisation constraints](#98-data-visualisation-constraints) |
| 9.9 | [Chatbot and retrieval assumptions](#99-chatbot-and-retrieval-assumptions) |
| 9.10 | [Architecture and security trade-offs](#910-architecture-and-security-trade-offs) |
| 9.11 | [External dependency assumptions](#911-external-dependency-assumptions) |
| 9.12 | [Content management, gamification and export assumptions](#912-content-management-gamification-and-export-assumptions) |
| 9.13 | [Verification status](#913-verification-status) |

---

## 1. Project Overview

FitGen is an adaptive fitness planning web platform that generates personalized workout routines and macro-based diet plans using AI, tailored to a user's fitness goals, dietary restrictions, available equipment, and injury history. The system combines deterministic fitness science (TDEE/BMR formulas, progressive overload logic) with AI-driven personalization (Groq LLM), grounded in a verified exercise and food database to prevent hallucinated or unsafe recommendations.

**Core problem solved:** Generic workout/diet plans found online don't adapt to an individual's equipment, injuries, or changing goals. FitGen auto-generates and re-generates plans as the user's situation changes, backed by a real exercise/food database and an AI chatbot for ongoing guidance.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React.js (Vite) + Tailwind CSS |
| Charts/Data Viz | Recharts *(Phase 4)* |
| Forms | React Hook Form |
| Backend | Node.js + Express.js (+ `zod` validation) |
| Database | MongoDB Atlas (Mongoose ODM) |
| Authentication | JWT + Google OAuth 2.0 (`@react-oauth/google` + `google-auth-library`; Passport.js not required for the token flow) |
| AI / LLM | Groq API (`openai/gpt-oss-120b`) — free tier · *Llama 3.x retired by Groq, see §9.1* |
| Email / SMTP | *None. Google OAuth is the only sign-in method, so there is no verification mail, no reset mail and no Nodemailer dependency — see §4 and §9.1* |
| PDF Export | jsPDF *(Phase 6)* |
| Voice Input | Web Speech API (browser-native) *(Phase 5)* |
| Exercise Data Source | Open-source `free-exercise-db` (seeded into MongoDB) |
| Hosting (suggested) | Vercel/Netlify (frontend) + Render/Railway (backend) + MongoDB Atlas |

---

## 3. System Architecture Principle

**Hybrid AI + Verified Data Model** (key differentiator):

- **Static/factual data** (exercise names, muscle groups, video demo links, food nutrition values) → pre-seeded in MongoDB from a verified dataset. AI never invents this data, avoiding hallucinated exercises or broken video links.
- **Personalization/decision logic** (which exercises to combine, sets/reps/rest, meal composition, progression) → generated by Groq, constrained to only select from the verified database (RAG-style grounding).
- **Deterministic calculations** (TDEE, BMR, macro split, body fat estimate) → computed via standard formulas (Mifflin-St Jeor), not AI, for accuracy and consistency.

This split is a strong viva talking point: AI is used where it adds personalization value, not as a blind wrapper around ChatGPT.

---

## 4. Authentication & Authenticity Strategy

- **Sole method:** Google OAuth 2.0 sign-in — authenticity guaranteed by Google's own verification, with no passwords stored, transmitted or reset anywhere in the system. The browser obtains an ID token from Google; the server verifies its signature and `aud` claim before issuing a FitGen JWT, so no client secret or redirect URI is needed.
- **Why only one method:** a self-managed email/password path would add password hashing, a reset flow, an email-verification token and an SMTP dependency — a meaningful attack surface and operational burden for no gain in authenticity, since Google has already verified the address. `authProvider` is stored on the user schema, so adding a second provider later is additive rather than a rewrite. *(This was a deviation from the initial brief — see §9.1.)*
- **Roles:** `user` (default) and `admin` (assigned to project owner only) via RBAC middleware — admin manages exercise/food database and views aggregate analytics; cannot see individual users' private data by default.

---

## 5. Priority Features (Must-Have — Core Scope)

| # | Feature | Status | Notes on delivery |
|---|---|---|---|
| 1 | Auth: Google OAuth 2.0 only — no passwords, no email verification flow | Delivered | Token flow with server-side signature and `aud` verification |
| 2 | Onboarding wizard (one-time): basics, goals, equipment, dietary restrictions, injury history | Delivered | Six steps, with a live target preview before saving |
| 3 | Editable profile/settings (ongoing), triggering plan regeneration | Delivered | Only *plan-relevant* changes flag plans stale; the changed fields are named |
| 4 | TDEE + BMR calculator with auto macro split | Delivered | Mifflin–St Jeor; deterministic, with disclosed safety floors |
| 5 | AI workout split generator (PPL / Upper-Lower / Bro-split / Full Body), grounded in the exercise DB | Delivered | 1–7 training days; deterministic fallback engine when the LLM is unavailable |
| 6 | AI diet plan generator respecting macros + restrictions, grounded in the food DB | Delivered | Three-pass deterministic portion scaling; residual variance disclosed |
| 7 | Exercise library with filters and demo links | Delivered | 876 records. Demo links are YouTube **search** URLs — see §9.1 |
| 8 | Workout logging with progressive overload auto-adjustment | Delivered | Double progression, auto-deload, stall reset; session history with delete |
| 9 | Progress dashboard: weight/measurement logs, charts over time | Delivered | Recharts, lazy-loaded; colourblind-validated palettes (§9.8) |
| 10 | RAG-based AI gym chatbot | Delivered | 38-entry corpus, TF-IDF retrieval (§9.9), safety triage, voice input |
| 11 | Admin panel: manage exercise/food DB, aggregate analytics (RBAC-protected) | Delivered | Full CRUD with slug immutability and reference-checked deletion (§9.12) |

Beyond the must-have scope, three items were added during implementation because
their absence was a defect rather than a missing feature: a **deterministic
fallback engine** for both generators, **plan versioning with history**, and
**session history with deletion** (without which a mistyped log permanently
skewed every derived figure).

---

## 6. List of AI Features

| # | AI Feature | Purpose | Approach as planned | Approach as built |
|---|---|---|---|---|
| 1 | Workout Split Generator | Weekly plan from goal, split type, equipment, injuries | Groq (Llama 3.x), constrained JSON, grounded to exercise DB | **Groq `openai/gpt-oss-120b`** (§9.1), constrained JSON, grounded. One batched call per unique session. |
| 2 | Diet Plan Generator | Meal plan matching macro targets + restrictions | Groq, constrained JSON, grounded to food DB | As planned. Portions then scaled **deterministically** — the model's own numbers are never persisted. |
| 3 | Meal Swap / Regeneration | Replace one meal, keeping daily macros intact | Groq, single-meal prompt | As planned. Totals and variance recomputed server-side after the swap. |
| 4 | RAG Gym Chatbot | Grounded answers on supplements, form, recovery | Groq + retrieval (neural embeddings, or Atlas Vector Search) | Groq + **TF-IDF sparse vectors with cosine similarity** — Groq exposes no embeddings endpoint (§9.9). |
| 5 | Injury-Aware Substitution | Exclude unsafe exercises per injury history | Groq (rule-guided prompt) + DB filtering | **Rule-based only — no LLM.** Filtering runs *before* generation, so an unsafe exercise is never among the model's options. Safety is a guarantee, not a prompt. |
| 6 | Adaptive Progression Logic | Adjust intensity from logged performance | Rule-based + Groq-assisted recommendation | **Rule-based only — no LLM.** Identical logs must always yield an identical recommendation; a non-deterministic load suggestion is a safety and trust problem. |
| 7 | Voice Input to Chatbot | Hands-free question entry | Web Speech API (browser-native, not Groq) | As planned. Mic hidden rather than shown-and-broken where unsupported. |

**Two planned AI features were deliberately built without AI.** Features 5 and 6
concern physical safety and load prescription, where reproducibility matters more
than flexibility — so both are deterministic rule engines. This narrows the LLM's
role to four features (1–4), and in each of those its output passes through a
grounding stage that discards anything not present in the verified database.

---

## 7. Phase-Wise Feature Roadmap

The plan as scheduled, over twelve weeks. **All six phases were completed.**
Where the delivered work diverged from the line item, §9 records why.

### Phase 1 — Foundation (Weeks 1–2)
- Project setup (MERN boilerplate, MongoDB Atlas, Groq API keys)
- Auth system: Google OAuth 2.0 (token flow, server-side verification)
- User schema, role-based access (user/admin)
- Seed exercise DB (`free-exercise-db`) and food/nutrition DB into MongoDB

### Phase 2 — Onboarding & Core Calculations (Weeks 3–4)
- Multi-step onboarding wizard (basic info → goals → equipment → diet → injuries)
- TDEE/BMR calculator + macro split logic
- Editable profile/settings page with regeneration triggers

### Phase 3 — AI Generation Engines (Weeks 5–6)
- Groq prompt templates for workout split generation (JSON schema-constrained)
- Groq prompt templates for diet plan generation (JSON schema-constrained)
- Exercise/food DB grounding logic (validate AI output against real DB)
- Injury-aware substitution logic

### Phase 4 — Logging & Progress (Weeks 7–8)
- Workout logging (sets/reps/weight performed)
- Progressive overload / auto-deload logic
- Progress dashboard with Recharts (weight, measurements, streaks)
- Body fat % estimator (Navy method)

### Phase 5 — AI Chatbot / RAG (Weeks 9–10)
- Curate fitness knowledge base (supplements, form, recovery FAQs)
- Build embedding + retrieval pipeline
- Integrate Groq for RAG-based chatbot responses
- Add voice input (Web Speech API)

### Phase 6 — Admin Panel & Polish (Weeks 11–12)
- Admin panel: manage exercises/foods, view analytics
- PDF export (workout/diet plan) via jsPDF
- Grocery list generator from weekly meal plan
- Gamification: streaks, badges, consistency score
- UI polish, responsive design, final testing

### Delivery summary

| Phase | Outcome | Test coverage |
|---|---|---|
| 1 — Foundation | Delivered | `test:auth` (20) |
| 2 — Onboarding & calculations | Delivered | `test:calc` (35) · `test:profile` (44) |
| 3 — AI generation | Delivered, plus an unplanned deterministic fallback engine | `test:generation` (46) · `test:grounding` (35) · `test:plans` (49) · `test:budget` (14) |
| 4 — Logging & progress | Delivered | `test:progression` (50) · `test:logs` (53) |
| 5 — AI chatbot / RAG | Delivered with lexical rather than neural retrieval (§9.9) | `test:retrieval` (63) · `test:chat` (54) |
| 6 — Admin panel & polish | Delivered | `test:adminusers` (32) · `test:phase6` (69) · client PDF suite (14) |

Total: **578 assertions across 14 suites.** The one line item not closed by an
automated check is "UI polish, responsive design" — built to a responsive system
and reviewed in code, but never confirmed in a browser (see §9.13).

---

## 8. Explicitly Excluded / Deprioritized Features (with Reasoning)

| Feature | Reason for Exclusion |
|---|---|
| Wearable device sync | No real hardware integration possible without paid APIs; manual entry adds complexity for low payoff — covered instead by existing Activity Level dropdown in TDEE formula |
| Social feed (follow + PR sharing) | Adds a full mini social-network scope (follow system, feed, privacy rules) unrelated to the AI/fitness core story. PDF export of plans covers the practical need to take something away from the app |
| Shareable image export of PRs (html2canvas) | Was a stretch goal; dropped. PDF export already covers taking a plan out of the app, and an image export exists only to feed the social sharing that is itself out of scope |
| "Check-in" nudge prompts for stale profile data | Was a stretch goal; dropped. The staleness signal it would have driven is already surfaced directly on the plan pages, which is where a regeneration decision is actually made |
| Phone OTP verification | Requires paid SMS gateway (Twilio/MSG91); email verification + Google OAuth achieve the same authenticity goal for free |
| Two-Factor Authentication | Overkill for project scope; mentioned as "future scope" in report |

---

## 9. Assumptions, Deviations & Limitations

This section records every judgement call made during implementation that is not
derivable from the specification above. It is stated explicitly so that the
boundary between *verified fact*, *reasoned convention*, and *unverified
assumption* is auditable rather than implicit.

### 9.1 Deviations from the original specification

| Area | Specified | Implemented | Reason |
|---|---|---|---|
| Authentication | Google OAuth **+** email/password with Nodemailer verification | Google OAuth **only** | Project decision taken before Phase 1 began. Removes password storage, reset flows and an SMTP dependency. `authProvider` remains on the user schema, so a second provider is additive. Sections 2, 4, 5 and 7 above have been updated to describe the OAuth-only design that was actually built; this row is the record of what the initial brief asked for. |
| LLM | Groq — Llama 3.1 / 3.3 | Groq — `openai/gpt-oss-120b` | Groq retired the Llama 3.x models from its serving catalogue during development. Verified against the live `/models` endpoint. Configurable via `GROQ_MODEL`. |
| Exercise demo media | "Real video demo links" | A YouTube **search** URL per exercise | The `free-exercise-db` dataset ships step photographs, not hosted video. Generating a search query is honest and always resolves; fabricating video URLs would violate the project's own no-hallucination principle. |
| Server-side validation | Not specified | `zod` added | A multi-field profile payload needs a real validation boundary, since the client's own validation is only a UX affordance. |
| Fallback generation | Not specified | A deterministic rule-based engine backs both AI generators | Unrequested scope, added so plan generation degrades rather than fails when the LLM is unavailable or rate-limited. |

### 9.2 Deterministic calculation parameters

The formulas themselves are published (Mifflin–St Jeor for BMR; standard PAL
multipliers for TDEE). The **parameter values applied on top of them** are
reasoned choices drawn from mainstream sports-nutrition practice, not values
prescribed by a single cited source:

| Parameter | Value used |
|---|---|
| Activity multipliers | 1.2 / 1.375 / 1.55 / 1.725 / 1.9 |
| Goal calorie shift | −20% fat loss · −5% recomposition · 0% maintain · +8% strength · +12% muscle |
| Protein target | 2.2 g/kg cutting · 2.2 recomposition · 1.8 building · 1.8 strength · 1.6 maintaining |
| Fat target | 25% of calories, floor 0.6 g/kg (absolute floor 0.4 g/kg) |
| Minimum carbohydrate | 50 g/day |
| Calorie safety floors | 1500 kcal male · 1200 female · 1350 unspecified; never below 90% of BMR |
| Weight-change projection | 7700 kcal ≈ 1 kg body mass |
| Hydration target | 35 ml per kg bodyweight |
| Accepted age range | 13–100 years |

**One value has no published basis.** The Mifflin–St Jeor equation applies a
sex-dependent constant (+5 male, −161 female) and offers none for users who
select "other". The implementation uses the **midpoint (−78)**. This is an
invention, not a citation. The application discloses it to the user in the
`assumptions` field of every computed target rather than presenting the figure
as authoritative.

**BMI is reported but is a weak metric** for muscular individuals, since it
cannot distinguish lean mass from fat mass. It is shown as context only and is
not an input to any plan decision. The Navy-method body-fat estimate scheduled
for Phase 4 is the better measure.

### 9.3 Injury-filtering logic — the most significant assumption

The injury-aware substitution system maps each user-declared injury area onto
the muscle vocabulary used by the seeded exercise database, then filters
candidates by severity **before** the language model receives them.

**This mapping and its severity policy were authored from general training
knowledge. They have not been reviewed by a physiotherapist, clinician, or any
published rehabilitation protocol.**

The policy applied:

| Severity | Behaviour |
|---|---|
| `severe` | Exercise excluded if the injured area's muscles appear as **primary or secondary** movers; additionally excludes heavy barbell compound movements for spinal areas (axial loading) |
| `moderate` | Excluded if those muscles are **primary** movers |
| `mild` | Retained, with a caution note attached advising reduced load |

The design is deliberately **conservative — it over-excludes rather than
under-excludes.** A consequence is that a severe lower-limb injury can eliminate
every exercise a training day targets; the generator then substitutes a session
built from whatever remains safe and relabels it, or schedules active recovery
if nothing qualifies.

The application displays a "does not provide medical advice" disclaimer at the
point of sign-in, and on every exported plan.

### 9.4 Nutrition data provenance

The 129-entry food database was curated by hand and is attributed to USDA
FoodData Central and the Indian Food Composition Tables. **The values were
transcribed rather than programmatically retrieved from those sources, and no
individual entry has been verified against them.**

The seeder validates each record's internal consistency — that stated calories
fall within a plausible range of the 4/4/9 kcal macro arithmetic, accounting for
the fact that reference sources differ over whether fibre is counted in
carbohydrate. This check catches transcription errors of magnitude (a decimal
place, a swapped field). **It cannot detect a value that is wrong but internally
consistent.**

Verifying the dataset against its cited sources is outstanding work.

### 9.5 Training-structure assumptions

- **Weekly split shapes** (which day trains which muscle groups, and the day
  ordering for each training frequency) are treated as settled convention and
  computed rather than generated. The specific muscle groupings and sequences
  are the author's.
- **Repeated day types share an identical session.** In a six-day
  Push/Pull/Legs week, day 1 and day 4 prescribe the same exercises. This
  mirrors standard practice, where progression occurs across weeks rather than
  within one, but generating distinct variants was a viable alternative.
- **Volume prescriptions** (4–6 exercises per session; sets, reps and rest by
  goal) follow common hypertrophy and strength guidelines.
- **Cardio and stretching entries are excluded** from prescribed resistance
  work. Only the `strength`, `powerlifting`, `olympic weightlifting` and
  `strongman` categories are eligible.

### 9.6 Diet-generation assumptions

- **A plan covers one day**, intended to be repeated, rather than a full week of
  distinct days. The specification does not state which.
- **Per-meal calorie shares** are fixed by meal count (30/40/30 for three meals,
  and so on) rather than optimised.
- **Portion scaling is bounded**: every portion stays within 10–600 g and no
  meal is scaled beyond roughly 2×, which prevents nonsensical prescriptions at
  the cost of not always reaching a target exactly.
- **Only foods above 12 g protein per 100 g are trimmed** when protein
  overshoots. Whole foods that merely contain protein — yogurt, rice, roti,
  vegetables — are left intact, on the reasoning that reducing a portion of rice
  to satisfy a protein figure produces a worse meal. The consequence is a floor:
  where much of a day's protein comes from sub-threshold foods, protein settles
  slightly above target and stops.
- Any residual difference between a plan and its targets is stored and displayed
  to the user rather than concealed.

### 9.7 Progression and body-composition assumptions

The progression *decision* is deterministic and follows standard double
progression. The **thresholds and increments are reasoned choices**, in the same
category as the calculation parameters in 9.2:

| Parameter | Value used |
|---|---|
| Load increment | Barbell compound 5 kg (lower body) / 2.5 kg · dumbbell 2 kg per hand · machine 5 kg / 2.5 kg · cable 2.5 kg |
| Deload trigger | Below the rep range on 2 consecutive sessions |
| Deload size | 10% of current load, snapped to a liftable step |
| Stall trigger | Volume flat (within 3%) across 3 consecutive sessions |
| Streak definition | Consecutive **weeks** meeting planned frequency, not consecutive days |
| Estimated 1RM | Epley formula, `weight × (1 + reps/30)` |

**Estimated 1RM is calculated, never tested.** Epley is a widely used
approximation that drifts at high rep counts; it is presented as a trend
indicator for personal records rather than a true maximum.

**The Navy body-fat method is a circumference regression** fitted to a military
population. It tracks an individual's trend usefully and is noticeably less
reliable as an absolute figure — the UI states this. Users who select "other"
are estimated with the male formula, since the method defines no third variant,
and this is disclosed with the result. The estimate is stored with the height
and sex used, so historical values remain reproducible if the profile changes.

**A weigh-in updates the profile weight but does not bump `profileVersion`.**
Calorie targets therefore follow the user's current weight, while plans are not
flagged stale on every check-in — which would otherwise make the staleness
signal meaningless.

### 9.8 Data-visualisation constraints

Chart palettes were selected by running a colourblind-safety validator rather
than by visual judgement, and the measured results changed the design:

- The two-colour pair used for the lean/fat composition chart passes every check
  on all pairs.
- The three-colour macro palette passes only on *adjacent* pairs — green and
  orange are nearly indistinguishable under deuteranopia. This is acceptable for
  a stacked bar with touching, directly-labelled segments, and is the reason no
  multi-line chart in the application uses three hues.
- A five-colour categorical set could not be made colourblind-safe within the
  dark-surface lightness band. Multi-metric views are therefore **faceted into
  single-series small multiples** rather than differentiated by hue.

Every chart also provides the same data as a table, so no information depends on
colour perception.

### 9.9 Chatbot and retrieval assumptions

**Retrieval is lexical, not neural.** The specification suggests "embeddings +
cosine similarity". Groq exposes no embeddings endpoint (verified against the
live API), and a local neural embedding model would add roughly 100 MB and a
substantial cold start on a free-tier host. The implementation therefore uses
**TF-IDF term vectors with cosine similarity** — classical sparse embeddings
rather than dense neural ones. This matches the specification's wording in the
information-retrieval sense but not in the sense usually meant today, and the
distinction is material: lexical retrieval matches words, not meaning, so a
paraphrase using entirely different vocabulary can miss. Alternate question
phrasings, a domain synonym map and suffix stemming mitigate this, and 63 tests
assert the expected entry ranks first for realistic phrasings.

**A single-term match is treated as coincidence, not relevance.** An early
version matched the query "Who won the 1998 World Cup?" against the free-weights
entry, because that entry contains the phrase "real-world". Retrieval now
requires overlap on two or more distinct query terms, with a higher score
threshold as an escape hatch for genuinely one-word queries.

**The knowledge base is a code-versioned data file, not a database
collection.** The specification lists `chatHistory` among the collections but no
knowledge collection. Keeping the corpus in source control is a deliberate
strengthening of the grounding guarantee: the set of things the assistant may
say is reviewed in version control and cannot be altered at runtime.

**Knowledge-base content is authored, not systematically sourced.** The 38
entries reflect mainstream evidence-based practice — ISSN position stands, ACSM
guidance and well-replicated meta-analyses — and are deliberately conservative
where evidence is mixed. **They are not individually citation-backed, and no
subject-matter expert has reviewed them.** This is the same category of
limitation as the nutrition data in 9.4.

**Safety triage is pattern-based, not a classifier.** Medical, emergency,
medication, pregnancy, minor-age and disordered-eating questions are refused
before retrieval runs. Patterns match intent phrases rather than bare keywords,
because words like "chest" and "pain" are ordinary gym vocabulary and blocking
them would make the assistant unusable. A rule-based filter will inevitably miss
some unusual phrasings; the grounded-generation stage provides a second layer,
since the corpus contains no medication or diagnostic content to answer from.

**Conversation history is retained for 90 days, then deleted automatically.**
A MongoDB TTL index prunes the `chatHistory` collection. Storage is not
optional: follow-up questions work by reading prior turns back from the
database, so removing it would break conversational context. The window is
bounded and disclosed in the interface rather than applied silently. The
collection name is pinned explicitly in the model, because Mongoose would
otherwise derive `chatmessages` and disagree with §11 of this report.

**Voice input depends on uneven browser support.** The Web Speech API is
implemented in Chrome and Edge, partially in Safari, and not by default in
Firefox. The interface hides the microphone rather than offering a control that
silently fails. In Chrome, recognition is routed through a remote service, so it
requires a network connection.

### 9.10 Architecture and security trade-offs

- **Session tokens are held in `localStorage` and sent as a Bearer header**,
  rather than in an `httpOnly` cookie. The client and API are deployed to
  different registrable domains (`*.vercel.app` and `*.onrender.com`), where
  third-party cookie restrictions make cookie-based sessions unreliable. The
  accepted cost is exposure to cross-site scripting; the mitigation is React's
  default output escaping and the absence of `dangerouslySetInnerHTML` anywhere
  in the codebase. A single-domain deployment should prefer a cookie.
- **Sign-out is client-side.** JWTs are stateless and no server-side denylist is
  maintained, so a token remains cryptographically valid until it expires
  (7 days). A denylist is noted as future scope.
- **Administrator access is granted only through the admin interface.** Every
  new account is created as a plain member, and signing in never changes a role,
  so nothing can silently override an administrator's decision. The
  consequence is one manual bootstrap step: on a brand-new database there is no
  administrator, and therefore nobody able to grant the role, so the first
  administrator is set directly in MongoDB. This was chosen over an environment
  variable (which had to be excluded from the precedence rules to avoid undoing
  deliberate revocations) and over auto-promoting the first account (which would
  hand the role to whoever signed up first on a public deployment).
- **Role changes carry three guards.** Nobody may change their own role, which
  prevents both accidental self-lockout and an administrator quietly restoring
  their own access; the last remaining administrator cannot be removed; and
  every change is recorded on the user with who made it and when, so privilege
  escalation is never anonymous. The last-admin check is currently *unreachable*
  because the self-edit guard precedes it — to demote the last administrator the
  caller would have to be that administrator — and it is retained as defence in
  depth should the self-edit rule ever be relaxed. The tests assert the
  invariant it protects (no sequence of operations leaves zero administrators)
  rather than the unreachable branch.
- **The administrator role sees the user roster but not user data.** Adding role
  management necessarily widened the original "aggregate data only" boundary:
  an administrator must be able to see who exists in order to grant access. The
  exposure is held to identity and status — email, name, avatar, role, whether
  onboarding is complete, join date and last sign-in. **No endpoint exposes any
  user's profile, plans, logs or chat history to an administrator**, and a test
  asserts the roster response contains no fields beyond that allowlist.

### 9.11 External dependency assumptions

- **Groq's free tier permits 8,000 tokens per minute**, counting the prompt and
  the reserved output together. This figure was measured from the API's own
  error response, not assumed, and the prompt builders are constrained to fit
  it. A change to that limit would require adjusting the token budget.
- **The `free-exercise-db` repository continues to host its step images** at
  their current raw URLs. Images are referenced, not copied into the project.
- **Render's free tier idles instances after inactivity**, so the first request
  after a pause takes 30–60 seconds. The client's request timeout was originally
  20 seconds, which made an ordinary cold start indistinguishable from the
  server being unreachable; it is now 75 seconds, and a request in flight for
  more than 4 seconds shows an explicit "waking the server" indicator. The
  underlying delay remains a property of the hosting tier, not something the
  application can remove.

### 9.12 Content management, gamification and export assumptions

- **Slugs are treated as permanent identifiers.** Admin editing cannot change a
  slug, because it is the handle stored inside every generated plan and workout
  log. This is a deliberate restriction rather than an oversight: because the
  grounding layer silently drops unknown slugs, a rename would shorten users'
  stored plans with no error surfacing anywhere. A rename is therefore a delete
  plus a create.
- **Deletion is refused, not cascaded, while a record is referenced.** The
  alternative — deleting the referring plans and logs — would destroy user data
  to satisfy an administrative tidy-up. The reference count is exposed so the
  decision is informed, but the record stays.
- **Gamification is derived, never stored.** Badges and the consistency score
  are recomputed from the user's own logs on every request. Storing them would
  let an award outlive its evidence (deleting a log would leave a stored badge
  standing) and would introduce an award job with double-grant and migration
  concerns. The cost is recomputation over at most 400 recent logs per request.
- **The consistency weights are a judgement, not a published standard.**
  Adherence 40, recency 25, streak 20, check-in logging 15. They were chosen so
  that actually training dominates and diligent logging alone cannot manufacture
  a good score. No external source prescribes these numbers.
- **The "biggest gain" hint ranks by weighted headroom**, not by the lowest
  component — 50% of a 40-point weight is a larger available gain than 0% of a
  15-point one. This is asserted in tests because the intuitive reading (lowest
  value wins) is wrong and would otherwise be "fixed" back.
- **Grocery quantities round upward** to practical shopping amounts, so a list
  always slightly exceeds what the plan requires. Being short of an ingredient
  is a worse failure than buying a little too much. The interface states this
  rather than implying the figures are exact.
- **A diet plan describes one repeatable day**, so the number of days to shop
  for is presented as a user control (1, 3, 7, 14) rather than inferred. Ticked
  items are per-viewer and not persisted, since a shopping list is transient.
- **PDF generation is client-side** (jsPDF), so no document is stored and no
  server round-trip occurs. The library is fetched on the first export rather
  than at load, because it is roughly 400 kB — more than the rest of the
  application combined — and most sessions never export anything. Documents are
  black-on-white by design: a plan is typically printed, where the application's
  dark theme would waste ink and read poorly.
- **Content-management validation duplicates the seeder's rules**, including the
  4/4/9 calorie-consistency band for foods. An administrator can therefore add a
  food only if its macros and calories reconcile, which prevents a mistyped
  value from silently distorting every diet plan the food subsequently enters.

### 9.13 Verification status

| Verified | Method |
|---|---|
| Calculation correctness | BMR checked against hand-computed values; macro totals asserted to reconcile; determinism asserted |
| AI grounding | Adversarial suite injects fabricated model responses and asserts none survives |
| Injury filtering | Asserted against the database that no exercise loading an injured area appears in a generated plan |
| Constraint compliance | Equipment, diet type and allergy filters re-verified against the database rather than trusted |
| Plan versioning | Supersession, history retention, stale detection and ownership scoping asserted |
| Progression logic | Each rule asserted in isolation (increase, hold, deload, stall reset, bodyweight); determinism asserted |
| Body-fat estimator | Both formulas hand-checked against published ranges; implausible inputs asserted to be rejected rather than returning NaN |
| Log integrity | Volume, set and rep totals computed server-side and asserted; exercise slugs validated against the DB on write |
| Retrieval quality | 63 assertions that the expected entry ranks first for realistic phrasings, slang and abbreviations; off-topic queries asserted to return nothing |
| Chatbot grounding | Fabricated citation ids asserted to be stripped; an uncited answer asserted to be marked ungrounded; an out-of-scope question asserted to make no LLM call |
| Chatbot safety | Each refusal category asserted to trigger, and ordinary gym questions asserted NOT to |
| Role management | Non-admins asserted to be refused (403); self-edits refused; a demoted admin asserted to lose access immediately; the roster asserted to leak no profile/plan/log fields; both granted and revoked roles asserted to survive re-login unchanged |
| Content management | Non-admins refused; duplicate slugs, invalid enums and inconsistent calories rejected; slug immutability asserted at the database, not just the response; deletion asserted to be refused while referenced; an optional field asserted to be clearable with an explicit null |
| Grocery aggregation | Identical foods across meals asserted to combine; purchase quantities asserted to round upward; the day count asserted to clamp to 1–30; an empty plan asserted not to throw |
| PDF generation | Documents built under Node with `save()` stubbed: byte output asserted non-trivial, filenames asserted, page count asserted to exceed one for a plan long enough to need it, and plans missing optional sections asserted to export rather than throw. The rendered *appearance* of a document is still unconfirmed |
| Gamification | Badge evaluation asserted deterministic and per-user isolated; the score asserted to stay within 0–100; component weights asserted to sum to 100; overtraining asserted not to inflate adherence past 100; a dormant history asserted to score below a current one; the weighted-headroom hint asserted against the lowest-value reading |

| Not verified | Status |
|---|---|
| Log history and deletion | The list and delete endpoints are asserted, and the response is asserted to carry every field the history panel renders; the panel itself is unviewed in a browser |
| Visual and responsive appearance | Built to a responsive system and reviewed in code, but **not confirmed in a browser** across device widths. This now covers fifteen pages, and three real interface defects across earlier phases were found only by using the application — none would have been caught by any automated check in place |
| Nutrition values against their cited sources | Outstanding (see 9.4) |
| Injury logic against clinical guidance | Outstanding (see 9.3) |

---

## 10. Viva/Presentation Talking Points

- **RAG grounding to prevent hallucination**: AI never invents exercises, foods, or video links — always selects from a verified database.
- **RBAC**: deliberate security design separating admin and user capabilities.
- **Delegated authentication as a security decision**: Google OAuth only, deliberately. Nothing in the system stores, transmits or resets a password, so an entire class of vulnerability — weak hashes, credential stuffing, reset-token leaks, SMTP misconfiguration — is designed out rather than defended against. The server still verifies every ID token's signature and `aud` claim itself, so it never trusts the browser's word about who the user is.
- **Adaptive system**: plans version and regenerate as user goals/equipment/injuries change over time, not a static one-time output.
- **Structured AI output**: constrained JSON schema prompting for reliable parsing into UI — demonstrates real prompt engineering, not "just calling an API."
- **Grounding was proved adversarially, not anecdotally**: "it didn't hallucinate when I tried it" is not evidence, so a dedicated suite stubs the LLM and injects fabricated exercises, fabricated macros, portions of 500,000 g, negative weights and malformed response shapes — asserting that none of it survives to the user. That suite caught a real bug: a malformed *shape* crashed both generators instead of falling back.
- **Two planned AI features were deliberately built without AI**: injury filtering and load progression concern physical safety and reproducibility, where an identical input must always give an identical answer. Knowing where *not* to use a language model is the same skill as knowing where to.
- **The system degrades instead of failing**: with no API key, or under a rate limit, a rule-based engine builds the plan from the same filtered shortlist and the interface states which engine produced it. Every compromise — a bound calorie floor, a clamped macro, an unreachable protein target, an injury that emptied a training day — is surfaced rather than concealed.

---

## 11. MongoDB Collections

Eight collections. The names below are the **actual** collection names in
MongoDB: Mongoose lower-cases and pluralises a model name to derive one, so the
camelCase names used in earlier drafts of this report do not exist on disk.
`chatHistory` is the sole exception — it is pinned explicitly in the model,
because the derived name (`chatmessages`) would have contradicted this section.

| Collection | Contents | Notes |
|---|---|---|
| `users` | Auth identity, role, and the versioned profile (goals, equipment, restrictions, injuries) | `profileVersion` drives stale-plan detection; role changes carry an audit trail |
| `exercises` | Seeded exercise library — name, muscles, equipment, level, mechanic, instructions, images, demo URL | 876 records. Admin-editable; `slug` is immutable |
| `foods` | Curated nutrition database — macros per 100 g/ml, diet tags, allergens | 129 records. Admin-editable; `slug` is immutable |
| `workoutplans` | Generated plans, versioned with timestamps | Never overwritten; regenerating supersedes and retains history |
| `dietplans` | Generated plans, versioned with timestamps | Stores `targets`, `dailyTotals` and the `variance` between them |
| `workoutlogs` | Actual performance per session — sets, reps, load, RPE | Snapshots the plan's prescription, so a log stays interpretable after the plan changes |
| `progresslogs` | Weight, measurements and body-composition history | Upserts by day; stores the height and sex used, so estimates stay reproducible |
| `chatHistory` | Conversations with their full retrieval traces | Pruned after 90 days by a TTL index. Name pinned explicitly (see above) |

**Deliberately not a collection:** the chatbot's knowledge base. It lives as a
code-versioned data file rather than in the database, so the set of things the
assistant may say is reviewed in source control and cannot be altered at
runtime — a strengthening of the grounding guarantee (see §9.9).

**Nothing stores gamification state.** Badges, streaks and the consistency score
are derived from `workoutlogs` and `progresslogs` on every read (see §9.12).

---

*FitGen — AI Smart Workout & Macro Diet Generator*
