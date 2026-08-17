// Vibrant Resonance — Knowledge Base v1
// ---------------------------------------------------------------
// Sources:
//   "Vibrant research"            — entries taken verbatim from Jordan's research documents
//                                   (Parasites General PDF, Mold/Fungus CAFL cross-check, Aug 2026)
//   "CAFL (public reproductions)" — curated starter entries from widely circulated CAFL lists.
//                                   Marked "verify" — confirm against your own reference; correcting
//                                   them via Admin → Add Research trains the Brain permanently.
//   "Solfeggio / Schumann"        — popular wellness tone sets, not CAFL.
//
// IMPORTANT ARCHITECTURE NOTE: this file is the *base layer* only. Research updates and
// corrections live in the kb_entries store (Admin → Add Research) and are merged OVER this
// base by id. Training data lives in a separate store and is NEVER touched by KB updates.
// These listings are historical Rife/CAFL practitioner conventions — not clinically
// validated treatments.
'use strict';

const KB_VERSION = 1;
const DEFAULT_DWELL = 180; // seconds — the commonly cited 3-minute Rife practitioner convention

const KB_BASE = [
  // ============================== PARASITES (Vibrant research) ==============================
  {
    id: 'parasites-general-core', condition: 'Parasites — General (core list)',
    aliases: ['parasite cleanup', 'parasite general', 'parasites'],
    category: 'Parasites', frequencies: [728, 784, 880, 465, 727, 800], dwell: 180,
    source: 'Vibrant research',
    notes: 'Core parasite-associated list. 728/784/465 core cleanup; 880 core Rife; 727 and 800 appear repeatedly in parasite sets.',
  },
  {
    id: 'parasites-classic-4step', condition: 'Parasites — Classic 4-Step Cleanup',
    aliases: ['classic cleanup', '4 step parasite'],
    category: 'Parasites', frequencies: [728, 784, 880, 465], dwell: 180,
    source: 'Vibrant research',
    notes: 'Classic CAFL cleanup sequence. 3 minutes each — 12 minutes total.',
  },
  {
    id: 'parasites-extended-6step', condition: 'Parasites — Extended 6-Step',
    aliases: ['6 step parasite', 'extended parasite'],
    category: 'Parasites', frequencies: [728, 784, 880, 465, 727, 800], dwell: 180,
    source: 'Vibrant research',
    notes: 'Expanded six-frequency sequence. 3 minutes each — 18 minutes total.',
  },

  // ============================== PARASITES (curated starter — verify) ==============================
  {
    id: 'parasites-roundworms', condition: 'Roundworms (general)',
    aliases: ['nematodes', 'roundworm'],
    category: 'Parasites', frequencies: [240, 650, 688, 750, 776, 2720], dwell: 180,
    source: 'CAFL (public reproductions)', verify: true,
    notes: 'General roundworm set as commonly reproduced.',
  },
  {
    id: 'parasites-ascaris', condition: 'Ascaris',
    aliases: ['ascaris lumbricoides', 'giant roundworm'],
    category: 'Parasites', frequencies: [152, 442, 751, 1146, 8146], dwell: 180,
    source: 'CAFL (public reproductions)', verify: true,
  },
  {
    id: 'parasites-pinworm', condition: 'Pinworm (Enterobiasis)',
    aliases: ['enterobius', 'threadworm'],
    category: 'Parasites', frequencies: [773, 826, 827, 835, 4152], dwell: 180,
    source: 'CAFL (public reproductions)', verify: true,
  },
  {
    id: 'parasites-hookworm', condition: 'Hookworm',
    aliases: ['ancylostoma', 'necator'],
    category: 'Parasites', frequencies: [440, 2008, 5868, 6436], dwell: 180,
    source: 'CAFL (public reproductions)', verify: true,
  },
  {
    id: 'parasites-tapeworm', condition: 'Tapeworm (Taenia)',
    aliases: ['taenia', 'cestode', 'tape worm'],
    category: 'Parasites', frequencies: [522, 562, 843, 1223, 3032, 5522], dwell: 180,
    source: 'CAFL (public reproductions)', verify: true,
  },
  {
    id: 'parasites-flukes-general', condition: 'Flukes (general)',
    aliases: ['fluke', 'trematode'],
    category: 'Parasites', frequencies: [435, 524, 651, 676, 763, 846, 854, 945], dwell: 180,
    source: 'CAFL (public reproductions)', verify: true,
  },
  {
    id: 'parasites-fluke-liver', condition: 'Liver Fluke (Fasciola hepatica)',
    aliases: ['fasciola', 'liver fluke'],
    category: 'Parasites', frequencies: [143, 275, 676, 763, 6641, 6672], dwell: 180,
    source: 'CAFL (public reproductions)', verify: true,
  },
  {
    id: 'parasites-fluke-blood', condition: 'Blood Fluke (Schistosoma)',
    aliases: ['schistosoma', 'bilharzia'],
    category: 'Parasites', frequencies: [329, 419, 635, 847, 867, 5516], dwell: 180,
    source: 'CAFL (public reproductions)', verify: true,
  },
  {
    id: 'parasites-giardia', condition: 'Giardia (Giardia lamblia)',
    aliases: ['giardiasis', 'beaver fever'],
    category: 'Parasites', frequencies: [334, 812, 829, 4334], dwell: 180,
    source: 'CAFL (public reproductions)', verify: true,
  },
  {
    id: 'parasites-blastocystis', condition: 'Blastocystis hominis',
    aliases: ['blasto'],
    category: 'Parasites', frequencies: [365, 595, 844, 848, 1201], dwell: 180,
    source: 'CAFL (public reproductions)', verify: true,
  },
  {
    id: 'parasites-entamoeba', condition: 'Entamoeba histolytica',
    aliases: ['amoeba', 'amebiasis'],
    category: 'Parasites', frequencies: [148, 166, 308, 393, 631, 778], dwell: 180,
    source: 'CAFL (public reproductions)', verify: true,
  },
  {
    id: 'parasites-trichinella', condition: 'Trichinosis (Trichinella)',
    aliases: ['trichinella spiralis'],
    category: 'Parasites', frequencies: [101, 541, 822, 1054, 1372], dwell: 180,
    source: 'CAFL (public reproductions)', verify: true,
  },
  {
    id: 'parasites-toxoplasma', condition: 'Toxoplasmosis',
    aliases: ['toxoplasma gondii'],
    category: 'Parasites', frequencies: [434, 852], dwell: 180,
    source: 'CAFL (public reproductions)', verify: true,
  },
  {
    id: 'parasites-strongyloides', condition: 'Strongyloides',
    aliases: ['threadworm strongyloides'],
    category: 'Parasites', frequencies: [332, 422, 721, 732, 749, 942, 3212], dwell: 180,
    source: 'CAFL (public reproductions)', verify: true,
  },
  {
    id: 'parasites-filariasis', condition: 'Filariasis',
    aliases: ['filaria'],
    category: 'Parasites', frequencies: [112, 120, 332, 753], dwell: 180,
    source: 'CAFL (public reproductions)', verify: true,
  },

  // ============================== MOLD & FUNGUS (Vibrant research, Aug 2026) ==============================
  {
    id: 'mold-general', condition: 'Mold — General',
    aliases: ['mold', 'mould'],
    category: 'Mold & Fungus',
    frequencies: [222, 242, 523, 565, 592, 623, 745, 933, 1130, 1155, 1333, 1833, 4442], dwell: 180,
    source: 'Vibrant research',
    notes: 'Cross-checked across multiple CAFL reproductions.',
  },
  {
    id: 'mold-fungus-general', condition: 'Mold & Fungus — General',
    aliases: ['fungus general', 'mold and fungus'],
    category: 'Mold & Fungus',
    frequencies: [728, 880, 784, 464, 886, 414, 254, 344, 2411, 321, 555, 942, 337, 766, 1823, 524, 374, 743, 132, 866], dwell: 180,
    source: 'Vibrant research',
    notes: 'Core starting cluster: 728 – 784 – 880 – 464 (overlaps the parasite core list).',
  },
  {
    id: 'mold-fungus-general-extended', condition: 'Mold & Fungus — General (extended 37-frequency set)',
    aliases: ['extended mold set'],
    category: 'Mold & Fungus',
    frequencies: [4442, 2411, 1833, 1823, 1333, 1155, 1130, 1016, 942, 933, 886, 880, 866, 784, 774, 766, 745, 743, 728, 623, 594, 592, 565, 555, 524, 512, 464, 414, 374, 344, 337, 321, 254, 242, 222, 158, 132], dwell: 180,
    source: 'Vibrant research',
    notes: 'The more extensive CAFL general mold/fungus sequence.',
  },
  {
    id: 'aspergillus-general', condition: 'Aspergillus — General',
    aliases: ['aspergillus', 'aspergillosis'],
    category: 'Mold & Fungus',
    frequencies: [1972, 1823, 758, 743, 697, 524, 374, 339, 247], dwell: 180,
    source: 'Vibrant research',
    notes: 'Organism-specific CAFL master set, independently reproduced in several CAFL copies.',
  },
  {
    id: 'aspergillus-flavus', condition: 'Aspergillus flavus',
    aliases: [], category: 'Mold & Fungus', frequencies: [1823, 247, 1972], dwell: 180,
    source: 'Vibrant research',
  },
  {
    id: 'aspergillus-glaucus', condition: 'Aspergillus glaucus',
    aliases: [], category: 'Mold & Fungus', frequencies: [524, 758], dwell: 180,
    source: 'Vibrant research',
  },
  {
    id: 'aspergillus-niger', condition: 'Aspergillus niger',
    aliases: ['black mold aspergillus'], category: 'Mold & Fungus', frequencies: [374, 697], dwell: 180,
    source: 'Vibrant research',
  },
  {
    id: 'aspergillus-terreus', condition: 'Aspergillus terreus',
    aliases: [], category: 'Mold & Fungus', frequencies: [743, 339], dwell: 180,
    source: 'Vibrant research',
  },
  {
    id: 'alternaria-tenuis', condition: 'Alternaria tenuis',
    aliases: ['alternaria'], category: 'Mold & Fungus', frequencies: [853, 304], dwell: 180,
    source: 'Vibrant research',
  },
  {
    id: 'penicillium-chrysogenum', condition: 'Penicillium chrysogenum',
    aliases: ['penicillium chyrosogenium'], category: 'Mold & Fungus',
    frequencies: [129, 249, 344, 967], dwell: 180,
    source: 'Vibrant research',
    notes: 'CAFL spelling sometimes "chyrosogenium".',
  },
  {
    id: 'penicillium-chrysogenum-secondary', condition: 'Penicillium chrysogenum — Secondary',
    aliases: [], category: 'Mold & Fungus',
    frequencies: [345, 688, 868, 1070, 2411, 728, 764, 765], dwell: 180,
    source: 'Vibrant research',
  },
  {
    id: 'penicillium-notatum', condition: 'Penicillium notatum',
    aliases: [], category: 'Mold & Fungus', frequencies: [334, 629], dwell: 180,
    source: 'Vibrant research',
  },
  {
    id: 'penicillium-notatum-secondary', condition: 'Penicillium notatum — Secondary',
    aliases: [], category: 'Mold & Fungus',
    frequencies: [321, 550, 555, 556, 558, 560, 562, 566, 572, 644, 825, 922, 942, 4870, 7780, 412, 715], dwell: 180,
    source: 'Vibrant research',
  },
  {
    id: 'penicillium-rubrum', condition: 'Penicillium rubrum',
    aliases: [], category: 'Mold & Fungus',
    frequencies: [332, 457, 460, 462, 766, 1015, 1018], dwell: 180,
    source: 'Vibrant research',
  },
  {
    id: 'mucor-mucedo', condition: 'Mucor mucedo',
    aliases: [], category: 'Mold & Fungus',
    frequencies: [612, 1000, 488, 766, 9788, 735], dwell: 180,
    source: 'Vibrant research',
  },
  {
    id: 'mucor-plumbeus', condition: 'Mucor plumbeus',
    aliases: [], category: 'Mold & Fungus',
    frequencies: [361, 578, 785, 877], dwell: 180,
    source: 'Vibrant research',
  },
  {
    id: 'mucor-racemosus', condition: 'Mucor racemosus',
    aliases: ['mucor racemosis'], category: 'Mold & Fungus',
    frequencies: [310, 474, 875], dwell: 180,
    source: 'Vibrant research',
    notes: 'Listed as "racemosis" in some CAFL copies.',
  },
  {
    id: 'mucor-racemosus-secondary', condition: 'Mucor racemosus — Secondary',
    aliases: [], category: 'Mold & Fungus',
    frequencies: [473, 686, 871, 873, 876, 878, 887, 7768, 7976, 8788, 713, 729, 731, 751, 760, 778, 1200], dwell: 180,
    source: 'Vibrant research',
  },
  {
    id: 'monotospora-languinosa', condition: 'Monotospora languinosa',
    aliases: [], category: 'Mold & Fungus', frequencies: [788], dwell: 180,
    source: 'Vibrant research',
  },
  {
    id: 'microsporum-audouinii', condition: 'Microsporum audouinii',
    aliases: [], category: 'Mold & Fungus', frequencies: [422, 831, 1222, 285], dwell: 180,
    source: 'Vibrant research',
  },
  {
    id: 'microsporum-canis', condition: 'Microsporum canis',
    aliases: ['ringworm cat dog'], category: 'Mold & Fungus',
    frequencies: [347, 970, 1644, 402, 650], dwell: 180,
    source: 'Vibrant research',
  },
  {
    id: 'stachybotrys-chartarum', condition: 'Stachybotrys chartarum',
    aliases: ['black mold', 'toxic black mold'],
    category: 'Mold & Fungus', frequencies: [], dwell: 180, noReliableListing: true,
    source: 'Vibrant research',
    notes: 'No sufficiently reliable CAFL entry found — deliberately left blank rather than assigning frequencies from poorly sourced lists. Nearest option: Mold & Fungus — General core cluster (728/784/880/464).',
  },
  {
    id: 'cladosporium', condition: 'Cladosporium',
    aliases: [], category: 'Mold & Fungus', frequencies: [], dwell: 180, noReliableListing: true,
    source: 'Vibrant research',
    notes: 'No sufficiently reliable CAFL entry found — deliberately left blank. Nearest option: Mold & Fungus — General core cluster (728/784/880/464).',
  },

  // ============================== FUNGAL / YEAST (curated starter — verify) ==============================
  {
    id: 'candida-albicans', condition: 'Candida albicans',
    aliases: ['candida', 'yeast overgrowth', 'thrush'],
    category: 'Mold & Fungus', frequencies: [464, 727, 787, 880, 886, 95, 125, 225, 240, 442, 465], dwell: 180,
    source: 'CAFL (public reproductions)', verify: true,
  },
  {
    id: 'tinea-pedis', condition: "Athlete's Foot (Tinea pedis)",
    aliases: ['athletes foot', 'tinea'],
    category: 'Mold & Fungus', frequencies: [20, 379, 727, 787, 880, 5000], dwell: 180,
    source: 'CAFL (public reproductions)', verify: true,
  },
  {
    id: 'ringworm-general', condition: 'Ringworm (general)',
    aliases: ['tinea corporis'],
    category: 'Mold & Fungus', frequencies: [442, 727, 766, 784, 787, 880], dwell: 180,
    source: 'CAFL (public reproductions)', verify: true,
  },

  // ============================== BACTERIA & SPIROCHETES (curated starter — verify) ==============================
  {
    id: 'strep-general', condition: 'Streptococcus (general)',
    aliases: ['strep'],
    category: 'Bacteria', frequencies: [20, 465, 727, 787, 880, 875, 885], dwell: 180,
    source: 'CAFL (public reproductions)', verify: true,
  },
  {
    id: 'staph-general', condition: 'Staphylococcus (general)',
    aliases: ['staph'],
    category: 'Bacteria', frequencies: [727, 786, 880, 998], dwell: 180,
    source: 'CAFL (public reproductions)', verify: true,
  },
  {
    id: 'ecoli', condition: 'E. coli',
    aliases: ['escherichia coli'],
    category: 'Bacteria', frequencies: [282, 333, 413, 957, 1320, 1722], dwell: 180,
    source: 'CAFL (public reproductions)', verify: true,
  },
  {
    id: 'h-pylori', condition: 'H. pylori',
    aliases: ['helicobacter pylori'],
    category: 'Bacteria', frequencies: [352, 676, 2167], dwell: 180,
    source: 'CAFL (public reproductions)', verify: true,
  },
  {
    id: 'lyme-borrelia', condition: 'Lyme (Borrelia)',
    aliases: ['lyme disease', 'borrelia burgdorferi'],
    category: 'Bacteria', frequencies: [432, 615, 625, 800, 884], dwell: 180,
    source: 'CAFL (public reproductions)', verify: true,
  },

  // ============================== VIRUSES (curated starter — verify) ==============================
  {
    id: 'ebv', condition: 'Epstein–Barr Virus (EBV)',
    aliases: ['epstein barr', 'mononucleosis', 'mono'],
    category: 'Viruses', frequencies: [105, 172, 253, 274, 380, 465, 660, 663, 669, 744, 825, 880], dwell: 180,
    source: 'CAFL (public reproductions)', verify: true,
  },
  {
    id: 'herpes-simplex-1', condition: 'Herpes Simplex I',
    aliases: ['hsv1', 'cold sores'],
    category: 'Viruses', frequencies: [322, 476, 589, 664, 785, 822], dwell: 180,
    source: 'CAFL (public reproductions)', verify: true,
  },
  {
    id: 'influenza-general', condition: 'Influenza (general)',
    aliases: ['flu', 'grippe'],
    category: 'Viruses', frequencies: [728, 787, 800, 880], dwell: 180,
    source: 'CAFL (public reproductions)', verify: true,
  },

  // ============================== GENERAL & WELLNESS ==============================
  {
    id: 'rife-classic-general', condition: 'Rife Classics — General Set',
    aliases: ['general set', 'classic rife', 'maintenance'],
    category: 'General & Support', frequencies: [20, 72, 95, 125, 440, 465, 727, 787, 802, 880, 1550, 5000, 10000], dwell: 180,
    source: 'CAFL (public reproductions)', verify: true,
    notes: 'The widely reproduced classic Rife general/maintenance sweep.',
  },
  {
    id: 'sinusitis', condition: 'Sinusitis',
    aliases: ['sinus', 'sinus infection'],
    category: 'General & Support', frequencies: [60, 120, 440, 727, 787, 880], dwell: 180,
    source: 'CAFL (public reproductions)', verify: true,
  },
  {
    id: 'solfeggio-set', condition: 'Solfeggio Scale (full set)',
    aliases: ['solfeggio', '528'],
    category: 'Wellness Tones', frequencies: [174, 285, 396, 417, 528, 639, 741, 852, 963], dwell: 180,
    source: 'Solfeggio (popular)',
    notes: 'Popular wellness tone scale — not a CAFL/Rife listing.',
  },
  {
    id: 'schumann-resonances', condition: 'Schumann Resonances',
    aliases: ['schumann', 'earth resonance', '7.83'],
    category: 'Wellness Tones', frequencies: [7.83, 14.3, 20.8, 27.3, 33.8], dwell: 180,
    source: 'Schumann (geophysics)',
    notes: 'Earth–ionosphere resonance modes. Frequencies below ~20 Hz are felt more than heard on normal speakers.',
  },
];
