# GrowthOS — Full-App Test Plan & Demo-Day Prep

One pass, two outcomes: every feature verified on production, AND a demo
clinic full of realistic data for the evening. Follow the order — later
sections depend on data created in earlier ones. Budget ≈ 3 hours of work;
start the Deep Audit early (it runs ~8 min unattended).

**Legend:** ☐ = check it works · 💬 = a wa.me tap · 💰 = spends credits/API
money · 🎬 = keep this on screen for the demo

---

## RULE #1 — every dummy patient gets YOUR phone number

Enter YOUR OWN mobile (or a second SIM you hold) as every patient's WhatsApp
number. Every 💬 tap then opens a chat with *yourself* — you can demo real
sends all evening without messaging strangers. Never use a real patient's
number today.

## The dummy data pack (copy from here as you go)

**Clinic** (use your real target positioning):
- Name: `Smile Care Dental Clinic` · Doctor: `Dr. Anjali Sharma`
- Area/City: your REAL area + city (Map Rank and Deep Audit hit 10× harder
  on real geography) · Phone: your number
- Google review link: your real GBP review URL (Settings → Clinic Info)

**Patients** (10 — name / age / note):
1. Ramesh Gupta, 52 — RCT candidate (big treatment plan)
2. Priya Verma, 34 — cleaning done today (survey/review flow)
3. Aarav Mehta, 8 — kids checkup (recall + campaign)
4. Sunita Joshi, 61 — dentures, ₹8,000 outstanding (dues flow)
5. Kabir Khan, 29 — no-show today (recovery flow)
6. Neha Agarwal, 41 — whitening done (Moment Capture)
7. Vikram Singh, 45 — implant enquiry (lead → convert)
8. Meera Nair, 37 — lapsed 8 months (campaign segment)
9. Rohit Kulkarni, 26 — new enquiry via Instagram (lead)
10. Anita Desai, 55 — braces consult tomorrow (appointment)

**Rate card:** RCT ₹6,000 · Implant ₹28,000 · Braces ₹45,000 · Whitening
₹7,000 · Cleaning ₹1,200 · Extraction ₹1,500 · Kids checkup ₹500

---

## Phase 0 — Account & settings (20 min)

- ☐ Sign up fresh on production (owner email). Trial starts: **50 content +
  4 map credits** visible on Upgrade.
