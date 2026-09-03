# FitGen — Setup Guide

Everything needed to run FitGen, from an empty machine to a working app with an
administrator account.

For **what FitGen is and how it works**, see [`README.md`](README.md).
For **design decisions and their justification**, see
[`FitGen_Project_Report.md`](FitGen_Project_Report.md).

---

## Contents

| | Section | For whom |
|---|---|---|
| 1 | [Prerequisites](#1-prerequisites) | Everyone |
| 2 | [Google OAuth client ID](#2-google-oauth-client-id) | Everyone — the app cannot start without it |
| 3 | [MongoDB connection string](#3-mongodb-connection-string) | Everyone |
| 4 | [Install and configure](#4-install-and-configure) | Developer |
| 5 | [Seed the databases](#5-seed-the-databases) | Developer |
| 6 | [Run it](#6-run-it) | Developer |
| 7 | [Create the first administrator](#7-create-the-first-administrator) | Project owner |
| 8 | [What an administrator can do](#8-what-an-administrator-can-do) | Administrator |
| 9 | [First-time setup for a regular user](#9-first-time-setup-for-a-regular-user) | End user |
| 10 | [Deployment](#10-deployment) | Project owner |
| 11 | [Troubleshooting](#11-troubleshooting) | Everyone |

**Companion files** — the two longest procedures live on their own so they can be
followed without scrolling past anything else:

- [`google-clientid-steps.txt`](google-clientid-steps.txt) — getting a Google
  OAuth client ID, screen by screen
- [`seed_steps.txt`](seed_steps.txt) — seeding, including the production database

---

## 1. Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js 20+** | `node -v` to check. The server uses ESM and Node's built-in test runner. |
| **MongoDB** | MongoDB Atlas free tier (recommended) or a local `mongod`. |
| **A Google account** | To create the OAuth client, and to sign in with. |
| **Internet access** | The exercise seeder downloads its dataset from GitHub at run time. |
| Groq API key | **Optional.** Without one, plans are built by the deterministic rule-based engine and the AI coach is disabled. Everything else works. |

---

## 2. Google OAuth client ID

**Google sign-in is the only way into FitGen** — there is no password login — so
this must be done first. Nothing else in this guide will work without it.

→ **Follow [`google-clientid-steps.txt`](google-clientid-steps.txt)** for the
step-by-step walkthrough, including the consent screen, the Test-users list, and
the two mistakes that are hardest to diagnose.

The short version:

1. [Google Cloud Console](https://console.cloud.google.com) → new project.
2. Consent screen → **External**, add **your own account under Test users**
   (while the app is in Testing, nobody else can sign in).
3. Credentials → **OAuth client ID** → **Web application**.
4. **Authorised JavaScript origins:** `http://localhost:5173` (add your deployed
   URL later). **Leave redirect URIs empty** — FitGen has no callback route.
5. Copy the **Client ID**. Ignore the client secret; FitGen never uses it.

That one value goes into **both** `.env` files, and they must match exactly —
the server verifies the token's `aud` claim against its own copy, so a mismatch
fails every sign-in.

---

## 3. MongoDB connection string

**Atlas (recommended):** create a free M0 cluster → **Connect → Drivers** → copy
the connection string.

Two things to fix in the copied string:

- **Add the database name** before the `?`:
  `...mongodb.net/fitgen?retryWrites=true...`. Without it, Mongoose silently
  uses a database called `test`.
- **URL-encode special characters** in the password. `@ : / ? # [ ] %` all break
  the URI if left raw.

Then **Network Access → Add IP Address**. Your current IP is enough for local
development; deployment needs `0.0.0.0/0` (see §10).

**Local instead:** `mongodb://127.0.0.1:27017/fitgen` with `mongod` running.

---

## 4. Install and configure

```bash
git clone <your-repo-url> fitgen
cd fitgen
```

### Server

```bash
cd server
npm install
cp .env.example .env
```

Now edit `server/.env`:

| Variable | Required | Notes |
|---|:--:|---|
| `MONGO_URI` | ✅ | From §3. Include the database name. |
| `JWT_SECRET` | ✅ | Generate a real one — see the warning below. |
| `GOOGLE_CLIENT_ID` | ✅ | From §2. |
| `PORT` | | Defaults to `5000`. **On macOS use `5001`** — see the note below. |
| `CLIENT_ORIGINS` | | Comma-separated browser origins allowed to call the API. Defaults cover localhost. |
| `GROQ_API_KEY` | | Optional. Omit to run entirely on the rule-based engine. |
| `GROQ_MODEL` | | Optional. Defaults to `openai/gpt-oss-120b`. |
| `JWT_EXPIRES_IN` | | Defaults to `7d`. |

The server **fails fast at boot** if any of the three required variables is
missing, naming the one at fault, rather than starting and failing later on the
first request.

> **Generate a real `JWT_SECRET`.** This key alone is what stops someone forging
> a session token for any account, including an administrator. A short or
> guessable value is brute-forceable offline against any token they hold.
>
> ```bash
> node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
> ```

> **macOS: port 5000 is taken.** AirPlay Receiver binds it, and the symptom is
> confusing — requests return `403` from `AirTunes` rather than failing to
> connect. Set `PORT=5001` in `server/.env` and point `VITE_API_URL` at `5001`
> too. (Alternatively: System Settings → General → AirDrop & Handoff → turn off
> AirPlay Receiver.)

### Client

```bash
cd ../client
npm install
cp .env.example .env
```

Edit `client/.env`:

| Variable | Notes |
|---|---|
| `VITE_API_URL` | API root, **no trailing slash and no `/api` suffix** — e.g. `http://localhost:5001` |
| `VITE_GOOGLE_CLIENT_ID` | The **same** client ID as the server's `GOOGLE_CLIENT_ID` |

> Vite only exposes variables prefixed `VITE_`, and it **inlines them at build
> time**. Editing `.env` therefore requires a dev-server restart locally, and a
> redeploy in production — an edit alone appears to do nothing.

---

## 5. Seed the databases

FitGen cannot generate a plan against empty collections: the AI is only allowed
to pick from the seeded exercise and food data, so with nothing seeded there is
nothing to pick.

```bash
cd server
npm run seed
```

Expect roughly:

```
[seed] starting (target=all, fresh=false)
[db] connected -> cluster0-shard-00-00.xxxxx.mongodb.net/fitgen
[seed:exercises] downloading dataset…
[seed:exercises] received 876 records
[seed:exercises] done — 876 inserted, 0 updated, 0 skipped, 876 total
[seed:foods] preparing 129 curated records
[seed:foods] done — 129 inserted, 0 updated, 129 total
[seed] complete
```

| Command | Effect |
|---|---|
| `npm run seed` | Upsert both collections. **Safe to re-run** — matches on `slug`, never duplicates. |
| `npm run seed:exercises` | Exercises only (needs internet). |
| `npm run seed:foods` | Foods only (no download — the data ships in the repo). |
| `npm run seed -- --fresh` | **Destructive.** Wipes both collections first. |

**Where the data comes from**

- **876 exercises** downloaded at seed time from
  [`free-exercise-db`](https://github.com/yuhonas/free-exercise-db) — name,
  force, level, mechanic, equipment, muscles, instructions, step images.
- **129 foods** from [`server/src/data/foods.js`](server/src/data/foods.js),
  macros per 100 g, drawn from USDA FoodData Central and the Indian Food
  Composition Tables, weighted towards Indian staples.

The food seeder cross-checks every stated calorie value against 4/4/9 kcal macro
arithmetic and warns on anything implausible. Warnings are advisory and do not
stop the seed.

> **`--fresh` is dangerous once real data exists.** Stored plans and workout logs
> reference exercises and foods **by slug**, and the grounding layer silently
> drops slugs it cannot find — so users' saved plans would quietly get shorter
> with no error surfacing anywhere. Never use `--fresh` on a database with real
> users.

> **Re-seeding overwrites administrator edits.** If an admin edited an exercise
> through the UI and that slug also exists upstream, the seeder resets it to the
> upstream values. Admin-created records with new slugs are untouched.

→ **Seeding a production database is a separate procedure** — the deployed server
never seeds itself. See [`seed_steps.txt`](seed_steps.txt).

---

## 6. Run it

Two terminals:

```bash
# Terminal 1
cd server && npm run dev        # http://localhost:5001

# Terminal 2
cd client && npm run dev        # http://localhost:5173
```

Check the API is alive and connected to Mongo:

```bash
curl http://localhost:5001/api/health
```

Then open **http://localhost:5173** and sign in with Google.

### Confirm the install

```bash
cd server && npm test      # 564 assertions across 13 suites
cd client && npm test      # 14 assertions — PDF generation
```

The suites create and delete their own throwaway accounts, so they are safe to
run against your development database — but **point `MONGO_URI` at a development
database, never production.**

---

## 7. Create the first administrator

Roles are managed **entirely from the admin UI**. There is no environment
variable for it, and signing in never changes a role — so whatever an
administrator sets is what holds.

That leaves exactly one bootstrap step, and it exists for a real reason: on a
brand-new database there is **no administrator, and therefore nobody able to
grant the role**. So the very first one is set directly in MongoDB.

**Do this once.**

### Step 1 — Sign in first

Open the app and sign in with Google. This creates your user document. Trying to
promote an account that does not exist yet is the usual reason this fails.

### Step 2 — Set the role

**Atlas UI:** Browse Collections → your database → `users` → find your email →
edit `role` from `"user"` to `"admin"` → Update.

**mongosh:**

```js
db.users.updateOne(
  { email: "you@example.com" },
  { $set: { role: "admin" } }
)
```

Confirm it applied:

```js
db.users.findOne({ email: "you@example.com" }, { email: 1, role: 1 })
```

### Step 3 — Pick up the new role

Sign out and back in, or reload. The JWT carries the role, so an existing session
keeps the old one until it is reissued.

**Admin** now appears in the avatar dropdown (top-right).

### Everyone else

From **Admin → User roles**. Never repeat the database step — that is the
bootstrap only.

### Guards you will run into

| Guard | Why it exists |
|---|---|
| **Nobody can change their own role** | Prevents self-lockout, and stops an administrator quietly restoring their own revoked access |
| **The last administrator cannot be removed** | Keeps the admin area reachable at all |
| **Every change is recorded** (who, from, to, when) | Privilege escalation is never anonymous |

The first guard is why you cannot promote yourself through the UI even *as* an
administrator — hence the one-time database step.

---

## 8. What an administrator can do

**Admin → Content:** create, edit and delete exercises and foods. This is the
data the AI is grounded against, so edits here change what any generated plan
can contain.

Two rules will stop you, deliberately:

- **Slugs cannot be changed.** A slug is stored inside every generated plan and
  workout log. Renaming one would orphan those references — and because unknown
  slugs are *silently dropped*, users would just see shorter plans with no error.
  A rename is a delete plus a create.
- **A referenced record cannot be deleted.** The UI checks reference counts
  *before* asking you to confirm, so you are told the delete will be refused
  rather than discovering it afterwards. Edit it instead.

Foods must also pass the calorie-consistency check: stated calories have to sit
inside the band the 4/4/9 macro arithmetic allows. A swapped protein/carb column
is caught at the form rather than quietly distorting every plan the food enters.

**Admin → User roles:** grant and revoke admin, with an audit trail.

**Admin → Analytics:** aggregate counts and distributions.

### What an administrator deliberately cannot see

Identity and status only: email, name, avatar, role, onboarding status, join
date, last sign-in. **No endpoint exposes any user's profile, plans, logs or chat
history to an administrator** — a test asserts the roster response carries no
field outside that allowlist.

Content management does not widen this. An admin can see *how many* plans and
logs reference a record — which is what makes a safe delete decision possible —
but never whose they are.

---

## 9. First-time setup for a regular user

No configuration. Everything below happens in the browser.

### 1. Sign in

Open the app → **Sign in with Google**. There is no password to create and no
verification email to wait for.

> If the deployment is still in Google's *Testing* status, the account must be on
> the project's **Test users** list or Google blocks it. Ask the project owner to
> add it.

### 2. Complete the onboarding wizard

Six steps, and it is **required** — targets and plans cannot be computed without
it:

| Step | What it collects | Why it matters |
|---|---|---|
| **Basics** | Age, sex, height, weight, activity level | Drives BMR and TDEE |
| **Goal** | Fat loss / recomposition / maintain / muscle / strength | Sets the calorie shift and protein target |
| **Equipment** | What you actually have access to | Exercises are filtered to this — nothing you can't perform is prescribed |
| **Diet** | Diet type, allergies, meals per day | Filters the food pool and shapes the meal split |
| **Injuries** | Area and severity | Filters unsafe exercises **before** the AI sees candidates |
| **Review** | Live target preview | Shows your numbers before anything is saved |

Be honest about equipment and injuries — both are hard filters, not
suggestions. Declaring equipment you don't have produces a plan you can't do.

### 3. Generate your plans

- **Training → Generate plan** — a weekly split
- **Nutrition → Generate plan** — a day of meals matched to your macro targets

Both take a few seconds. If the AI is unavailable or rate-limited, a rule-based
engine builds the plan instead and the page says so rather than failing.

### 4. Day to day

| Do this | Where |
|---|---|
| Log a session | **Log** — pre-filled with the progression engine's suggestion; overwrite anything |
| Review or delete past sessions | **Log**, below the form |
| Record a body check-in | **Progress → Check in** |
| See charts, records, badges | **Progress** |
| Ask a training question | **Coach** — answers only from the built-in knowledge base |
| Shopping list | **Nutrition → Grocery list** |
| Take a plan to the gym | **Download PDF** on either plan page |

### 5. When your situation changes

Edit **Profile**. Changing a plan-relevant field (goal, equipment, injuries,
weight, diet) flags your plans as stale and tells you **which** field caused it.
Regenerate when you're ready — nothing is rebuilt behind your back.

Cosmetic changes like your display name never trigger this.

> **FitGen does not provide medical advice.** The
> injury filtering is conservative but has not been reviewed by a clinician. The
> AI coach refuses medical, medication, pregnancy and disordered-eating
> questions by design and redirects to a professional.

---

## 10. Deployment

The app has **not** been deployed. These are the intended steps.

### Server → Render

1. Push the repo to GitHub.
2. Render → **New → Web Service** → pick the repo.
3. **Root directory** `server`, build `npm ci`, start `npm start`.
4. Add the environment variables from §4. Set `NODE_ENV=production` and put your
   real Vercel URL in `CLIENT_ORIGINS`.
5. **Health check path:** `/api/health`.

> **Free-tier cold starts.** Render idles instances after ~15 minutes, so the
> first request after a pause takes 30–60 s. The client's timeout is 75 s and a
> request in flight beyond 4 s shows a "waking the server" indicator, so this
> reads as a wait rather than an error. Hitting `/api/health` first warms it.

### Client → Vercel

1. Vercel → **Add New → Project** → pick the repo.
2. **Root directory** `client`. Framework preset Vite (auto-detected).
3. Environment variables: `VITE_API_URL` (your Render URL) and
   `VITE_GOOGLE_CLIENT_ID`.
4. Deploy.

[`client/vercel.json`](client/vercel.json) rewrites all paths to `index.html`, so
client-side routes survive a hard refresh.

### Post-deploy checklist

- [ ] Vercel URL added to Google's **Authorised JavaScript origins**
- [ ] Vercel URL added to `CLIENT_ORIGINS` on Render
- [ ] `VITE_API_URL` points at Render — no trailing slash, no `/api`
- [ ] Atlas **Network Access** allows `0.0.0.0/0` (Render's free tier has no
      static outbound IP, so no narrower rule is possible — use a long random
      database password)
- [ ] **Seeded the production database** — see [`seed_steps.txt`](seed_steps.txt).
      The deployed server never seeds itself; you run the seeder locally with
      `MONGO_URI` pointed at production
- [ ] Promoted the first administrator (§7) on the production database
- [ ] `JWT_SECRET` is a fresh long random value, not the development one

---

## 11. Troubleshooting

### Startup

**`Missing required environment variable: X`**
Exactly what it says — `server/.env` is incomplete. See §4.

**`Invalid scheme, expected connection string to start with "mongodb://"`**
`MONGO_URI` is malformed. Usually an unquoted shell command breaking at `&`, or
a stray line break in `.env`.

**`Authentication failed` from MongoDB**
Wrong password, or an unencoded special character. Percent-encode
`@ : / ? # [ ] %`.

**`Could not connect to any servers in your MongoDB Atlas cluster`**
Atlas **Network Access** does not include your current IP.

**Server returns `403` with `AirTunes` in the response**
macOS AirPlay Receiver has port 5000. Use `PORT=5001` (§4).

### Sign-in

**Popup opens, then the API returns 401**
`GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID` differ, or the dev servers were
not restarted after editing `.env`. Compare:

```bash
grep GOOGLE_CLIENT_ID server/.env
grep VITE_GOOGLE_CLIENT_ID client/.env
```

**"Access blocked: This app's request is invalid"**
The origin is not in **Authorised JavaScript origins**. Needs the scheme and no
trailing slash: `http://localhost:5173`.

**Another person cannot sign in**
The app is in *Testing* and their account is not on the **Test users** list.

**Nothing happens on click**
Check the browser console — a missing `VITE_GOOGLE_CLIENT_ID` stops Google's
script from initialising.

### Running

**Empty exercise and food libraries; plans won't generate**
Not seeded, or seeded into a different database than the server reads. Check the
database name in `MONGO_URI` — `fitgen` and `fitgen_prod` are different
databases on the same cluster, and a typo silently creates a third.

**"Cannot reach the FitGen server"**
The API isn't running, or `VITE_API_URL` is wrong. It must have no trailing slash
and no `/api` suffix.

**Plans say "AI unavailable — the deterministic engine was used"**
Either no `GROQ_API_KEY`, or Groq rate-limited the request. The plan is still
valid; the page discloses which engine built it.

**`Admin` missing from the dropdown after promoting myself**
The role is carried in the JWT. Sign out and back in.

**Charts and badges look wrong**
A mistyped session skews volume, records, adherence and badges. Delete it from
the history list under the form on **Log**.

### Tests

**`test:generation` skips its Groq half**
Expected without `GROQ_API_KEY`. The deterministic half still runs.

**Admin-role tests fail on a shared database**
The suites scope administrator counts to their own throwaway accounts precisely
so your real admin account doesn't interfere. If they still fail, check that a
previous interrupted run didn't leave `fitgen-p6-*@example.com` accounts behind.
