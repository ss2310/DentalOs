-- ============================================================
-- GrowthOS — migration 044: prompt quality pass + grouped social topics
--
-- 1. PROMPT UPGRADES (6 of the 16 post_types): the long-form website types
--    and the two example-less short types get the treatment the best prompts
--    (GBP Post, IG Caption, Review Response) already have — answer-first
--    structure, an anti-boilerplate ban-list, concrete-language rules, and
--    few-shot examples where they earn their tokens. The already-strong
--    templates are left untouched (no churn).
-- 2. GROUPED SOCIAL TOPICS: topic_suggestions gains `group_label` so the
--    Social composer can offer a two-level picker — treatment first
--    ("Root Canal") → curated social topics within it → plus a free-text
--    "Other". Dental seed rows stay in the shared NULL-vertical pool
--    (CLAUDE.md vertical rules).
--
-- Additive + idempotent. Requires 005 (post_types), 012 (topic_suggestions).
-- Run in the Supabase SQL editor, then: notify pgrst, 'reload schema';
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1a. Shared anti-boilerplate rules appended to the long-form types.
--     (Kept inside each template so the route stays template-driven.)
-- ---------------------------------------------------------------------------

update post_types set prompt_template = $TPL$Write an SEO blog article for the website of {{clinic_name}} ({{area}}, {{city}}).
Topic: {{topic}}. Tone: {{tone}}. Context: {{context}}.
- Language: primarily English, with a few natural Hinglish phrases for local warmth.
- 800–1,200 words.
- Output in this order, labelled:
  META TITLE: (≤60 characters, primary keyword + {{city}}; include {{year}} if it reads naturally)
  META DESCRIPTION: (≤155 characters, keyword + a concrete reason to click)
  Then the article in markdown:
  - H1 (title)
  - IMMEDIATELY under the H1: a self-contained 40–60 word DIRECT ANSWER to the search intent behind the topic — quotable on its own, no preamble.
  - 4–6 H2 sections framed as the QUESTIONS a patient would actually search; short paragraphs (2–3 sentences), bullets where they aid scanning.
  - Closing section with a soft CTA to book at {{clinic_name}} (📞 {{clinic_phone}}).
- Write for a worried patient at an 8th-grade reading level — explain every clinical term in the same sentence you use it.
- Every claim must be concrete or omitted. BANNED (never output these or their cousins): "state-of-the-art", "world-class", "cutting-edge", "look no further", "we understand that", "nestled in", "in today's fast-paced world", "your smile is our passion", "comprehensive dental solutions".
- BANNED openers: "In today's world", "In the realm of", "When it comes to". Start with the patient's problem or a surprising fact from the context.
- No scare tactics, no guarantees, no invented statistics — if a number wasn't supplied, don't use one.$TPL$
where name = 'Blog Article';

update post_types set prompt_template = $TPL$Write an SEO blog article WITH an FAQ section for {{clinic_name}} ({{area}}, {{city}}).
Topic: {{topic}}. Tone: {{tone}}. Context: {{context}}.
PART A — ARTICLE (English with light Hinglish warmth), 800–1,200 words:
- META TITLE (≤60 chars, keyword + {{city}}; include {{year}} if natural) and META DESCRIPTION (≤155 chars).
- H1, then IMMEDIATELY a self-contained 40–60 word DIRECT ANSWER to the search intent — quotable on its own.
- 4–6 H2 sections framed as the questions a patient would search; short paragraphs; explain every clinical term where it first appears (8th-grade level).
- A dedicated H2 "Frequently Asked Questions" with 4–6 Q&As (each answer 1–3 sentences, self-contained — an AI engine should be able to quote any single answer).
- Soft CTA to book at 📞 {{clinic_phone}}.
- Concrete or omitted: no invented numbers. BANNED phrases: "state-of-the-art", "world-class", "cutting-edge", "look no further", "we understand that", "in today's fast-paced world", "your smile is our passion", "comprehensive dental solutions". BANNED openers: "In today's world", "In the realm of", "When it comes to".
PART B — SCHEMA ("SEO Schema" heading) — output BOTH as valid JSON-LD:
1. Article: headline, author "Dr. {{doctor_name}}", publisher "{{clinic_name}}", url "{{website_url}}", dateModified "{{today}}".
2. FAQPage whose questions/answers EXACTLY match the FAQ section you wrote:
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {"@type": "Question", "name": "<Q>", "acceptedAnswer": {"@type": "Answer", "text": "<A>"}}
  ]
}
Output PART A then PART B.$TPL$
where name = 'Blog Article with FAQ';

