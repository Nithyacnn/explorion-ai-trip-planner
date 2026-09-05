import { APICallError, streamText } from "ai";
import { z } from "zod";
import { extractJson } from "@/lib/json-extract";
import { MODE_LABELS, type TripPlan, type TransportModeId } from "@/lib/trip-planner";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 31;
const MAX_TRAVELERS = 50;
const isoDate = z.string().regex(ISO_DATE, "Expected YYYY-MM-DD");

// Bounded, so an abusive client can't ship megabytes into the model prompt.
const Input = z.object({
  prompt: z.string().trim().min(1).max(2000),
  origin: z.string().trim().max(80).nullable().optional(),
  travelerCount: z.number().finite().min(1).max(MAX_TRAVELERS).nullable().optional(),
  preference: z.string().trim().max(600).nullable().optional(),
  startDate: isoDate.nullable().optional(),
  endDate: isoDate.nullable().optional(),
  /** Client's local calendar date — the server clock may be in a different timezone. */
  today: isoDate.nullable().optional(),
});

const money = z.number().finite();

const modeSchema = z.object({
  mode: z.enum(["flight", "train", "bus", "own_vehicle"]),
  low: money,
  high: money,
  duration: z.string(),
  notes: z.string(),
});

const stopSchema = z.object({
  activity: z.string(),
  why: z.string().nullable().optional(),
  travel_time_from_previous: z.string().nullable().optional(),
  optional: z.boolean().nullable().optional(),
});

const blockSchema = z.object({
  stops: z.array(stopSchema).max(20),
  time_range: z.string().nullable().optional(),
  overpacked: z.boolean().nullable().optional(),
});

const daySchema = z.object({
  day: z.number().finite(),
  early_morning: blockSchema.nullable().optional(),
  morning: blockSchema,
  afternoon: blockSchema,
  evening: blockSchema,
});

const stayOptionSchema = z.object({
  name: z.string(),
  type: z.string(),
  price_per_night: money,
  rating: money,
  why: z.string(),
});

const breakdownSchema = z.object({
  stay: money,
  transit: money,
  meals: money,
  activities: money,
});

const visaSchema = z.object({
  required: z.boolean(),
  type: z.enum(["not_required", "visa_on_arrival", "e_visa", "advance_visa"]),
  estimated_cost: z.object({
    low: z.number(),
    high: z.number(),
    currency: z.string(),
  }),
  processing_time: z.string(),
  apply_by: z.string(),
  how_to_apply: z.string(),
  notes: z.string(),
});

const planSchema = z.object({
  destination: z.string(),
  origin: z.string().nullable(),
  needs_origin: z.boolean(),
  traveler_count: z.number().nullable(),
  needs_traveler_count: z.boolean(),
  travel_dates: z
    .object({
      start_date: z.string().nullable(),
      end_date: z.string().nullable(),
    })
    .nullable()
    .optional(),
  needs_dates: z.boolean().nullable().optional(),
  international: z.boolean().nullable().optional(),
  visa: visaSchema.nullable().optional(),
  trip_preference: z.string(),
  duration_days: z.number().finite(),
  budget_total: z.number().finite(),
  month: z.string(),
  style: z.string(),
  vibe: z.string(),
  transport: z.object({
    available_modes: z.array(modeSchema).min(1).max(8),
    recommended_mode: z.string(),
    recommended_reason: z.string(),
  }),
  stay_options: z.array(stayOptionSchema).min(1).max(6),
  itinerary: z.array(daySchema).min(1).max(MAX_DAYS + 5),
  budget_breakdown: breakdownSchema,
  agent_labels: z.object({
    transport: z.string(),
    stay: z.string(),
    itinerary: z.string(),
    budget_breakdown: z.string(),
  }),
});

const BLOCK_SHAPE = `{"stops":[{"activity":string,"why":string,"travel_time_from_previous":string,"optional":boolean}],"time_range":string,"overpacked":boolean}`;

const VISA_SHAPE = `{"required":boolean,"type":"not_required"|"visa_on_arrival"|"e_visa"|"advance_visa","estimated_cost":{"low":number,"high":number,"currency":string},"processing_time":string,"apply_by":string,"how_to_apply":string,"notes":string}`;

const JSON_SHAPE = `{"destination":string,"origin":string|null,"needs_origin":boolean,"traveler_count":number|null,"needs_traveler_count":boolean,"travel_dates":{"start_date":string|null,"end_date":string|null},"needs_dates":boolean,"international":boolean,"visa":${VISA_SHAPE}|null,"trip_preference":string,"duration_days":number,"budget_total":number,"month":string,"style":string,"vibe":string,"transport":{"available_modes":[{"mode":"flight"|"train"|"bus"|"own_vehicle","low":number,"high":number,"duration":string,"notes":string}],"recommended_mode":string,"recommended_reason":string},"stay_options":[{"name":string,"type":string,"price_per_night":number,"rating":number,"why":string}],"itinerary":[{"day":number,"early_morning":${BLOCK_SHAPE},"morning":${BLOCK_SHAPE},"afternoon":${BLOCK_SHAPE},"evening":${BLOCK_SHAPE}}],"budget_breakdown":{"stay":number,"transit":number,"meals":number,"activities":number},"agent_labels":{"transport":string,"stay":string,"itinerary":string,"budget_breakdown":string}}`;

