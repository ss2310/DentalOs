// Product knowledge base for the in-app FAQ help chatbot (see
// app/api/help/route.ts + components/help-chat.tsx) AND the future in-app help
// centre. ONE structured source, several surfaces — so the KB can't drift out of
// sync with the app the way a hand-written blob did.
//
// This is a HAND-WRITTEN product guide, deliberately NOT a dump of the codebase
// or any clinic/patient data — it explains "how do I use GrowthOS" only.
//
// TO KEEP IT CURRENT: there should be one HELP_SECTIONS entry per sidebar item
// (see components/app-shell.tsx), using the plain-language names the app shows
// users (Enquiries, not "Leads"). When you add or rename a feature, edit the
// matching section here — the chatbot prompt, the suggested questions, and the
// help centre all read from this file.
//
// The assistant answers in English OR Hinglish (the user picks per chat). The KB
// itself stays in English (feature names stay English in both modes); the model
// is told to reply in Hinglish when chosen. Only the user-facing bits authored
// here — greeting + suggested questions + placeholder — are translated.

export type HelpAudience = "all" | "admin"; // admin = owner/doctor only

/** Chat language. "hi" = Hinglish (Roman-script Hindi/English mix). */
export type HelpLang = "en" | "hi";

/** A pair of authored strings, one per chat language. */
export type Localized<T> = Record<HelpLang, T>;

export type HelpSection = {
  /** Stable id (kebab-case). */
  key: string;
  /** Exact sidebar / header label the app shows (English in both modes). */
  label: string;
  /** Route prefixes that map to this section (for page-aware help). */
  routes: string[];
  /** Who can reach it — "admin" hides it from receptionists. */
  audience: HelpAudience;
  /** Journey group, used to order + group the help centre / topic picker. */
  stage: string;
  /** One-line "what it does" (feeds the English chatbot prompt). */
  summary: string;
  /** How-to detail lines (feed the chatbot prompt + the help centre). */
  details: string[];
  /** Suggested questions (chips), authored per language. */
  questions: Localized<string[]>;
};

export type HelpTopic = {
  key: string;
  title: string;
  details: string[];
};

// Order the journey stages read in the sidebar; drives grouping everywhere.
export const HELP_STAGE_ORDER = [
  "Start here",
  "Get Patients In",
  "Run the Clinic",
  "Get Paid & Keep Them",
  "Marketing",
  "Account",
] as const;

