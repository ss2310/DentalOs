-- 005_seed_post_types.sql
-- Seeds the global post_types catalog for the /generate Content Studio.
-- post_types has no clinic_id and no write RLS policy for authenticated users,
-- so this must be run in the Supabase SQL Editor (postgres role bypasses RLS).
--
-- Idempotent: a unique index on name + ON CONFLICT upsert means re-running this
-- file refreshes the templates in place (no duplicates).
--
-- ARCHITECTURE
-- - The SHARED SYSTEM PROMPT (clinic identity + guardrails) lives in the API
--   route (app/api/generate/route.ts) and is sent as `system` on every call.
-- - Each row's prompt_template is filled with {{variables}} and sent as the
--   `user` message. Variables: {{clinic_name}} {{area}} {{city}} {{doctor_name}}
--   {{clinic_phone}} {{website_url}} {{tone}} {{topic}} {{context}} plus per-type
--   extras ({{review_text}} {{star_rating}} {{target_area}} {{question}} {{occasion}}).
-- - max_tokens is chosen in code by platform: Website types → 4000, else 1500.
-- - Web pages emit their JSON-LD schema inline ("PART B — SCHEMA"); the route
--   splits it out. So schema_template stays null here.
--
-- extra_fields (jsonb) drives the input UI:
--   { "topic": {"show":bool,"required":bool,"label":str,"placeholder":str},
--     "inputs": [ {"name","label","type":"text|textarea|select","options":[],"required":bool,"placeholder"} ] }

create unique index if not exists post_types_name_key on post_types (name);

insert into post_types (name, platform, credits_cost, prompt_template, schema_template, extra_fields) values

-- 1. GBP Post ------------------------------------------------------------------
(
  'GBP Post', 'Google Business', 2,
  $tpl$Write a Google Business Profile post about: {{topic}}.
Tone: {{tone}}. Context: {{context}}.
- Language: Hinglish (Hindi + English, Roman script), warm.
- 150–200 words, hard max 1,400 characters.
- CRITICAL: the first sentence (~first 100 characters) must hook on its own — Google hides the rest behind "Read more." Put the core benefit or offer in that opening line.
- NO hashtags — they are not clickable on GBP and read as spam.
- 3–5 emojis, spread naturally, not clustered.
- Mention {{area}}, {{city}} once, naturally.
- One clear CTA (call / book / visit).
- End with: {{clinic_name}} | 📞 {{clinic_phone}}

--- EXAMPLE of excellent output (different clinic — match this quality and structure, never copy its specifics) ---
Daant peele ya dull lag rahe hain? Ek professional scaling & polishing se woh natural shine wapas laayi ja sakti hai ✨

Roz brush karne ke baad bhi, thoda tartar aur plaque aise corners mein jam jaata hai jahan brush nahi pahunchta. Yahi aage chalke gums ki problem aur bad breath ki wajah ban sakta hai. Professional cleaning ismein madad karti hai — clean daant, fresh saans, healthy gums 🦷

SmileWell Dental, Vaishali Nagar mein hum aapke comfort ka poora dhyan rakhte hain. Zyada waqt nahi lagta, aur aap ek fresh smile ke saath ghar jaate hain 😊

Apni cleaning book karne ke liye aaj hi call karein 👇

SmileWell Dental | 📞 98765 43210
--- END EXAMPLE ---$tpl$,
  null,
  '{"topic":{"required":true,"label":"What is this post about?","placeholder":"e.g. Painless single-sitting root canal"}}'::jsonb
),

