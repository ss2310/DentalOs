// Seed content for the ORTHOPEDICS vertical (slug 'ortho'). Loaded with:
//
//     npm run seed:vertical -- ortho
//
// SAFETY: every row below is written tagged vertical='ortho'. The loader NEVER
// touches a NULL (shared) or other vertical's row; a re-run replaces only ortho
// rows. The vertical row must already exist in `verticals` before seeding.
//
// Compliance rules and few-shots are captured here for completeness, but no store
// tables exist yet — the loader reports them as pending (no DB write).

export type VerticalTopic = { bank: string; label: string; sort_order: number };
export type FewShot = { post_type: string; example: string };
export type ComplianceRule = { rule: string };

export type VerticalSeed = {
  slug: string;
  display_name: string;
  topics: VerticalTopic[];
  few_shots: FewShot[];
  compliance_rules: ComplianceRule[];
};

const seed: VerticalSeed = {
  slug: "ortho",
  display_name: "Orthopedics",

  // ── TOPIC BANKS ──────────────────────────────────────────────────────────
  // ~15 per applicable bank (social · article · service · guide · comparison ·
  // question · occasion · update) + gbp_category. Labels are distinct from
  // dental and derma within each bank (curated unique index is (bank,label)
  // where clinic_id is null and is NOT vertical-aware).
  topics: [
    // BANK 'social' — covers the required themes
    { bank: "social", label: "Ghutno ka dard aur osteoarthritis — kya karein", sort_order: 1 },
    { bank: "social", label: "Back pain aur sciatica: kab dhyan dein", sort_order: 2 },
    { bank: "social", label: "Sports injuries: turant kya karein", sort_order: 3 },
    { bank: "social", label: "Joint replacement ke baad recovery — FAQs", sort_order: 4 },
    { bank: "social", label: "Osteoporosis: mahilaon mein bone health", sort_order: 5 },
    { bank: "social", label: "Desk-job posture aur kamar dard", sort_order: 6 },
    { bank: "social", label: "Fracture care: myths vs facts", sort_order: 7 },
    { bank: "social", label: "Arthritis: monsoon mein flare-ups", sort_order: 8 },
    { bank: "social", label: "Physiotherapy ya surgery — kaise decide karein", sort_order: 9 },
    { bank: "social", label: "Bone health ke liye nutrition", sort_order: 10 },
    { bank: "social", label: "Knee pain: exercise jo madad karti hain", sort_order: 11 },
    { bank: "social", label: "Neck pain aur cervical spondylosis basics", sort_order: 12 },
    { bank: "social", label: "Frozen shoulder — signs aur care", sort_order: 13 },
    { bank: "social", label: "Heel pain / plantar fasciitis awareness", sort_order: 14 },
    { bank: "social", label: "Bones strong rakhne ke liye Vitamin D & calcium", sort_order: 15 },

    // BANK 'article'
    { bank: "article", label: "Complete guide to knee osteoarthritis", sort_order: 1 },
    { bank: "article", label: "Back pain and sciatica: causes and care", sort_order: 2 },
    { bank: "article", label: "Sports injury recovery: what to expect", sort_order: 3 },
    { bank: "article", label: "Knee replacement: a recovery guide", sort_order: 4 },
    { bank: "article", label: "Hip replacement: what to expect", sort_order: 5 },
    { bank: "article", label: "Osteoporosis in women: prevention and care", sort_order: 6 },
    { bank: "article", label: "Desk posture and back pain: an office guide", sort_order: 7 },
    { bank: "article", label: "Fracture care: myths vs facts", sort_order: 8 },
    { bank: "article", label: "Arthritis management through the seasons", sort_order: 9 },
    { bank: "article", label: "Physiotherapy vs surgery: how decisions are made", sort_order: 10 },
    { bank: "article", label: "A bone-health nutrition guide", sort_order: 11 },
    { bank: "article", label: "Frozen shoulder: causes and treatment", sort_order: 12 },
    { bank: "article", label: "Cervical (neck) pain: a complete guide", sort_order: 13 },
    { bank: "article", label: "Heel and foot pain: causes and relief", sort_order: 14 },
    { bank: "article", label: "Understanding joint pain in older adults", sort_order: 15 },

    // BANK 'service'
    { bank: "service", label: "Knee Replacement Surgery", sort_order: 1 },
    { bank: "service", label: "Hip Replacement Surgery", sort_order: 2 },
    { bank: "service", label: "Arthroscopy (Keyhole Joint Surgery)", sort_order: 3 },
    { bank: "service", label: "Sports Injury Treatment", sort_order: 4 },
    { bank: "service", label: "Fracture Care & Trauma", sort_order: 5 },
    { bank: "service", label: "Spine / Back Pain Treatment", sort_order: 6 },
    { bank: "service", label: "Osteoarthritis Management", sort_order: 7 },
    { bank: "service", label: "Osteoporosis Treatment", sort_order: 8 },
    { bank: "service", label: "Frozen Shoulder Treatment", sort_order: 9 },
    { bank: "service", label: "Ligament (ACL) Reconstruction", sort_order: 10 },
    { bank: "service", label: "Joint Pain Consultation", sort_order: 11 },
    { bank: "service", label: "Physiotherapy & Rehabilitation", sort_order: 12 },
    { bank: "service", label: "Heel & Foot Pain Treatment", sort_order: 13 },
    { bank: "service", label: "Cervical / Neck Pain Treatment", sort_order: 14 },
    { bank: "service", label: "Sports Medicine Consultation", sort_order: 15 },

    // BANK 'guide' (YMYL — condition / interaction aware, red-flag aware)
    { bank: "guide", label: "Diabetes and joint-replacement surgery: considerations", sort_order: 1 },
    { bank: "guide", label: "Osteoporosis and fracture-risk management", sort_order: 2 },
    { bank: "guide", label: "Blood thinners and orthopedic surgery", sort_order: 3 },
    { bank: "guide", label: "Knee replacement: who is and isn't a candidate", sort_order: 4 },
    { bank: "guide", label: "Managing arthritis pain safely", sort_order: 5 },
    { bank: "guide", label: "Post-surgery recovery: what's normal vs a red flag", sort_order: 6 },
    { bank: "guide", label: "Sports injuries: when it needs urgent care", sort_order: 7 },
    { bank: "guide", label: "Bone health after menopause", sort_order: 8 },
    { bank: "guide", label: "Back pain: red-flag symptoms to never ignore", sort_order: 9 },
    { bank: "guide", label: "Physiotherapy vs surgery: evidence-based decisions", sort_order: 10 },
    { bank: "guide", label: "Obesity and joint health", sort_order: 11 },
    { bank: "guide", label: "Vitamin D deficiency and bone pain", sort_order: 12 },
    { bank: "guide", label: "Elderly falls and fracture prevention", sort_order: 13 },
    { bank: "guide", label: "Pain management: medication safety", sort_order: 14 },
    { bank: "guide", label: "Return to sport after injury: safe timelines", sort_order: 15 },

    // BANK 'comparison'
    { bank: "comparison", label: "Physiotherapy vs Surgery for knee pain", sort_order: 1 },
    { bank: "comparison", label: "Knee Replacement vs Arthroscopy", sort_order: 2 },
    { bank: "comparison", label: "Partial vs Total Knee Replacement", sort_order: 3 },
    { bank: "comparison", label: "Conservative vs Surgical back-pain treatment", sort_order: 4 },
    { bank: "comparison", label: "Open Surgery vs Keyhole (Arthroscopy)", sort_order: 5 },
    { bank: "comparison", label: "Hot vs Cold therapy for joint pain", sort_order: 6 },
    { bank: "comparison", label: "Rest vs Activity for back pain", sort_order: 7 },
    { bank: "comparison", label: "Physiotherapy vs Pain medication", sort_order: 8 },
    { bank: "comparison", label: "ACL Reconstruction vs Conservative management", sort_order: 9 },
    { bank: "comparison", label: "Cemented vs Uncemented implants (doctor-decided)", sort_order: 10 },
    { bank: "comparison", label: "Spinal Fusion vs Non-surgical care", sort_order: 11 },
    { bank: "comparison", label: "MRI vs X-ray for joint problems", sort_order: 12 },
    { bank: "comparison", label: "Steroid injection vs Physiotherapy (doctor-decided)", sort_order: 13 },
    { bank: "comparison", label: "Home exercise vs Supervised rehab", sort_order: 14 },
    { bank: "comparison", label: "Immediate vs Delayed surgery after injury", sort_order: 15 },

    // BANK 'question' — Hinglish Q&A set
    { bank: "question", label: "Ghutne ka operation zaroori hai kya?", sort_order: 1 },
    { bank: "question", label: "Knee replacement ke baad kitne din mein chal sakte hain?", sort_order: 2 },
    { bank: "question", label: "Kamar dard kab serious hota hai?", sort_order: 3 },
    { bank: "question", label: "Sciatica ka ilaaj kaise hota hai?", sort_order: 4 },
    { bank: "question", label: "Kya physiotherapy se surgery se bach sakte hain?", sort_order: 5 },
    { bank: "question", label: "Arthritis ka ilaaj kaise hota hai?", sort_order: 6 },
    { bank: "question", label: "Sports injury ke baad turant kya karein?", sort_order: 7 },
    { bank: "question", label: "Osteoporosis kaise rokein?", sort_order: 8 },
    { bank: "question", label: "Joint replacement implant kitne saal chalta hai?", sort_order: 9 },
    { bank: "question", label: "Fracture ke baad plaster kitne din rehta hai?", sort_order: 10 },
    { bank: "question", label: "Ghutno ke dard mein kaunsi exercise sahi hai?", sort_order: 11 },
    { bank: "question", label: "Frozen shoulder theek hone mein kitna time lagta hai?", sort_order: 12 },
    { bank: "question", label: "Bones strong kaise banayein?", sort_order: 13 },
    { bank: "question", label: "Monsoon mein joint pain kyun badhta hai?", sort_order: 14 },
    { bank: "question", label: "Neck pain ke liye doctor kab dikhana chahiye?", sort_order: 15 },

    // BANK 'occasion'
    { bank: "occasion", label: "World Osteoporosis Day awareness (Oct 20)", sort_order: 1 },
    { bank: "occasion", label: "World Arthritis Day awareness (Oct 12)", sort_order: 2 },
    { bank: "occasion", label: "Monsoon joint-pain care", sort_order: 3 },
    { bank: "occasion", label: "Winter joint-stiffness care", sort_order: 4 },
    { bank: "occasion", label: "Bone & Joint Day awareness (Aug 4)", sort_order: 5 },
    { bank: "occasion", label: "Senior citizens' bone-health camp", sort_order: 6 },
    { bank: "occasion", label: "Free joint-pain consultation week", sort_order: 7 },
    { bank: "occasion", label: "New Year fitness & joint-care reset", sort_order: 8 },
    { bank: "occasion", label: "Summer sports-season injury care", sort_order: 9 },
    { bank: "occasion", label: "Women's Day bone-health awareness", sort_order: 10 },
    { bank: "occasion", label: "Marathon / run-season injury prevention", sort_order: 11 },
    { bank: "occasion", label: "Fall-prevention awareness for elders", sort_order: 12 },
    { bank: "occasion", label: "Post-festival back-pain care", sort_order: 13 },
    { bank: "occasion", label: "Ortho clinic anniversary offer", sort_order: 14 },
    { bank: "occasion", label: "Free bone-density check camp", sort_order: 15 },

    // BANK 'update'
    { bank: "update", label: "New knee-replacement technology", sort_order: 1 },
    { bank: "update", label: "Advanced arthroscopy (keyhole) surgery", sort_order: 2 },
    { bank: "update", label: "Computer-navigated joint replacement now available", sort_order: 3 },
    { bank: "update", label: "New sports-medicine service", sort_order: 4 },
    { bank: "update", label: "New orthopedic surgeon joined the team", sort_order: 5 },
    { bank: "update", label: "Upgraded physiotherapy & rehab unit", sort_order: 6 },
    { bank: "update", label: "Digital X-ray / MRI now on-site", sort_order: 7 },
    { bank: "update", label: "Expanded joint-pain consultation hours", sort_order: 8 },
    { bank: "update", label: "Updated surgical safety protocols", sort_order: 9 },
    { bank: "update", label: "New spine-care service", sort_order: 10 },
    { bank: "update", label: "Teleconsultation for follow-ups now available", sort_order: 11 },
    { bank: "update", label: "New paediatric orthopedic service", sort_order: 12 },
    { bank: "update", label: "Ortho clinic expansion / new branch", sort_order: 13 },
    { bank: "update", label: "New EMI / flexible payment options for surgery", sort_order: 14 },
    { bank: "update", label: "Free bone-health awareness camp", sort_order: 15 },

    // BANK 'gbp_category' — GBP business-category defaults
    { bank: "gbp_category", label: "Orthopedic surgeon", sort_order: 1 },
    { bank: "gbp_category", label: "Orthopedic clinic", sort_order: 2 },
  ],

  // ── FEW-SHOT EXAMPLES (Stage 1, approved) ────────────────────────────────
  // Clean Roman Hinglish. Fictional clinic: "OrthoLife Clinic, Dharampeth,
  // Nagpur · Dr. Rakesh Verma · 📞 98765 43210". Loader reports as pending.
  few_shots: [
    {
      post_type: "GBP Post",
      example: `Ghutno mein dard subah zyada rehta hai, ya seedhiyan chadhte waqt? Isse ignore karna aage mushkil badha sakta hai 🦵

Knee pain ke kai reasons hote hain — osteoarthritis, purani injury, ya extra weight ka joints par pressure. Har case alag hota hai, isliye sahi assessment ke baad hi pata chalta hai ki aapke liye kya sahi rahega — kabhi exercise aur physiotherapy, kabhi medication, aur kuch cases mein hi surgery. Most patients ko sahi guidance se apni movement aur comfort mein improvement dikhti hai, though results har vyakti mein alag hote hain.

Agar dard achanak bahut tez ho, ghutna sooj jaaye ya bukhaar ho — turant doctor ko dikhayein ⚠️

OrthoLife Clinic, Dharampeth mein Dr. Rakesh Verma aapke joints ko samajh kar ek realistic plan banate hain — bina kisi jhoothe vaade ke 🩺

Apni consultation book karne ke liye aaj hi call karein 👇

OrthoLife Clinic | 📞 98765 43210`,
    },
    {
      post_type: "GBP Post",
      example: `Knee ya hip replacement soch rahe hain, par recovery ko lekar dar lag raha hai? Yeh sawaal poochna bilkul sahi hai 🙂

Joint replacement ke baad recovery step-by-step hoti hai — pehle supported walking, phir dheere-dheere daily activities. Typically logon ko kuch hafton se mahino mein movement wapas aati hai, par yeh har vyakti mein alag hoti hai — age, health aur physiotherapy par depend karta hai. Koi bhi implant ya surgery "hamesha ke liye guarantee" nahi hoti; sabse zaroori hai realistic expectations aur proper follow-up.

Surgery aapke liye sahi hai ya nahi, yeh sirf ek proper checkup ke baad decide hota hai — na koi shortcut, na koi "ek ilaaj se bach jaayenge" wala vaada 🩺

OrthoLife Clinic, Dharampeth mein hum har sawaal ka honest jawab dete hain 😊

Apne doubts clear karne ke liye call karein 👇

OrthoLife Clinic | 📞 98765 43210`,
    },
    {
      post_type: "Instagram Caption",
      example: `Din bhar laptop ke saamne, aur ab kamar dard normal lagne laga hai? Yeh signal ignore mat kariye 💺

Ghanton tak ek hi position mein baithna back aur neck par lagataar pressure daalta hai.

Chhoti aadatein farak laati hain — har 30-40 min mein uthna, screen ko eye-level par rakhna, aur beech beech mein stretch karna 🧍

Par agar dard tang ya pairon tak jaaye, ya numbness ho — toh isse serious lein aur doctor se milein ⚠️

Har kamar dard alag hota hai, isliye general tips ke saath ek proper assessment bhi zaroori hai. Apni body ko samajhne ke liye DM karein 📩

#NagpurOrthopedic #BackPain #PostureCare #DeskJob #Dharampeth`,
    },
    {
      post_type: "Instagram Caption",
      example: `Weekend match ke baad ankle ya knee mein dard? "Ho jaayega theek" maan kar chhodna mehnga pad sakta hai ⚽

Sports injuries — sprain, ligament strain ya swelling — sahi time par sahi care maangti hain.

Shuruaat mein rest, ice aur activity kam karna madad karta hai. Lekin agar joint par weight na daal payein, zyada sooj ho, ya dard tez ho — toh turant doctor ko dikhayein ⚠️

Har injury alag hoti hai; sahi diagnosis se hi pata chalta hai ki recovery ka sahi rasta kya hai. Results har kisi mein alag hote hain.

Apni injury check karwane ke liye DM karein 📩

#NagpurSportsInjury #Orthopedics #KneeCare #AnkleInjury #Dharampeth`,
    },
    {
      // 5-star
      post_type: "Review Response",
      example: `Thank you so much for your kind words! 😊 Dr. Verma aur poori OrthoLife team maanti hai ki har patient ko honest guidance aur saare options samajhne ka haq hai. Aapka bharosa hamare liye bahut maayne rakhta hai — apne joints ya recovery ko lekar kabhi bhi koi sawaal ho toh zaroor aaiye. Take care!
— Team OrthoLife Clinic`,
    },
    {
      // 2-star: empathise, NO admission of fault, NO health detail, move offline.
      post_type: "Review Response",
      example: `Hi, we're truly sorry that your experience with us didn't meet your expectations — that's genuinely not the standard we aim for. Your feedback matters to us, and we'd really like to understand what happened and make it right. Please call us at 📞 98765 43210 so we can look into this personally.
— Team OrthoLife Clinic`,
    },
  ],

  // ── COMPLIANCE RULES (Stage 1, approved) ─────────────────────────────────
  compliance_rules: [
    { rule: "No guaranteed surgery outcomes. Never promise a surgery/procedure will succeed, be '100% successful', or fully restore function. Use 'most patients', 'aims to', 'can help improve', 'results vary from person to person'." },
    { rule: "No 'avoid surgery with this one trick' framing. Never imply a single exercise, remedy, or tip lets someone skip needed surgery or replaces a doctor's advice. Surgery-vs-conservative is an individual, doctor-led decision." },
    { rule: "No implant/hardware brand claims or longevity guarantees. Never name an implant/brand as 'the best' or promise a joint/implant will 'last X years' or 'a lifetime'. Longevity varies by patient, activity, weight, and many factors." },
    { rule: "Recovery timelines only as typical ranges + 'varies'. Never give a fixed recovery date; use general typical ranges and always add that individual recovery varies." },
    { rule: "Red-flag symptoms route to urgent care. For serious signs (sudden severe pain, numbness/tingling, loss of bladder or bowel control, inability to bear weight, deformity after injury, fever with a hot swollen joint), explicitly say 'see a doctor immediately / go to emergency' — never downplay or defer." },
    { rule: "YMYL rails. Never invent statistics, success rates, prices, package costs, credentials, or study citations. Any clinic-specific fact must appear as a visible '[clinic to supply: …]' placeholder — never fabricated." },
    { rule: "No diagnosis, no patient details, no fear-mongering. Describe signs generally and invite assessment; never reveal/imply an individual patient's health info; no fake urgency ('operate now or lose the leg')." },
    { rule: "Instant-reject phrases (never output): 'guaranteed surgery success', '100% successful surgery', 'cure arthritis', 'permanent cure for arthritis', 'risk-free surgery', 'avoid surgery forever', 'no surgery needed — just do this', 'skip surgery with this one trick', 'surgery ki zaroorat nahi padegi', 'implant will last a lifetime', 'lifetime guarantee', 'best implant brand', 'pain gone forever', 'instant permanent relief', '100% pain-free', 'best orthopedic surgeon in city', 'No.1 ortho clinic', '99% success rate'." },
  ],
};

export default seed;
