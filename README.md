# StadiumPal

A stadium companion app that models crowd flow, tracks live queue times, and nudges you before the exit surge hits.

Built for the PromptWars Virtual Hackathon. Themed as an IPL night at M. Chinnaswamy Stadium, Bangalore — but the code is venue-agnostic; swapping venues is a one-file change (`venues/chinnaswamy.json`).

---

## What it does

**Exit Choreographer** — As the match enters its final overs, the app models every fan leaving at once and redistributes the crowd across gates before the surge hits. A two-panel animated SVG shows the difference between the natural flow (everyone piling into the nearest gate) and the choreographed flow (the app spreading load to underused gates). Your personal dot tracks your recommended departure time, and Gemini generates an exit plan: which gate, when to leave, and how long to wait. The animation runs at 1.5× speed, so the full 45-minute exit window plays out in about 30 seconds.

**Queue Radar** — A live top-down schematic of the stadium with colour-coded heat overlays showing current wait times and a 10-minute forecast at every concession stand, restroom, and gate. Your seat is pinned on the map. Every station is a keyboard-navigable button with full ARIA labels.

**Concierge Chat** — A Gemini-powered natural-language chat that knows your seat, the current match clock, your dietary preferences, and the live venue state. Ask it anything: *"Where's the shortest veg food queue near section 114?"* It calls a `get_venue_state` tool to get current wait times before answering, so responses reflect actual queue lengths rather than guesses.

**Smart Nudges** — A server-side agent tick, triggered once per match-minute by the active client session, that asks Gemini *"should I nudge this user right now?"* and writes a nudge to Firestore when the answer is yes. The client subscribes via `onSnapshot` and shows a slide-up toast.

---

## Architecture

```
Browser (Next.js client)
  ├── Digital Twin      — reads timeline.json + match clock, renders SVG heat map
  ├── ExitChoreographer — animated two-panel SVG with RAF play loop
  ├── Chat UI           — POSTs to /api/chat, displays responses
  └── NudgeToast        — onSnapshot on Firestore nudges collection

Next.js API routes (Cloud Run)
  ├── POST /api/exit-plan   — crowd flow matrix → greedy choreographer → Gemini narration
  ├── POST /api/chat        — Gemini tool-calling over current venue state
  └── POST /api/agent/tick  — decideNudge() → writes nudge to Firestore

lib/
  ├── crowdFlow.ts    — builds 46-slot departure matrix per gate from section capacities
  ├── exitPlan.ts     — greedy re-router: shifts overflow fans to neighbouring gates
  ├── exitExplainer.ts — Gemini narrates personalised exit plan; template fallback on failure
  ├── timeline.ts     — pure interpolation over pre-baked venue curves
  ├── agent.ts        — pure decideNudge() with cooldown + Zod validation
  ├── gemini.ts       — Vertex AI client (ADC, no API key)
  └── logger.ts       — structured JSON logs for Cloud Logging
```

**Six Google services:**

| Service | Role |
|---|---|
| Vertex AI (Gemini 2.5 Flash) | Chat tool-calling + agent nudge decisions |
| Firestore | User docs (`matchStartedAt`, seat, prefs) + nudges collection |
| Firebase Anonymous Auth | Anonymous session, no signup required |
| Cloud Run | Hosts the Next.js app (scale-to-zero, `output: "standalone"`) |
| Cloud Logging | Structured logs from every API route via `lib/logger.ts` |
| Firebase CLI | Deploys Firestore security rules and composite indexes |

---

## Setup

### Prerequisites

- Node.js 20+
- A GCP project with Vertex AI API and Firestore enabled
- Firebase project linked to the same GCP project (Anonymous Auth enabled)
- `gcloud` CLI authenticated: `gcloud auth application-default login`

### Install

```bash
git clone https://github.com/anmolgaur45/stadiumpal
cd stadiumpal
npm install
```

### Environment variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

```
# Firebase client SDK (from Firebase console → Project Settings → Your apps)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Vertex AI — uses Application Default Credentials, no API key needed
VERTEX_PROJECT=your-gcp-project-id
VERTEX_LOCATION=us-central1
```

For local Vertex AI calls, also run:

```bash
gcloud auth application-default set-quota-project your-gcp-project-id
```

### Firestore rules and indexes

```bash
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project your-project-id
```

### Run locally

```bash
npm run dev
# → http://localhost:3000
```

---

## Tests

```bash
npm test
```

41 tests across five suites:

- **`tests/timeline.test.ts`** — 14 tests covering boundary clamping, linear interpolation, per-station scale factors, and realistic curve shapes (gate entry rush, innings-break restroom peak, pavilion café spike)
- **`tests/agent.test.ts`** — 5 tests covering cooldown enforcement (Gemini not called), happy path, Gemini throws, malformed JSON, and schema validation failure — all failure paths return `{action:"wait"}` without throwing
- **`tests/crowdFlow.test.ts`** — matrix invariants: per-gate sums match capacity, bucket fractions sum to 1, floor+remainder distributes exactly
- **`tests/exitPlan.test.ts`** — greedy re-router: overflow fans shifted to neighbours, urgency tiers, no-overflow pass-through, unknown section fallback
- **`tests/exitExplainer.test.ts`** — Gemini happy path, 503 throw → template fallback, malformed JSON → template fallback, Zod rejection (recommendation too short) → template fallback

```bash
npm run type-check
```

---

## Simulation layer

Venue state (wait times at concessions, restrooms, and gates) is driven by a pre-baked timeline in `venues/timeline.json` rather than live sensor data. On first visit, a `matchStartedAt` timestamp is written to Firestore. Every subsequent render computes `elapsedMinutes = now - matchStartedAt` and looks up the interpolated wait time from the pre-baked curve — so each visitor's match clock starts when they open the app.

**Timing assumptions** — the 210-minute window and wait-curve shapes (entry rush at T=0, innings-break spike at T≈100, exit surge at T≈200) are reasonable approximations for an IPL T20 night match. Real match durations vary: a 20-over innings can run 75–110+ minutes depending on bowling pace, DRS reviews, strategic timeouts, and rain delays.

In production, this would be replaced by live data from POS systems, gate scanners, and CV cameras.

---

## Deployment

Deployed to Cloud Run via source-based deploy:

```bash
gcloud run deploy stadiumpal \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --set-env-vars VERTEX_PROJECT=your-project-id,VERTEX_LOCATION=us-central1
```

On Cloud Run, Vertex AI and Firestore Admin SDK use the attached runtime service account — no credentials file needed.
