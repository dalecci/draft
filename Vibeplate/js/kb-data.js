"use strict";
const KB_VERSION = 2;
const DEFAULT_DWELL = 180;
const KB_BASE = [
  // ============================== PARASITES (Vibrant research) ==============================
  {
    id: "parasites-general-core",
    condition: "Parasites \u2014 General (core list)",
    aliases: ["parasite cleanup", "parasite general", "parasites"],
    category: "Parasites",
    frequencies: [728, 784, 880, 465, 727, 800],
    dwell: 180,
    source: "Vibrant research",
    notes: "Core parasite-associated list. 728/784/465 core cleanup; 880 core Rife; 727 and 800 appear repeatedly in parasite sets."
  },
  {
    id: "parasites-classic-4step",
    condition: "Parasites \u2014 Classic 4-Step Cleanup",
    aliases: ["classic cleanup", "4 step parasite"],
    category: "Parasites",
    frequencies: [728, 784, 880, 465],
    dwell: 180,
    source: "Vibrant research",
    notes: "Classic CAFL cleanup sequence. 3 minutes each \u2014 12 minutes total."
  },
  {
    id: "parasites-extended-6step",
    condition: "Parasites \u2014 Extended 6-Step",
    aliases: ["6 step parasite", "extended parasite"],
    category: "Parasites",
    frequencies: [728, 784, 880, 465, 727, 800],
    dwell: 180,
    source: "Vibrant research",
    notes: "Expanded six-frequency sequence. 3 minutes each \u2014 18 minutes total."
  },
  // ============================== PARASITES (curated starter — verify) ==============================
  {
    id: "parasites-roundworms",
    condition: "Roundworms (general)",
    aliases: ["nematodes", "roundworm"],
    category: "Parasites",
    frequencies: [240, 650, 688, 750, 776, 2720],
    dwell: 180,
    source: "CAFL (public reproductions)",
    verify: true,
    notes: "General roundworm set as commonly reproduced."
  },
  {
    id: "parasites-ascaris",
    condition: "Ascaris",
    aliases: ["ascaris lumbricoides", "giant roundworm"],
    category: "Parasites",
    frequencies: [152, 442, 751, 1146, 8146],
    dwell: 180,
    source: "CAFL (public reproductions)",
    verify: true
  },
  {
    id: "parasites-pinworm",
    condition: "Pinworm (Enterobiasis)",
    aliases: ["enterobius", "threadworm"],
    category: "Parasites",
    frequencies: [773, 826, 827, 835, 4152],
    dwell: 180,
    source: "CAFL (public reproductions)",
    verify: true
  },
  {
    id: "parasites-hookworm",
    condition: "Hookworm",
    aliases: ["ancylostoma", "necator"],
    category: "Parasites",
    frequencies: [440, 2008, 5868, 6436],
    dwell: 180,
    source: "CAFL (public reproductions)",
    verify: true
  },
  {
    id: "parasites-tapeworm",
    condition: "Tapeworm (Taenia)",
    aliases: ["taenia", "cestode", "tape worm"],
    category: "Parasites",
    frequencies: [522, 562, 843, 1223, 3032, 5522],
    dwell: 180,
    source: "CAFL (public reproductions)",
    verify: true
  },
  {
    id: "parasites-flukes-general",
    condition: "Flukes (general)",
    aliases: ["fluke", "trematode"],
    category: "Parasites",
    frequencies: [435, 524, 651, 676, 763, 846, 854, 945],
    dwell: 180,
    source: "CAFL (public reproductions)",
    verify: true
  },
  {
    id: "parasites-fluke-liver",
    condition: "Liver Fluke (Fasciola hepatica)",
    aliases: ["fasciola", "liver fluke"],
    category: "Parasites",
    frequencies: [143, 275, 676, 763, 6641, 6672],
    dwell: 180,
    source: "CAFL (public reproductions)",
    verify: true
  },
  {
    id: "parasites-fluke-blood",
    condition: "Blood Fluke (Schistosoma)",
    aliases: ["schistosoma", "bilharzia"],
    category: "Parasites",
    frequencies: [329, 419, 635, 847, 867, 5516],
    dwell: 180,
    source: "CAFL (public reproductions)",
    verify: true
  },
  {
    id: "parasites-giardia",
    condition: "Giardia (Giardia lamblia)",
    aliases: ["giardiasis", "beaver fever"],
    category: "Parasites",
    frequencies: [334, 812, 829, 4334],
    dwell: 180,
    source: "CAFL (public reproductions)",
    verify: true
  },
  {
    id: "parasites-blastocystis",
    condition: "Blastocystis hominis",
    aliases: ["blasto"],
    category: "Parasites",
    frequencies: [365, 595, 844, 848, 1201],
    dwell: 180,
    source: "CAFL (public reproductions)",
    verify: true
  },
  {
    id: "parasites-entamoeba",
    condition: "Entamoeba histolytica",
    aliases: ["amoeba", "amebiasis"],
    category: "Parasites",
    frequencies: [148, 166, 308, 393, 631, 778],
    dwell: 180,
    source: "CAFL (public reproductions)",
    verify: true
  },
  {
    id: "parasites-trichinella",
    condition: "Trichinosis (Trichinella)",
    aliases: ["trichinella spiralis"],
    category: "Parasites",
    frequencies: [101, 541, 822, 1054, 1372],
    dwell: 180,
    source: "CAFL (public reproductions)",
    verify: true
  },
  {
    id: "parasites-toxoplasma",
    condition: "Toxoplasmosis",
    aliases: ["toxoplasma gondii"],
    category: "Parasites",
    frequencies: [434, 852],
    dwell: 180,
    source: "CAFL (public reproductions)",
    verify: true
  },
  {
    id: "parasites-strongyloides",
    condition: "Strongyloides",
    aliases: ["threadworm strongyloides"],
    category: "Parasites",
    frequencies: [332, 422, 721, 732, 749, 942, 3212],
    dwell: 180,
    source: "CAFL (public reproductions)",
    verify: true
  },
  {
    id: "parasites-filariasis",
    condition: "Filariasis",
    aliases: ["filaria"],
    category: "Parasites",
    frequencies: [112, 120, 332, 753],
    dwell: 180,
    source: "CAFL (public reproductions)",
    verify: true
  },
  // ============================== MOLD & FUNGUS (Vibrant research, Aug 2026) ==============================
  {
    id: "mold-general",
    condition: "Mold \u2014 General",
    aliases: ["mold", "mould"],
    category: "Mold & Fungus",
    frequencies: [222, 242, 523, 565, 592, 623, 745, 933, 1130, 1155, 1333, 1833, 4442],
    dwell: 180,
    source: "Vibrant research",
    notes: "Cross-checked across multiple CAFL reproductions."
  },
  {
    id: "mold-fungus-general",
    condition: "Mold & Fungus \u2014 General",
    aliases: ["fungus general", "mold and fungus"],
    category: "Mold & Fungus",
    frequencies: [728, 880, 784, 464, 886, 414, 254, 344, 2411, 321, 555, 942, 337, 766, 1823, 524, 374, 743, 132, 866],
    dwell: 180,
    source: "Vibrant research",
    notes: "Core starting cluster: 728 \u2013 784 \u2013 880 \u2013 464 (overlaps the parasite core list)."
  },
  {
    id: "mold-fungus-general-extended",
    condition: "Mold & Fungus \u2014 General (extended 37-frequency set)",
    aliases: ["extended mold set"],
    category: "Mold & Fungus",
    frequencies: [4442, 2411, 1833, 1823, 1333, 1155, 1130, 1016, 942, 933, 886, 880, 866, 784, 774, 766, 745, 743, 728, 623, 594, 592, 565, 555, 524, 512, 464, 414, 374, 344, 337, 321, 254, 242, 222, 158, 132],
    dwell: 180,
    source: "Vibrant research",
    notes: "The more extensive CAFL general mold/fungus sequence."
  },
  {
    id: "aspergillus-general",
    condition: "Aspergillus \u2014 General",
    aliases: ["aspergillus", "aspergillosis"],
    category: "Mold & Fungus",
    frequencies: [1972, 1823, 758, 743, 697, 524, 374, 339, 247],
    dwell: 180,
    source: "Vibrant research",
    notes: "Organism-specific CAFL master set, independently reproduced in several CAFL copies."
  },
  {
    id: "aspergillus-flavus",
    condition: "Aspergillus flavus",
    aliases: [],
    category: "Mold & Fungus",
    frequencies: [1823, 247, 1972],
    dwell: 180,
    source: "Vibrant research"
  },
  {
    id: "aspergillus-glaucus",
    condition: "Aspergillus glaucus",
    aliases: [],
    category: "Mold & Fungus",
    frequencies: [524, 758],
    dwell: 180,
    source: "Vibrant research"
  },
  {
    id: "aspergillus-niger",
    condition: "Aspergillus niger",
    aliases: ["black mold aspergillus"],
    category: "Mold & Fungus",
    frequencies: [374, 697],
    dwell: 180,
    source: "Vibrant research"
  },
  {
    id: "aspergillus-terreus",
    condition: "Aspergillus terreus",
    aliases: [],
    category: "Mold & Fungus",
    frequencies: [743, 339],
    dwell: 180,
    source: "Vibrant research"
  },
  {
    id: "alternaria-tenuis",
    condition: "Alternaria tenuis",
    aliases: ["alternaria"],
    category: "Mold & Fungus",
    frequencies: [853, 304],
    dwell: 180,
    source: "Vibrant research"
  },
  {
    id: "penicillium-chrysogenum",
    condition: "Penicillium chrysogenum",
    aliases: ["penicillium chyrosogenium"],
    category: "Mold & Fungus",
    frequencies: [129, 249, 344, 967],
    dwell: 180,
    source: "Vibrant research",
    notes: 'CAFL spelling sometimes "chyrosogenium".'
  },
  {
    id: "penicillium-chrysogenum-secondary",
    condition: "Penicillium chrysogenum \u2014 Secondary",
    aliases: [],
    category: "Mold & Fungus",
    frequencies: [345, 688, 868, 1070, 2411, 728, 764, 765],
    dwell: 180,
    source: "Vibrant research"
  },
  {
    id: "penicillium-notatum",
    condition: "Penicillium notatum",
    aliases: [],
    category: "Mold & Fungus",
    frequencies: [334, 629],
    dwell: 180,
    source: "Vibrant research"
  },
  {
    id: "penicillium-notatum-secondary",
    condition: "Penicillium notatum \u2014 Secondary",
    aliases: [],
    category: "Mold & Fungus",
    frequencies: [321, 550, 555, 556, 558, 560, 562, 566, 572, 644, 825, 922, 942, 4870, 7780, 412, 715],
    dwell: 180,
    source: "Vibrant research"
  },
  {
    id: "penicillium-rubrum",
    condition: "Penicillium rubrum",
    aliases: [],
    category: "Mold & Fungus",
    frequencies: [332, 457, 460, 462, 766, 1015, 1018],
    dwell: 180,
    source: "Vibrant research"
  },
  {
    id: "mucor-mucedo",
    condition: "Mucor mucedo",
    aliases: [],
    category: "Mold & Fungus",
    frequencies: [612, 1e3, 488, 766, 9788, 735],
    dwell: 180,
    source: "Vibrant research"
  },
  {
    id: "mucor-plumbeus",
    condition: "Mucor plumbeus",
    aliases: [],
    category: "Mold & Fungus",
    frequencies: [361, 578, 785, 877],
    dwell: 180,
    source: "Vibrant research"
  },
  {
    id: "mucor-racemosus",
    condition: "Mucor racemosus",
    aliases: ["mucor racemosis"],
    category: "Mold & Fungus",
    frequencies: [310, 474, 875],
    dwell: 180,
    source: "Vibrant research",
    notes: 'Listed as "racemosis" in some CAFL copies.'
  },
  {
    id: "mucor-racemosus-secondary",
    condition: "Mucor racemosus \u2014 Secondary",
    aliases: [],
    category: "Mold & Fungus",
    frequencies: [473, 686, 871, 873, 876, 878, 887, 7768, 7976, 8788, 713, 729, 731, 751, 760, 778, 1200],
    dwell: 180,
    source: "Vibrant research"
  },
  {
    id: "monotospora-languinosa",
    condition: "Monotospora languinosa",
    aliases: [],
    category: "Mold & Fungus",
    frequencies: [788],
    dwell: 180,
    source: "Vibrant research"
  },
  {
    id: "microsporum-audouinii",
    condition: "Microsporum audouinii",
    aliases: [],
    category: "Mold & Fungus",
    frequencies: [422, 831, 1222, 285],
    dwell: 180,
    source: "Vibrant research"
  },
  {
    id: "microsporum-canis",
    condition: "Microsporum canis",
    aliases: ["ringworm cat dog"],
    category: "Mold & Fungus",
    frequencies: [347, 970, 1644, 402, 650],
    dwell: 180,
    source: "Vibrant research"
  },
  {
    id: "stachybotrys-chartarum",
    condition: "Stachybotrys chartarum",
    aliases: ["black mold", "toxic black mold"],
    category: "Mold & Fungus",
    frequencies: [],
    dwell: 180,
    noReliableListing: true,
    source: "Vibrant research",
    notes: "No sufficiently reliable CAFL entry found \u2014 deliberately left blank rather than assigning frequencies from poorly sourced lists. Nearest option: Mold & Fungus \u2014 General core cluster (728/784/880/464)."
  },
  {
    id: "cladosporium",
    condition: "Cladosporium",
    aliases: [],
    category: "Mold & Fungus",
    frequencies: [],
    dwell: 180,
    noReliableListing: true,
    source: "Vibrant research",
    notes: "No sufficiently reliable CAFL entry found \u2014 deliberately left blank. Nearest option: Mold & Fungus \u2014 General core cluster (728/784/880/464)."
  },
  // ============================== FUNGAL / YEAST (curated starter — verify) ==============================
  {
    id: "candida-albicans",
    condition: "Candida albicans",
    aliases: ["candida", "yeast overgrowth", "thrush"],
    category: "Mold & Fungus",
    frequencies: [464, 727, 787, 880, 886, 95, 125, 225, 240, 442, 465],
    dwell: 180,
    source: "CAFL (public reproductions)",
    verify: true
  },
  {
    id: "tinea-pedis",
    condition: "Athlete's Foot (Tinea pedis)",
    aliases: ["athletes foot", "tinea"],
    category: "Mold & Fungus",
    frequencies: [20, 379, 727, 787, 880, 5e3],
    dwell: 180,
    source: "CAFL (public reproductions)",
    verify: true
  },
  {
    id: "ringworm-general",
    condition: "Ringworm (general)",
    aliases: ["tinea corporis"],
    category: "Mold & Fungus",
    frequencies: [442, 727, 766, 784, 787, 880],
    dwell: 180,
    source: "CAFL (public reproductions)",
    verify: true
  },
  // ============================== BACTERIA & SPIROCHETES (curated starter — verify) ==============================
  {
    id: "strep-general",
    condition: "Streptococcus (general)",
    aliases: ["strep"],
    category: "Bacteria",
    frequencies: [20, 465, 727, 787, 880, 875, 885],
    dwell: 180,
    source: "CAFL (public reproductions)",
    verify: true
  },
  {
    id: "staph-general",
    condition: "Staphylococcus (general)",
    aliases: ["staph"],
    category: "Bacteria",
    frequencies: [727, 786, 880, 998],
    dwell: 180,
    source: "CAFL (public reproductions)",
    verify: true
  },
  {
    id: "ecoli",
    condition: "E. coli",
    aliases: ["escherichia coli"],
    category: "Bacteria",
    frequencies: [282, 333, 413, 957, 1320, 1722],
    dwell: 180,
    source: "CAFL (public reproductions)",
    verify: true
  },
  {
    id: "h-pylori",
    condition: "H. pylori",
    aliases: ["helicobacter pylori"],
    category: "Bacteria",
    frequencies: [352, 676, 2167],
    dwell: 180,
    source: "CAFL (public reproductions)",
    verify: true
  },
  {
    id: "lyme-borrelia",
    condition: "Lyme (Borrelia)",
    aliases: ["lyme disease", "borrelia burgdorferi"],
    category: "Bacteria",
    frequencies: [432, 615, 625, 800, 884],
    dwell: 180,
    source: "CAFL (public reproductions)",
    verify: true
  },
  // ============================== VIRUSES (curated starter — verify) ==============================
  {
    id: "ebv",
    condition: "Epstein\u2013Barr Virus (EBV)",
    aliases: ["epstein barr", "mononucleosis", "mono"],
    category: "Viruses",
    frequencies: [105, 172, 253, 274, 380, 465, 660, 663, 669, 744, 825, 880],
    dwell: 180,
    source: "CAFL (public reproductions)",
    verify: true
  },
  {
    id: "herpes-simplex-1",
    condition: "Herpes Simplex I",
    aliases: ["hsv1", "cold sores"],
    category: "Viruses",
    frequencies: [322, 476, 589, 664, 785, 822],
    dwell: 180,
    source: "CAFL (public reproductions)",
    verify: true
  },
  {
    id: "influenza-general",
    condition: "Influenza (general)",
    aliases: ["flu", "grippe"],
    category: "Viruses",
    frequencies: [728, 787, 800, 880],
    dwell: 180,
    source: "CAFL (public reproductions)",
    verify: true
  },
  // ============================== RESPIRATORY (Vibrant research, Aug 2026 — full forensic asthma review) ==============================
  {
    id: "asthma-main",
    condition: "Asthma \u2014 Main Set",
    aliases: ["asthma", "bronchial asthma"],
    category: "Respiratory",
    frequencies: [7344, 3702, 3672, 2720, 2170, 1800, 1600, 1500, 1283, 1234, 1233, 880, 787, 727, 522, 444, 146, 125, 95, 72, 20, 0.5],
    dwell: 180,
    source: "Vibrant research",
    notes: "CAFL main asthma entry. Most asthma-SPECIFIC values: 1233/1234, 1283, 3672/3702, 7344/7346 \u2014 the 727/787/880 trio appears across many unrelated conditions and should not be read as asthma resonances. CAFL cross-references Liver support, Parasites Ascaris, and Mycoplasma general. SAFETY: never a substitute for prescribed inhaler therapy or an asthma action plan, and never run vibration/frequency sessions during an active asthma attack \u2014 in a human study, chest-wall vibration increased breathing rate and produced sensations resembling an asthma episode. Use only when asthma is stable and controlled."
  },
  {
    id: "asthma-1",
    condition: "Asthma 1",
    aliases: [],
    category: "Respiratory",
    frequencies: [1283, 1233, 4.7],
    dwell: 180,
    source: "Vibrant research",
    notes: "4.7 Hz is sub-audible \u2014 felt more than heard on normal speakers. Same safety rules as the main asthma entry."
  },
  {
    id: "asthma-2",
    condition: "Asthma 2 \u2014 documented 5-minute dwells",
    aliases: ["asthma_2"],
    category: "Respiratory",
    frequencies: [1234, 3672, 7346, 727, 787, 880, 1e4, 47, 120],
    dwell: 300,
    source: "Vibrant research",
    notes: 'The most clearly documented CAFL asthma protocol \u2014 CAFL explicitly labels this set "all frequencies for 5 min" (45 minutes total). Same safety rules as the main asthma entry.'
  },
  {
    id: "asthma-v",
    condition: "Asthma V",
    aliases: [],
    category: "Respiratory",
    frequencies: [3125, 3124, 890, 886, 871, 822, 782, 756, 712, 665, 633, 521, 515, 487, 434, 411, 322, 263, 172, 128],
    dwell: 180,
    source: "Vibrant research",
    notes: "Same safety rules as the main asthma entry."
  },
  // ============================== BRAIN & COGNITION (Vibrant research, Aug 2026) ==============================
  {
    id: "gamma-frontal-40",
    condition: "Frontal Lobe \u2014 Gamma 40 Hz (research-based)",
    aliases: ["frontal lobe", "focus", "executive function", "brain fog", "gamma", "cognition", "turn brain on"],
    category: "Brain & Cognition",
    frequencies: [40],
    dwell: 1200,
    source: "Clinical research (MIT GENUS)",
    notes: 'The one frequency with real peer-reviewed brain evidence: 40 Hz gamma sensory stimulation (MIT GENUS / Cognito Therapeutics trials). In late-onset Alzheimer\'s patients, 1 hour DAILY of 40 Hz light+sound improved MMSE/CDR scores and cut plasma pTau217 up to 47% over 2 years of use. Key detail: the research uses sound PULSING at 40 Hz, not a plain 40 Hz tone \u2014 use the Gamma preset (pulsed carrier). Daily consistency matters far more than one long session. No CAFL entry exists for "frontal lobe" \u2014 this is science-tier, not Rife-tier.'
  },
  {
    id: "alzheimers-1",
    condition: "Alzheimers 1 (CAFL)",
    aliases: ["alzheimer", "dementia", "memory loss", "memory"],
    category: "Brain & Cognition",
    frequencies: [430, 620, 624, 840, 866, 5148, 2213, 19180.5, 742.4, 303, 23.2, 3773.3, 943.3, 471.66, 470.9, 941.8, 3767.3],
    dwell: 180,
    source: "Vibrant research",
    notes: 'CAFL Alzheimers_1 (verified against electroherbalism CAFL; CAFL also says "see ALS sets"). Historical listing, unverified clinically. The clinically supported frequency approach for dementia is 40 Hz gamma stimulation \u2014 see Frontal Lobe \u2014 Gamma 40 Hz. Never a substitute for medical dementia care.'
  },
  {
    id: "alzheimers-2",
    condition: "Alzheimers 2 (CAFL)",
    aliases: [],
    category: "Brain & Cognition",
    frequencies: [19180.5, 2213, 5148, 866, 840, 624, 620, 430],
    dwell: 180,
    source: "Vibrant research",
    notes: "CAFL Alzheimers_2 \u2014 the compact set. Same honesty notes as Alzheimers 1."
  },
  // ============================== LYMPH & CIRCULATION (Vibrant research, Aug 2026) ==============================
  {
    id: "lymph-support",
    condition: "Lymph Support (CAFL \u2014 6-min dwells)",
    aliases: ["lymph", "lymphatic", "lymphatic drainage"],
    category: "Lymph & Circulation",
    frequencies: [15.05, 10.36, 3176],
    dwell: 360,
    source: "Vibrant research",
    notes: 'CAFL "Lymph Support" \u2014 CAFL documents 6 minutes per frequency. 15.05 and 10.36 Hz are sub-audible (felt as pulsing more than heard). Historical listing, unverified; actual lymph movement is driven by muscle activity, breathing, hydration, and manual lymphatic drainage massage.'
  },
  {
    id: "detox-lymphs",
    condition: "Detox & Lymphs (CAFL full set)",
    aliases: ["detox", "drainage"],
    category: "Lymph & Circulation",
    frequencies: [1e4, 3176, 3040, 880, 787, 751, 727, 676, 635, 625, 522, 465, 444, 440, 304, 306, 148, 146, 15.2, 15.05, 10.36, 10, 7.83, 6.3, 2.5],
    dwell: 180,
    source: "Vibrant research",
    notes: 'CAFL "Detox and lymphs" \u2014 25 frequencies, verified against CAFL reproductions. Sub-20 Hz values are felt, not heard, on normal speakers.'
  },
  {
    id: "arteriosclerosis",
    condition: "Arteriosclerosis (CAFL)",
    aliases: ["arteries", "artery cleaning", "atherosclerosis", "hardening of the arteries", "circulation", "plaque"],
    category: "Lymph & Circulation",
    frequencies: [1e4, 2720, 2170, 1800, 1600, 1500, 880, 787, 776, 727, 20],
    dwell: 180,
    source: "Vibrant research",
    notes: 'CAFL entry, verified \u2014 CAFL itself annotates "hardening of the arteries; regeneration takes time." Honesty: no clinical evidence that sound frequencies clear arterial plaque \u2014 the proven levers are blood pressure control, statins, diet, and exercise; treat this as a complementary session only.'
  },
  // ============================== DIGESTIVE (Vibrant research, Aug 2026) ==============================
  {
    id: "ibs",
    condition: "Irritable Bowel Syndrome (IBS)",
    aliases: ["ibs", "irritable bowel", "gut", "bowel", "intestinal spasms"],
    category: "Digestive",
    frequencies: [6766, 5429, 4334, 2018, 1550, 880, 832, 829, 812, 802, 787, 727, 465, 422, 407, 334, 20],
    dwell: 180,
    source: "Vibrant research",
    notes: 'CAFL entry verified verbatim \u2014 CAFL cross-references "Parasites general set and Colitis" and annotates that this set may help balance gut bacteria and ease intestinal spasms but may miss giardia/parasites. Honesty: IBS has no cure in any system \u2014 it is a gut-brain axis disorder managed into remission. Best clinical evidence: low-FODMAP diet, psyllium fiber, enteric-coated peppermint oil, and gut-directed hypnotherapy/CBT (real RCT support \u2014 the mind-body layer genuinely moves IBS). Stress drives flares, so the CALMING component of a session is the honest mechanism here \u2014 run sessions relaxed, low volume, comfortable position. Red flags that mean doctor, not frequencies: blood in stool, weight loss, fever, nighttime symptoms, onset after 50.'
  },
  {
    id: "colitis-diarrhea",
    condition: "Colitis & Diarrhea",
    aliases: ["colitis", "diarrhea", "colon inflammation"],
    category: "Digestive",
    frequencies: [1e4, 5e3, 1550, 880, 832, 802, 787, 727, 621, 465, 454, 440, 433, 344, 152],
    dwell: 180,
    source: "Vibrant research",
    notes: 'CAFL "Colitis_and_Diarrhea" (inflammation of the colon), verified verbatim. Persistent bloody diarrhea, fever, or weight loss = medical evaluation for IBD \u2014 not a frequency session.'
  },
  {
    id: "colon-general",
    condition: "Colon Problems \u2014 General",
    aliases: ["colon"],
    category: "Digestive",
    frequencies: [20, 440, 880, 1552, 802, 832],
    dwell: 180,
    source: "Vibrant research",
    notes: 'CAFL "Colon_problems_general", verified verbatim. CAFL also lists Large intestine tonic: 8, 440, 880.'
  },
  // ============================== GENERAL & WELLNESS ==============================
  {
    id: "rife-classic-general",
    condition: "Rife Classics \u2014 General Set",
    aliases: ["general set", "classic rife", "maintenance"],
    category: "General & Support",
    frequencies: [20, 72, 95, 125, 440, 465, 727, 787, 802, 880, 1550, 5e3, 1e4],
    dwell: 180,
    source: "CAFL (public reproductions)",
    verify: true,
    notes: "The widely reproduced classic Rife general/maintenance sweep."
  },
  {
    id: "sinusitis",
    condition: "Sinusitis",
    aliases: ["sinus", "sinus infection"],
    category: "General & Support",
    frequencies: [60, 120, 440, 727, 787, 880],
    dwell: 180,
    source: "CAFL (public reproductions)",
    verify: true
  },
  {
    id: "solfeggio-set",
    condition: "Solfeggio Scale (full set)",
    aliases: ["solfeggio", "528"],
    category: "Wellness Tones",
    frequencies: [174, 285, 396, 417, 528, 639, 741, 852, 963],
    dwell: 180,
    source: "Solfeggio (popular)",
    notes: "Popular wellness tone scale \u2014 not a CAFL/Rife listing."
  },
  {
    id: "schumann-resonances",
    condition: "Schumann Resonances",
    aliases: ["schumann", "earth resonance", "7.83"],
    category: "Wellness Tones",
    frequencies: [7.83, 14.3, 20.8, 27.3, 33.8],
    dwell: 180,
    source: "Schumann (geophysics)",
    notes: "Earth\u2013ionosphere resonance modes. Frequencies below ~20 Hz are felt more than heard on normal speakers."
  }
];
