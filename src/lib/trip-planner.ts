export type AccessibilityFlags = {
  wheelchairAccessible: boolean | "unconfirmed";
  dietaryMatch?: boolean | "unconfirmed" | undefined;
  note?: string | undefined;
};

export type Intensity = "low" | "moderate" | "high";
export const INTENSITIES: Intensity[] = ["low", "moderate", "high"];

/** Controlled vocabulary the model must use for per-stop accessibility risks. */
export const ACCESSIBILITY_RISKS = [
  "uneven-terrain",
  "long-walking-distance",
  "climbing",
  "stairs",
  "water-based",
  "crowded",
  "loud",
  "low-light",
  "audio-only",
  "visual-only",
] as const;
export type AccessibilityRisk = (typeof ACCESSIBILITY_RISKS)[number];

export const RISK_LABELS: Record<AccessibilityRisk, string> = {
  "uneven-terrain": "Uneven terrain",
  "long-walking-distance": "Long walk",
  climbing: "Climbing",
  stairs: "Stairs",
  "water-based": "Water-based",
  crowded: "Crowded",
  loud: "Loud",
  "low-light": "Low light",
  "audio-only": "Audio-only",
  "visual-only": "Visual-only",
};

export type Stop = {
  activity: string;
  why?: string | undefined;
  travelTimeFromPrevious?: string | undefined;
  optional?: boolean | undefined;
  accessibilityFlags?: AccessibilityFlags | undefined;
  intensity?: Intensity | undefined;
  accessibilityRisk?: AccessibilityRisk[] | undefined;
  petFriendly?: boolean | "unconfirmed" | undefined;
  /** Set when the safety pass swapped out an unsafe activity; holds the original activity text. */
  replacedForSafety?: string | undefined;
};
export type Slot = {
  label: string;
  tag: string;
  stops: Stop[];
  overpacked?: boolean | undefined;
};
export type DayPlan = { day: number; title: string; slots: Slot[] };

export type TransportModeId = "flight" | "train" | "bus" | "own_vehicle";

export type TransportMode = {
  mode: TransportModeId;
  label: string;
  min: number;
  max: number;
  duration: string;
  notes: string;
};

export type Transport = {
  modes: TransportMode[];
  recommendedMode: string;
  recommendedReason: string;
  /** The mode the traveller picked; defaults to recommendedMode when absent. */
  selectedMode?: string | undefined;
};

export type Stay = {
  name: string;
  type: string;
  pricePerNight: number;
  rating: number;
  why: string;
};

export type AgentLabels = {
  transport: string;
  stay: string;
  itinerary: string;
  budget: string;
};

export type VisaType = "not_required" | "visa_on_arrival" | "e_visa" | "advance_visa";

export type VisaInfo = {
  required: boolean;
  type: VisaType;
  estimatedCost: { low: number; high: number; currency: string };
  processingTime: string;
  applyBy: string;
  howToApply: string;
  notes: string;
};

export type TravelDates = { startDate: string | null; endDate: string | null };

/** Property types the traveller can ask for before planning. */
export const STAY_TYPES = [
  "hotel",
  "apartment",
  "resort",
  "holiday_home",
  "villa",
  "hostel",
  "guest_house",
  "farm_stay",
  "bed_and_breakfast",
  "lodge",
  "homestay",
] as const;
export type StayType = (typeof STAY_TYPES)[number];
export const STAY_TYPE_LABELS: Record<StayType, string> = {
  hotel: "Hotels",
  apartment: "Apartments",
  resort: "Resorts",
  holiday_home: "Holiday homes",
  villa: "Villas",
  hostel: "Hostels",
  guest_house: "Guest houses",
  farm_stay: "Farm stays",
  bed_and_breakfast: "Bed and breakfasts",
  lodge: "Lodges",
  homestay: "Homestays",
};

