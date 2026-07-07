# GrowthOS — Complete Manual Test Script (with dummy data)

One sitting ≈ 3 hours. Follow top to bottom on the LIVE site with a fresh
clinic — every phase both **verifies a feature** and **seeds realistic demo
data**, so at the end you have a demo-ready account. Tick every box; if a box
fails, note the page + what you saw and stop that phase (don't improvise).

> Prereqs: migrations 001–047 applied (`select version from applied_migrations
> order by version` ends at 047); Vercel env has `SERP_PROVIDER=serper`,
> `IMAGE_PROVIDER=openrouter`, `CASHFREE_ENV=production`, `OPENROUTER_API_KEY`,
> `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_MAPS_API_KEY`, `CRON_SECRET`.

---

## The dummy clinic (use these values exactly)

| Field | Value |
|---|---|
| Clinic name | SmileCare Dental Studio |
| Doctor | Dr. Kavita Sharma |
| Email | smilecare.test+jul26@gmail.com (any inbox you control) |
| Password | Test@2026! |
| Phone | 9876543210 |
| City | Jaipur |
| Area | Vaishali Nagar |
| Address | 2nd Floor, Crystal Court Mall, Vaishali Nagar, Jaipur 302021 |
| Instagram | @smilecare.jaipur |
| Google review URL | https://g.page/r/smilecare-test/review (any URL works for testing) |
| UPI | smilecare@okhdfcbank |

**Rate card (Settings → Rate Card):**

| Treatment | Category | Price ₹ | Mins | Recall days |
|---|---|---|---|---|
| Consultation | General | 300 | 20 | 180 |
| Scaling & Polishing | General | 1,500 | 45 | 180 |
| Root Canal Treatment | Endodontics | 6,500 | 60 | 365 |
| Zirconia Crown | Prosthodontics | 9,000 | 45 | 365 |
| Dental Implant | Implants | 28,000 | 90 | 365 |
| Teeth Whitening | Cosmetic | 8,000 | 60 | 365 |

**Patients (Patients → Add):**

| Name | Mobile | Age/Sex | Notes |
|---|---|---|---|
| Ramesh Gupta | 9829011111 | 52 M | RCT candidate |
| Priya Jain | 9829022222 | 29 F | Whitening enquiry |
| Arjun Singh | 9829033333 | 35 M | Scaling, overdue recall |
| Meena Devi | 9829044444 | 61 F | Implant consult |
| Kabir Khan | 9829055555 | 8 M | Kids checkup |

---

## Phase 0 — Signup, profile gate & setup (25 min)

- [ ] Sign up with the dummy clinic (only name/doctor/email/password/phone/city
      at signup). Copy says **30 content credits, 2 map scans & 1 Deep Audit**.
- [ ] **Profile gate:** after signup, clicking ANY page (e.g. Patients) bounces
      you to **Settings with the "Finish setting up your clinic" banner** —
      because Area + Address are still empty.
- [ ] Settings → Clinic Info: 6 fields show a red * (name, doctor, phone,
      city, area, address). Try saving with Area blank → inline error. Fill
      everything from the table (incl. Instagram, review URL, UPI, and pick
      the clinic location on the map) → Save → "saved ✓".
- [ ] Now /patients loads normally (gate released).
- [ ] **Logo:** still in Settings → Clinic Info, the "Logo & brand" card is
      under the form. Upload any square PNG < 2 MB → "Logo saved ✓" and the
      preview shows it. (This logo must appear on every social image later.)
- [ ] Rate Card tab: add the 6 treatments above.
- [ ] Staff tab: add "Sunita" as **receptionist** (sunita.test@gmail.com /
      Test@2026!). Log in as her in an incognito window: no Marketing group in
      sidebar, no Settings, dashboard shows no money cards — and she is NOT
      bounced to settings (gate is owner/doctor only).
- [ ] **Dashboard setup checklist:** back as the owner, /dashboard shows "Set
      up your clinic — n/6 done" with clinic info ✓, logo ✓, rate card ✓,
      review link ✓; Brand Personality and first patient still open.

## Phase 1 — Slow burners first (10 min)

- [ ] Deep Audit (Marketing → Deep Audit): run the included audit (takes
      5–8 min — let it run while you do Phase 2).
- [ ] Map Rank: keyword "dentist in vaishali nagar" → Run Scan (1 of your 2
      map credits). Heatmap renders with real ranks.

## Phase 2 — Front desk (40 min)

- [ ] Patients: add the 5 dummy patients.
      Dashboard checklist item "Add your first patient" ticks; when all 6 are
      done **the checklist card disappears**.
- [ ] Enquiries (Get Patients In → Enquiries): add lead "Rahul Verma /
      9829066666 / implant enquiry via Instagram". Move it along the stages;
      convert to patient.
- [ ] Appointments: book Ramesh tomorrow 10:00 (Root Canal, Dr. Kavita),
      Priya tomorrow 11:00 (Whitening), Arjun today (Scaling).
- [ ] 24h reminder: on tomorrow's bookings tap "Send reminder" → wa.me opens
      with Hinglish message; back in app the button becomes **✓ Sent** (tap
      again is impossible — anti-duplicate).
- [ ] Complete Arjun's appointment → billing: bill ₹1,500, record ₹1,000 paid
      (UPI) → ₹500 outstanding shows on dashboard + Payments.
- [ ] Treatment plan (Pipeline): Ramesh — RCT + Crown plan ₹15,500, stage
      "Thinking", follow-up date today → shows in dashboard Actions.
- [ ] Recalls: Arjun's scaling creates a 180-day recall (visible in Recalls).
- [ ] No-show recovery: mark Priya's appointment no-show → Actions row shows
      recovery; send the wa.me recovery message → ✓ Sent.

## Phase 3 — Reputation (20 min)

- [ ] Reviews: send Arjun a review request (wa.me + ✓ Sent). Reviews →
      Insights: generate the AI report (**2 credits** — balance drops).
- [ ] Post-visit survey: open the /s/<token> link from the appointment,
      submit a 5★ response → shows in dashboard satisfaction.
- [ ] Moments (Run the Clinic → Moments): capture a photo of anything with
      consent A+B for Arjun → gallery shows "Social OK". Review-ask fires only
      because the Google review URL is set.

## Phase 4 — Marketing engine (50 min)

- [ ] Social → **Brand & logo** button opens the wizard: complete Brand
      Personality (tone sliders, Hinglish for Instagram, 2 proof points e.g.
      "1,200+ happy patients since 2015" — note how unproven claims get
      rejected later).
- [ ] Social → New post: topic picker → treatment "Root Canal" → pick a myth
      topic → generates IG + FB + GBP variants (**1 credit each**).
- [ ] Review a post: approve the IG one. **Render branded image (free)** —
      credits unchanged, logo visible on the card.
- [ ] **✨ Premium visuals:** on the same post tap "Photo backdrop (1
      credit)" → ~15 s → warm photo behind your brand overlay + ✨ chip; then
      "Studio photo (2 credits)" → richer image. Balance drops exactly 1
      then 2. (Carousel prices show 3 / 5.)