update post_types set prompt_template = $TPL$Write a conversion-focused service page for the treatment: {{topic}}.
Tone: {{tone}}. Context: {{context}}.
PART A — PAGE COPY (English with light Hinglish warmth):
- META TITLE (≤60 chars) and META DESCRIPTION (≤155 chars).
- H1 with the service + {{city}}.
- Opening: a self-contained 40–60 word answer to "what is this treatment and who is it for" — quotable on its own, naming {{clinic_name}} and {{city}} naturally.
- H2 "Who needs {{topic}} — and who doesn't": honest signs it's needed AND when a simpler option may do. (This honesty section converts better than any sales pitch — and AI engines quote it.)
- H2 "What to expect at {{clinic_name}}" — the visit-by-visit process in numbered steps a nervous patient can picture.
- H2 "Why patients choose {{clinic_name}}" — 3–4 trust points built ONLY from the context; if the context gives nothing specific, speak to comfort, clear pricing discussions, and follow-up care in concrete everyday language. Never fabricate equipment, awards, or years of experience.
- H2 "FAQs" — 4 questions, and the FIRST must be the cost question ("What does {{topic}} cost in {{city}}?"): answer with the honest FACTORS that decide the price (never an invented number, no price unless supplied in context) and invite a call for an exact quote. Include one "Is it painful?" style comfort question answered without promising painlessness.
- Closing CTA with 📞 {{clinic_phone}}.
- BANNED phrases: "state-of-the-art", "world-class", "cutting-edge", "look no further", "we understand that", "your smile is our passion", "comprehensive dental solutions", "top-notch".
PART B — SCHEMA (under a "SEO Schema" heading, valid JSON-LD, omit fields you have no value for):
{
  "@context": "https://schema.org",
  "@type": "MedicalProcedure",
  "name": "{{topic}}",
  "description": "<one-line description you wrote>",
  "provider": {
    "@type": "Dentist",
    "name": "{{clinic_name}}",
    "telephone": "{{clinic_phone}}",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "{{area}}",
      "addressRegion": "{{city}}",
      "addressCountry": "IN"
    },
    "url": "{{website_url}}"
  }
}
Output PART A, then PART B.$TPL$
where name = 'Service Page';

update post_types set prompt_template = $TPL$Write a location-targeted landing page for patients searching for a dentist in: {{target_area}} (near {{city}}).
Tone: {{tone}}. Context: {{context}}.
GOAL: this must read like a page genuinely written FOR {{target_area}} residents — not a template with the area name swapped in. Google demotes doorway pages; specificity is the defence.
PART A — PAGE COPY (English with light Hinglish warmth):
- META TITLE (≤60 chars, keyword-first, e.g. "Dentist in {{target_area}} | {{clinic_name}}").
- META DESCRIPTION (≤155 chars, mentions {{target_area}}).
- H1 naming {{target_area}} explicitly.
- Opening: a self-contained 40–60 word answer for the local searcher — who the clinic is, where it is relative to {{target_area}}, and the one strongest reason to cross that distance.
- H2 services offered (brief — link-style list, no padding).
- H2 why patients from {{target_area}} choose {{clinic_name}} — trust points ONLY from context; otherwise concrete everyday reasons (appointment punctuality, clear cost discussions, follow-up on WhatsApp), never invented specifics.
- H2 getting here from {{target_area}} — if the context gives routes/landmarks use them; otherwise keep it general and invite a call for directions. NEVER invent a landmark, road name, or travel time.
- Local CTA with 📞 {{clinic_phone}}.
- Mention {{target_area}} 3–4 times total — natural, not stuffed.
- BANNED phrases: "state-of-the-art", "world-class", "look no further", "nestled in", "conveniently located" (show the convenience concretely instead, or omit).
PART B — SCHEMA ("SEO Schema" heading, valid JSON-LD, omit unknown fields):
{
  "@context": "https://schema.org",
  "@type": "Dentist",
  "name": "{{clinic_name}}",
  "areaServed": "{{target_area}}",
  "telephone": "{{clinic_phone}}",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "{{area}}",
    "addressRegion": "{{city}}",
    "addressCountry": "IN"
  },
  "url": "{{website_url}}",
  "priceRange": "₹₹"
}
Output PART A then PART B.$TPL$
where name = 'Geo Landing Page';

