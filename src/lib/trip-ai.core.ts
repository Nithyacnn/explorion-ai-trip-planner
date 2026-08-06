import { streamText } from "ai";
import { z } from "zod";
import { extractJson } from "@/lib/json-extract";
import { MODE_LABELS, type TripPlan, type TransportModeId } from "@/lib/trip-planner";

const Input = z.object({
  prompt: z.string(),
  origin: z.string().nullable().optional(),
  travelerCount: z.number().nullable().optional(),
  preference: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
});

const modeSchema = z.object({
  mode: z.enum(["flight", "train", "bus", "own_vehicle"]),
  low: z.number(),
  high: z.number(),
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
  stops: z.array(stopSchema),
  time_range: z.string().nullable().optional(),
  overpacked: z.boolean().nullable().optional(),
});

const daySchema = z.object({
  day: z.number(),
  early_morning: blockSchema.nullable().optional(),
  morning: blockSchema,
  afternoon: blockSchema,
  evening: blockSchema,
});

const stayOptionSchema = z.object({
  name: z.string(),
  type: z.string(),
  price_per_night: z.number(),
  rating: z.number(),
  why: z.string(),
});

const breakdownSchema = z.object({
  stay: z.number(),
  transit: z.number(),
  meals: z.number(),
  activities: z.number(),
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
  duration_days: z.number(),
  budget_total: z.number(),
  month: z.string(),
  style: z.string(),
  vibe: z.string(),
  transport: z.object({
    available_modes: z.array(modeSchema).min(1),
    recommended_mode: z.string(),
    recommended_reason: z.string(),
  }),
  stay_options: z.array(stayOptionSchema).min(1),
  itinerary: z.array(daySchema).min(1),
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

const JSON_SHAPE = `{"destination":string,"origin":string|null,"needs_origin":boolean,"traveler_count":number|null,"needs_traveler_count":boolean,"international":boolean,"visa":${VISA_SHAPE}|null,"trip_preference":string,"duration_days":number,"budget_total":number,"month":string,"style":string,"vibe":string,"transport":{"available_modes":[{"mode":"flight"|"train"|"bus"|"own_vehicle","low":number,"high":number,"duration":string,"notes":string}],"recommended_mode":string,"recommended_reason":string},"stay_options":[{"name":string,"type":string,"price_per_night":number,"rating":number,"why":string}],"itinerary":[{"day":number,"early_morning":${BLOCK_SHAPE},"morning":${BLOCK_SHAPE},"afternoon":${BLOCK_SHAPE},"evening":${BLOCK_SHAPE}}],"budget_breakdown":{"stay":number,"transit":number,"meals":number,"activities":number},"agent_labels":{"transport":string,"stay":string,"itinerary":string,"budget_breakdown":string}}`;

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

async function callAi(system: string, prompt: string, tag: string): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured yet.");
  const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
  const gateway = createLovableAiGatewayProvider(key);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const result = streamText({
      model: gateway("google/gemini-3.6-flash"),
      system,
      prompt,
      abortSignal: controller.signal,
    });
    return await result.text;
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI request failed";
    console.error(`[Explorion] ${tag} AI request failed:`, message);
    if (controller.signal.aborted)
      throw new Error("That took too long — please try again.");
    if (message.includes("429")) throw new Error("Too many requests — try again shortly.");
    if (message.includes("402")) throw new Error("AI credits exhausted for this workspace.");
    throw new Error("Something went wrong generating your trip — try again.");
  } finally {
    clearTimeout(timer);
  }
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
  return modes.map((m) => ({
    mode: m.mode as TransportModeId,
    label: MODE_LABELS[m.mode as TransportModeId] ?? m.mode,
    min: Math.round(m.low),
    max: Math.round(m.high),
    duration: m.duration,
    notes: m.notes,
  }));
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
      pricePerNight: Math.round(s.price_per_night),
      rating: Math.round(Math.min(5, Math.max(0, s.rating)) * 10) / 10,
      why: s.why,
    }))
    .sort((a, b) => b.rating - a.rating);
}

