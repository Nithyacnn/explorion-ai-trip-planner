import type { TripPlan } from "@/lib/trip-planner";

export type SavedTrip = {
  id: string;
  savedAt: string;
  plan: TripPlan;
  broken?: boolean;
};

const STORAGE_KEY = "explorion.saved-trips";
const LIMIT = 20;

function isPlanLike(value: unknown): value is TripPlan {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<TripPlan>;
  return typeof p.destination === "string" && Array.isArray(p.itinerary);
}

export function loadSavedTrips(): SavedTrip[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry, i) => {
      const e = entry as Partial<SavedTrip>;
      if (!isPlanLike(e?.plan)) {
        return {
          id: typeof e?.id === "string" ? e.id : `broken-${i}`,
          savedAt: typeof e?.savedAt === "string" ? e.savedAt : "",
          plan: { destination: "Unknown trip" } as TripPlan,
          broken: true,
        };
      }
      return {
        id: typeof e.id === "string" ? e.id : `trip-${i}`,
        savedAt: typeof e.savedAt === "string" ? e.savedAt : "",
        plan: e.plan,
      };
    });
  } catch (error) {
    console.error("[Explorion] saved trips could not be read:", error);
    return [];
  }
}

export function saveTrip(plan: TripPlan, existingId?: string): SavedTrip[] {
  const id = existingId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entry: SavedTrip = { id, savedAt: new Date().toISOString(), plan };
  try {
    const list = loadSavedTrips().filter((t) => t.id !== id && !t.broken);
    const next = [entry, ...list].slice(0, LIMIT);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch (error) {
    console.error("[Explorion] saving trip failed (storage full or unavailable):", error);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([entry]));
      return [entry];
    } catch {
      return loadSavedTrips();
    }
  }
}

export function removeSavedTrip(id: string): SavedTrip[] {
  try {
    const next = loadSavedTrips().filter((t) => t.id !== id);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.filter((t) => !t.broken)));
    return next.filter((t) => t.id !== id);
  } catch (error) {
    console.error("[Explorion] removing saved trip failed:", error);
    return loadSavedTrips();
  }
}