update post_types set prompt_template = $TPL$Write a short-form video (Reel / Short) script about: {{topic}}.
Tone: {{tone}}. Context: {{context}}.
- Target 20–35 seconds of spoken content. Language: Hinglish, energetic, human.
- Every visual suggestion must be shootable by ONE person on a phone inside a small clinic (talking head, over-shoulder, close-up of a model/tool, text-on-screen) — never suggest drone shots, actors, or stock footage.
- Output these labelled sections:
  1. HOOK (0–3 sec): one punchy scroll-stopping line — a myth, bold question, or relatable problem. This single line decides whether the video works.
  2. SCRIPT: 3–5 beats. For each beat: the SPOKEN line, then in [brackets] the ON-SCREEN TEXT and a phone-shootable visual.
  3. CTA (final 3 sec): spoken + on-screen, driving to DM / call / book.
  4. CAPTION: 1–2 line post caption with 3–5 hashtags (mix {{area}}/{{city}} + topic).
- Simple, punchy, no jargon, no guarantees.

--- EXAMPLE of excellent output (different clinic — match the energy and structure, never copy its specifics) ---
HOOK: "Root canal = dard? Ye myth aaj khatam karte hain 🙅"
SCRIPT:
Beat 1: "Sach ye hai — root canal DARD hataane ke liye hota hai, dene ke liye nahi." [ON-SCREEN: "RCT = pain RELIEF" | close-up talking head]
Beat 2: "Jo dard aapko lagta hai RCT ka hai... woh actually infection ka hai jo pehle se hai." [ON-SCREEN: "Dard = infection, not treatment" | point at an X-ray on screen]
Beat 3: "Modern anaesthesia ke saath zyada tar patients bolte hain — 'bas? ho gaya?'" [ON-SCREEN: "Bas? Ho gaya? 😄" | mock-surprised face to camera]
CTA: "Daant mein dard hai? Der mat kariye — DM ya call kariye, hum check kar lenge." [ON-SCREEN: "DM 'DARD' 👇"]
CAPTION: Root canal se darr lagta hai? Ye reel aapke liye hai 🦷 #RootCanal #JaipurDentist #DentalMyths #VaishaliNagar
--- END EXAMPLE ---$TPL$
where name = 'Instagram Reel Script';

update post_types set prompt_template = $TPL$Write a WhatsApp broadcast for this occasion/offer: {{occasion}}.
Tone: {{tone}}. Context: {{context}}.
- Language: Hinglish, warm and personal — a message from a caring family dentist, not a blast.
- SHORT: 2–4 lines. WhatsApp rewards brevity.
- Open with a greeting containing the literal token {name} (replaced per-patient at send time), e.g. "Namaste {name} ji 🙏".
- 1–3 tasteful emojis. WhatsApp *bold* allowed, sparingly.
- One clear action (reply / call {{clinic_phone}} / book).
- No ALL CAPS, no spam, no fake urgency ("aaj hi!", "sirf 2 slots!" are banned unless the context genuinely says so). End with {{clinic_name}}.
Output TWO labelled blocks:
MESSAGE: the human-readable message.
WA_ENCODED: the exact same message URL-encoded for https://wa.me/?text= — spaces as %20, line breaks as %0A, emojis and all special characters encoded correctly.

--- EXAMPLE of an excellent MESSAGE (different clinic — match the warmth and brevity, never copy specifics) ---
Namaste {name} ji 🙏
School holidays chal rahi hain — bachon ke dental checkup ka perfect time! Is hafte kids checkup camp chal raha hai.
Slot ke liye bas is message ka reply kariye 😊
— SmileWell Dental
--- END EXAMPLE ---$TPL$
where name = 'WhatsApp Broadcast';

-- ---------------------------------------------------------------------------
-- 2. Grouped social topics: treatment → topics, two-level picker.
-- ---------------------------------------------------------------------------
alter table topic_suggestions add column if not exists group_label text;

-- Existing curated social topics become the "General & Seasonal" group.
update topic_suggestions
   set group_label = 'General & Seasonal'
 where bank = 'social' and clinic_id is null and group_label is null;