export type TripPlan = {
  destination: string;
  origin: string | null;
  needsOrigin: boolean;
  travelerCount: number | null;
  needsTravelerCount: boolean;
  travelDates?: TravelDates | null;
  needsDates?: boolean;
  days: number;
  budget: number;
  month: string;
  transport: Transport;
  itinerary: DayPlan[];
  budgetBreakdown: { label: string; amount: number; pct: number }[];
  stayOptions: Stay[];
  agentLabels?: AgentLabels;
  style?: string;
  vibe?: string;
  tripPreference?: string;
  /** Property types the traveller asked for (empty = no preference). */
  stayTypes?: StayType[];
  international?: boolean;
  visa?: VisaInfo | null;
  visaUnavailable?: boolean;
  debugRaw?: string;
};

export const isValidTravelerCount = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 1;

export const VISA_STATUS: Record<VisaType, { label: string; tone: "ok" | "warn" | "alert" }> = {
  not_required: { label: "No Visa Required", tone: "ok" },
  visa_on_arrival: { label: "Visa on Arrival", tone: "warn" },
  e_visa: { label: "e-Visa Required", tone: "warn" },
  advance_visa: { label: "Visa Required", tone: "alert" },
};

export const MODE_LABELS: Record<TransportModeId, string> = {
  flight: "Flight (economy)",
  train: "Train (SL / 3A)",
  bus: "Bus (AC sleeper)",
  own_vehicle: "Own vehicle (fuel + tolls)",
};


type Dest = {
  name: string;
  keywords: string[];
  trainMin: number;
  trainMax: number;
  flightMin: number;
  flightMax: number;
  vibe: string;
  spots: string[][];
};