const SYSTEM = `You are Explorion, a travel planning and budgeting expert (INR, India-first but able to plan international trips).

OUTPUT FORMAT (critical): respond with ONE raw JSON object and nothing else.
No markdown, no \`\`\`json code fences, no commentary before or after.
The first character must be "{" and the last "}". Numbers are plain integers in INR (no commas, no symbols, not strings) — except stay rating, which is a number 0-5 with at most one decimal.

JSON shape:
${JSON_SHAPE}

Rules:
- Parse destination, duration_days (default 3) and budget_total from the free-text prompt. If no budget is stated, estimate a realistic one.
- origin: if the prompt mentions a starting city ("from Chennai") use it. If no origin is stated and none is supplied, set "origin": null and "needs_origin": true. Never guess an origin.
- traveler_count: extract from the prompt when stated or clearly implied ("solo" = 1, "couple"/"me and my partner"/"for 2" = 2, "family of 4" = 4, "3 friends" = 3, "group of 6" = 6). If no count is stated or inferable and none is supplied, set "traveler_count": null and "needs_traveler_count": true. Never guess a count.
- travel_dates: resolve any date signal in the prompt to real calendar dates in ISO YYYY-MM-DD form, using TODAY'S DATE given in the user message ("15th to 17th August", "next weekend", "first week of October", "in 2 weeks" all resolve to actual dates; pick the next future occurrence). Set end_date consistent with duration_days when only a start is known. If no dates are stated or inferable and none are supplied, set both fields to null and "needs_dates": true — never guess dates. When dates are known set "needs_dates": false and derive "month" from start_date.
- Use the resolved dates for season awareness: mention weather/monsoon caveats, seasonal closures, peak/off-season pricing and festival crowding in the relevant stop "why" fields, notes and recommended_reason where it genuinely matters.
- visa.apply_by must be an explicit calendar date (and a short "X days before departure" clause) computed backwards from the actual start_date and the processing time — never a generic statement. If dates are unknown, say it depends on the confirmed departure date.
- PER-PERSON BUDGET (critical): budget_total, every budget_breakdown value, every stay price_per_night and every transport low/high are PER PERSON. Any budget the traveller states is a per-person figure. Costs shared across the group (stay rooms, private cabs, own_vehicle fuel/tolls) must be DIVIDED by traveler_count; individual costs (meals, activities, tickets, flights, train seats) stay as-is per person. Larger groups therefore show lower per-person stay costs.
- stay_options price_per_night is the per-person share of the nightly room cost for the given traveler_count (e.g. a ₹4,000 room shared by 2 travellers is 2000).
- international: true only when the origin city's country differs from the destination's country. When false (or origin unknown), set "visa": null and do not invent visa data.
- visa: for international trips only, fill every field for a traveller holding the origin country's passport. "required" is false only for genuine visa-free access. estimated_cost is a realistic per-traveller fee range with an explicit currency code. how_to_apply describes the correct official channel (portal type or embassy/consulate) — never invent a specific URL. notes is one short caveat line. If you genuinely cannot determine the requirement, still return the object with type "advance_visa", required true and notes explaining the uncertainty.
- transport.available_modes: ONLY include modes that genuinely exist for this origin→destination pair. Include "train"/"bus"/"own_vehicle" only when a real rail/road route exists (same country or connected region) AND the road/rail journey is under roughly 15-18 hours. For overseas or otherwise air-only routes, return ONLY the flight mode. Never fabricate a bus or train for a route that has none.
- Each mode: low/high are realistic ROUND-TRIP per-person costs for that exact pair; "duration" is a human string like "12 hrs each way"; "notes" is one short practical line. For "own_vehicle", low/high estimate round-trip FUEL + TOLL cost for the route (not a ticket price).
- recommended_mode must be one of the modes you returned. recommended_reason must weigh the traveller's stated style/preference and budget against cost AND duration — a genuine trade-off sentence (e.g. "flight recommended: saves 14 hours for only ₹2,000 more on a comfort-first trip"), never just "cheapest".
- stay_options: exactly 3 realistic distinct properties that each fit within the stated budget, with name, type (hotel/homestay/resort/hostel), price_per_night, rating (0-5) and a one-line "why". Sort by rating descending.
- itinerary: exactly duration_days entries. Each day has FOUR blocks: early_morning (06:00 – 09:00), morning (09:00 – 13:00), afternoon (13:00 – 17:00), evening (17:00 – 22:00). Each block is an object with "stops", "time_range" and "overpacked".

Full-day coverage (mandatory, all paces):
- EVERY day of EVERY trip must span roughly 06:00 to 22:00 with no empty block and no unplanned gap larger than ~3 hours inside that span. Pace changes ONLY the number of stops per block and how rushed it feels — never the total span. A calm day = fewer stops spread comfortably across the whole day; a packed day = more stops across the same whole day.
- A block with zero stops is invalid output. If nothing destination-appropriate exists for a block, fill it with a light default such as "Leisurely breakfast and coffee at the stay" or "Rest and unwind at the stay" — never leave it blank.
- Final day: only shorten the span if the prompt states or clearly implies a departure time ("evening train back", "flying out at 6pm"). Otherwise plan the full day including dinner.

Meals (mandatory, all paces):
- Every day must include a specific breakfast (early_morning or morning), lunch (afternoon or late morning) and dinner (evening) stop. Meals are never skipped, never omitted for calm days, and never generic.
- Each meal stop names an actual place plus cuisine style, e.g. "Breakfast at Vinayaka Mylari — Mysore-style masala dosa". The "why" field names the actual dish or regional speciality.
- Default to local delicacies and regional specialities tied to the destination, never generic "cafe"/"restaurant".
- A stated dietary or cuisine preference (vegetarian, no seafood, gluten-free, Jain, etc.) fully overrides the local-delicacy default; a partial constraint still prefers local specialities matching it over international options.
- Where the block has room, add one alternate pick for the meal as an extra stop marked "optional": true (e.g. "Alternate: ...").

Activity density (there is NO fixed cap of 2 stops):
- Set stops-per-block from the traveller's pace / trip_preference: calm, relaxed or "less travel" → 1 stop per block plus its meal; unspecified → 1-2; adventurous or "see everything" → up to 3-4 where the destination and real travel times genuinely allow. Meals always stay.
- Every stop after the first in a block MUST have "travel_time_from_previous" as a human string ("12 min walk", "25 min drive"). The first stop of a block uses an empty string.
- "why" is one short clause explaining the pick; "optional" is true only for a genuinely skippable extra or an alternate meal pick.
- If the stops plus their travel times realistically exceed the block's time_range, set "overpacked": true on that block (otherwise false).
- If trip_preference names a theme (cafe hunting, street food, nightlife, shopping, adventure), bias stops in MULTIPLE blocks across the day toward that theme, while still covering 06:00–22:00.
- budget_breakdown: all four values are per person and must sum to approximately budget_total (for international trips include any per-traveller visa fee inside "activities" only if it is not shown separately — prefer leaving visa fees out of the four buckets, the UI adds them), and the top-rated stay's price_per_night × duration_days should roughly match budget_breakdown.stay.
- agent_labels must be exactly: transport "Research Agent", stay "Property Verification Agent", itinerary "Itinerary Builder Agent", budget_breakdown "Budget Optimisation Agent".
- month: the travel month mentioned, else "Anytime". style: romantic, solo, luxury, budget, family, adventure or balanced. vibe: a short 3-6 word description.
- trip_preference: echo the traveller's free-text preference exactly (empty string if none).

Trip preference shaping (apply ALL signals present, combined):
- Unexplored / hidden / "not touristy": bias toward lesser-known spots and append a short " — why: ..." clause in at least one activity.
- Calm / relaxed / slow: fewer, lighter activities ("Free time / rest" where appropriate), no multi-location day trips, cluster everything in one area.
- Adventurous / active: prioritise outdoor and activity-based items.
- Food or stay preferences: meals and every stay option MUST match; never conflict with a stated preference.
- If trip_preference is empty, produce a balanced default plan.`;