- ☐ Settings → Clinic Info: fill EVERYTHING incl. Google review link and
  socials. (Half the app's messages template from these fields.)
- ☐ Settings → Rate Card: enter the 7 treatments above.
- ☐ Settings → Staff: add `reception@…` as **Receptionist** (second browser
  profile later for the role check).
- ☐ 🎬 Phone: open the site on Android Chrome → menu → **Add to Home screen**
  → teal tooth icon installs, opens standalone to /dashboard.
- ☐ Help chatbot: open it, ask "How do credits work?" in English, then switch
  to Hinglish and ask "Social posts kaise banau?" — both answer sensibly.

## Phase 1 — Kick off the slow burners (10 min, then they cook)

- ☐ 💰 **Deep Audit → Run** (uses your 1 included audit, ~₹100 API,
  ~8 min). Let it run while you continue below.
- ☐ 💰 Map Rank: add keywords `dentist in {your area}` + `root canal {city}`
  → run ONE scan (1 credit). ☐ Heatmap renders with real ranks — if every pin
  looks suspiciously perfect/identical, `SERP_PROVIDER` is on `mock`: stop
  and fix the env var before the demo.

## Phase 2 — Front desk day-in-the-life (40 min)

**Enquiries**
- ☐ Add leads: Vikram Singh (implant, source: walk-in), Rohit Kulkarni
  (whitening, source: Instagram).
- ☐ 💬 Tap the WhatsApp reply on Vikram → Hinglish message opens to your
  phone → send → button becomes **✓ Sent** and stays that way on refresh.
- ☐ Convert Vikram to a patient + appointment. Leave Rohit as "New" 🎬 (the
  dashboard needs an unanswered enquiry tonight).

**Patients**
- ☐ Add the remaining 8 patients (your number on all).
- ☐ Open Ramesh Gupta: profile shows visits/outstanding sections empty but
  clean.
- ☐ (Optional) Settings → Data Migration: import a 5-row CSV with odd column
  names (`PatientName`, `Mob`) → AI maps them → rows land in Patients.

**Appointments**
- ☐ Create: Priya (today, cleaning), Kabir (today — you'll no-show him),
  Anita (tomorrow, braces consult), Aarav (tomorrow, kids checkup).
- ☐ 💬 Anita's **24-hour reminder** → send → ✓ Sent.
- ☐ Mark Priya **completed** → 💬 send the **post-visit survey** (keep the
  link!). Mark Kabir **no-show** → 💬 the recovery message appears → send.

**Treatment Plans**
- ☐ Create: Ramesh — RCT ₹6,000 (Quoted) · Vikram — Implant ₹28,000
  (Thinking) · Anita — Braces ₹45,000 (Scheduled).
- ☐ Pipeline shows the ₹ total; drag/move Ramesh Quoted → Thinking; 💬 one
  follow-up nudge. 🎬 Board view is a demo star.

**Billing**
- ☐ Invoice Priya's cleaning ₹1,200 → record full payment (UPI).
- ☐ Invoice Sunita ₹8,000 → record ₹0 → she appears in outstanding →
  💬 dues reminder with UPI link.

**Recalls**
- ☐ Aarav due for 6-month checkup → 💬 reminder → ✓ Sent.

## Phase 3 — Reputation loop, end to end (20 min)

- ☐ Open Priya's survey link **on your phone** (logged out — it's public).
  Submit **5 stars** → you're routed to the Google review page. ☐ Back in
  the app: response recorded, routed "to Google".
- ☐ Complete another appointment (Sunita) → send survey → submit **2 stars +
  a complaint** → ☐ an **urgent notification** fires in-app; the complaint
  shows on Reviews for handling 🎬 (the "we catch bad reviews first" moment).
- ☐ 💰 Reviews → Insights report (2 credits) → readable AI summary from your
  real data (thin data is fine — it should say so honestly).

**Moments (Moment Capture)**
- ☐ /capture: photo of anything tooth-adjacent (a printed smile pic works),
  patient = Neha, treatment = Whitening, **both consent toggles ON** → save.
- ☐ 💬 The review ask opens (no photo attached — confirm!) → send → ✓.
- ☐ Try capturing another moment for Neha with consent A → the 30-day cap
  blocks the ask ("already asked N days ago") — this is CORRECT 🎬.
- ☐ Save one moment with **only consent A** (any patient) → Gallery shows
  "Review only" badge and NO "Compose post" button on it.
- ☐ Gallery: Neha's card shows "Social OK" 🎬.

## Phase 4 — The growth engine (45 min)

**Brand Personality + Social**
- ☐ /social → "Set it up (2 min)" → complete the wizard. Add one proof point
  WITH source ("4.9★ on Google" / "Google Business Profile") and one WITHOUT
  → the sourceless one shows "unverified — won't be used".
- ☐ Brand kit: upload any square logo PNG, keep teal, save.
- ☐ 💰 **Plan my week** (5 credits): focus "Kids' dental checkups", offer
  "Free consultation this week" → 5 posts land in the approval queue 🎬.
- ☐ Open the Instagram one → **Render image (free)** → branded 1080×1080
  with your logo. Approve it → publish screen: **Copy caption** works,
  **Download image** works, **Mark as posted** → ✓ Posted.
- ☐ Edit another post and type `95% success guaranteed` → save → the safety
  check REJECTS it with named violations 🎬 (the trust moment). Remove it →
  saves clean.
- ☐ Reject one post (it stays as an audit trail). Approve the rest.
- ☐ Quota math: home shows posts used / 5 (trial).
- ☐ 💰 Moment → composed post: Neha's gallery card → Compose → template +
  feed size → Compose (free) → the image carries **"Actual patient — shared
  with consent"** baked in → Write 3 captions (1 credit) → pick one → queue →
  approve 🎬.

**Generate (Content Studio)**
- ☐ The grid shows NO Instagram/GBP post cards, but DOES show the teal
  "moved to Social" pointer.
- ☐ 💰 Generate a **Service Page** for RCT (3 credits) → save → publish as a
  hosted landing page (1 credit) → ☐ open the public URL logged-out on your
  phone 🎬.
- ☐ 💰 Generate a **WhatsApp Broadcast** (1 credit) → 💬 send to yourself.

**AI Visibility**
- ☐ Generate the question set → run one check session → mark a few
  Cited/Mentioned/Absent → scorecard ring updates. Free.

**Campaigns**
- ☐ New campaign, segment "lapsed 6+ months" → Meera appears → 💰 AI-draft
  the message (1 credit) → 💬 send → sent count ticks.

**Deep Audit (should be done cooking by now)**
- ☐ Report loads: score vs your real top rival, the 6 moats, AI-visibility
  verdict (which engines cite you), the **30-day plan** with evidence per
  item 🎬🎬 (this closes deals).
- ☐ Tick 2 plan items done → progress bar moves.
- ☐ 💬 WhatsApp-share the report summary to yourself.
- ☐ Run button now shows the ₹599 top-up state (your 1 credit is used) —
  correct, don't buy.

## Phase 5 — Money & guardrails (20 min)

- ☐ Upgrade page: plan card ₹2,499, both balances, Deep Audit pack ₹599.
- ☐ Click through to Cashfree checkout — **verify it reaches the real
  payment page, then CANCEL** (env `CASHFREE_ENV=production` proven; don't
  pay unless you want a live ₹ test).
- ☐ **Receptionist check** (second browser, reception@ login): sees
  Dashboard/Enquiries/Appointments/Patients/Moments/Payments/Recalls/
  Reviews/Campaigns — but NO Marketing group, NO Revenue Recovered, NO
  Settings. Typing /social or /audit URLs directly bounces to dashboard.
  Typing /admin gives **404**.
- ☐ Revenue Recovered (owner): shows ₹ from Kabir's recovery + Sunita's
  dues flow.
- ☐ Notifications bell: the complaint + digest items are listed; mark read.
- ☐ Dashboard 🎬: now genuinely full — enquiry to answer, tomorrow's
  appointments, Sunita's dues, recall due. This is your demo's opening
  screen.

## Phase 6 — Final demo prep (15 min)

- ☐ Phone: run Script B (docs/DEMO-SCRIPT.md) once against this data, out
  loud, with a timer. Trim what runs long.
- ☐ Leave open in tabs: Dashboard · Pipeline board · Map Rank heatmap ·
  Deep Audit report · Social queue · Neha's composed post.
- ☐ Charge the demo phone. Test the venue's network against the live site.

---

## If something fails

Symptom → file map lives in **docs/TROUBLESHOOTING.md**. Fast triage:
- AI features error → `ANTHROPIC_API_KEY` env on Vercel.
- Map/audit rank data absent or fake-looking → `SERPER_API_KEY` /
  `SERP_PROVIDER=serper`.
- WhatsApp buttons dead → popup blocker, or patient phone isn't a valid +91.
- Images won't render → check Vercel function logs for the render route.
- Checkout dead → `CASHFREE_*` envs.
- Anything cross-clinic-looking → stop the demo prep and report it
  immediately (should be impossible).

**Total credits burned by this pass:** ≈ 16–18 content + 1 map + the 1
included deep audit — comfortably inside the trial's 50/4/1. The evening
demo then runs on the SAME data with near-zero extra spend.