export const HELP_SECTIONS: HelpSection[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    routes: ["/dashboard"],
    audience: "all",
    stage: "Start here",
    summary:
      "Your morning to-do list — what needs action across the clinic today.",
    details: [
      "The Dashboard is where you start each day. It surfaces what needs doing now — new enquiries to reply to, today's appointments, dues to collect, and check-ups due.",
      "Work down the list each morning; the other screens hold the full detail behind each item.",
    ],
    questions: {
      en: [
        "What should I do first each morning?",
        "What does the Dashboard show me?",
      ],
      hi: [
        "Subah sabse pehle kya karun?",
        "Dashboard mujhe kya dikhata hai?",
      ],
    },
  },
  {
    key: "enquiries",
    label: "Enquiries",
    routes: ["/leads"],
    audience: "all",
    stage: "Get Patients In",
    summary:
      "Every new enquiry or lead — log it, note it, and follow up on WhatsApp.",
    details: [
      "Use the add button to log a walk-in or phone enquiry. Add notes as you talk to them, and message them on WhatsApp.",
      "Move an enquiry forward when they agree to treatment or book an appointment.",
    ],
    questions: {
      en: [
        "How do I add a new enquiry?",
        "How do I follow up with an enquiry on WhatsApp?",
      ],
      hi: [
        "Nayi enquiry kaise add karun?",
        "Enquiry ko WhatsApp par follow-up kaise karun?",
      ],
    },
  },
  {
    key: "treatment-plans",
    label: "Treatment Plans",
    routes: ["/pipeline"],
    audience: "all",
    stage: "Get Patients In",
    summary:
      "Proposed treatments and their value, tracked until the patient says yes — your revenue pipeline.",
    details: [
      "Create a treatment plan for a patient with the treatments you're proposing and their prices (pulled from your Rate Card in Settings).",
      "Track each plan as it moves toward acceptance — this is your pipeline of potential revenue.",
    ],
    questions: {
      en: [
        "How do I create a treatment plan?",
        "Where do the treatment prices come from?",
      ],
      hi: [
        "Treatment plan kaise banaun?",
        "Treatment ke prices kahan se aate hain?",
      ],
    },
  },
  {
    key: "appointments",
    label: "Appointments",
    routes: ["/appointments"],
    audience: "all",
    stage: "Run the Clinic",
    summary: "The day's schedule — book, reschedule, cancel, and log each visit.",
    details: [
      "Book, reschedule, or cancel appointments. Completed ones collapse under a 'Show completed' toggle so you see what still needs action.",
      "Log each visit — the treatment done and the payment taken — from the appointment.",
    ],
    questions: {
      en: ["How do I book an appointment?", "How do I log a completed visit?"],
      hi: [
        "Appointment kaise book karun?",
        "Complete hui visit kaise log karun?",
      ],
    },
  },
  {
    key: "patients",
    label: "Patients",
    routes: ["/patients"],
    audience: "all",
    stage: "Run the Clinic",
    summary:
      "The full patient list and each patient's profile, visit history, and last visit.",
    details: [
      "Open a patient to see their profile, visit history, outstanding balance, and last-visit date.",
      "Patients are created as enquiries move through the journey, or when you log a visit.",
    ],
    questions: {
      en: ["How do I find a patient?", "How is a new patient added?"],
      hi: ["Patient ko kaise dhoondhun?", "Naya patient kaise add hota hai?"],
    },
  },
  {
    key: "notes",
    label: "Notes",
    routes: ["/notes"],
    audience: "all",
    stage: "Run the Clinic",
    summary:
      "Dictate a note in Hinglish; AI stages follow-ups, recalls, and review requests for you to approve. (Available if Voice Notes is enabled for your clinic.)",
    details: [
      "Record a voice note from a patient's profile or the 🎙️ button in the header. Speak in Hinglish — just say what happened in the visit.",
      "AI turns it into a staged proposal: suggested follow-ups, a recall, an appointment, or a review request. Clinical details (diagnosis, prescriptions) stay as written notes — AI never rewrites them.",
      "Nothing is saved until a staff member reviews the note and taps Confirm. The AI NEVER messages a patient on its own — any sending stays manual on WhatsApp.",
      "The Notes screen is the inbox of every note; the ones still 'to review' are flagged.",
    ],
    questions: {
      en: [
        "How do I record a voice note?",
        "Does the AI message patients automatically?",
        "How do I review and confirm a note?",
      ],
      hi: [
        "Voice note kaise record karun?",
        "Kya AI patient ko apne-aap message karta hai?",
        "Note ko review aur confirm kaise karun?",
      ],
    },
  },
  {
    key: "moments",
    label: "Moments",
    routes: ["/capture"],
    audience: "all",
    stage: "Run the Clinic",
    summary:
      "Capture a result photo chairside — with the patient's recorded consent — then ask for a review in one tap.",
    details: [
      "After a great result, snap the photo (before photo optional), pick the patient, and record their consent with two separate toggles: A) okay to send a review request, B) okay to share the photo on social media. Nothing saves without at least one consent.",
      "If they agreed to a review request, a ready Hinglish WhatsApp message opens with your Google review link — the photo is never attached. Each patient can only be asked once every 30 days (the app checks surveys and moments together).",
      "The Gallery is your proof library: every consented photo, its consent type, and — if it became a social post — that post's status. Delete a moment any time if a patient withdraws consent; the photos are removed permanently.",
      "Photos consented for social can be composed into a branded before/after post from the Gallery (owner/doctor only) — always stamped 'Actual patient — shared with consent'.",
    ],
    questions: {
      en: [
        "How do I capture a patient's result photo?",
        "What are the two consent toggles?",
        "How do I delete a photo if the patient changes their mind?",
      ],
      hi: [
        "Patient ka result photo kaise capture karun?",
        "Do consent toggles kya hain?",
        "Patient mana kare toh photo kaise delete karun?",
      ],
    },
  },
  {
    key: "payments",
    label: "Payments",
    routes: ["/billing"],
    audience: "all",
    stage: "Get Paid & Keep Them",
    summary: "Billing and outstanding balances — record what patients pay.",
    details: [
      "Record a payment against a patient from Payments or from their visit log.",
      "See what's still outstanding across the clinic at a glance.",
    ],
    questions: {
      en: ["How do I record a payment?", "How do I see who still owes money?"],
      hi: [
        "Payment kaise record karun?",
        "Kis patient ka balance baaki hai, kaise dekhun?",
      ],
    },
  },
  {
    key: "check-up-reminders",
    label: "Check-up Reminders",
    routes: ["/recalls"],
    audience: "all",
    stage: "Get Paid & Keep Them",
    summary: "Patients due for a routine check-up — send a WhatsApp reminder.",
    details: [
      "Shows patients due for a recall (routine check-up). Send each one a WhatsApp reminder with a single tap.",
    ],
    questions: {
      en: [
        "How do I remind patients about check-ups?",
        "Who counts as due for a recall?",
      ],
      hi: [
        "Patients ko check-up ke liye kaise remind karun?",
        "Recall ke liye due kaun hota hai?",
      ],
    },
  },
  {
    key: "reviews",
    label: "Reviews",
    routes: ["/reviews"],
    audience: "all",
    stage: "Get Paid & Keep Them",
    summary:
      "Ask happy patients for a Google review over WhatsApp; owners also get an AI Insights report.",
    details: [
      "Send review requests to happy patients over WhatsApp — it opens WhatsApp with your Google review link ready to share.",
      "Owners and doctors can also generate an AI 'Insights' report here (costs 2 content credits).",
    ],
    questions: {
      en: ["How do I get more Google reviews?", "What is the Insights report?"],
      hi: [
        "Zyada Google reviews kaise laun?",
        "Insights report kya hai?",
      ],
    },
  },
  {
    key: "campaigns",
    label: "Campaigns",
    routes: ["/campaigns"],
    audience: "all",
    stage: "Get Paid & Keep Them",
    summary:
      "Message a whole segment of patients on WhatsApp — one tap per patient, safe from bans.",
    details: [
      "Pick a segment: Dormant 6 months, Dormant 12 months, Treatment follow-up, Outstanding balance, or Birthday this month.",
      "Write the message — owners/doctors can have AI draft it (1 content credit) — using {name}, {clinic}, {doctor}, {phone} placeholders. Then send one patient at a time on WhatsApp; sending one-by-one keeps your number safe from WhatsApp bans.",
      "Each campaign tracks how many of the segment you've sent to; statuses are draft, active, and done.",
    ],
    questions: {
      en: [
        "How do I re-engage dormant patients?",
        "Can AI write the campaign message?",
        "Which patient segments can I target?",
      ],
      hi: [
        "Purane (dormant) patients ko wapas kaise laun?",
        "Kya AI campaign ka message likh sakta hai?",
        "Kaun-kaun se patient segments target kar sakta hoon?",
      ],
    },
  },
  {
    key: "revenue-recovered",
    label: "Revenue Recovered",
    routes: ["/recovery"],
    audience: "admin",
    stage: "Get Paid & Keep Them",
    summary:
      "Money won back automatically — no-shows rebooked, dues collected, 'still thinking' cases revived, lapsed patients returned.",
    details: [
      "A running tally of revenue recovered across the clinic. It works under all three journey stages as a safety net.",
      "Owner/doctor only.",
    ],
    questions: {
      en: ["What is Revenue Recovered?", "How is recovered revenue counted?"],
      hi: [
        "Revenue Recovered kya hai?",
        "Recovered revenue kaise count hota hai?",
      ],
    },
  },
  {
    key: "ai-visibility",
    label: "AI Visibility",
    routes: ["/ai-visibility"],
    audience: "admin",
    stage: "Marketing",
    summary:
      "Track how often ChatGPT, Gemini, Perplexity, and Google AI Overviews mention your clinic.",
    details: [
      "Generate a set of questions patients might ask an AI, then run a 'check session' that records whether your clinic was Cited, Mentioned, or Absent for each.",
      "A scorecard ring shows your overall visibility %. Recording checks is free — it uses no credits.",
    ],
    questions: {
      en: ["What is AI Visibility?", "How do I run an AI visibility check?"],
      hi: [
        "AI Visibility kya hai?",
        "AI visibility check kaise chalaun?",
      ],
    },
  },
  {
    key: "generate",
    label: "Generate",
    routes: ["/generate"],
    audience: "admin",
    stage: "Marketing",
    summary:
      "AI-written marketing content — Google Business posts, Instagram captions, WhatsApp messages, and web pages.",
    details: [
      "Pick a content type and topic; AI writes it. Generating and regenerating cost content credits (the amount depends on the content type). Saving what you generated is free.",
      "Choose which AI writes it: Claude (recommended, included), ChatGPT, or Gemini Flash for everyday posts, or the top-tier premium models — Claude Opus (+2 credits) and Gemini 3 Pro (+1) — when you want the best writing. The extra credits are shown on each option before you generate.",
      "Generate covers your website and Google presence: service pages, geo landing pages, blog articles, Q&A pages, WhatsApp broadcasts, review responses, and reel scripts. Instagram and Google Business feed posts now live in Social.",
      "You can also publish AI-generated landing pages for specific areas or treatments (1 content credit to publish).",
    ],
    questions: {
      en: [
        "What content types can I generate?",
        "How many credits does a generation cost?",
        "How do I publish a landing page?",
      ],
      hi: [
        "Kaunse content types generate kar sakta hoon?",
        "Ek generation mein kitne credits lagte hain?",
        "Landing page kaise publish karun?",
      ],
    },
  },
  {
    key: "social",
    label: "Social",
    routes: ["/social"],
    audience: "admin",
    stage: "Marketing",
    summary:
      "Instagram, Facebook, and Google Business posts in your clinic's voice — you approve everything, then post manually.",
    details: [
      "Set your Brand Personality once (a 2-minute wizard: who you are, tone, language per platform, facts you're proud of). Every post is written in that voice; a fact without a source is never used.",
      "'Plan my week' asks 3 questions and creates 5 posts across platforms for your approval. 'New post' makes one topic into Instagram, Facebook, and Google Business versions in one go. Each post costs 1 content credit.",
      "Post images and 6-slide carousels are composed from your logo and brand colours — the branded look is FREE (no credits), always. For a single post, pick a style — Clean, Colour band, or Bold — to control how much of your brand colour fills the card.",
      "Optional premium visuals put an AI-generated photo backdrop behind the same branded overlay: Photo backdrop costs 1 content credit for a single image (3 for a carousel), Studio photo costs 2 (5 for a carousel), and Studio Pro — the top-tier photo model — costs 3 (7 for a carousel). AI backdrops never show people, faces, or treatment results — real patient photos come only from Moments with recorded consent.",
      "Every post waits in the approval queue: preview it exactly as the platform shows it, then Approve, Edit (safety checks re-run), or Reject. After approving: copy the caption, download the image, post it yourself in the app, and tap 'Mark as posted'. GrowthOS never posts automatically.",
      "Your plan includes a monthly post quota (30 on Growth). A built-in safety check blocks made-up statistics, prices, or medical promises before anything reaches the queue.",
    ],
    questions: {
      en: [
        "How do I plan a week of posts?",
        "Are post images free?",
        "Why was my post flagged?",
        "How do I set my Brand Personality?",
      ],
      hi: [
        "Hafte bhar ke posts kaise plan karun?",
        "Kya post images free hain?",
        "Mera post flag kyun hua?",
        "Brand Personality kaise set karun?",
      ],
    },
  },
  {
    key: "deep-audit",
    label: "Deep Audit",
    routes: ["/audit"],
    audience: "admin",
    stage: "Marketing",
    summary:
      "A full automated audit of your online presence vs local competitors — ending in a 30-day action plan.",
    details: [
      "One tap runs a 6-stage audit (~8 minutes): it finds your real competitors, pulls Google Business profiles, analyses websites, tests whether AI assistants (ChatGPT, Gemini, Perplexity) recommend you, scores you against your top rival, and writes a 30-day plan of specific actions with evidence.",
      "Your plan includes 1 deep audit per billing period; extra audits are ₹599 each (Upgrade page). The report has a WhatsApp share button for sending the summary.",
      "Every 30 days the audit re-runs automatically (if you have an audit available) and you get a 'what moved' digest — including a warning when a competitor's reviews start growing much faster than yours. Tick plan items as you finish them; a mid-plan nudge reminds you if progress stalls.",
    ],
    questions: {
      en: [
        "How do I run a Deep Audit?",
        "What does the 30-day plan contain?",
        "How much does an extra audit cost?",
      ],
      hi: [
        "Deep Audit kaise chalaun?",
        "30-din ke plan mein kya hota hai?",
        "Extra audit ka kitna kharcha hai?",
      ],
    },
  },
  {
    key: "map-rank",
    label: "Map Rank",
    routes: ["/rank"],
    audience: "admin",
    stage: "Marketing",
    summary: "Track your clinic's Google Maps ranking for chosen keywords.",
    details: [
      "Add keywords and run a scan to see where you rank across the local map grid. Each scan uses 1 map-scan credit.",
    ],
    questions: {
      en: [
        "How do I check my Google Maps ranking?",
        "What do map-scan credits get used for?",
      ],
      hi: [
        "Apni Google Maps ranking kaise check karun?",
        "Map-scan credits kis kaam aate hain?",
      ],
    },
  },
  {
    key: "competitors",
    label: "Competitors",
    routes: ["/competitors"],
    audience: "admin",
    stage: "Marketing",
    summary: "Compare your clinic against rival clinics on your keywords.",
    details: [
      "See how nearby competitor clinics rank against you for the keywords you track.",
    ],
    questions: {
      en: ["How do I compare against competitor clinics?"],
      hi: ["Competitor clinics se comparison kaise karun?"],
    },
  },
  {
    key: "settings",
    label: "Settings",
    routes: ["/settings"],
    audience: "admin",
    stage: "Account",
    summary:
      "Clinic info, rate card, landing pages, staff, and data migration. Owner/doctor only.",
    details: [
      "Clinic Info: clinic name, doctor name, phone, address, area, city, Google review link, and socials.",
      "Rate Card: your treatments and their prices (used by Treatment Plans).",
      "Landing Pages: AI-generated web pages you can publish.",
      "Staff: add or remove team members and set each one's role (Owner, Doctor, Receptionist).",
      "Data Migration: upload a CSV from your old software; AI matches its columns to GrowthOS fields and imports it (e.g. your existing patients).",
    ],
    questions: {
      en: [
        "How do I add a staff member?",
        "How do I import my old patients?",
        "How do I change my treatment prices?",
      ],
      hi: [
        "Staff member kaise add karun?",
        "Apne purane patients kaise import karun?",
        "Treatment prices kaise change karun?",
      ],
    },
  },
  {
    key: "notifications",
    label: "Notifications",
    routes: ["/notifications"],
    audience: "all",
    stage: "Account",
    summary: "Alerts for you and your clinic — tap the bell in the header.",
    details: [
      "The bell in the top bar shows a count of unread alerts. Open Notifications to see the latest, and 'Mark all read' to clear them.",
    ],
    questions: {
      en: [
        "Where do I see my notifications?",
        "How do I clear notification alerts?",
      ],
      hi: [
        "Apne notifications kahan dekhun?",
        "Notification alerts kaise clear karun?",
      ],
    },
  },
  {
    key: "upgrade",
    label: "Upgrade",
    routes: ["/upgrade"],
    audience: "all",
    stage: "Account",
    summary:
      "Your plan, trial status, and credit balances — buy plans or credit packs.",
    details: [
      "Shows your current plan and status (trial, active, or past due), days left in a free trial, and your two balances: content credits and map-scan credits.",
      "Buy or change a plan, or top up with a credit pack. Plans grant fresh credits each month.",
    ],
    questions: {
      en: [
        "How do I upgrade my plan?",
        "How do I buy more credits?",
        "How many days are left in my trial?",
      ],
      hi: [
        "Apna plan kaise upgrade karun?",
        "Zyada credits kaise khareedun?",
        "Mere trial mein kitne din bache hain?",
      ],
    },
  },
];