const SLOT_TAGS = ["06:00 – 09:00", "09:00 – 13:00", "13:00 – 17:00", "17:00 – 22:00"];
const SLOT_LABELS = ["Early morning", "Morning", "Afternoon", "Evening"];
const SLOT_FILLERS = [
  "Leisurely breakfast and morning coffee at the stay",
  "Easy local stroll around the neighbourhood",
  "Free time / rest at the stay",
  "Relaxed dinner near the stay",
];

/** Pull the HTTP status out of an AI SDK error (APICallError) or a message that embeds it. */
function statusOf(error: unknown): number | undefined {
  if (APICallError.isInstance(error)) return error.statusCode;
  const message = error instanceof Error ? error.message : "";
  const m = message.match(/\b(400|401|402|403|429|5\d\d)\b/);
  return m ? Number(m[1]) : undefined;
}

function friendlyAiError(error: unknown, aborted: boolean, fallback: string): Error {
  if (aborted) return new Error("That took too long — please try again.");
  const status = statusOf(error);
  if (status === 402)
    return new Error(
      "AI credits are exhausted for this workspace — add credits in Lovable, then retry.",
    );
  if (status === 403) return new Error("AI access is blocked by workspace policy.");
  if (status === 429) return new Error("Too many requests — try again in a moment.");
  if (status === 401) return new Error("AI is not configured correctly (invalid API key).");
  if (status && status >= 500) return new Error("The AI service hiccuped — please retry.");
  return new Error(fallback);
}

