/**
 * Persistent traveller profile — accessibility needs and dietary preferences that
 * shouldn't be re-typed on every trip. Stored separately from saved trips.
 */

export const MOBILITY_OPTIONS = ["none", "limited-mobility", "wheelchair"] as const;
export type Mobility = (typeof MOBILITY_OPTIONS)[number];

export const SENSORY_OPTIONS = ["visual", "hearing", "cognitive", "sensory-sensitive"] as const;
export type Sensory = (typeof SENSORY_OPTIONS)[number];

export const DIET_OPTIONS = ["none", "vegetarian", "vegan", "jain", "halal", "kosher"] as const;
export type DietType = (typeof DIET_OPTIONS)[number];

export type AccessibilityProfile = {
  mobility: Mobility;
  sensory: string[];
  serviceAnimal: boolean;
  notes: string;
};

export type DietaryProfile = {
  type: DietType;
  allergies: string[];
  notes: string;
};

export const PET_TYPES = ["dog", "cat", "small-pet", "other"] as const;
export type PetType = (typeof PET_TYPES)[number];
export const PET_SIZES = ["small", "medium", "large"] as const;
export type PetSize = (typeof PET_SIZES)[number];

export type PetProfile = {
  traveling: boolean;
  type: PetType | null;
  size: PetSize | null;
  notes: string;
};

export type TravelerProfile = {
  startingPoint: string | null;
  accessibility: AccessibilityProfile | null;
  dietary: DietaryProfile | null;
  pet: PetProfile | null;
  updatedAt: string;
};

export const PROFILE_STORAGE_KEY = "explorion.traveler-profile";

export const MAX_NOTES = 300;
export const MAX_TAGS = 12;
export const MAX_TAG_LEN = 40;
export const MAX_ORIGIN_LEN = 80;

export const PET_TYPE_LABELS: Record<PetType, string> = {
  dog: "Dog",
  cat: "Cat",
  "small-pet": "Small pet (rabbit, bird…)",
  other: "Other",
};
export const PET_SIZE_LABELS: Record<PetSize, string> = {
  small: "Small (under 8 kg)",
  medium: "Medium (8–25 kg)",
  large: "Large (25 kg+)",
};

export const MOBILITY_LABELS: Record<Mobility, string> = {
  none: "No mobility needs",
  "limited-mobility": "Limited mobility",
  wheelchair: "Wheelchair user",
};

export const SENSORY_LABELS: Record<string, string> = {
  visual: "Visual",
  hearing: "Hearing",
  cognitive: "Cognitive",
  "sensory-sensitive": "Sensory-sensitive",
};

export const DIET_LABELS: Record<DietType, string> = {
  none: "No dietary preference",
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  jain: "Jain",
  halal: "Halal",
  kosher: "Kosher",
};

export const emptyAccessibility = (): AccessibilityProfile => ({
  mobility: "none",
  sensory: [],
  serviceAnimal: false,
  notes: "",
});

export const emptyDietary = (): DietaryProfile => ({ type: "none", allergies: [], notes: "" });

const cleanTag = (t: unknown): string | null => {
  if (typeof t !== "string") return null;
  const s = t.trim().replace(/\s+/g, " ").slice(0, MAX_TAG_LEN);
  return s ? s : null;
};

const cleanTags = (v: unknown, allowed?: readonly string[]): string[] => {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const raw of v) {
    const t = cleanTag(raw);
    if (!t) continue;
    const key = t.toLowerCase();
    if (allowed && !allowed.includes(key)) continue;
    if (out.some((x) => x.toLowerCase() === key)) continue;
    out.push(allowed ? key : t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
};

const cleanNotes = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, MAX_NOTES) : "");

/** True when the section carries no real information (treated as "not set"). */
export const isEmptyAccessibility = (a: AccessibilityProfile | null | undefined) =>
  !a || (a.mobility === "none" && a.sensory.length === 0 && !a.serviceAnimal && !a.notes.trim());

export const isEmptyDietary = (d: DietaryProfile | null | undefined) =>
  !d || (d.type === "none" && d.allergies.length === 0 && !d.notes.trim());

export const isEmptyProfile = (p: TravelerProfile | null | undefined) =>
  !p || (isEmptyAccessibility(p.accessibility) && isEmptyDietary(p.dietary));