// Cross-cutting concepts that aren't a single screen. They go into the chatbot
// prompt and can headline the help centre.
export const HELP_TOPICS: HelpTopic[] = [
  {
    key: "messaging",
    title: "How messaging works (WhatsApp)",
    details: [
      "All patient messaging is via WhatsApp. Tapping a message button opens WhatsApp (wa.me) in a new tab with a ready-written Hinglish message to that patient's +91 number — you just press send.",
      "Once you've sent, the button turns into a green '✓ Sent' label so you don't message the same person twice. GrowthOS never sends WhatsApp messages automatically — a person always presses send.",
    ],
  },
  {
    key: "credits",
    title: "Credits",
    details: [
      "There are TWO credit balances. CONTENT credits pay for AI content in Generate (1–3 per piece), Social posts (1 per post; caption options for a patient moment are 1), the Reviews Insights report (2), a campaign's AI-drafted message (1), and publishing a landing page (1).",
      "MAP-SCAN credits pay for Map Rank scans (1 each) and, for agencies, prospect audits (1 each).",
      "Deep Audits have their own balance: 1 included per billing period, extra audits ₹599 (Upgrade page).",
      "FREE things: saving generated content, recording AI Visibility checks, and ALL social images — post images, carousels, and patient-moment compositions cost no credits.",
      "If you run out, you'll see a 'not enough credits' message — buy a credit pack on Upgrade, or wait for your monthly plan reset. Social also has a monthly post quota (30 on Growth), separate from credits.",
    ],
  },
  {
    key: "roles",
    title: "Roles & staff",
    details: [
      "Three roles: Owner, Doctor, and Receptionist. Owner and Doctor see everything. Receptionists get the front-desk subset — they do NOT see Revenue Recovered, the Marketing tools (AI Visibility, Generate, Social, Map Rank, Competitors, Deep Audit), or Settings. (They can open Campaigns, but only owners/doctors can have AI draft the message. They CAN use Moments — capturing photos and consent is front-desk work — but composing a social post from a moment is owner/doctor only.)",
      "The owner adds staff in Settings → Staff (name, email, a temporary password, and their role). New staff sign in with that email and temp password.",
    ],
  },
];