async function callAi(
  system: string,
  prompt: string,
  tag: string,
  fallback = "Something went wrong generating your trip — try again.",
): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured yet.");
  const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
  const gateway = createLovableAiGatewayProvider(key);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  // streamText swallows transport errors (402/429/5xx) and `result.text` then rejects with
  // a generic "No output generated" — capture the real error via onError so the UI gets
  // the actual reason (e.g. out of credits) instead of a generic message.
  let streamError: unknown;
  try {
    const result = streamText({
      model: gateway("google/gemini-3.6-flash"),
      system,
      prompt,
      abortSignal: controller.signal,
      maxRetries: 0,
      onError: ({ error }) => {
        streamError = error;
      },
    });
    const text = await result.text;
    if (streamError) throw streamError;
    console.log(`[Explorion] ${tag} raw AI response (${text.length} chars):`, text.slice(0, 2000));
    return text;
  } catch (caught) {
    const error = streamError ?? caught;
    console.error(
      `[Explorion] ${tag} AI request failed (status ${statusOf(error) ?? "n/a"}):`,
      error instanceof Error ? error.message : error,
    );
    throw friendlyAiError(error, controller.signal.aborted, fallback);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse model text against a schema. If the first pass fails (fences, prose, wrong keys,
 * stringified numbers…) run ONE repair call that hands the model its own output plus the
 * validation errors and asks for corrected raw JSON.
 */
async function parseWithRepair<T extends z.ZodTypeAny>(
  schema: T,
  text: string,
  tag: string,
  normalise: (value: unknown) => unknown = (v) => v,
): Promise<z.infer<T>> {
  const first = schema.safeParse(normalise(extractJson(text)));
  if (first.success) return first.data;
  console.warn(`[Explorion] ${tag} JSON failed validation, attempting repair:`, first.error.message);

  const repaired = await callAi(
    `You repair JSON. You receive a model response that was supposed to be one raw JSON object plus the validation errors it produced. Return ONLY the corrected raw JSON object — no markdown, no code fences, no commentary. Keep all valid content, fix key names, types (numbers must be plain integers, not strings), remove trailing commas and any prose.`,
    `Validation errors:\n${first.error.message.slice(0, 3000)}\n\nOriginal response:\n${text.slice(0, 60_000)}`,
    `${tag}-repair`,
    "The AI returned an unreadable answer — please try again.",
  );
  const second = schema.safeParse(normalise(extractJson(repaired)));
  if (second.success) return second.data;
  console.error(`[Explorion] ${tag} JSON still invalid after repair:`, second.error.message.slice(0, 2000), repaired.slice(0, 2000));
  throw new Error("The AI returned an unreadable answer — please try again.");
}


function toSlots(d: z.infer<typeof daySchema>) {
  return [d.early_morning, d.morning, d.afternoon, d.evening].map((block, j) => ({
    label: SLOT_LABELS[j] ?? "Morning",
    tag: block?.time_range?.trim() || SLOT_TAGS[j] || "",
    overpacked: block?.overpacked === true,
    stops: (Array.isArray(block?.stops) ? block.stops : [])
      .filter((s) => s && typeof s.activity === "string" && s.activity.trim())
      .map((s, i) => ({
        activity: s.activity.trim(),
        why: s.why?.trim() || undefined,
        travelTimeFromPrevious:
          i > 0 ? s.travel_time_from_previous?.trim() || undefined : undefined,
        optional: s.optional === true,
      })),
  })).map((slot, j) =>
    slot.stops.length
      ? slot
      : {
          ...slot,
          stops: [
            {
              activity: SLOT_FILLERS[j] ?? "Free time at the stay",
              why: "Keeps the day covered without rushing",
              travelTimeFromPrevious: undefined,
              optional: false,
            },
          ],
        },
  );
}

function toDay(d: z.infer<typeof daySchema>, index: number, days: number, destination: string) {
  return {
    day: index + 1,
    title:
      index === 0
        ? "Arrival & first impressions"
        : index === days - 1
          ? "Slow morning & departure"
          : `Exploring ${destination}`,
    slots: toSlots(d),
  };
}

function toBreakdown(bb: z.infer<typeof breakdownSchema>, fallbackTotal: number) {
  const items = [
    { label: "Stay", amount: Math.max(0, Math.round(bb.stay)) },
    { label: "Transit", amount: Math.max(0, Math.round(bb.transit)) },
    { label: "Meals", amount: Math.max(0, Math.round(bb.meals)) },
    { label: "Activities", amount: Math.max(0, Math.round(bb.activities)) },
  ];
  const total = items.reduce((s, b) => s + b.amount, 0) || fallbackTotal || 1;
  return items.map((b) => ({ ...b, pct: Math.round((b.amount / total) * 100) }));
}

function toModes(modes: z.infer<typeof modeSchema>[]) {
  const seen = new Set<string>();
  return modes
    .filter((m) => (seen.has(m.mode) ? false : (seen.add(m.mode), true))) // one card per mode
    .map((m) => {
      const a = Math.max(0, Math.round(m.low));
      const b = Math.max(0, Math.round(m.high));
      return {
        mode: m.mode as TransportModeId,
        label: MODE_LABELS[m.mode as TransportModeId] ?? m.mode,
        min: Math.min(a, b),
        max: Math.max(a, b),
        duration: m.duration,
        notes: m.notes,
      };
    });
}

/** The model must recommend a mode it actually returned; otherwise fall back to the cheapest. */
function pickRecommended(modes: { mode: string; min: number }[], recommended: string) {
  const wanted = recommended.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (modes.some((m) => m.mode === wanted)) return wanted;
  return [...modes].sort((a, b) => a.min - b.min)[0]?.mode ?? recommended;
}

function toVisa(v: z.infer<typeof visaSchema> | null | undefined) {
  if (!v) return null;
  const low = Math.max(0, Math.round(v.estimated_cost?.low ?? 0));
  const high = Math.max(low, Math.round(v.estimated_cost?.high ?? low));
  return {
    required: v.required === true || v.type !== "not_required",
    type: v.type,
    estimatedCost: { low, high, currency: v.estimated_cost?.currency?.trim() || "INR" },
    processingTime: v.processing_time?.trim() || "Varies",
    applyBy: v.apply_by?.trim() || "Not applicable",
    howToApply: v.how_to_apply?.trim() || "",
    notes: v.notes?.trim() || "",
  };
}

function toStays(options: z.infer<typeof stayOptionSchema>[]) {
  return options
    .map((s) => ({
      name: s.name,
      type: s.type,
      pricePerNight: Math.max(0, Math.round(s.price_per_night)),
      rating: Math.round(Math.min(5, Math.max(0, s.rating)) * 10) / 10,
      why: s.why,
    }))
    .sort((a, b) => b.rating - a.rating);
}

/** Inclusive day count between two ISO dates, or null when either is missing/invalid. */
function daysBetween(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / 86_400_000) + 1;
}

const fillerDay = (): z.infer<typeof daySchema> => ({
  day: 0,
  morning: { stops: [] },
  afternoon: { stops: [] },
  evening: { stops: [] },
});

export type GenerateInput = z.infer<typeof Input>;
export const parseGenerateInput = (input: unknown): GenerateInput => {
  const parsed = Input.safeParse(input);
  if (parsed.success) return parsed.data;
  console.error("[Explorion] generate input rejected:", parsed.error.message);
  throw new Error("Please shorten your trip description or check the dates and traveller count.");
};

