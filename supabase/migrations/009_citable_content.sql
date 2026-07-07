-- ============================================================
-- GrowthOS — migration 009: AI-Citable content
--
-- 1) Adds generated_content.citable_mode so /history can badge generations that
--    were produced with AI-Citable Mode on.
-- 2) Seeds 5 new citation-optimised "Website" post types (upsert by name, same
--    pattern as 005). Run in the Supabase SQL Editor (postgres bypasses RLS).
--
-- The AI-Citable instruction block + hard YMYL rules live in the API route
-- (app/api/generate/route.ts) and are injected into the system prompt when the
-- toggle is on. These templates carry the type-specific structure + baseline
-- never-fabricate YMYL behavior so they stay safe even with the toggle off.
--
-- New template variables available: {{today}} (DD MMM YYYY, IST) and {{year}}.
-- Additive + idempotent.
-- ============================================================

alter table generated_content
  add column if not exists citable_mode boolean not null default false;

insert into post_types (name, platform, credits_cost, prompt_template, schema_template, extra_fields) values

-- A. City Dental Stats ---------------------------------------------------------
(
  'City Dental Stats', 'Website', 3,
  $tpl$Write a "{{city}} Dental Treatment Statistics {{year}}" reference page for {{clinic_name}} ({{area}}, {{city}}).
Use ONLY the real numbers in STATS DATA below. Never invent, estimate, or guess a figure.
STATS DATA (clinic-supplied): {{stats_data}}
Context: {{context}}. Tone: {{tone}}.
PART A — PAGE COPY (English, patient-friendly):
- META TITLE (≤60 chars) and META DESCRIPTION (≤155 chars), both naming {{city}} and {{year}}.
- H1: "{{city}} Dental Treatment Statistics ({{year}})".
- A self-contained 40–60 word answer-first intro summarising what the page covers, naming {{clinic_name}}, {{area}}, {{city}}.
- Clearly LABELLED HTML <table>s built ONLY from STATS DATA (e.g. "Treatment cost ranges in {{city}}", "Typical treatment timelines", "Monthly patient volumes"). Each table has a caption and a header row.
- For ANY category or cell with no supplied number, output the literal placeholder "[clinic to supply: <what is needed>]" — never a made-up figure.
- A short plain-English reading of what the numbers mean for a patient choosing care.
- A visible "Last updated: {{today}}" line.
- Soft CTA to book at {{clinic_name}} (📞 {{clinic_phone}}).
PART B — SCHEMA ("SEO Schema" heading, valid JSON-LD): an Article (headline, author "Dr. {{doctor_name}}", publisher "{{clinic_name}}", datePublished and dateModified "{{today}}"). If STATS DATA contains structured figures, ALSO emit a Dataset describing them. Omit fields you have no value for.
Output PART A then PART B.$tpl$,
  null,
  '{"topic":{"show":false},"inputs":[{"name":"stats_data","label":"Stats data (real numbers only)","type":"textarea","required":true,"placeholder":"e.g. RCT ₹4,000–8,000; Implant ₹25,000–45,000; ~120 patients/month; braces avg 18 months"}]}'::jsonb
),

-- B. Treatment Comparison ------------------------------------------------------
(
  'Treatment Comparison', 'Website', 3,
  $tpl$Write a treatment comparison page comparing: {{treatments}} — for {{clinic_name}} ({{area}}, {{city}}).
Real cost/time data (use ONLY these, never invent a number): {{cost_time_data}}
Context: {{context}}. Tone: {{tone}}.
PART A — PAGE COPY (English, patient-friendly):
- META TITLE (≤60 chars) and META DESCRIPTION (≤155 chars) naming the options and {{city}}.
- H1 naming the comparison and {{city}}.
- A self-contained 40–60 word answer-first intro stating, in plain terms, which option suits whom.
- A comparison HTML <table> with columns: Option | Typical cost range | Treatment time | Visibility | Maintenance | Best for | Age suitability.
  - Fill "Typical cost range" and "Treatment time" ONLY from the supplied data; where a value was not supplied, put "[clinic to supply: cost]" or "[clinic to supply: time]" — never invent a number.
  - The non-numeric columns (Visibility, Maintenance, Best for, Age suitability) may use standard dental knowledge, but no fabricated statistics.
- 2–3 short paragraphs on how to choose, localised to {{city}}.
- H2 "Frequently Asked Questions" with 3–4 concise Q&As.
- Soft CTA (📞 {{clinic_phone}}).
PART B — SCHEMA ("SEO Schema" heading, valid JSON-LD): output BOTH (1) an Article (author "Dr. {{doctor_name}}", publisher "{{clinic_name}}", dateModified "{{today}}") and (2) an FAQPage whose questions/answers EXACTLY match the FAQ section you wrote.
Output PART A then PART B.$tpl$,
  null,
  '{"topic":{"show":false},"inputs":[{"name":"treatments","label":"Treatments to compare","type":"text","required":true,"placeholder":"e.g. Braces vs Aligners vs Veneers"},{"name":"cost_time_data","label":"Real cost / time data (optional)","type":"textarea","required":false,"placeholder":"e.g. Braces ₹30–60k, 18–24 mo; Aligners ₹80k–1.8L, 12–18 mo"}]}'::jsonb
),