// Suggested questions when the user isn't on a screen that maps to a section.
export const DEFAULT_QUESTIONS: Localized<string[]> = {
  en: [
    "How do I message a patient on WhatsApp?",
    "What do credits get used for?",
    "How do I bring my old patients into GrowthOS?",
    "Why can't my receptionist see Settings?",
  ],
  hi: [
    "Patient ko WhatsApp par message kaise karun?",
    "Credits kis cheez mein use hote hain?",
    "Apne purane patients ko GrowthOS mein kaise laun?",
    "Mera receptionist Settings kyun nahi dekh pata?",
  ],
};

// The assistant's opening line, per language.
export const HELP_GREETING: Localized<string> = {
  en: "Hi! I'm your GrowthOS help assistant. Ask me how to do anything in the app — messaging patients, recording payments, importing old data, and more.",
  hi: "Namaste! Main aapka GrowthOS help assistant hoon. App mein kuch bhi kaise karein — patient ko message, payment record karna, purana data import — kuch bhi poochho.",
};

// Composer placeholder, per language.
export const HELP_PLACEHOLDER: Localized<string> = {
  en: "Ask a question…",
  hi: "Apna sawaal likho…",
};

// Human-readable language names for the picker.
export const HELP_LANG_LABEL: Localized<string> = {
  en: "English",
  hi: "Hinglish",
};