export async function runGenerateTripPlan(data: GenerateInput): Promise<TripPlan> {
    const originLine = data.origin
      ? `\nThe traveller is departing from: ${data.origin}. Use it as the origin and set needs_origin to false.`
      : "";

    const travelerLine =
      typeof data.travelerCount === "number" && data.travelerCount >= 1
        ? `\nNumber of travellers: ${Math.round(data.travelerCount)}. Use it as traveler_count and set needs_traveler_count to false.`
        : "";

    const preference = data.preference?.trim() ?? "";
    const preferenceLine = preference
      ? `\nTrip preference (free text, shape the whole plan around it): ${preference}`
      : `\nThe traveller skipped the preference question — use a balanced default plan and return "trip_preference": "".`;

    // Prefer the traveller's local calendar date; the server clock may sit in another timezone.
    const today = data.today?.trim() || new Date().toISOString().slice(0, 10);
    let startDate = data.startDate?.trim() || "";
    let endDate = data.endDate?.trim() || "";
    if (startDate && endDate && endDate < startDate) [startDate, endDate] = [endDate, startDate];
    if (!startDate) endDate = "";
    const suppliedSpan = daysBetween(startDate || null, endDate || null);
    const datesLine = startDate
      ? `\nConfirmed travel dates: start ${startDate}${
          endDate
            ? `, end ${endDate} (that is ${suppliedSpan} days — duration_days MUST equal ${suppliedSpan})`
            : " (derive the end date from duration_days)"
        }. Use them as travel_dates and set needs_dates to false.`
      : "";

    const text = await callAi(
      SYSTEM,
      `${data.prompt}${originLine}${travelerLine}${datesLine}${preferenceLine}\nTODAY'S DATE is ${today} — resolve every relative date against it.\nAny budget figure in the prompt is PER PERSON.\n\nReturn ONLY the raw JSON object described in the system message.`,
      "plan",
    );

    const raw = await parseWithRepair(planSchema, text, "plan");

    const origin = data.origin?.trim() || raw.origin?.trim() || null;
    const validCount = (v: unknown) =>
      typeof v === "number" && Number.isFinite(v) && v >= 1
        ? Math.min(MAX_TRAVELERS, Math.round(v))
        : null;
    const travelerCount = validCount(data.travelerCount) ?? validCount(raw.traveler_count);
    const isDate = (v: unknown): v is string =>
      typeof v === "string" && ISO_DATE.test(v.trim());
    let startDateOut = startDate || (isDate(raw.travel_dates?.start_date) ? raw.travel_dates!.start_date!.trim() : null);
    let endDateOut = endDate || (isDate(raw.travel_dates?.end_date) ? raw.travel_dates!.end_date!.trim() : null);
    if (startDateOut && endDateOut && endDateOut < startDateOut)
      [startDateOut, endDateOut] = [endDateOut, startDateOut];
    if (!startDateOut) endDateOut = null;

    const international = origin ? raw.international === true : false;
    const visa = international ? toVisa(raw.visa) : null;

    // Trip length: explicit user dates win, then the model's duration, then the itinerary length.
    const days = Math.min(
      MAX_DAYS,
      Math.max(1, suppliedSpan ?? Math.round(raw.duration_days || raw.itinerary.length || 3)),
    );
    // Keep the model's own day order, drop duplicates, pad short itineraries with light days.
    const seenDays = new Set<number>();
    const ordered = raw.itinerary
      .map((d, i) => ({ d, n: Number.isFinite(d.day) ? Math.round(d.day) : i + 1, i }))
      .sort((a, b) => a.n - b.n || a.i - b.i)
      .filter(({ n }) => (seenDays.has(n) ? false : (seenDays.add(n), true)))
      .map(({ d }) => d)
      .slice(0, days);
    while (ordered.length < days) ordered.push(fillerDay());
    const itinerary = ordered.map((d, i) => toDay(d, i, days, raw.destination));

    // Derive an end date from the start when the model didn't give one.
    if (startDateOut && !endDateOut) {
      const t = Date.parse(`${startDateOut}T00:00:00Z`);
      if (!Number.isNaN(t)) endDateOut = new Date(t + (days - 1) * 86_400_000).toISOString().slice(0, 10);
    }

    const modes = toModes(raw.transport.available_modes);

    return {
      destination: raw.destination.trim() || "Your destination",
      origin,
      needsOrigin: !origin,
      travelerCount,
      needsTravelerCount: !travelerCount,
      travelDates: startDateOut ? { startDate: startDateOut, endDate: endDateOut } : null,
      needsDates: !startDateOut,
      international,
      visa,
      visaUnavailable: international && !visa,
      days,
      budget: Math.max(0, Math.round(raw.budget_total || 0)),
      month: raw.month?.trim() || "Anytime",
      transport: {
        modes,
        recommendedMode: pickRecommended(modes, raw.transport.recommended_mode),
        recommendedReason: raw.transport.recommended_reason,
      },
      itinerary,
      budgetBreakdown: toBreakdown(raw.budget_breakdown, raw.budget_total),
      stayOptions: toStays(raw.stay_options),
      agentLabels: {
        transport: raw.agent_labels.transport,
        stay: raw.agent_labels.stay,
        itinerary: raw.agent_labels.itinerary,
        budget: raw.agent_labels.budget_breakdown,
      },
      tripPreference: preference || raw.trip_preference?.trim() || "",
      style: raw.style,
      vibe: raw.vibe,
      debugRaw: text,
    };
}

/* ---------------- Refinement ---------------- */

const num = z.coerce.number();

