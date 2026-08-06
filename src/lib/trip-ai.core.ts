import { streamText } from "ai";
import { z } from "zod";
import { extractJson } from "@/lib/json-extract";
import { MODE_LABELS, type TripPlan, type TransportModeId } from "@/lib/trip-planner";

const Input = z.object({
  prompt: z.string(),
  origin: z.string().nullable().optional(),
  preference: z.string().nullable().optional(),
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

const planSchema = z.object({
  destination: z.string(),
  origin: z.string().nullable(),
  needs_origin: z.boolean(),
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

const JSON_SHAPE = `{"destination":string,"origin":string|null,"needs_origin":boolean,"trip_preference":string,"duration_days":number,"budget_total":number,"month":string,"style":string,"vibe":string,"transport":{"available_modes":[{"mode":"flight"|"train"|"bus"|"own_vehicle","low":number,"high":number,"duration":string,"notes":string}],"recommended_mode":string,"recommended_reason":string},"stay_options":[{"name":string,"type":string,"price_per_night":number,"rating":number,"why":string}],"itinerary":[{"day":number,"morning":${BLOCK_SHAPE},"afternoon":${BLOCK_SHAPE},"evening":${BLOCK_SHAPE}}],"budget_breakdown":{"stay":number,"transit":number,"meals":number,"activities":number},"agent_labels":{"transport":string,"stay":string,"itinerary":string,"budget_breakdown":string}}`;

const SYSTEM = `You are Explorion, a travel planning and budgeting expert (INR, India-first but able to plan international trips).

OUTPUT FORMAT (critical): respond with ONE raw JSON object and nothing else.
No markdown, no \`\`\`json code fences, no commentary before or after.
The first character must be "{" and the last "}". Numbers are plain integers in INR (no commas, no symbols, not strings) — except stay rating, which is a number 0-5 with at most one decimal.

JSON shape:
${JSON_SHAPE}

Rules:
- Parse destination, duration_days (default 3) and budget_total from the free-text prompt. If no budget is stated, estimate a realistic one.
- origin: if the prompt mentions a starting city ("from Chennai") use it. If no origin is stated and none is supplied, set "origin": null and "needs_origin": true. Never guess an origin.
- transport.available_modes: ONLY include modes that genuinely exist for this origin→destination pair. Include "train"/"bus"/"own_vehicle" only when a real rail/road route exists (same country or connected region) AND the road/rail journey is under roughly 15-18 hours. For overseas or otherwise air-only routes, return ONLY the flight mode. Never fabricate a bus or train for a route that has none.
- Each mode: low/high are realistic ROUND-TRIP per-person costs for that exact pair; "duration" is a human string like "12 hrs each way"; "notes" is one short practical line. For "own_vehicle", low/high estimate round-trip FUEL + TOLL cost for the route (not a ticket price).
- recommended_mode must be one of the modes you returned. recommended_reason must weigh the traveller's stated style/preference and budget against cost AND duration — a genuine trade-off sentence (e.g. "flight recommended: saves 14 hours for only ₹2,000 more on a comfort-first trip"), never just "cheapest".
- stay_options: exactly 3 realistic distinct properties that each fit within the stated budget, with name, type (hotel/homestay/resort/hostel), price_per_night, rating (0-5) and a one-line "why". Sort by rating descending.
- itinerary: exactly duration_days entries. Each day has three blocks (morning, afternoon, evening); each block is an object with "stops", "time_range" (e.g. "08:00 – 12:00") and "overpacked".

Activity density (important — there is NO fixed cap of 2 stops):
- Set target density from the traveller's pace / trip_preference: calm, relaxed or "less travel" → exactly 1 stop per block (fewer, longer, unhurried visits); unspecified → 1-2 stops; adventurous, packed or "see everything" → up to 3-4 stops per block, but ONLY where the destination genuinely supports it and real travel times allow.
- Every stop after the first in a block MUST have "travel_time_from_previous" as a human string ("12 min walk", "25 min drive"). The first stop of a block uses an empty string.
- Never add a stop just to fill space. Remote or rural destinations with long distances between sights stay sparse — 1 stop is a valid, good block.
- "why" is one short clause explaining the pick; "optional" is true only for a genuinely skippable extra.
- If the stops plus their travel times realistically exceed the block's time_range, set "overpacked": true on that block (otherwise false) instead of pretending it fits.
- budget_breakdown: stay + transit + meals + activities must sum to approximately budget_total, and the top-rated stay's price_per_night × duration_days should roughly match budget_breakdown.stay.
- agent_labels must be exactly: transport "Research Agent", stay "Property Verification Agent", itinerary "Itinerary Builder Agent", budget_breakdown "Budget Optimisation Agent".
- month: the travel month mentioned, else "Anytime". style: romantic, solo, luxury, budget, family, adventure or balanced. vibe: a short 3-6 word description.
- trip_preference: echo the traveller's free-text preference exactly (empty string if none).

Trip preference shaping (apply ALL signals present, combined):
- Unexplored / hidden / "not touristy": bias toward lesser-known spots and append a short " — why: ..." clause in at least one activity.
- Calm / relaxed / slow: fewer, lighter activities ("Free time / rest" where appropriate), no multi-location day trips, cluster everything in one area.
- Adventurous / active: prioritise outdoor and activity-based items.
- Food or stay preferences: meals and every stay option MUST match; never conflict with a stated preference.
- If trip_preference is empty, produce a balanced default plan.`;

const SLOT_TAGS = ["08:00 – 12:00", "12:00 – 17:00", "17:00 – late"];
const SLOT_LABELS = ["Morning", "Afternoon", "Evening"];

async function callAi(system: string, prompt: string, tag: string): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured yet.");
  const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
  const gateway = createLovableAiGatewayProvider(key);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
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
  return [d.morning, d.afternoon, d.evening].map((block, j) => ({
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
  }));
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

    const preference = data.preference?.trim() ?? "";
    const preferenceLine = preference
      ? `\nTrip preference (free text, shape the whole plan around it): ${preference}`
      : `\nThe traveller skipped the preference question — use a balanced default plan and return "trip_preference": "".`;

    const text = await callAi(
      SYSTEM,
      `${data.prompt}${originLine}${preferenceLine}\n\nReturn ONLY the raw JSON object described in the system message.`,
      "plan",
    );

    const parsed = planSchema.safeParse(extractJson(text));
    if (!parsed.success) {
      console.error("[Explorion] could not parse AI plan:", parsed.error.message, text);
      throw new Error("Something went wrong generating your trip — try again.");
    }
    const raw = parsed.data;

    const origin = data.origin?.trim() || raw.origin?.trim() || null;
    const days = Math.max(1, Math.round(raw.duration_days || raw.itinerary.length || 3));
    const itinerary = raw.itinerary
      .slice(0, days)
      .map((d, i) => toDay(d, i, days, raw.destination));

    return {
      destination: raw.destination,
      origin,
      needsOrigin: !origin,
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
{"changed":["transport"|"stay"|"budget"|"day:<n>"...],"summary":string,"transport"?:{"available_modes":[{"mode":"flight"|"train"|"bus"|"own_vehicle","low":number,"high":number,"duration":string,"notes":string}],"recommended_mode":string,"recommended_reason":string},"stay_options"?:[{"name":string,"type":string,"price_per_night":number,"rating":number,"why":string}],"itinerary_days"?:[{"day":number,"morning":string,"afternoon":string,"evening":string}],"budget_breakdown"?:{"stay":number,"transit":number,"meals":number,"activities":number}}

Rules:
- "changed" lists exactly the sections you actually rewrote; "summary" is a short human sentence like "Updated: Day 2 itinerary, stay options".
- itinerary_days contains ONLY the days you changed, each keeping its original "day" number.
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