// Extra system instruction appended (uncached) when the user picks a non-default
// language. English needs nothing (the whole KB is English). Roman-script only.
export const HELP_LANG_DIRECTIVE: Record<HelpLang, string | null> = {
  en: null,
  hi: 'LANGUAGE: Reply in Hinglish — natural Roman-script Hindi mixed with English, the way Indian clinic staff actually chat (e.g. "Patient ko WhatsApp par message bhejne ke liye Enquiries kholiye…"). Keep ALL GrowthOS feature names in English (Enquiries, Treatment Plans, Payments, Check-up Reminders, etc.). Keep it warm, short, and simple. Use Roman letters only — never Devanagari script.',
};

/** Guard an untrusted string down to a valid HelpLang (defaults to English). */
export function toHelpLang(value: unknown): HelpLang {
  return value === "hi" ? "hi" : "en";
}

/** The section whose route matches `pathname`, or null (page-aware help). */
export function sectionForPath(
  pathname: string | null | undefined,
): HelpSection | null {
  if (!pathname) return null;
  for (const s of HELP_SECTIONS) {
    if (s.routes.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
      return s;
    }
  }
  return null;
}

/** Sections a given audience may reach (receptionists don't see admin ones). */
export function sectionsForAudience(isAdmin: boolean): HelpSection[] {
  return isAdmin
    ? HELP_SECTIONS
    : HELP_SECTIONS.filter((s) => s.audience === "all");
}

