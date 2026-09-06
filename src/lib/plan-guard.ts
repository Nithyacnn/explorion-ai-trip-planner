import {
  ACCESSIBILITY_RISKS,
  INTENSITIES,
  MODE_LABELS,
  type AccessibilityRisk,
  type Intensity,
  type TripPlan,
  type TransportModeId,
  type VisaType,
} from "@/lib/trip-planner";

/**
 * Deep-sanitises any plan-like value (old saved trips, hand-crafted share tokens, AI drift)
 * into a TripPlan the dashboard can render without throwing. Returns null when the value
 * is not recognisably a trip plan at all.
 */

const MAX_DAYS = 31;
const MAX_STOPS = 12;
const MAX_STAYS = 6;
const MAX_STR = 600;

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v.slice(0, MAX_STR) : fallback;
const optStr = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.slice(0, MAX_STR) : undefined;
const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
};
const money = (v: unknown): number => Math.max(0, Math.round(num(v)));
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const MODE_IDS: TransportModeId[] = ["flight", "train", "bus", "own_vehicle"];
const VISA_TYPES: VisaType[] = ["not_required", "visa_on_arrival", "e_visa", "advance_visa"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isoDate = (v: unknown): string | null =>
  typeof v === "string" && ISO_DATE.test(v.trim()) ? v.trim() : null;

const tri = (v: unknown): boolean | "unconfirmed" | undefined =>
  v === true || v === false || v === "unconfirmed" ? v : undefined;
const accessFlags = (v: unknown) => {
  const f = obj(v);
  const wc = tri(f["wheelchairAccessible"]);
  const dm = tri(f["dietaryMatch"]);
  if (wc === undefined && dm === undefined) return undefined;
  return { wheelchairAccessible: wc ?? "unconfirmed", dietaryMatch: dm, note: optStr(f["note"]) };
};

const intensity = (v: unknown): Intensity | undefined =>
  INTENSITIES.includes(v as Intensity) ? (v as Intensity) : undefined;
const risks = (v: unknown): AccessibilityRisk[] | undefined => {
  const out = arr(v).filter((r): r is AccessibilityRisk =>
    (ACCESSIBILITY_RISKS as readonly string[]).includes(r as string),
  );
  return out.length ? [...new Set(out)] : undefined;
};

export function normalizePlan(value: unknown): TripPlan | null {
  const p = obj(value);
  const destination = str(p["destination"]).trim();
  if (!destination || !Array.isArray(p["itinerary"])) return null;

  const itinerary = arr(p["itinerary"])
    .slice(0, MAX_DAYS)
    .map((d, i) => {
      const day = obj(d);
      return {
        day: Math.max(1, Math.round(num(day["day"], i + 1))),
        title: str(day["title"]),
        slots: arr(day["slots"])
          .slice(0, 4)
          .map((s) => {
            const slot = obj(s);
            return {
              label: str(slot["label"], "Morning"),
              tag: str(slot["tag"]),
              overpacked: slot["overpacked"] === true,
              stops: arr(slot["stops"])
                .slice(0, MAX_STOPS)
                .map((x) => (typeof x === "string" ? { activity: x } : obj(x)))
                .filter((x) => typeof x["activity"] === "string" && (x["activity"] as string).trim())
                .map((x) => ({
                  activity: str(x["activity"]).trim(),
                  why: optStr(x["why"]),
                  travelTimeFromPrevious: optStr(x["travelTimeFromPrevious"]),
                  optional: x["optional"] === true,
                  accessibilityFlags: accessFlags(x["accessibilityFlags"]),
                  intensity: intensity(x["intensity"]),
                  accessibilityRisk: risks(x["accessibilityRisk"]),
                  petFriendly: tri(x["petFriendly"]),
                  replacedForSafety: optStr(x["replacedForSafety"]),
                })),
            };
          }),
      };
    })
    .sort((a, b) => a.day - b.day);

  const transportRaw = obj(p["transport"]);
  const modes = arr(transportRaw["modes"])
    .map((m) => obj(m))
    .filter((m) => MODE_IDS.includes(m["mode"] as TransportModeId))
    .slice(0, MODE_IDS.length)
    .map((m) => {
      const mode = m["mode"] as TransportModeId;
      const a = money(m["min"]);
      const b = money(m["max"]);
      return {
        mode,
        label: str(m["label"]) || MODE_LABELS[mode],
        min: Math.min(a, b),
        max: Math.max(a, b),
        duration: str(m["duration"]),
        notes: str(m["notes"]),
      };
    });

  const stayOptions = arr(p["stayOptions"])
    .map((s) => obj(s))
    .filter((s) => typeof s["name"] === "string" && (s["name"] as string).trim())
    .slice(0, MAX_STAYS)
    .map((s) => ({
      name: str(s["name"]).trim(),
      type: str(s["type"]),
      pricePerNight: money(s["pricePerNight"]),
      rating: Math.round(Math.min(5, Math.max(0, num(s["rating"]))) * 10) / 10,
      why: str(s["why"]),
    }));

  const budgetBreakdown = arr(p["budgetBreakdown"])
    .map((b) => obj(b))
    .filter((b) => typeof b["label"] === "string")
    .slice(0, 8)
    .map((b) => ({ label: str(b["label"]), amount: money(b["amount"]), pct: 0 }));
  const bbSum = budgetBreakdown.reduce((s, b) => s + b.amount, 0);
  for (const b of budgetBreakdown) b.pct = Math.round((b.amount / (bbSum || 1)) * 100);

  const visaRaw = p["visa"] ? obj(p["visa"]) : null;
  const visa =
    visaRaw && VISA_TYPES.includes(visaRaw["type"] as VisaType)
      ? (() => {
          const cost = obj(visaRaw["estimatedCost"]);
          const low = money(cost["low"]);
          const high = Math.max(low, money(cost["high"]));
          const type = visaRaw["type"] as VisaType;
          return {
            required: visaRaw["required"] === true || type !== "not_required",
            type,
            estimatedCost: { low, high, currency: str(cost["currency"]).trim() || "INR" },
            processingTime: str(visaRaw["processingTime"]) || "Varies",
            applyBy: str(visaRaw["applyBy"]) || "Not applicable",
            howToApply: str(visaRaw["howToApply"]),
            notes: str(visaRaw["notes"]),
          };
        })()
      : null;

  const datesRaw = p["travelDates"] ? obj(p["travelDates"]) : null;
  const startDate = datesRaw ? isoDate(datesRaw["startDate"]) : null;
  const endDate = datesRaw ? isoDate(datesRaw["endDate"]) : null;

  const travelerRaw = num(p["travelerCount"], NaN);
  const travelerCount =
    Number.isFinite(travelerRaw) && travelerRaw >= 1 ? Math.min(50, Math.round(travelerRaw)) : null;

  const origin = optStr(p["origin"])?.trim() ?? null;
  const international = p["international"] === true;
  const labels = p["agentLabels"] ? obj(p["agentLabels"]) : null;

  const plan: TripPlan = {
    destination,
    origin,
    needsOrigin: !origin,
    travelerCount,
    needsTravelerCount: !travelerCount,
    travelDates: startDate ? { startDate, endDate } : null,
    needsDates: !startDate,
    days: Math.min(MAX_DAYS, Math.max(1, Math.round(num(p["days"], itinerary.length || 1)))),
    budget: money(p["budget"]) || bbSum,
    month: str(p["month"]).trim() || "Anytime",
    transport: {
      modes,
      recommendedMode: str(transportRaw["recommendedMode"]),
      recommendedReason: str(transportRaw["recommendedReason"]),
      selectedMode: modes.some((m) => m.mode === transportRaw["selectedMode"])
        ? (transportRaw["selectedMode"] as string)
        : undefined,
    },
    itinerary,
    budgetBreakdown,
    stayOptions,
    tripPreference: optStr(p["tripPreference"]) ?? "",
    international,
    visa: international ? visa : null,
    visaUnavailable: international && !visa,
  };
  if (labels)
    plan.agentLabels = {
      transport: str(labels["transport"]),
      stay: str(labels["stay"]),
      itinerary: str(labels["itinerary"]),
      budget: str(labels["budget"]),
    };
  const style = optStr(p["style"]);
  if (style) plan.style = style;
  const vibe = optStr(p["vibe"]);
  if (vibe) plan.vibe = vibe;
  return plan;
}