// The CURRENT plan as the client holds it. Validated leniently (older saved trips may be
// missing newer fields) so a stale payload still refines instead of failing on a type nit.
const optStr = z.string().nullable().optional();
const currentPlanSchema = z.object({
  destination: z.string(),
  origin: optStr,
  travelerCount: z.number().nullable().optional(),
  travelDates: z
    .object({ startDate: optStr, endDate: optStr })
    .nullable()
    .optional(),
  days: num,
  budget: num.default(0),
  month: optStr,
  style: optStr,
  tripPreference: optStr,
  international: z.boolean().nullable().optional(),
  transport: z
    .object({
      modes: z
        .array(
          z.object({
            mode: z.string(),
            min: num.default(0),
            max: num.default(0),
            duration: z.string().default(""),
            notes: z.string().default(""),
          }),
        )
        .default([]),
      recommendedMode: z.string().default(""),
      recommendedReason: z.string().default(""),
    })
    .default({ modes: [], recommendedMode: "", recommendedReason: "" }),
  itinerary: z.array(
    z.object({
      day: num,
      title: optStr,
      slots: z
        .array(
          z.object({
            label: z.string().default(""),
            tag: z.string().default(""),
            overpacked: z.boolean().nullable().optional(),
            stops: z
              .array(
                z.object({
                  activity: z.string(),
                  why: optStr,
                  travelTimeFromPrevious: optStr,
                  optional: z.boolean().nullable().optional(),
                }),
              )
              .default([]),
          }),
        )
        .default([]),
    }),
  ),
  budgetBreakdown: z
    .array(z.object({ label: z.string(), amount: num.default(0), pct: num.default(0) }))
    .default([]),
  stayOptions: z
    .array(
      z.object({
        name: z.string(),
        type: z.string().default(""),
        pricePerNight: num.default(0),
        rating: num.default(0),
        why: z.string().default(""),
      }),
    )
    .default([]),
});

const RefineInput = z.object({
  request: z.string().trim().min(1).max(2000),
  scope: z.array(z.string().max(40)).max(64).default([]),
  /** Individual activities the traveller marked for change (everything else in that day is locked). */
  stops: z
    .array(z.object({ day: z.number(), block: z.string().max(40), activity: z.string().max(600) }))
    .max(200)
    .default([]),
  plan: currentPlanSchema.superRefine((p, ctx) => {
    if (p.itinerary.length > MAX_DAYS)
      ctx.addIssue({ code: "custom", message: "Too many itinerary days" });
    if (p.itinerary.some((d) => d.slots.some((s) => s.stops.length > 40)))
      ctx.addIssue({ code: "custom", message: "Too many stops" });
  }),
});

export type RefineInputType = z.infer<typeof RefineInput>;
export const parseRefineInput = (input: unknown): RefineInputType => {
  const parsed = RefineInput.safeParse(input);
  if (parsed.success) return parsed.data;
  console.error("[Explorion] refine input rejected:", parsed.error.message);
  throw new Error(
    "This trip is in an older format and can't be refined — generate it again first.",
  );
};

/** Re-express the client's camelCase plan in the exact snake_case shape the model must emit. */
function toRefineContext(p: z.infer<typeof currentPlanSchema>) {
  const blockKeys = ["early_morning", "morning", "afternoon", "evening"] as const;
  const breakdown = Object.fromEntries(
    p.budgetBreakdown.map((b) => [b.label.toLowerCase(), b.amount]),
  ) as Record<string, number>;
  return {
    destination: p.destination,
    origin: p.origin ?? null,
    traveler_count: p.travelerCount ?? null,
    travel_dates: p.travelDates
      ? { start_date: p.travelDates.startDate, end_date: p.travelDates.endDate }
      : null,
    duration_days: p.days,
    budget_total_per_person: p.budget,
    month: p.month ?? "Anytime",
    style: p.style ?? "balanced",
    trip_preference: p.tripPreference ?? "",
    international: p.international === true,
    transport: {
      available_modes: p.transport.modes.map((m) => ({
        mode: m.mode,
        low: m.min,
        high: m.max,
        duration: m.duration,
        notes: m.notes,
      })),
      recommended_mode: p.transport.recommendedMode,
      recommended_reason: p.transport.recommendedReason,
    },
    stay_options: p.stayOptions.map((s) => ({
      name: s.name,
      type: s.type,
      price_per_night: s.pricePerNight,
      rating: s.rating,
      why: s.why,
    })),
    itinerary: p.itinerary.map((d) => {
      const day: Record<string, unknown> = { day: d.day };
      blockKeys.forEach((key, j) => {
        const slot = d.slots[j];
        day[key] = {
          time_range: slot?.tag ?? SLOT_TAGS[j],
          overpacked: slot?.overpacked === true,
          stops: (slot?.stops ?? []).map((s, i) => ({
            activity: s.activity,
            why: s.why ?? "",
            travel_time_from_previous: i > 0 ? (s.travelTimeFromPrevious ?? "") : "",
            optional: s.optional === true,
          })),
        };
      });
      return day;
    }),
    budget_breakdown: {
      stay: breakdown["stay"] ?? 0,
      transit: breakdown["transit"] ?? 0,
      meals: breakdown["meals"] ?? 0,
      activities: breakdown["activities"] ?? 0,
    },
  };
}

const refineStopSchema = z.object({
  activity: z.string(),
  why: z.string().nullable().optional(),
  travel_time_from_previous: z.string().nullable().optional(),
  optional: z.boolean().nullable().optional(),
});

const refineBlockSchema = z.object({
  stops: z.array(refineStopSchema).default([]),
  time_range: z.string().nullable().optional(),
  overpacked: z.boolean().nullable().optional(),
});

