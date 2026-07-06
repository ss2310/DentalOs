// Seed content for the DERMATOLOGY vertical (slug 'derma'). Loaded with:
//
//     npm run seed:vertical -- derma
//
// SAFETY: every row below is written tagged vertical='derma'. The loader NEVER
// touches a NULL (shared) or 'dental' row; a re-run replaces only derma rows.
// The vertical row must already exist in `verticals` (add it in /admin/verticals
// or `insert into verticals (id, display_name, is_active) values
// ('derma','Dermatology',false);`) before seeding, because topics FK-reference it.
//


// Compliance rules and few-shots load into compliance_rules / few_shot_examples (042).

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
  slug: "derma",
  display_name: "Dermatology",

  // ── TOPIC BANKS ──────────────────────────────────────────────────────────
  // ~15 per applicable bank, mirroring dental's set:
  // social · article · service · guide · comparison · question · occasion · update
  // Plus gbp_category (GBP business-category defaults: primary/secondary).
  // Every label is distinct from dental's within its bank (the curated unique
  // index is (bank,label) where clinic_id is null and is NOT vertical-aware).
  // Compliant: pigmentation/melasma framed as tone + skin health, never fairness.
  topics: [
    // BANK 'social' — the 15 required themes
    { bank: "social", label: "Acne aur acne scars — kya farak hai", sort_order: 1 },
    { bank: "social", label: "Pigmentation & melasma: even skin tone ki basics", sort_order: 2 },
    { bank: "social", label: "Hair fall kab worry ki baat hai", sort_order: 3 },
    { bank: "social", label: "Laser hair reduction kaise kaam karta hai", sort_order: 4 },
    { bank: "social", label: "Monsoon mein fungal skin infections se bachaav", sort_order: 5 },
    { bank: "social", label: "Winter dry skin care routine", sort_order: 6 },
    { bank: "social", label: "Sensitive skin ke liye sunscreen ki aadat", sort_order: 7 },
    { bank: "social", label: "Wedding-season skin prep kab shuru karein", sort_order: 8 },
    { bank: "social", label: "Teenage acne — parents ke liye guide", sort_order: 9 },
    { bank: "social", label: "Eczema aur psoriasis: awareness", sort_order: 10 },
    { bank: "social", label: "Skincare myths busted (safe facts)", sort_order: 11 },
    { bank: "social", label: "Mole aur wart removal — kab dikhayein", sort_order: 12 },
    { bank: "social", label: "Chemical peel kya hota hai — basics", sort_order: 13 },
    { bank: "social", label: "Dandruff care ka sahi tarika", sort_order: 14 },
    { bank: "social", label: "Retinol ke do's and don'ts", sort_order: 15 },

    // BANK 'article'
    { bank: "article", label: "Complete guide to acne scar treatments", sort_order: 1 },
    { bank: "article", label: "Melasma & pigmentation: causes and care", sort_order: 2 },
    { bank: "article", label: "Hair fall: causes and when to see a dermatologist", sort_order: 3 },
    { bank: "article", label: "Laser hair reduction: a complete guide", sort_order: 4 },
    { bank: "article", label: "PRP for hair: what to expect", sort_order: 5 },
    { bank: "article", label: "Chemical peels explained: types and uses", sort_order: 6 },
    { bank: "article", label: "Sunscreen guide for Indian skin", sort_order: 7 },
    { bank: "article", label: "Eczema: triggers and daily care", sort_order: 8 },
    { bank: "article", label: "Psoriasis: understanding a chronic skin condition", sort_order: 9 },
    { bank: "article", label: "Sensitive skin: building a gentle routine", sort_order: 10 },
    { bank: "article", label: "Anti-dandruff care: causes and solutions", sort_order: 11 },
    { bank: "article", label: "Retinol: how to start safely", sort_order: 12 },
    { bank: "article", label: "Monsoon skin & fungal infection prevention", sort_order: 13 },
    { bank: "article", label: "Winter dry skin: complete care guide", sort_order: 14 },
    { bank: "article", label: "Teenage acne: a parent's guide", sort_order: 15 },

    // BANK 'service'
    { bank: "service", label: "Acne Treatment", sort_order: 1 },
    { bank: "service", label: "Acne Scar Treatment", sort_order: 2 },
    { bank: "service", label: "Chemical Peels", sort_order: 3 },
    { bank: "service", label: "Laser Hair Reduction", sort_order: 4 },
    { bank: "service", label: "Pigmentation / Melasma Treatment", sort_order: 5 },
    { bank: "service", label: "PRP Hair Treatment", sort_order: 6 },
    { bank: "service", label: "Hair Fall Treatment", sort_order: 7 },
    { bank: "service", label: "Anti-Dandruff Treatment", sort_order: 8 },
    { bank: "service", label: "Mole & Wart Removal", sort_order: 9 },
    { bank: "service", label: "Laser Tattoo Removal", sort_order: 10 },
    { bank: "service", label: "Eczema & Psoriasis Management", sort_order: 11 },
    { bank: "service", label: "Microneedling", sort_order: 12 },
    { bank: "service", label: "Skin Tag Removal", sort_order: 13 },
    { bank: "service", label: "Sensitive Skin Consultation", sort_order: 14 },
    { bank: "service", label: "Wedding Skin Prep Package", sort_order: 15 },

    // BANK 'guide' (YMYL — condition / interaction aware, doctor-supervised framing)
    { bank: "guide", label: "Doctor-prescribed acne therapy: what patients should know", sort_order: 1 },
    { bank: "guide", label: "Skincare during pregnancy: what's advised", sort_order: 2 },
    { bank: "guide", label: "Acne treatment for sensitive skin", sort_order: 3 },
    { bank: "guide", label: "Managing eczema flare-ups", sort_order: 4 },
    { bank: "guide", label: "Psoriasis and lifestyle factors", sort_order: 5 },
    { bank: "guide", label: "Why steroid creams need doctor supervision", sort_order: 6 },
    { bank: "guide", label: "Diabetes and skin / wound care", sort_order: 7 },
    { bank: "guide", label: "Sun protection for melasma-prone skin", sort_order: 8 },
    { bank: "guide", label: "Laser treatment: who is and isn't suitable", sort_order: 9 },
    { bank: "guide", label: "PRP for hair: candidacy and expectations", sort_order: 10 },
    { bank: "guide", label: "Retinoids: safe use under guidance", sort_order: 11 },
    { bank: "guide", label: "Fungal infections: why self-medication backfires", sort_order: 12 },
    { bank: "guide", label: "Chemical peel aftercare", sort_order: 13 },
    { bank: "guide", label: "Hair fall in women: when to investigate", sort_order: 14 },
    { bank: "guide", label: "Teenage acne: a safe treatment approach", sort_order: 15 },

    // BANK 'comparison'
    { bank: "comparison", label: "Chemical Peel vs Microdermabrasion", sort_order: 1 },
    { bank: "comparison", label: "Laser Hair Reduction vs Waxing", sort_order: 2 },
    { bank: "comparison", label: "PRP vs Hair Transplant", sort_order: 3 },
    { bank: "comparison", label: "Chemical Peel vs Laser for pigmentation", sort_order: 4 },
    { bank: "comparison", label: "Microneedling vs Chemical Peel for scars", sort_order: 5 },
    { bank: "comparison", label: "Retinol vs prescription retinoid (under guidance)", sort_order: 6 },
    { bank: "comparison", label: "Physical vs Chemical Sunscreen", sort_order: 7 },
    { bank: "comparison", label: "Salicylic vs Benzoyl-based acne care", sort_order: 8 },
    { bank: "comparison", label: "Oral vs Topical acne treatment (doctor-decided)", sort_order: 9 },
    { bank: "comparison", label: "Q-switched vs other lasers for pigmentation", sort_order: 10 },
    { bank: "comparison", label: "Mole removal: laser vs excision", sort_order: 11 },
    { bank: "comparison", label: "Anti-dandruff shampoo vs medicated treatment", sort_order: 12 },
    { bank: "comparison", label: "Home care vs clinic treatment for acne", sort_order: 13 },
    { bank: "comparison", label: "Hydrating vs oil-control routines", sort_order: 14 },
    { bank: "comparison", label: "Spot treatment vs full-face care", sort_order: 15 },

    // BANK 'question' — Hinglish Q&A set
    { bank: "question", label: "Kya laser hair removal permanent hai?", sort_order: 1 },
    { bank: "question", label: "Acne scars kaise theek hote hain?", sort_order: 2 },
    { bank: "question", label: "Pigmentation kyun hoti hai?", sort_order: 3 },
    { bank: "question", label: "Melasma ka ilaaj kaise hota hai?", sort_order: 4 },
    { bank: "question", label: "Chemical peel safe hai kya?", sort_order: 5 },
    { bank: "question", label: "Hair fall kitna normal hai?", sort_order: 6 },
    { bank: "question", label: "PRP treatment mein kitne sessions lagte hain?", sort_order: 7 },
    { bank: "question", label: "Sunscreen roz lagana zaroori hai kya?", sort_order: 8 },
    { bank: "question", label: "Dandruff baar-baar kyun hota hai?", sort_order: 9 },
    { bank: "question", label: "Retinol kaise shuru karein?", sort_order: 10 },
    { bank: "question", label: "Monsoon mein skin infection se kaise bachein?", sort_order: 11 },
    { bank: "question", label: "Winter mein skin itni dry kyun hoti hai?", sort_order: 12 },
    { bank: "question", label: "Teenage acne ke liye kya karein?", sort_order: 13 },
    { bank: "question", label: "Mole ya til removal safe hai kya?", sort_order: 14 },
    { bank: "question", label: "Sensitive skin ke liye kaunsa routine sahi hai?", sort_order: 15 },

    // BANK 'occasion' — seasonal / festive skin occasions
    { bank: "occasion", label: "Wedding-season skin prep", sort_order: 1 },
    { bank: "occasion", label: "Holi ke baad skin & hair recovery", sort_order: 2 },
    { bank: "occasion", label: "Summer skin-care shift", sort_order: 3 },
    { bank: "occasion", label: "Monsoon skin & scalp care", sort_order: 4 },
    { bank: "occasion", label: "Winter dry-skin care season", sort_order: 5 },
    { bank: "occasion", label: "Diwali festive glow prep", sort_order: 6 },
    { bank: "occasion", label: "Pre-wedding consultation reminder", sort_order: 7 },
    { bank: "occasion", label: "New Year skin-health reset", sort_order: 8 },
    { bank: "occasion", label: "Summer sun-protection reminder", sort_order: 9 },
    { bank: "occasion", label: "Karwa Chauth festive skin prep", sort_order: 10 },
    { bank: "occasion", label: "Exam-season teenage acne care", sort_order: 11 },
    { bank: "occasion", label: "World Psoriasis Day awareness (Oct 29)", sort_order: 12 },
    { bank: "occasion", label: "Monsoon-to-winter transition care", sort_order: 13 },
    { bank: "occasion", label: "Skin clinic anniversary offer", sort_order: 14 },
    { bank: "occasion", label: "Free skin consultation week", sort_order: 15 },

    // BANK 'update'
    { bank: "update", label: "New Q-switched laser installed", sort_order: 1 },
    { bank: "update", label: "Advanced acne scar treatment added", sort_order: 2 },
    { bank: "update", label: "New PRP hair therapy available", sort_order: 3 },
    { bank: "update", label: "Latest pigmentation treatment technology", sort_order: 4 },
    { bank: "update", label: "New dermatologist joined the team", sort_order: 5 },
    { bank: "update", label: "Upgraded laser hair reduction machine", sort_order: 6 },
    { bank: "update", label: "New microneedling service", sort_order: 7 },
    { bank: "update", label: "Expanded skin consultation hours", sort_order: 8 },
    { bank: "update", label: "Updated hygiene & safety protocols", sort_order: 9 },
    { bank: "update", label: "New chemical peel options", sort_order: 10 },
    { bank: "update", label: "Teledermatology consultation now available", sort_order: 11 },
    { bank: "update", label: "New child (paediatric) skin-care service", sort_order: 12 },
    { bank: "update", label: "Clinic expansion / new branch", sort_order: 13 },
    { bank: "update", label: "New flexible payment plans for treatments", sort_order: 14 },
    { bank: "update", label: "Seasonal skin-care camp", sort_order: 15 },

    // BANK 'gbp_category' — GBP business-category defaults (no dropdown consumes
    // this bank; it just persists the derma defaults tagged to the vertical).
    { bank: "gbp_category", label: "Dermatologist", sort_order: 1 },
    { bank: "gbp_category", label: "Skin care clinic", sort_order: 2 },
  ],

  // ── FEW-SHOT EXAMPLES (Stage 1, approved) ────────────────────────────────
  // Captured here for when a few_shot_examples table exists. The loader reports
  // these as pending (no DB write today). Fictional clinic in the samples:
  // "SkinSense Clinic, Vijay Nagar, Indore · Dr. Ananya · 📞 98765 43210".
  few_shots: [
    {
      post_type: "GBP Post",
      example: `Pimples toh theek ho gaye, par unke daag abhi bhi chehre par? Aap akele nahi hain 🙂

Acne ke baad reh jaane wale marks aur scars kaafi common hain, aur inke liye alag-alag options hote hain — chemical peels se lekar laser tak. Har skin alag hoti hai, isliye ek proper skin assessment ke baad hi decide hota hai ki aapke liye kya sahi rahega. Zyada tar logon ko regular sessions se apni skin texture mein improvement dikhti hai, though results har vyakti mein alag ho sakte hain ✨

SkinSense Clinic, Vijay Nagar mein Dr. Ananya aapki skin ko samajh kar ek realistic plan banati hain — bina kisi jhoothe vaade ke 🩺

Apni skin consultation book karne ke liye aaj hi call karein 👇

SkinSense Clinic | 📞 98765 43210`,
    },
    {
      post_type: "GBP Post",
      example: `Gaalon ya upper lip par dark patches jo dhoop mein aur gehre lagte hain? Yeh melasma ho sakta hai 🌤️

Pigmentation ka matlab "rang saaf karna" nahi hai — iska matlab hai skin ko healthy rakhna aur uneven tone ko even karna. Sabse pehla aur sabse zaroori step hai daily sunscreen, kyunki dhoop pigmentation ko badha deti hai. Iske aage treatment aapki skin ke hisaab se doctor decide karti hain. Most patients ko consistent care se gradual improvement dikhta hai, par results vary karte hain 🧴

SkinSense Clinic, Vijay Nagar mein hum pigmentation ko skin-health ki tarah treat karte hain — safe, gradual aur aapki skin ke liye suitable 😊

Consultation ke liye call karein 👇

SkinSense Clinic | 📞 98765 43210`,
    },
    {
      post_type: "Instagram Caption",
      example: `Roz brush aur takiye par itne baal? Thoda ruk kar isse samajhna zaroori hai 💭

Kuch hair fall normal hai, par lagataar zyada jhadna ek signal ho sakta hai jise ignore nahi karna chahiye.

Hair fall ki wajah alag-alag hoti hai — stress, nutrition, ya scalp health. Isiliye treatment se pehle sahi reason samajhna zaroori hai 🩺

PRP jaise options madad kar sakte hain, but kaun sa treatment aapke liye sahi hai yeh consultation ke baad hi decide hota hai. Results har kisi mein alag hote hain.

Apni scalp check karwane ke liye DM karein 📩

#IndoreSkinClinic #HairFall #PRP #ScalpCare #VijayNagar`,
    },
    {
      post_type: "Instagram Caption",
      example: `"Ghar ke andar hoon, sunscreen ki kya zaroorat?" — yeh sabse common galti hai ☀️

Windows aur screens se aane wali light bhi skin tak pahunchti hai. Isiliye sunscreen sirf beach ke liye nahi, roz ke liye hai.

Sunscreen pigmentation aur early ageing dono se bachaav mein madad karta hai — aur sensitive skin ke liye bhi gentle options aate hain 🧴

Rozana subah, aur dhoop mein ho toh dubara lagana — bas itni si aadat aage chalke bada farak la sakti hai 🙂

Apni skin ke liye sahi sunscreen jaanne ke liye DM karein 📩

#IndoreDermatologist #Sunscreen #SkinCare #SensitiveSkin #VijayNagar`,
    },
    {
      // 5-star: warm, references what they mentioned, no invented health detail.
      post_type: "Review Response",
      example: `Thank you so much for your kind words! 😊 Dr. Ananya aur poori SkinSense team hamesha maanti hai ki sahi guidance aur patient ka comfort sabse zaroori hai. Aapka bharosa hamare liye bahut maayne rakhta hai — apni skin ke liye kabhi bhi koi sawaal ho toh zaroor aaiye. Take care!
— Team SkinSense Clinic`,
    },
    {
      // 2-star: empathise, NO admission of fault, NO health detail, move offline.
      post_type: "Review Response",
      example: `Hi, we're truly sorry that your experience with us didn't meet your expectations — that's genuinely not the standard we aim for. Your feedback matters to us, and we'd really like to understand what happened and make things right. Please call us at 📞 98765 43210 so we can look into this personally.
— Team SkinSense Clinic`,
    },
  ],

  // ── COMPLIANCE RULES (Stage 1, approved) ─────────────────────────────────
  // Niche guardrails layered on the shared brand-safety block. No compliance_rules
  // table exists yet — loader reports these as pending (no DB write).
  compliance_rules: [
    { rule: "No cure / permanence / absolutes. Never promise a 'cure', 'permanent' result, '100% safe', 'no side effects', or a guaranteed outcome for any skin or hair condition. Use 'improvement', 'most patients', 'results vary from person to person', 'can help manage'." },
    { rule: "No fairness / whitening — hard ethical + legal line. Never use fairness, skin-whitening, 'gora/gori', 'fair', 'fairer', 'get lighter', or 'shades lighter' language in Hindi or English. Frame every pigmentation, tan, melasma, or tone topic ONLY as pigmentation care, even skin tone, and skin health — never as becoming fairer or whiter." },
    { rule: "No prescription actives by name or dose in public content. Never name or recommend a prescription active (isotretinoin, Rx-strength retinoids, oral/topical steroids, hydroquinone, minoxidil dosing, oral antibiotics, etc.) or any dosage. Refer only to 'a doctor-prescribed treatment decided after consultation'." },
    { rule: "No miracle before/after, no invented timelines. No dramatic before/after promises and no fabricated recovery timeline or session count ('clear skin in 7 days', 'scars gone in 2 sittings'). If a range is genuinely needed, keep it general and always add a 'results vary' caveat." },
    { rule: "YMYL rails. Never invent statistics, success rates, prices, package costs, credentials, machine names, or study citations. Any clinic-specific fact must appear as a visible '[clinic to supply: …]' placeholder — never fabricated." },
    { rule: "No diagnosis, no patient details. Don't tell a reader they 'have' a condition or reveal/imply any individual patient's skin or health information; describe signs generally and invite a consultation." },
    { rule: "No fear-mongering or fake urgency. Warm, informative tone only — never 'act now before it becomes permanent'." },
    { rule: "Instant-reject phrases (never output): 'permanent cure', '100% cure', 'guaranteed results', 'risk-free', 'fair skin', 'fairer', 'gora/gori', 'skin whitening', 'whitening', '3 shades lighter', 'rang saaf', '100% safe', 'no side effects', 'use isotretinoin', 'apply hydroquinone', any '…mg', 'clear skin in 7 days', 'scars gone forever', 'miracle treatment', 'best dermatologist in city', 'No.1 skin clinic', '99% success rate'." },
  ],
};

export default seed;