const DESTINATIONS: Dest[] = [
  {
    name: "Goa",
    keywords: ["goa", "panaji", "anjuna"],
    trainMin: 1500,
    trainMax: 3200,
    flightMin: 5500,
    flightMax: 9000,
    vibe: "Beaches & Portuguese cafés",
    spots: [
      ["Baga Beach sunrise walk", "Shack lunch at Calangute", "Sunset at Sinquerim Fort"],
      ["Fontainhas heritage walk", "Spice plantation tour", "Mandovi river cruise"],
      ["Palolem kayaking", "Butterfly Beach boat ride", "Beach shack seafood dinner"],
      ["Dudhsagar Falls trip", "Local flea market", "Live music at Vagator"],
      ["Divar Island cycling", "Old Goa churches", "Farewell sunset at Ashwem"],
    ],
  },
  {
    name: "Manali",
    keywords: ["manali", "himachal", "kasol", "solang"],
    trainMin: 1800,
    trainMax: 3600,
    flightMin: 7500,
    flightMax: 13000,
    vibe: "Snow peaks & pine valleys",
    spots: [
      ["Hadimba Temple visit", "Old Manali café hop", "Mall Road stroll"],
      ["Solang Valley ropeway", "Paragliding session", "Bonfire dinner"],
      ["Atal Tunnel & Sissu", "Snow point photo stop", "Riverside Himachali thali"],
      ["Jogini Falls trek", "Vashisht hot springs", "Stargazing by the Beas"],
      ["Naggar Castle", "Art gallery walk", "Slow evening at the homestay"],
    ],
  },
  {
    name: "Coorg",
    keywords: ["coorg", "madikeri", "kodagu"],
    trainMin: 1200,
    trainMax: 2600,
    flightMin: 5000,
    flightMax: 8500,
    vibe: "Coffee estates & misty hills",
    spots: [
      ["Raja's Seat sunrise", "Coffee plantation tour", "Madikeri market walk"],
      ["Abbey Falls", "Dubare Elephant Camp", "Estate-stay campfire"],
      ["Mandalpatti jeep ride", "Nagarhole safari", "Kodava cuisine dinner"],
      ["Talacauvery trek", "Golden Temple, Bylakuppe", "Local brew tasting"],
      ["Chelavara Falls", "Cycling through estates", "Farewell breakfast"],
    ],
  },
  {
    name: "Pondicherry",
    keywords: ["pondicherry", "puducherry", "pondy", "auroville"],
    trainMin: 900,
    trainMax: 2200,
    flightMin: 4800,
    flightMax: 8000,
    vibe: "French Quarter & quiet sea",
    spots: [
      ["Promenade Beach sunrise", "White Town café brunch", "Rock Beach evening"],
      ["Auroville & Matrimandir", "Paradise Beach boat", "Serenity Beach sunset"],
      ["Scuba at Temple Adventures", "Botanical garden", "French Quarter dinner"],
      ["Chunnambar backwaters", "Pottery workshop", "Live jazz night"],
      ["Bazaar shopping", "Ashram visit", "Last seaside walk"],
    ],
  },
  {
    name: "Jaipur",
    keywords: ["jaipur", "rajasthan", "udaipur", "jodhpur"],
    trainMin: 1100,
    trainMax: 2800,
    flightMin: 5200,
    flightMax: 9500,
    vibe: "Forts, bazaars & desert light",
    spots: [
      ["Amber Fort", "Panna Meena stepwell", "Nahargarh sunset"],
      ["City Palace & Jantar Mantar", "Johari Bazaar shopping", "Rooftop Rajasthani dinner"],
      ["Hawa Mahal photos", "Albert Hall Museum", "Chokhi Dhani folk night"],
      ["Galtaji Monkey Temple", "Block-printing workshop", "Café hopping in C-Scheme"],
      ["Jal Mahal stop", "Local sweets trail", "Farewell chai at Nahargarh"],
    ],
  },
  {
    name: "Rishikesh",
    keywords: ["rishikesh", "haridwar", "uttarakhand"],
    trainMin: 800,
    trainMax: 2400,
    flightMin: 5500,
    flightMax: 9500,
    vibe: "River rapids & riverside calm",
    spots: [
      ["Sunrise yoga session", "Laxman Jhula walk", "Triveni Ghat aarti"],
      ["White-water rafting", "Cliff jumping", "Café by the Ganga"],
      ["Neer Garh waterfall trek", "Beatles Ashram art", "Bonfire by the river"],
      ["Bungee jumping", "Ayurvedic massage", "Stargazing at camp"],
      ["Kunjapuri sunrise trek", "Local market", "Slow farewell breakfast"],
    ],
  },
];

const FALLBACK: Dest = {
  name: "Your Destination",
  keywords: [],
  trainMin: 1200,
  trainMax: 3000,
  flightMin: 5500,
  flightMax: 9500,
  vibe: "A trip tuned to your prompt",
  spots: [
    ["City orientation walk", "Local landmark tour", "Sunset viewpoint"],
    ["Museum or heritage site", "Street food trail", "Live music evening"],
    ["Day trip nearby", "Craft market", "Rooftop dinner"],
    ["Nature escape", "Café hopping", "Night walk"],
    ["Local breakfast", "Souvenir shopping", "Farewell dinner"],
  ],
};

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const NUM_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
};

const SLOT_META = [
  { label: "Morning", tag: "08:00 – 12:00" },
  { label: "Afternoon", tag: "12:00 – 17:00" },
  { label: "Evening", tag: "17:00 – late" },
];

function parseDays(text: string): number {
  const digit = text.match(/(\d+)\s*(?:days?|nights?|d\b)/i);
  if (digit?.[1]) return clamp(parseInt(digit[1], 10), 1, 7);
  const word = text.match(
    /\b(one|two|three|four|five|six|seven)\s*(?:days?|nights?)/i,
  );
  if (word?.[1]) return NUM_WORDS[word[1].toLowerCase()] ?? 3;
  if (/weekend/i.test(text)) return 2;
  return 3;
}