-- Treatment-grouped social topics (shared NULL-vertical pool — dental default).
-- Labels are distinct from every existing (bank,label) row (curated unique idx).
insert into topic_suggestions (bank, label, sort_order, group_label, source, is_active) values
  -- Root Canal
  ('social', 'Root canal myth-busting: dard hataata hai, deta nahi', 101, 'Root Canal', 'curated', true),
  ('social', 'RCT ke baad crown kyon zaroori hai',                    102, 'Root Canal', 'curated', true),
  ('social', 'Root canal vs daant nikalwana — sahi faisla kaise',     103, 'Root Canal', 'curated', true),
  ('social', 'RCT ke signs: kab ignore karna mehnga padta hai',       104, 'Root Canal', 'curated', true),
  ('social', 'Ek RCT patient ka typical visit — step by step',        105, 'Root Canal', 'curated', true),
  ('social', 'Root canal ke baad care ke 5 simple rules',             106, 'Root Canal', 'curated', true),
  -- Braces & Aligners
  ('social', 'Braces vs clear aligners — kiske liye kya sahi',        111, 'Braces & Aligners', 'curated', true),
  ('social', 'Braces ki sahi umar kya hai (hint: sirf teens nahi)',   112, 'Braces & Aligners', 'curated', true),
  ('social', 'Aligners ke saath khaana-peena: do''s & don''ts',       113, 'Braces & Aligners', 'curated', true),
  ('social', 'Braces ke pehle hafte mein kya expect karein',          114, 'Braces & Aligners', 'curated', true),
  ('social', 'Teeth alignment sirf looks nahi — bite aur health bhi', 115, 'Braces & Aligners', 'curated', true),
  ('social', 'Retainers: braces ke baad ka sabse important step',     116, 'Braces & Aligners', 'curated', true),
  -- Dental Implants
  ('social', 'Missing tooth ignore karne ki asli keemat',             121, 'Dental Implants', 'curated', true),
  ('social', 'Implant vs bridge vs denture — farak samjhiye',         122, 'Dental Implants', 'curated', true),
  ('social', 'Dental implant ka process — timeline ke saath',         123, 'Dental Implants', 'curated', true),
  ('social', 'Kya implant har umar mein ho sakta hai?',               124, 'Dental Implants', 'curated', true),
  ('social', 'Implant ke baad ki care — lifetime smile ka formula',   125, 'Dental Implants', 'curated', true),
  -- Whitening & Smile Makeover
  ('social', 'Ghar ke whitening hacks jo daanton ko nuksan dete hain',131, 'Whitening & Smile Makeover', 'curated', true),
  ('social', 'Professional whitening vs whitening toothpaste',        132, 'Whitening & Smile Makeover', 'curated', true),
  ('social', 'Peele daant = kamzor daant? Myth vs fact',              133, 'Whitening & Smile Makeover', 'curated', true),
  ('social', 'Shaadi season smile prep — kab shuru karein',           134, 'Whitening & Smile Makeover', 'curated', true),
  ('social', 'Veneers kya hote hain — kiske liye sahi',               135, 'Whitening & Smile Makeover', 'curated', true),
  -- Kids' Dentistry
  ('social', 'Bachon ka pehla dental visit — kab aur kaisa ho',       141, 'Kids'' Dentistry', 'curated', true),
  ('social', 'Doodh ke daant kharab ho toh kya farak padta hai?',     142, 'Kids'' Dentistry', 'curated', true),
  ('social', 'Bachon mein cavity ke 3 sabse bade reasons',            143, 'Kids'' Dentistry', 'curated', true),
  ('social', 'Thumb sucking aur daanton ka connection',               144, 'Kids'' Dentistry', 'curated', true),
  ('social', 'School jaane se pehle 2-minute brushing routine',       145, 'Kids'' Dentistry', 'curated', true),
  -- Gum Care & Cleaning
  ('social', 'Brush karte waqt khoon — kab worry karein',             151, 'Gum Care & Cleaning', 'curated', true),
  ('social', 'Scaling se daant kamzor hote hain? Myth busted',        152, 'Gum Care & Cleaning', 'curated', true),
  ('social', 'Bad breath ke asli reasons (sirf pyaaz nahi)',          153, 'Gum Care & Cleaning', 'curated', true),
  ('social', 'Saal mein kitni baar cleaning karwani chahiye',         154, 'Gum Care & Cleaning', 'curated', true),
  ('social', 'Gums ka dhyan = heart ka dhyan — surprising link',      155, 'Gum Care & Cleaning', 'curated', true)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. Register this migration.
-- ---------------------------------------------------------------------------
insert into applied_migrations (version, name) values
  ('044','prompt_quality_topic_groups')
on conflict (version) do nothing;