export type GenerateInput = z.infer<typeof Input>;
export const parseGenerateInput = (input: unknown): GenerateInput => Input.parse(input);

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

    const text = await callAi(
      SYSTEM,
      `${data.prompt}${originLine}${travelerLine}${preferenceLine}\nAny budget figure in the prompt is PER PERSON.\n\nReturn ONLY the raw JSON object described in the system message.`,
      "plan",
    );

    const parsed = planSchema.safeParse(extractJson(text));
    if (!parsed.success) {
      console.error("[Explorion] could not parse AI plan:", parsed.error.message, text);
      throw new Error("Something went wrong generating your trip — try again.");
    }
    const raw = parsed.data;

    const origin = data.origin?.trim() || raw.origin?.trim() || null;
    const suppliedCount =
      typeof data.travelerCount === "number" && data.travelerCount >= 1
        ? Math.round(data.travelerCount)
        : null;
    const rawCount =
      typeof raw.traveler_count === "number" && raw.traveler_count >= 1
        ? Math.round(raw.traveler_count)
        : null;
    const travelerCount = suppliedCount ?? rawCount;
    const international = origin ? raw.international === true : false;
    const visa = international ? toVisa(raw.visa) : null;
    const days = Math.max(1, Math.round(raw.duration_days || raw.itinerary.length || 3));
    const itinerary = raw.itinerary
      .slice(0, days)
      .map((d, i) => toDay(d, i, days, raw.destination));

    return {
      destination: raw.destination,
      origin,
      needsOrigin: !origin,
      travelerCount,
      needsTravelerCount: !travelerCount,
      international,
      visa,
      visaUnavailable: international && !visa,
      days,
      budget: Math.round(raw.budget_total || 0),
      month: raw.month || "Anytime",
      transport: {
        modes: toModes(raw.transport.available_modes),
        recommendedMode: raw.transport.recommended_mode,
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

const RefineInput = z.object({
  request: z.string(),
  scope: z.array(z.string()),
  plan: z.unknown(),
});

const refineSchema = z.object({
  changed: z.array(z.string()),
  summary: z.string(),
  transport: z
    .object({
      available_modes: z.array(modeSchema).min(1),
      recommended_mode: z.string(),
      recommended_reason: z.string(),
    })
    .nullable()
    .optional(),
  stay_options: z.array(stayOptionSchema).min(1).nullable().optional(),
  itinerary_days: z.array(daySchema).nullable().optional(),
  budget_breakdown: breakdownSchema.nullable().optional(),
});

const REFINE_SYSTEM = `You are Explorion's trip refinement agent.

You receive an existing trip plan JSON and a refinement request. You must change ONLY the sections in scope and return a PARTIAL JSON patch — omit every section that should stay unchanged. Never restate unchanged data.

OUTPUT FORMAT: one raw JSON object, no markdown, no code fences, no prose. First character "{", last "}". INR integers.

Shape:
{"changed":["transport"|"stay"|"budget"|"day:<n>"...],"summary":string,"transport"?:{"available_modes":[{"mode":"flight"|"train"|"bus"|"own_vehicle","low":number,"high":number,"duration":string,"notes":string}],"recommended_mode":string,"recommended_reason":string},"stay_options"?:[{"name":string,"type":string,"price_per_night":number,"rating":number,"why":string}],"itinerary_days"?:[{"day":number,"early_morning":BLOCK,"morning":BLOCK,"afternoon":BLOCK,"evening":BLOCK}] where BLOCK = {"stops":[{"activity":string,"why":string,"travel_time_from_previous":string,"optional":boolean}],"time_range":string,"overpacked":boolean},"budget_breakdown"?:{"stay":number,"transit":number,"meals":number,"activities":number}}

Rules:
- "changed" lists exactly the sections you actually rewrote; "summary" is a short human sentence like "Updated: Day 2 itinerary, stay options".
- itinerary_days contains ONLY the days you changed, each keeping its original "day" number.
- Each day has FOUR blocks: early_morning (06:00 – 09:00), morning (09:00 – 13:00), afternoon (13:00 – 17:00), evening (17:00 – 22:00). Every day must cover 06:00–22:00 with no empty block and no gap over ~3 hours, at every pace — pace only changes stop count; an empty block is invalid, fill it with a light default.
- Every day keeps a specific breakfast, lunch and dinner naming a real place plus the local dish/cuisine in "why"; dietary or cuisine preferences override the local-delicacy default. Meals are never dropped for calm days. If trip_preference names a theme, bias multiple blocks toward it.
- Block density follows the traveller's pace: calm → 1 stop per block, default → 1-2, adventurous/packed → up to 3-4 where realistic. Every stop after the first needs "travel_time_from_previous"; never pad a block with filler; set "overpacked": true when the stops plus travel realistically exceed time_range.
- Only include modes that genuinely exist for the route; air-only routes return only flight. own_vehicle costs are fuel + tolls.
- stay_options is always 3 options within budget, sorted by rating descending.
- Keep everything consistent with the untouched parts of the plan (same destination, duration, budget).
- If the request is unclear or out of scope, return {"changed":[],"summary":"Nothing changed — could you be more specific?"}.`;

export type RefinePatch = {
  changed: string[];
  summary: string;
  transport?: TripPlan["transport"];
  stayOptions?: TripPlan["stayOptions"];
  itineraryDays?: TripPlan["itinerary"];
  budgetBreakdown?: TripPlan["budgetBreakdown"];
};

export type RefineInputType = z.infer<typeof RefineInput>;
export const parseRefineInput = (input: unknown): RefineInputType => RefineInput.parse(input);

export async function runRefineTripPlan(data: RefineInputType): Promise<RefinePatch> {
    const scopeLine = data.scope.length
      ? `Sections explicitly marked for change: ${data.scope.join(", ")}. Change ONLY these.`
      : `No sections were explicitly marked — infer the narrowest scope from the request text and change nothing else.`;

    const text = await callAi(
      REFINE_SYSTEM,
      `Existing plan JSON:\n${JSON.stringify(data.plan)}\n\nRefinement request: ${data.request}\n${scopeLine}\n\nReturn ONLY the raw partial JSON patch.`,
      "refine",
    );

    const parsed = refineSchema.safeParse(extractJson(text));
    if (!parsed.success) {
      console.error("[Explorion] could not parse refinement:", parsed.error.message, text);
      throw new Error("Couldn't apply that change — try rephrasing.");
    }
    const raw = parsed.data;

    const patch: RefinePatch = {
      changed: raw.changed,
      summary: raw.summary,
    };
    if (raw.transport) {
      patch.transport = {
        modes: toModes(raw.transport.available_modes),
        recommendedMode: raw.transport.recommended_mode,
        recommendedReason: raw.transport.recommended_reason,
      };
    }
    if (raw.stay_options) patch.stayOptions = toStays(raw.stay_options);
    if (raw.itinerary_days) {
      patch.itineraryDays = raw.itinerary_days.map((d) => ({
        day: Math.round(d.day),
        title: "",
        slots: toSlots(d),
      }));
    }
    if (raw.budget_breakdown) {
      patch.budgetBreakdown = toBreakdown(raw.budget_breakdown, 0);
    }
  return patch;
}