-- 2. Instagram Caption ---------------------------------------------------------
(
  'Instagram Caption', 'Instagram', 1,
  $tpl$Write an Instagram caption about: {{topic}}.
Tone: {{tone}}. Context: {{context}}.
- Language: Hinglish, conversational, scroll-stopping.
- First line (max 125 characters) is a standalone hook — Instagram hides everything after it behind "...more." Use a question, bold statement, or relatable pain point.
- Body: 3–6 short lines with line breaks. Educate or entertain, don't just advertise.
- One clear CTA (DM / call / book / "save this").
- End with 3–5 targeted hashtags on a new line: mix local ({{area}}, {{city}} dental) with topic tags. Never more than 5.
- Emojis purposeful, not decorative filler.

--- EXAMPLE of excellent output (different clinic — match this quality and structure, never copy its specifics) ---
Brush karte waqt khoon aata hai? Yeh normal nahi hai 🚨

Bleeding gums aksar early gum disease ka pehla signal hote hain — aur good news yeh hai ki shuruaat mein isse aasani se manage kiya ja sakta hai.

Ignore mat kariye. Ek simple checkup se pata chal jaata hai ki gums healthy hain ya thoda dhyan chahiye 🦷

Slot book karne ke liye DM karein ya call karein 📞

#JaipurDentist #GumCare #DentalHealth #VaishaliNagar #SmileWell
--- END EXAMPLE ---$tpl$,
  null,
  '{"topic":{"required":true,"label":"What is this post about?","placeholder":"e.g. Teeth whitening before wedding season"}}'::jsonb
),

-- 3. Blog Article --------------------------------------------------------------
(
  'Blog Article', 'Website', 3,
  $tpl$Write an SEO blog article for the website of {{clinic_name}} ({{area}}, {{city}}).
Topic: {{topic}}. Tone: {{tone}}. Context: {{context}}.
- Language: primarily English, with a few natural Hinglish phrases for local warmth.
- 800–1,200 words.
- Output in this order, labelled:
  META TITLE: (≤60 characters, primary keyword + {{city}})
  META DESCRIPTION: (≤155 characters, keyword + reason to click)
  Then the article in markdown:
  - H1 (title)
  - 4–6 H2 sections, short paragraphs; use bullets where they aid scanning
  - Closing section with a soft CTA to book at {{clinic_name}} (📞 {{clinic_phone}})
- Write for a patient, not a dentist — explain jargon simply.
- Sound authoritative and trustworthy. No scare tactics, no guarantees.$tpl$,
  null,
  '{"topic":{"required":true,"label":"Article topic","placeholder":"e.g. Is teeth scaling safe? Myths vs facts"}}'::jsonb
),

-- 4. Service Page --------------------------------------------------------------
(
  'Service Page', 'Website', 3,
  $tpl$Write a conversion-focused service page for the treatment: {{topic}}.
Tone: {{tone}}. Context: {{context}}.
PART A — PAGE COPY (English with light Hinglish warmth):
- META TITLE (≤60 chars) and META DESCRIPTION (≤155 chars).
- H1 with the service + {{city}}.
- Opening paragraph: what the treatment is and who it's for.
- H2 "Why choose {{clinic_name}}" — 3–4 credible trust points (comfort, care, experience, technology). Keep general if specifics aren't in context; do not fabricate.
- H2 "What to expect" — the process in simple steps.
- H2 "FAQs" — 4 common patient questions with concise answers.
- Closing CTA with 📞 {{clinic_phone}}.
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
Output PART A, then PART B.$tpl$,
  null,
  '{"topic":{"required":true,"label":"Treatment name","placeholder":"e.g. Dental Implants"}}'::jsonb
),