/** Suggested-question chips for a section (or the defaults) in a language. */
export function suggestionsFor(
  section: HelpSection | null,
  lang: HelpLang,
): string[] {
  return (section ? section.questions : DEFAULT_QUESTIONS)[lang];
}

/**
 * Build the chatbot system prompt from the structured KB above. Call this
 * server-side (see app/api/help/route.ts) — never eagerly at module load, so the
 * data can be imported by the client (chip suggestions) without bundling the
 * full prompt text. The KB is authored in English; the reply language is steered
 * per-request via HELP_LANG_DIRECTIVE.
 */
export function buildHelpSystemPrompt(): string {
  const featureNames = HELP_SECTIONS.map((s) => s.label).join(", ");

  const knowledge = HELP_STAGE_ORDER.map((stage) => {
    const rows = HELP_SECTIONS.filter((s) => s.stage === stage);
    if (rows.length === 0) return "";
    const lines = rows
      .map((s) => {
        const gate = s.audience === "admin" ? " (owner/doctor only)" : "";
        return `- ${s.label}${gate}: ${s.summary} ${s.details.join(" ")}`;
      })
      .join("\n");
    return `${stage.toUpperCase()}\n${lines}`;
  })
    .filter(Boolean)
    .join("\n\n");

  const topics = HELP_TOPICS.map(
    (t) => `${t.title.toUpperCase()}\n${t.details.map((d) => `- ${d}`).join("\n")}`,
  ).join("\n\n");

  return `You are the in-app help assistant for GrowthOS, a software product that Indian dental clinics use to run their practice and market themselves. The people talking to you are clinic staff — receptionists, doctors, and clinic owners — usually on an Android phone or a desktop at the front desk. Many are not very technical.

YOUR JOB: answer questions about HOW TO USE GrowthOS, clearly and briefly.

STYLE:
- Warm, plain, and practical. Short sentences. No jargon.
- Prefer step-by-step instructions ("1. Open Enquiries…  2. Tap…") when explaining how to do something.
- Refer to features by the exact names in the sidebar: ${featureNames}.
- Currency is ₹ (INR), phones are +91, dates read as DD MMM YYYY. This is India.
- Keep answers under ~150 words unless the user asks for more detail.
- Reply in English by default; if a LANGUAGE instruction follows, obey it.

HARD RULES:
- Only answer questions about using GrowthOS. If asked something unrelated (general medical/dental advice, other software, personal questions), politely decline and steer back to GrowthOS help.
- NEVER invent features, buttons, prices, or steps that are not in the KNOWLEDGE below. If you are unsure or the answer isn't covered, say so honestly and suggest they ask the clinic owner or contact GrowthOS support — do not guess.
- You do NOT have access to this clinic's actual patient, billing, or appointment data. If asked "how many patients do I have" or similar live-data questions, explain that you're a help guide and tell them which screen shows that number instead.
- Never give medical or clinical advice.

KNOWLEDGE — what GrowthOS does:

GrowthOS has two halves: (1) practice management (the day-to-day running of the clinic) and (2) AI marketing (getting found and getting reviews). The work is organised as a patient journey, shown as groups in the left sidebar.

${knowledge}

${topics}`;
}