-- C. Clinician Guide (YMYL) ----------------------------------------------------
(
  'Clinician Guide (YMYL)', 'Website', 3,
  $tpl$Write an authoritative, patient-friendly clinical guide on: {{topic}} — for {{clinic_name}} ({{area}}, {{city}}), authored by the named clinician.
Author (use EXACTLY as given; never add or invent credentials): {{author_credentials}}
References the clinic supplied (may be empty): {{references}}
Context: {{context}}. Tone: {{tone}}.
STRICT YMYL RULES: never fabricate statistics, success rates, study citations, journal names, DOIs, or credentials. Use only supplied facts, numbers, and references. Where a figure or citation is missing, write "[clinic to supply: …]" — never invent one. No outcome guarantees.
PART A — PAGE COPY (English, patient-friendly but authoritative), 700–1,100 words:
- META TITLE (≤60 chars) and META DESCRIPTION (≤155 chars).
- H1 (question- or topic-shaped), including {{year}} where it reads naturally.
- A self-contained 40–60 word answer-first summary.
- Question-shaped H2/H3 sections explaining the topic simply and accurately.
- An "About the author" block using ONLY {{author_credentials}} — do not add degrees, fellowships, or years of experience that were not supplied.
- A visible "Last updated: {{today}}" line.
- A "References" section listing ONLY the links/sources in {{references}}. If {{references}} is empty, output exactly: "Sources: Indian Dental Association, WHO." then on a new line "[clinic to add specific references]". NEVER output a fabricated citation, journal, or DOI.
- Soft CTA (📞 {{clinic_phone}}).
PART B — SCHEMA ("SEO Schema" heading, valid JSON-LD): a MedicalWebPage AND an Article. author.name from {{author_credentials}}; publisher "{{clinic_name}}"; dateModified "{{today}}". Omit unknown fields.
Output PART A then PART B.$tpl$,
  null,
  '{"topic":{"required":true,"label":"Guide topic","placeholder":"e.g. Root canal treatment: what to expect"},"inputs":[{"name":"author_credentials","label":"Author credentials (exact — never invented)","type":"text","required":true,"placeholder":"e.g. Dr. Priya Sharma, BDS, MDS (Endodontics)"},{"name":"references","label":"References — real links / sources (optional)","type":"textarea","required":false,"placeholder":"Paste the real source URLs the clinic wants cited"}]}'::jsonb
),

-- D. Dental Update / What's New ------------------------------------------------
(
  'Dental Update / What''s New', 'Website', 2,
  $tpl$Write a short, dated "what's new" news post for {{clinic_name}} ({{area}}, {{city}}) about: {{topic}}.
Tone: {{tone}}. Context: {{context}}.
PART A — PAGE COPY (English, patient-friendly):
- META TITLE (≤60 chars) and META DESCRIPTION (≤155 chars), including {{year}}.
- H1 headline including {{year}} and the update, answer-first.
- A visible "Published: {{today}}" line.
- 1–2 short paragraphs: a self-contained, answer-first summary of what's new and what it means for patients at {{clinic_name}} in {{area}}, {{city}}. No fabricated claims, no outcome guarantees.
- One-line soft CTA (📞 {{clinic_phone}}).
PART B — SCHEMA ("SEO Schema" heading, valid JSON-LD): an Article with headline, author "Dr. {{doctor_name}}", publisher "{{clinic_name}}", datePublished "{{today}}", dateModified "{{today}}".
Output PART A then PART B.$tpl$,
  null,
  '{"topic":{"required":true,"label":"What''s new?","placeholder":"e.g. New painless laser gum treatment now available"}}'::jsonb
),

-- E. Question Answer Page ------------------------------------------------------
(
  'Question Answer Page', 'Website', 1,
  $tpl$Write a single-question answer page for {{clinic_name}} ({{area}}, {{city}}).
The patient's question: "{{question}}"
Tone: {{tone}}. Context: {{context}}.
PART A — PAGE COPY (English, patient-friendly):
- META TITLE (≤60 chars) based on the question + {{city}} where it fits. META DESCRIPTION (≤155 chars) = the tight answer.
- H1: the question exactly as asked.
- IMMEDIATELY below the H1: a self-contained, quotable 40–60 word DIRECT ANSWER — no preamble, naming {{clinic_name}} / {{city}} where natural. This is the most important part; keep it tight and factual.
- Then 2–4 short H2/H3 sections with deeper explanation (plain language, no fabricated stats, no guarantees).
- End with a soft CTA to book at {{clinic_name}} (📞 {{clinic_phone}}).
PART B — SCHEMA ("SEO Schema" heading, valid JSON-LD): a QAPage whose mainEntity Question and acceptedAnswer EXACTLY match the H1 and the direct answer.
Output PART A then PART B.$tpl$,
  null,
  '{"topic":{"show":false},"inputs":[{"name":"question","label":"Patient question","type":"text","required":true,"placeholder":"e.g. Does a root canal hurt?"}]}'::jsonb
)

on conflict (name) do update set
  platform        = excluded.platform,
  credits_cost    = excluded.credits_cost,
  prompt_template = excluded.prompt_template,
  schema_template = excluded.schema_template,
  extra_fields    = excluded.extra_fields;