-- 5. Review Response -----------------------------------------------------------
(
  'Review Response', 'Google Reviews', 1,
  $tpl$Write a reply to a Google review for {{clinic_name}}.
Star rating: {{star_rating}}/5.
Review text: "{{review_text}}"
Tone: {{tone}}. Context: {{context}}.
- Address the reviewer by name if evident; otherwise a warm generic greeting.
- Concise: 2–4 sentences. Sign off as the {{clinic_name}} team (or Dr. {{doctor_name}} for a personal touch).
- Match the review's language: English review → English reply; Hinglish → Hinglish.
IF rating is 4–5:
- Thank them warmly, reference one specific thing they mentioned, invite them back.
IF rating is 1–3:
- Empathise sincerely. Do NOT admit fault, negligence, or any specific wrongdoing — this is a permanent public record.
- Do NOT mention any treatment or health detail about the patient.
- Apologise that their experience fell short, then move it OFFLINE: invite them to call {{clinic_phone}} so the clinic can understand and make it right.
- Stay calm and professional even if the review is hostile.

--- EXAMPLES of excellent replies (different clinic — match the tone and the offline-resolution pattern, never copy specifics) ---
[5-star]
Review: "Best dental experience! Dr. Anjali was so gentle and explained everything. Highly recommend."
Reply: "Thank you so much, Rahul! 😊 So glad Dr. Anjali could make your visit comfortable and clear. It means a lot that you'd recommend us — see you at your next check-up! — Team SmileWell"

[2-star]
Review: "Waited 40 minutes past my appointment time and felt rushed. Not happy."
Reply: "Thank you for sharing this, Priya — we're sorry your visit didn't meet the standard we aim for. Your time matters to us, and we'd genuinely like to understand what happened. Please call us at 📞 98765 43210 so we can make it right. — Team SmileWell"
--- END EXAMPLES ---

Note on the 2-star example: it empathises, moves the conversation offline, and does NOT admit fault, confirm the complaint, or mention any treatment detail. Preserve exactly that pattern for all negative reviews.$tpl$,
  null,
  '{"topic":{"show":false},"inputs":[{"name":"review_text","label":"Paste the patient''s review","type":"textarea","required":true,"placeholder":"Doctor bahut acche hain, but reception ne wait karaya..."},{"name":"star_rating","label":"Star rating","type":"select","options":["1","2","3","4","5"],"required":true}]}'::jsonb
),

-- 6. Instagram Reel Script -----------------------------------------------------
(
  'Instagram Reel Script', 'Instagram', 2,
  $tpl$Write a short-form video (Reel / Short) script about: {{topic}}.
Tone: {{tone}}. Context: {{context}}.
- Target 20–35 seconds of spoken content. Language: Hinglish, energetic, human.
- Output these labelled sections:
  1. HOOK (0–3 sec): one punchy scroll-stopping line — a myth, bold question, or relatable problem. This is the single most important line.
  2. SCRIPT: 3–5 beats. For each beat: the SPOKEN line, then in [brackets] the ON-SCREEN TEXT and a quick visual/shot suggestion.
  3. CTA (final 3 sec): spoken + on-screen, driving to DM / call / book.
  4. CAPTION: 1–2 line post caption with 3–5 hashtags.
- Simple, punchy, no jargon, no guarantees.$tpl$,
  null,
  '{"topic":{"required":true,"label":"Reel topic","placeholder":"e.g. 3 signs you need braces"}}'::jsonb
),

-- 7. Geo Landing Page ----------------------------------------------------------
(
  'Geo Landing Page', 'Website', 3,
  $tpl$Write a location-targeted landing page for patients searching for a dentist in: {{target_area}} (near {{city}}).
Tone: {{tone}}. Context: {{context}}.
PART A — PAGE COPY (English with light Hinglish warmth):
- META TITLE (≤60 chars, keyword-first, e.g. "Dentist in {{target_area}} | {{clinic_name}}").
- META DESCRIPTION (≤155 chars, mentions {{target_area}}).
- H1 naming {{target_area}} explicitly.
- Opening: speak to the local searcher ("Looking for a trusted dentist in {{target_area}}?") and how convenient the clinic is.
- H2 services offered (brief).
- H2 why patients from {{target_area}} choose {{clinic_name}} — credible trust points.
- H2 getting here / accessibility from {{target_area}} (general if no specifics given).
- Local CTA with 📞 {{clinic_phone}}.
- Mention {{target_area}} 3–4 times total — natural, not stuffed.
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
Output PART A then PART B.$tpl$,
  null,
  '{"topic":{"show":false},"inputs":[{"name":"target_area","label":"Target area / locality","type":"text","required":true,"placeholder":"e.g. Andheri West"}]}'::jsonb
),