const refineDaySchema = z.object({
  day: num,
  early_morning: refineBlockSchema.nullable().optional(),
  morning: refineBlockSchema.nullable().optional(),
  afternoon: refineBlockSchema.nullable().optional(),
  evening: refineBlockSchema.nullable().optional(),
});

const refineSchema = z.object({
  changed: z.array(z.string()).default([]),
  summary: z.string().default(""),
  transport: z
    .object({
      available_modes: z.array(modeSchema).min(1),
      recommended_mode: z.string(),
      recommended_reason: z.string(),
    })
    .nullable()
    .optional(),
  stay_options: z.array(stayOptionSchema).min(1).nullable().optional(),
  itinerary_days: z.array(refineDaySchema).nullable().optional(),
  budget_breakdown: breakdownSchema.nullable().optional(),
  budget_total: num.nullable().optional(),
});

/** Accept the common ways a model drifts from the patch shape and map them back. */
function normaliseRefine(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const v = { ...(value as Record<string, unknown>) };
  if (v["itinerary_days"] == null && Array.isArray(v["itinerary"])) v["itinerary_days"] = v["itinerary"];
  if (v["stay_options"] == null && Array.isArray(v["stay"])) v["stay_options"] = v["stay"];
  if (v["stay_options"] == null && Array.isArray(v["stays"])) v["stay_options"] = v["stays"];
  if (v["budget_breakdown"] == null && v["budget"] && typeof v["budget"] === "object")
    v["budget_breakdown"] = v["budget"];
  if (Array.isArray(v["itinerary_days"])) {
    v["itinerary_days"] = (v["itinerary_days"] as unknown[]).map((d) => {
      if (!d || typeof d !== "object") return d;
      const day = { ...(d as Record<string, unknown>) };
      for (const k of ["early_morning", "morning", "afternoon", "evening"]) {
        const b = day[k];
        if (Array.isArray(b)) day[k] = { stops: b }; // block given as a bare stops array
        const block = day[k];
        if (block && typeof block === "object" && Array.isArray((block as { stops?: unknown }).stops)) {
          (block as { stops: unknown[] }).stops = (block as { stops: unknown[] }).stops.map((s) =>
            typeof s === "string" ? { activity: s } : s, // stop given as a bare string
          );
        }
      }
      return day;
    });
  }
  if (!Array.isArray(v["changed"])) v["changed"] = [];
  if (typeof v["summary"] !== "string") v["summary"] = "";
  // Drop null/empty sections so optional() passes instead of min(1) failing.
  for (const k of ["transport", "stay_options", "itinerary_days", "budget_breakdown"]) {
    const s = v[k];
    if (s == null || (Array.isArray(s) && s.length === 0)) delete v[k];
  }
  return v;
}

const REFINE_SYSTEM = `You are Explorion's trip refinement agent. You EDIT an existing trip plan; you never start over.

INPUT: the traveller's CURRENT plan as JSON (this is the latest version, already including any earlier edits — treat it as the single source of truth) plus a change request.
OUTPUT: ONE raw JSON PATCH object. No markdown, no \`\`\` fences, no prose before or after. First character "{", last "}". All money values are per-person INR integers (no strings, commas or symbols).

Patch shape (include ONLY the keys you changed; omit the rest entirely):
{"changed":["transport"|"stay"|"budget"|"day:<n>", ...],
 "summary":string,
 "transport"?:{"available_modes":[{"mode":"flight"|"train"|"bus"|"own_vehicle","low":number,"high":number,"duration":string,"notes":string}],"recommended_mode":string,"recommended_reason":string},
 "stay_options"?:[{"name":string,"type":string,"price_per_night":number,"rating":number,"why":string}],
 "itinerary_days"?:[{"day":number,"early_morning":BLOCK,"morning":BLOCK,"afternoon":BLOCK,"evening":BLOCK}],
 "budget_breakdown"?:{"stay":number,"transit":number,"meals":number,"activities":number},
 "budget_total"?:number}
BLOCK = {"stops":[{"activity":string,"why":string,"travel_time_from_previous":string,"optional":boolean}],"time_range":string,"overpacked":boolean}

Editing operations — perform exactly what is asked and nothing more:
- MODIFY: change specific stops/blocks/days in place. Return each touched day IN FULL (all four blocks) with its original "day" number, keeping every untouched stop in that day word-for-word.
- INSERT: add a stop into the correct block of the named day, adjust travel_time_from_previous for the following stop, return that full day.
- DELETE: remove the named stop/activity; if the block would become empty, fill it with a light default (never empty). Return that full day.
- REARRANGE / SWAP / MOVE: when activities move between days or days swap order, return EVERY affected day in full, each with its ORIGINAL position number in "day" (day numbers are positions 1..duration_days and never change).
- REPLACE ("make day 2 calmer", "a food-focused day 3"): rebuild only that day at the requested pace/theme.
- STAY / TRANSPORT / BUDGET: return the full replacement section (always 3 stays sorted by rating desc; only real modes for the route). A cheaper/pricier stay or transport change must also return an updated "budget_breakdown" (and "budget_total" if the total changes) so the numbers stay consistent.
- Days not mentioned, and sections not in scope, must NOT appear in the patch. Never return the whole itinerary for a one-day change.

Quality rules for any day you return:
- Four blocks: early_morning 06:00 – 09:00, morning 09:00 – 13:00, afternoon 13:00 – 17:00, evening 17:00 – 22:00. Full 06:00–22:00 coverage, no empty block, no gap over ~3 hours.
- Keep a specific breakfast, lunch and dinner naming a real place plus the local dish in "why"; stated dietary/cuisine preferences override the local default.
- Density follows the traveller's pace: calm → 1 stop per block, default → 1-2, adventurous → up to 3-4 where realistic. Every stop after the first needs "travel_time_from_previous" ("12 min walk"); the first uses "". Set "overpacked": true only when stops plus travel exceed time_range.
- Stay consistent with the rest of the plan: same destination, origin, dates, traveler count, per-person budget, style and trip_preference.

Meta fields:
- "changed": exactly the sections you returned, using "day:<n>" for days.
- "summary": one short human sentence, e.g. "Swapped Day 1 and Day 2 activities" or "Updated: Day 2 itinerary, stay options".
- If the request is empty, unclear, or asks for something outside this plan, return {"changed":[],"summary":"<one short question asking what to change>"}.`;