- [ ] Publish flow: copy caption → download image → Mark as posted.
- [ ] Generate (Content Studio): **AI model picker shows Claude
      (Recommended · Included), ChatGPT (+1 credit), Gemini (Included).**
      Generate a "Question Answer Page" with Claude (1 cr), regenerate with
      ChatGPT (2 cr), once more with Gemini (1 cr) — the result badge names
      the model each time. Save → /history shows the model pill.
- [ ] Website types: generate a Service Page for "Dental Implant" with
      AI-Citable ON → META lines + SEO Schema block present → Publish as
      hosted page (1 cr) → open the public /p/… URL on your phone.
- [ ] WhatsApp Broadcast: Diwali offer → MESSAGE + wa.me-encoded text.
- [ ] Campaigns: draft a recall campaign with AI (1 cr), send one wa.me.
- [ ] AI Visibility: record a check (free) → scorecard updates.
- [ ] Deep Audit (from Phase 1) is done: score + "Where You Stand" + 30-day
      plan render; the PDF-ish report link works.

## Phase 5 — Money & guardrails (20 min)

- [ ] Upgrade page: **Growth Monthly ₹2,999** with 100 content credits,
      10 map scans, 1 Deep Audit, 30 social posts. Packs priced: Content 50 =
      ₹549, Content 200 = ₹1,699, Map 10 = ₹449, Map 50 = ₹1,799, Deep Audit
      = ₹599. (If any show ₹0 → migration 047 didn't run.)
- [ ] Cashfree checkout opens for the plan (use a real ₹ test if you're ready
      to; otherwise verify the checkout page loads and cancel).
- [ ] Burn credits to zero (regenerate content) → generation blocks with the
      upgrade nudge at exactly 0; premium visual at insufficient balance →
      402 message, image unchanged, nothing deducted.
- [ ] Settings → Billing: ledger lists every spend/refund from this run.

## Phase 6 — Cross-device (15 min)

- [ ] Android Chrome: install PWA, sidebar becomes hamburger, tables are
      stacked cards, all tap targets comfortable, wa.me buttons open the
      WhatsApp app.
- [ ] Log out / log in: lands on dashboard (profile complete → no gate).

---

**Expected credit burn for this whole pass:** ~20–24 content credits + 1 map
scan + 1 deep audit — designed to fit inside the 30-credit trial with a small
margin. If you run short, top up via admin grant, not by skipping steps.