-- 8. GBP Q&A Response ----------------------------------------------------------
(
  'GBP Q&A Response', 'Google Business', 1,
  $tpl$Write an answer to a question posted on {{clinic_name}}'s Google Business Profile.
Question: "{{question}}"
Tone: {{tone}}. Context: {{context}}.
- Match the question's language (English or Hinglish).
- 2–4 sentences, directly helpful and friendly.
- Answer the actual question. If the answer isn't in the context, give a helpful general response and invite them to call {{clinic_phone}} to confirm.
- No individual medical advice, no guarantees, no pricing unless in context.
- End with a light nudge to call or visit if relevant.$tpl$,
  null,
  '{"topic":{"show":false},"inputs":[{"name":"question","label":"The question that was asked","type":"textarea","required":true,"placeholder":"Kya aap Sunday ko open rehte hain?"}]}'::jsonb
),

-- 9. WhatsApp Broadcast --------------------------------------------------------
(
  'WhatsApp Broadcast', 'WhatsApp', 1,
  $tpl$Write a WhatsApp broadcast for this occasion/offer: {{occasion}}.
Tone: {{tone}}. Context: {{context}}.
- Language: Hinglish, warm and personal — a message from a caring family dentist, not a blast.
- SHORT: 2–4 lines. WhatsApp rewards brevity.
- Open with a greeting containing the literal token {name} (replaced per-patient at send time), e.g. "Namaste {name} ji 🙏".
- 1–3 tasteful emojis. WhatsApp *bold* allowed, sparingly.
- One clear action (reply / call {{clinic_phone}} / book).
- No ALL CAPS, no spam, no fake urgency. End with {{clinic_name}}.
Output TWO labelled blocks:
MESSAGE: the human-readable message.
WA_ENCODED: the exact same message URL-encoded for https://wa.me/?text= — spaces as %20, line breaks as %0A, emojis and all special characters encoded correctly.$tpl$,
  null,
  '{"topic":{"show":false},"inputs":[{"name":"occasion","label":"Occasion / offer","type":"text","required":true,"placeholder":"e.g. Diwali dental checkup camp"}]}'::jsonb
),

-- 10. Blog Article with FAQ ----------------------------------------------------
(
  'Blog Article with FAQ', 'Website', 3,
  $tpl$Write an SEO blog article WITH an FAQ section for {{clinic_name}} ({{area}}, {{city}}).
Topic: {{topic}}. Tone: {{tone}}. Context: {{context}}.
PART A — ARTICLE (English with light Hinglish warmth), 800–1,200 words:
- META TITLE (≤60 chars) and META DESCRIPTION (≤155 chars).
- H1, then 4–6 H2 sections.
- A dedicated H2 "Frequently Asked Questions" with 4–6 Q&As (each answer 1–3 sentences).
- Soft CTA to book at 📞 {{clinic_phone}}.
- Patient-friendly, trustworthy, no guarantees.
PART B — SCHEMA ("SEO Schema" heading) — output BOTH as valid JSON-LD:
1. Article: headline, author "Dr. {{doctor_name}}", publisher "{{clinic_name}}", url "{{website_url}}".
2. FAQPage whose questions/answers EXACTLY match the FAQ section you wrote:
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {"@type": "Question", "name": "<Q>", "acceptedAnswer": {"@type": "Answer", "text": "<A>"}}
  ]
}
Output PART A then PART B.$tpl$,
  null,
  '{"topic":{"required":true,"label":"Article topic","placeholder":"e.g. Everything about wisdom teeth removal"}}'::jsonb
)

on conflict (name) do update set
  platform        = excluded.platform,
  credits_cost    = excluded.credits_cost,
  prompt_template = excluded.prompt_template,
  schema_template = excluded.schema_template,
  extra_fields    = excluded.extra_fields;
