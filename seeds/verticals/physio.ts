// Seed content for the PHYSIOTHERAPY vertical (slug 'physio'). Loaded with:
//
//     npm run seed:vertical -- physio
//
// SAFETY: every row below is written tagged vertical='physio'. The loader NEVER
// touches a NULL (shared) or other vertical's row; a re-run replaces only physio
// rows. The vertical row must already exist in `verticals` before seeding.
//

// tables exist yet — the loader reports them as pending (no DB write).

export type VerticalTopic = { bank: string; label: string; sort_order: number };
export type FewShot = { post_type: string; example: string };
export type ComplianceRule = { rule: string; kind?: "banned_phrase" | "disclaimer" | "guidance" };

export type VerticalSeed = {
  slug: string;
  display_name: string;
  topics: VerticalTopic[];
  few_shots: FewShot[];
  compliance_rules: ComplianceRule[];
};

const seed: VerticalSeed = {
  slug: "physio",
  display_name: "Physiotherapy",

  // ── TOPIC BANKS ──────────────────────────────────────────────────────────
  // ~15 per applicable bank + gbp_category. Labels are distinct from dental,
  // derma AND ortho within each bank (curated unique index is (bank,label)
  // where clinic_id is null and is NOT vertical-aware). Physio overlaps ortho
  // conceptually, so labels are phrased physio-first to stay distinct.
  topics: [
    // BANK 'social' — covers the required themes
    { bank: "social", label: "Post-surgery rehab: movement wapas kaise aati hai", sort_order: 1 },
    { bank: "social", label: "Back aur neck pain ke liye physiotherapy program", sort_order: 2 },
    { bank: "social", label: "Sports rehab: injury ke baad safe wapsi", sort_order: 3 },
    { bank: "social", label: "Stroke ke baad rehab: ghar walon ke liye basics", sort_order: 4 },
    { bank: "social", label: "Safe home-exercise ki aadatein", sort_order: 5 },
    { bank: "social", label: "Dry needling kya hota hai — FAQs", sort_order: 6 },
    { bank: "social", label: "Cupping therapy: myths vs facts", sort_order: 7 },
    { bank: "social", label: "Buzurgon ke liye fall prevention aur balance", sort_order: 8 },
    { bank: "social", label: "Posture correction ki shuruaat", sort_order: 9 },
    { bank: "social", label: "Desk-workers ke liye simple stretches", sort_order: 10 },
    { bank: "social", label: "Recovery expectations: process, race nahi", sort_order: 11 },
    { bank: "social", label: "Frozen shoulder ke liye physiotherapy", sort_order: 12 },
    { bank: "social", label: "Knee rehab: strength wapas kaise laayein", sort_order: 13 },
    { bank: "social", label: "Postnatal (delivery ke baad) safe movement", sort_order: 14 },
    { bank: "social", label: "Physiotherapy dawai ki jagah nahi — kaise madad karti hai", sort_order: 15 },

    // BANK 'article'
    { bank: "article", label: "A guide to post-surgery physiotherapy", sort_order: 1 },
    { bank: "article", label: "Back and neck pain: how physiotherapy helps", sort_order: 2 },
    { bank: "article", label: "Sports rehabilitation: returning safely", sort_order: 3 },
    { bank: "article", label: "Stroke rehabilitation: a family's guide", sort_order: 4 },
    { bank: "article", label: "Safe home-exercise habits", sort_order: 5 },
    { bank: "article", label: "Dry needling: what to expect (FAQs)", sort_order: 6 },
    { bank: "article", label: "Cupping therapy: myths vs facts", sort_order: 7 },
    { bank: "article", label: "Fall prevention for older adults", sort_order: 8 },
    { bank: "article", label: "Posture correction: a starter guide", sort_order: 9 },
    { bank: "article", label: "Desk-worker stretches and ergonomics", sort_order: 10 },
    { bank: "article", label: "Setting realistic recovery expectations", sort_order: 11 },
    { bank: "article", label: "Frozen shoulder physiotherapy explained", sort_order: 12 },
    { bank: "article", label: "Knee rehabilitation after injury or surgery", sort_order: 13 },
    { bank: "article", label: "Postnatal physiotherapy basics", sort_order: 14 },
    { bank: "article", label: "Neurological rehabilitation: an introduction", sort_order: 15 },

    // BANK 'service'
    { bank: "service", label: "Post-Surgery Rehabilitation", sort_order: 1 },
    { bank: "service", label: "Back & Neck Pain Physiotherapy", sort_order: 2 },
    { bank: "service", label: "Sports Rehabilitation", sort_order: 3 },
    { bank: "service", label: "Neurological (Stroke) Rehabilitation", sort_order: 4 },
    { bank: "service", label: "Dry Needling", sort_order: 5 },
    { bank: "service", label: "Cupping Therapy", sort_order: 6 },
    { bank: "service", label: "Manual Therapy", sort_order: 7 },
    { bank: "service", label: "Posture Correction Program", sort_order: 8 },
    { bank: "service", label: "Fall-Prevention & Balance Training", sort_order: 9 },
    { bank: "service", label: "Postnatal Physiotherapy", sort_order: 10 },
    { bank: "service", label: "Knee Rehabilitation", sort_order: 11 },
    { bank: "service", label: "Frozen Shoulder Physiotherapy", sort_order: 12 },
    { bank: "service", label: "Electrotherapy", sort_order: 13 },
    { bank: "service", label: "Ergonomic Assessment", sort_order: 14 },
    { bank: "service", label: "Home-Visit Physiotherapy", sort_order: 15 },

    // BANK 'guide' (YMYL — physio-complements-medicine, red-flag aware)
    { bank: "guide", label: "Physiotherapy after joint-replacement surgery", sort_order: 1 },
    { bank: "guide", label: "When back pain needs a doctor, not just physio", sort_order: 2 },
    { bank: "guide", label: "Safe exercise with arthritis", sort_order: 3 },
    { bank: "guide", label: "Stroke rehab: what families should know", sort_order: 4 },
    { bank: "guide", label: "Fall prevention for the elderly", sort_order: 5 },
    { bank: "guide", label: "Physiotherapy during and after pregnancy", sort_order: 6 },
    { bank: "guide", label: "Red-flag symptoms physiotherapists screen for", sort_order: 7 },
    { bank: "guide", label: "Managing chronic pain safely", sort_order: 8 },
    { bank: "guide", label: "Returning to sport after injury: safe progression", sort_order: 9 },
    { bank: "guide", label: "Diabetes and exercise safety", sort_order: 10 },
    { bank: "guide", label: "Osteoporosis: safe movement guidelines", sort_order: 11 },
    { bank: "guide", label: "Post-fracture rehabilitation", sort_order: 12 },
    { bank: "guide", label: "Neck pain: when to seek urgent care", sort_order: 13 },
    { bank: "guide", label: "Physiotherapy is not a diagnosis: what that means", sort_order: 14 },
    { bank: "guide", label: "Home exercises: how to start safely", sort_order: 15 },

    // BANK 'comparison'
    { bank: "comparison", label: "Physiotherapy vs Painkillers for back pain", sort_order: 1 },
    { bank: "comparison", label: "Dry Needling vs Acupuncture", sort_order: 2 },
    { bank: "comparison", label: "Cupping vs Manual Therapy", sort_order: 3 },
    { bank: "comparison", label: "Home Exercise vs Supervised Physiotherapy", sort_order: 4 },
    { bank: "comparison", label: "Heat vs Ice for pain relief", sort_order: 5 },
    { bank: "comparison", label: "Rest vs Active Recovery", sort_order: 6 },
    { bank: "comparison", label: "Manual Therapy vs Electrotherapy", sort_order: 7 },
    { bank: "comparison", label: "Clinic Physiotherapy vs Home-Visit Physiotherapy", sort_order: 8 },
    { bank: "comparison", label: "Physiotherapy vs Chiropractic care", sort_order: 9 },
    { bank: "comparison", label: "Early vs Delayed rehab after surgery", sort_order: 10 },
    { bank: "comparison", label: "Passive vs Active treatment approaches", sort_order: 11 },
    { bank: "comparison", label: "Stretching vs Strengthening for back pain", sort_order: 12 },
    { bank: "comparison", label: "Group exercise vs One-on-one physiotherapy", sort_order: 13 },
    { bank: "comparison", label: "Short-term relief vs Long-term rehab", sort_order: 14 },
    { bank: "comparison", label: "Self-massage vs Professional therapy", sort_order: 15 },

    // BANK 'question' — Hinglish Q&A set
    { bank: "question", label: "Physiotherapy se kitne din mein aaram milta hai?", sort_order: 1 },
    { bank: "question", label: "Physiotherapy dawai ki jagah le sakti hai kya?", sort_order: 2 },
    { bank: "question", label: "Dry needling dukhti hai kya?", sort_order: 3 },
    { bank: "question", label: "Kamar dard ke liye physiotherapy safe hai kya?", sort_order: 4 },
    { bank: "question", label: "Stroke ke baad rehab kab shuru karein?", sort_order: 5 },
    { bank: "question", label: "Ghar pe exercise karna safe hai kya?", sort_order: 6 },
    { bank: "question", label: "Physiotherapy ke kitne sessions lagte hain?", sort_order: 7 },
    { bank: "question", label: "Sports injury ke baad kab exercise shuru karein?", sort_order: 8 },
    { bank: "question", label: "Frozen shoulder mein physiotherapy madad karti hai kya?", sort_order: 9 },
    { bank: "question", label: "Buzurgon ke liye balance exercises safe hain kya?", sort_order: 10 },
    { bank: "question", label: "Cupping therapy kis kaam aati hai?", sort_order: 11 },
    { bank: "question", label: "Posture theek karne mein kitna time lagta hai?", sort_order: 12 },
    { bank: "question", label: "Surgery ke baad rehab kyun zaroori hai?", sort_order: 13 },
    { bank: "question", label: "Pregnancy ke baad exercise kab shuru karein?", sort_order: 14 },
    { bank: "question", label: "Neck pain ke liye physiotherapy kab leni chahiye?", sort_order: 15 },

    // BANK 'occasion'
    { bank: "occasion", label: "World Physiotherapy Day awareness (Sep 8)", sort_order: 1 },
    { bank: "occasion", label: "World Stroke Day awareness (Oct 29)", sort_order: 2 },
    { bank: "occasion", label: "Monsoon joint-stiffness rehab", sort_order: 3 },
    { bank: "occasion", label: "Winter mobility & stiffness care", sort_order: 4 },
    { bank: "occasion", label: "Senior citizens' fall-prevention camp", sort_order: 5 },
    { bank: "occasion", label: "Free posture assessment week", sort_order: 6 },
    { bank: "occasion", label: "New Year movement & fitness reset", sort_order: 7 },
    { bank: "occasion", label: "Summer sports-season rehab", sort_order: 8 },
    { bank: "occasion", label: "Women's health physiotherapy awareness", sort_order: 9 },
    { bank: "occasion", label: "Marathon recovery & rehab clinic", sort_order: 10 },
    { bank: "occasion", label: "Back-care awareness week", sort_order: 11 },
    { bank: "occasion", label: "Ergonomics awareness for offices", sort_order: 12 },
    { bank: "occasion", label: "Post-festival body-recovery care", sort_order: 13 },
    { bank: "occasion", label: "Physio clinic anniversary offer", sort_order: 14 },
    { bank: "occasion", label: "Free movement-screening camp", sort_order: 15 },

    // BANK 'update'
    { bank: "update", label: "New neuro-rehabilitation unit", sort_order: 1 },
    { bank: "update", label: "Dry needling now offered", sort_order: 2 },
    { bank: "update", label: "Advanced electrotherapy equipment added", sort_order: 3 },
    { bank: "update", label: "New sports-rehab service", sort_order: 4 },
    { bank: "update", label: "New physiotherapist joined the team", sort_order: 5 },
    { bank: "update", label: "Upgraded rehabilitation gym", sort_order: 6 },
    { bank: "update", label: "Home-visit physiotherapy now available", sort_order: 7 },
    { bank: "update", label: "Expanded evening consultation hours", sort_order: 8 },
    { bank: "update", label: "Updated clinic hygiene & safety standards", sort_order: 9 },
    { bank: "update", label: "New pediatric physiotherapy service", sort_order: 10 },
    { bank: "update", label: "Teleconsultation for rehab follow-ups", sort_order: 11 },
    { bank: "update", label: "New postnatal physiotherapy program", sort_order: 12 },
    { bank: "update", label: "Physio clinic expansion / new branch", sort_order: 13 },
    { bank: "update", label: "New flexible payment options for rehab packages", sort_order: 14 },
    { bank: "update", label: "Free movement-health awareness camp", sort_order: 15 },

    // BANK 'gbp_category' — GBP business-category defaults
    { bank: "gbp_category", label: "Physiotherapy center", sort_order: 1 },
    { bank: "gbp_category", label: "Physiotherapist", sort_order: 2 },
  ],

  // ── FEW-SHOT EXAMPLES (Stage 1, approved) ────────────────────────────────
  // Clean Roman Hinglish. Fictional clinic: "ReVive Physiotherapy Clinic, Aundh,
  // Pune · Dr. Neha Kulkarni (PT) · 📞 98765 43210". Loader reports as pending.
  few_shots: [
    {
      post_type: "GBP Post",
      example: `Kamar ka dard baar-baar lauta aata hai? Physiotherapy isme madad kar sakti hai — par sahi tareeke se 🙂

Physiotherapy dawai ya doctor ki jagah nahi leti — yeh unke saath milke kaam karti hai. Sabse pehle ek proper assessment hoti hai, taaki pata chale ki dard ki wajah kya hai, aur phir aapke liye ek personalized movement plan banta hai. Zyada tar logon ko guided physiotherapy se apni movement aur daily comfort mein improvement dikhti hai, though results har vyakti mein alag hote hain.

Dhyan rahe: agar dard pairon tak jaaye, numbness ho, ya toilet control mein dikkat ho — toh yeh turant doctor ko dikhane wali baat hai ⚠️

Aundh, Pune mein ReVive Physiotherapy Clinic mein Dr. Neha Kulkarni pehle aapki condition samajhti hain, phir plan banati hain — bina kisi jhoothe vaade ke 🩺

Assessment book karne ke liye aaj hi call karein 👇

ReVive Physiotherapy Clinic | 📞 98765 43210`,
    },
    {
      post_type: "GBP Post",
      example: `Surgery ke baad movement wapas paana ek journey hai — aur aapko usme akele chalne ki zaroorat nahi 🙌

Post-surgery rehabilitation aapke doctor ke plan ke saath milke chalti hai, uski jagah nahi. Ek physiotherapist aapki current stage ke hisaab se safe, guided exercises decide karta hai — dheere-dheere strength aur movement build karne ke liye. Recovery ka time har vyakti mein alag hota hai; koi fixed date ya "guaranteed" result nahi hota — bas consistent, sahi guidance.

Zaroori: koi bhi exercise apne surgeon ya physiotherapist ki salah ke bina shuru na karein, aur dard ko "push through" karne ki koshish na karein ⚠️

Aundh, Pune mein hum aapke doctor ke saath tal-mel rakhkar rehab plan banate hain 😊

Apni recovery ke liye guidance lene ke liye call karein 👇

ReVive Physiotherapy Clinic | 📞 98765 43210`,
    },
    {
      post_type: "Instagram Caption",
      example: `Din bhar kursi pe, aur shaam tak kamar-gardan jakad jaati hai? 💺

Ghanton baithne se muscles stiff ho jaati hain — aur body dheere-dheere iski aadat daal leti hai.

Chhoti aadatein madad karti hain: har thodi der mein uthna, kandhe roll karna, aur gently move karna 🧍‍♀️ Yeh general tips hain — har kisi ki body alag hoti hai.

Isiliye koi bhi exercise routine shuru karne se pehle ek physiotherapist se assessment zaroori hai — taaki aapko wahi mile jo aapke liye safe ho.

Aur haan — dard ho toh "push through" mat kariye 🚫

Apni body ke liye sahi guidance lene ke liye DM karein 📩

#PunePhysiotherapy #DeskJob #PostureCare #BackCare #Aundh`,
    },
    {
      post_type: "Instagram Caption",
      example: `"Ghar pe hi thodi exercise kar leti hoon" — accha hai, par ek baat yaad rahe 🙂

Internet ke random exercises sabke liye safe nahi hote. Jo ek person ke liye theek hai, woh doosre ki condition bigaad sakta hai.

Safe movement ki shuruaat hoti hai ek proper assessment se — taaki aapko apni body aur stage ke hisaab se sahi guidance mile.

Recovery ek process hai, race nahi. Har kisi ka time alag hota hai, aur koi bhi "guaranteed 7-day fix" real nahi hota 🌱

Dard, numbness ya weakness badhe toh isse serious lein aur medical help lein ⚠️

Apne liye safe plan banane ke liye DM karein 📩

#PunePhysio #SafeRecovery #Physiotherapy #MovementMatters #Aundh`,
    },
    {
      // 5-star
      post_type: "Review Response",
      example: `Thank you so much for your kind words! 😊 Dr. Neha aur poori ReVive team maanti hai ki honest guidance aur realistic expectations recovery ka sabse zaroori hissa hain. Aapki consistency aur mehnat ka bahut bada role hai — hum bas aapko safe raaste par guide karte hain. Apni movement ko lekar kabhi bhi koi sawaal ho toh zaroor poochhiye. Take care!
— Team ReVive Physiotherapy Clinic`,
    },
    {
      // 2-star: empathise, NO admission of fault, NO health detail, move offline.
      post_type: "Review Response",
      example: `Hi, thank you for sharing your honest feedback — we're sorry that your experience didn't meet your expectations, and we truly value the chance to understand it better. Every person's recovery is different, and we'd genuinely like to listen and see how we can help. Please call us at 📞 98765 43210 so we can talk it through personally.
— Team ReVive Physiotherapy Clinic`,
    },
  ],

  // ── COMPLIANCE RULES (Stage 1, approved) ─────────────────────────────────
  compliance_rules: [
    { rule: "Physiotherapy is not a substitute for medical diagnosis. Never position physio as a replacement for seeing a doctor or getting a diagnosis. Physio complements medical care; serious, new, or undiagnosed symptoms need a doctor first." },
    { rule: "No pain-free or cure guarantees. Never promise 'pain-free', 'complete cure', 'guaranteed recovery', or a fixed outcome. Use 'many people improve', 'can help reduce pain and restore movement', 'results vary from person to person'." },
    { rule: "Red-flag symptoms route to urgent medical referral. For warning signs (chest pain, sudden weakness/numbness, loss of bladder or bowel control, severe unexplained or worsening pain, dizziness/fainting, signs of a stroke), explicitly tell the reader to seek urgent medical care — physio is not the first stop." },
    { rule: "Home-exercise content stays general + 'get assessed first'. Any home exercise/stretch content must be general, low-risk, and always carry a 'get assessed by a physiotherapist first' caveat. Never give specific prescriptions (sets/reps/load/progressions) that could harm an unassessed person, and never tell someone in pain to 'push through it'." },
    { rule: "YMYL rails. Never invent statistics, success rates, prices, credentials, or study citations. Any clinic-specific fact must appear as a visible '[clinic to supply: …]' placeholder — never fabricated." },
    { rule: "No diagnosis, no patient details, no fear-mongering. Describe signs generally and invite assessment; never reveal/imply an individual patient's health info; no fake urgency." },
    { rule: "Instant-reject phrases (never output): '100% pain-free', 'pain-free guaranteed', 'complete cure', 'cure guaranteed', 'permanent cure', 'guaranteed recovery', 'no need to see a doctor', 'skip the doctor', 'physio replaces diagnosis', 'doctor ki zaroorat nahi', 'fix your back in 5 minutes', 'recover in X days guaranteed', 'push through the pain', 'no pain no gain', 'best physiotherapist in city', 'No.1 physio', '99% success rate'." },
  ],
};

export default seed;