function parseBudget(text: string, days: number): number {
  const m = text
    .replace(/,/g, "")
    .match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(k|thousand|lakh|l\b)?/gi);
  if (m) {
    for (const raw of m) {
      const g = raw
        .replace(/,/g, "")
        .match(/(?:₹|rs\.?|inr)\s*(\d+(?:\.\d+)?)\s*(k|thousand|lakh|l\b)?/i);
      if (g?.[1]) return scale(parseFloat(g[1]), g[2]);
      const k = raw.match(/(\d+(?:\.\d+)?)\s*(k|thousand|lakh)/i);
      if (k?.[1]) return scale(parseFloat(k[1]), k[2]);
    }
  }
  return days * 7000;
}

function scale(n: number, unit?: string): number {
  if (!unit) return Math.round(n);
  const u = unit.toLowerCase();
  if (u === "k" || u === "thousand") return Math.round(n * 1000);
  return Math.round(n * 100000);
}

function parseMonth(text: string): string {
  const name = MONTHS.find((m) =>
    new RegExp(`\\b${m.slice(0, 3)}[a-z]*\\b`, "i").test(text),
  );
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : "Flexible dates";
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function planTrip(prompt: string): TripPlan {
  const text = prompt.trim() || "3 days in Goa under ₹20,000";
  const lower = text.toLowerCase();
  const dest =
    DESTINATIONS.find((d) => d.keywords.some((k) => lower.includes(k))) ?? FALLBACK;

  const days = parseDays(lower);
  const budget = parseBudget(lower, days);
  const month = parseMonth(lower);

  const seasonBump = /dec|jan|oct|nov/i.test(month) ? 1.18 : 1;

  const itinerary: DayPlan[] = Array.from({ length: days }, (_, i) => {
    const spots = dest.spots[i % dest.spots.length] ?? FALLBACK.spots[0]!;
    return {
      day: i + 1,
      title:
        i === 0
          ? "Arrival & first impressions"
          : i === days - 1
            ? "Slow morning & departure"
            : `Exploring ${dest.name}`,
      slots: SLOT_META.map((meta, j) => ({
        label: meta.label,
        tag: meta.tag,
        stops: [{ activity: spots[j] ?? "Free time to explore" }],
      })),
    };
  });

  const split = [
    { label: "Stay", pct: 0.34 },
    { label: "Transit", pct: 0.28 },
    { label: "Meals", pct: 0.22 },
    { label: "Activities", pct: 0.16 },
  ];

  const budgetBreakdown = split.map((s) => ({
    label: s.label,
    amount: Math.round((budget * s.pct) / 50) * 50,
    pct: Math.round(s.pct * 100),
  }));

  return {
    destination: dest.name,
    origin: null,
    needsOrigin: false,
    travelerCount: 1,
    needsTravelerCount: false,
    days,


    budget,
    month,
    transport: {
      modes: [
        {
          mode: "train" as const,
          label: MODE_LABELS.train,
          min: Math.round((dest.trainMin * seasonBump) / 50) * 50,
          max: Math.round((dest.trainMax * seasonBump) / 50) * 50,
          duration: "Overnight",
          notes: "Slower, easiest on budget",
        },
        {
          mode: "flight" as const,
          label: MODE_LABELS.flight,
          min: Math.round((dest.flightMin * seasonBump) / 50) * 50,
          max: Math.round((dest.flightMax * seasonBump) / 50) * 50,
          duration: "1–3 hrs",
          notes: "Fastest, book 3+ weeks ahead",
        },
      ],
      recommendedMode: "train",
      recommendedReason: "Cheapest option for this route on an offline estimate.",
    },
    itinerary,
    budgetBreakdown,
    stayOptions: [],
  };
}

export const formatINR = (n: number | null | undefined) =>
  "₹" + (typeof n === "number" && Number.isFinite(n) ? Math.round(n) : 0).toLocaleString("en-IN");

export const destinationVibe = (name: string) =>
  DESTINATIONS.find((d) => d.name === name)?.vibe ?? FALLBACK.vibe;