/** Deep-sanitises any stored/handed value into a TravelerProfile, or null if unusable/empty. */
export function normalizeProfile(value: unknown): TravelerProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const p = value as Record<string, unknown>;

  let accessibility: AccessibilityProfile | null = null;
  if (p["accessibility"] && typeof p["accessibility"] === "object") {
    const a = p["accessibility"] as Record<string, unknown>;
    const mobility = (MOBILITY_OPTIONS as readonly string[]).includes(a["mobility"] as string)
      ? (a["mobility"] as Mobility)
      : "none";
    accessibility = {
      mobility,
      sensory: cleanTags(a["sensory"], SENSORY_OPTIONS),
      serviceAnimal: a["serviceAnimal"] === true,
      notes: cleanNotes(a["notes"]),
    };
    if (isEmptyAccessibility(accessibility)) accessibility = null;
  }

  let dietary: DietaryProfile | null = null;
  if (p["dietary"] && typeof p["dietary"] === "object") {
    const d = p["dietary"] as Record<string, unknown>;
    const type = (DIET_OPTIONS as readonly string[]).includes(d["type"] as string)
      ? (d["type"] as DietType)
      : "none";
    dietary = { type, allergies: cleanTags(d["allergies"]), notes: cleanNotes(d["notes"]) };
    if (isEmptyDietary(dietary)) dietary = null;
  }

  if (!accessibility && !dietary) return null;
  const updatedAt =
    typeof p["updatedAt"] === "string" && !Number.isNaN(Date.parse(p["updatedAt"]))
      ? p["updatedAt"]
      : new Date().toISOString();
  return { accessibility, dietary, updatedAt };
}

export function loadTravelerProfile(): TravelerProfile | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    return normalizeProfile(JSON.parse(raw));
  } catch (error) {
    console.error("[Explorion] traveller profile could not be read:", error);
    return null;
  }
}

/** Persists the profile. An empty profile removes the key instead (nothing worth keeping). */
export function saveTravelerProfile(profile: TravelerProfile): TravelerProfile | null {
  const clean = normalizeProfile({ ...profile, updatedAt: new Date().toISOString() });
  try {
    if (!clean) {
      window.localStorage.removeItem(PROFILE_STORAGE_KEY);
      return null;
    }
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(clean));
    return clean;
  } catch (error) {
    console.error("[Explorion] saving traveller profile failed:", error);
    return clean;
  }
}

export function clearTravelerProfile(): void {
  try {
    window.localStorage.removeItem(PROFILE_STORAGE_KEY);
  } catch (error) {
    console.error("[Explorion] clearing traveller profile failed:", error);
  }
}

/** Short human summary, e.g. "Vegetarian · Wheelchair accessible · No peanuts". */
export function summarizeProfile(p: TravelerProfile | null): string[] {
  if (!p) return [];
  const parts: string[] = [];
  if (p.dietary) {
    if (p.dietary.type !== "none") parts.push(DIET_LABELS[p.dietary.type]);
    if (p.dietary.allergies.length)
      parts.push(
        `No ${p.dietary.allergies.slice(0, 2).join(", ")}${p.dietary.allergies.length > 2 ? ` +${p.dietary.allergies.length - 2}` : ""}`,
      );
    else if (p.dietary.type === "none" && p.dietary.notes) parts.push("Food notes");
  }
  if (p.accessibility) {
    if (p.accessibility.mobility === "wheelchair") parts.push("Wheelchair accessible");
    else if (p.accessibility.mobility === "limited-mobility") parts.push("Limited mobility");
    if (p.accessibility.sensory.length)
      parts.push(
        p.accessibility.sensory.map((s) => SENSORY_LABELS[s] ?? s).join(" & ") + " support",
      );
    if (p.accessibility.serviceAnimal) parts.push("Service animal");
    if (
      p.accessibility.mobility === "none" &&
      !p.accessibility.sensory.length &&
      !p.accessibility.serviceAnimal &&
      p.accessibility.notes
    )
      parts.push("Accessibility notes");
  }
  return parts;
}

/** Wire shape sent to the AI (snake_case, structured — never string-concatenated into the prompt). */
export type TravelerProfileWire = {
  accessibility: { mobility: Mobility; sensory: string[]; service_animal: boolean; notes: string } | null;
  dietary: { type: DietType; allergies: string[]; notes: string } | null;
};

export function toProfileWire(p: TravelerProfile | null): TravelerProfileWire | null {
  if (!p || isEmptyProfile(p)) return null;
  return {
    accessibility: p.accessibility
      ? {
          mobility: p.accessibility.mobility,
          sensory: p.accessibility.sensory,
          service_animal: p.accessibility.serviceAnimal,
          notes: p.accessibility.notes,
        }
      : null,
    dietary: p.dietary
      ? { type: p.dietary.type, allergies: p.dietary.allergies, notes: p.dietary.notes }
      : null,
  };
}