export type RefinePatch = {
  changed: string[];
  summary: string;
  transport?: TripPlan["transport"];
  stayOptions?: TripPlan["stayOptions"];
  itineraryDays?: TripPlan["itinerary"];
  budgetBreakdown?: TripPlan["budgetBreakdown"];
  budgetTotal?: number;
};

export async function runRefineTripPlan(data: RefineInputType): Promise<RefinePatch> {
  const stopScope = data.stops.length
    ? `\nACTIVITY-LEVEL SCOPE — the traveller marked ONLY these specific activities for change:\n${data.stops
        .map((s) => `- Day ${s.day}, ${s.block}: "${s.activity}"`)
        .join("\n")}\nFor each of those days: replace/adjust ONLY the listed activities (respecting the change request), keep EVERY other stop in that day word-for-word in its original block and order, then return the full day. Do not touch any day not listed here unless it is also in the section scope.`
    : "";
  const scopeLine =
    (data.scope.length
      ? `Sections explicitly marked for change by the traveller: ${data.scope.join(", ")} ("day:<n>" = itinerary day n, "stay" = stay_options, "budget" = budget_breakdown). Change ONLY these (plus budget_breakdown if costs moved) and return each of them in the patch.`
      : `No sections were explicitly marked — infer the narrowest scope from the request text and change nothing else.`) +
    stopScope;

  const context = toRefineContext(data.plan);
  const text = await callAi(
    REFINE_SYSTEM,
    `CURRENT PLAN (latest version, source of truth):\n${JSON.stringify(context)}\n\nTRAVELLER'S CHANGE REQUEST: ${data.request}\n${scopeLine}\n\nReturn ONLY the raw JSON patch object.`,
    "refine",
    "Couldn't apply that change — try rephrasing.",
  );

  const raw = await parseWithRepair(refineSchema, text, "refine", normaliseRefine);

  const patch: RefinePatch = { changed: [...raw.changed], summary: raw.summary };
  const ensureChanged = (key: string) => {
    if (!patch.changed.includes(key)) patch.changed.push(key);
  };

  if (raw.transport) {
    const modes = toModes(raw.transport.available_modes);
    patch.transport = {
      modes,
      recommendedMode: pickRecommended(modes, raw.transport.recommended_mode),
      recommendedReason: raw.transport.recommended_reason,
    };
    ensureChanged("transport");
  }
  if (raw.stay_options) {
    patch.stayOptions = toStays(raw.stay_options);
    ensureChanged("stay");
  }
  if (raw.itinerary_days?.length) {
    const totalDays = data.plan.days;
    const days = raw.itinerary_days.map((d, i) => {
      // Fall back to positional numbering if the model returned a full itinerary with bad numbers.
      const n = Math.round(d.day);
      const dayNo =
        n >= 1 && n <= totalDays
          ? n
          : raw.itinerary_days!.length === totalDays
            ? i + 1
            : n;
      const existing = data.plan.itinerary.find((x) => x.day === dayNo);
      return {
        day: dayNo,
        title: existing?.title ?? "",
        slots: toSlots({
          day: dayNo,
          early_morning: d.early_morning ?? undefined,
          morning: d.morning ?? { stops: [] },
          afternoon: d.afternoon ?? { stops: [] },
          evening: d.evening ?? { stops: [] },
        }),
      };
    });
    // Out-of-range days are dropped; duplicate day numbers keep the last version the model sent.
    const byDay = new Map<number, (typeof days)[number]>();
    for (const d of days) if (d.day >= 1 && d.day <= totalDays) byDay.set(d.day, d);
    patch.itineraryDays = [...byDay.values()].sort((a, b) => a.day - b.day);
    for (const d of patch.itineraryDays) ensureChanged(`day:${d.day}`);
  }
  if (typeof raw.budget_total === "number" && raw.budget_total > 0) {
    patch.budgetTotal = Math.round(raw.budget_total);
    ensureChanged("budget");
  }
  if (raw.budget_breakdown) {
    patch.budgetBreakdown = toBreakdown(
      raw.budget_breakdown,
      patch.budgetTotal ?? data.plan.budget,
    );
    ensureChanged("budget");
  }
  // "changed" claimed sections that never arrived → treat as no-op so the UI can say so.
  const delivered = new Set<string>([
    ...(patch.transport ? ["transport"] : []),
    ...(patch.stayOptions ? ["stay"] : []),
    ...(patch.budgetBreakdown || patch.budgetTotal ? ["budget"] : []),
    ...(patch.itineraryDays ?? []).map((d) => `day:${d.day}`),
  ]);
  patch.changed = patch.changed.filter((c) => delivered.has(c));
  if (!patch.changed.length) {
    patch.summary =
      patch.summary ||
      (data.scope.length
        ? `Couldn't work out how to change ${data.scope.join(", ")} — describe the change in a bit more detail.`
        : "Nothing changed — could you be more specific about what to adjust?");
  }
  return patch;
}
