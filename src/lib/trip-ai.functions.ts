import { createServerFn } from "@tanstack/react-start";
import { streamText } from "ai";
import { z } from "zod";
import { extractJson } from "@/lib/json-extract";
import type { TripPlan } from "@/lib/trip-planner";


const Input = z.object({
  prompt: z.string(),
  origin: z.string().nullable().optional(),
  preference: z.string().nullable().optional(),
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
    train: z.object({ low: z.number(), high: z.number() }),
    flight: z.object({ low: z.number(), high: z.number() }),
  }),
  stay: z.object({
    name: z.string(),
    type: z.string(),
    price_per_night: z.number(),
    why: z.string(),
  }),
  itinerary: z.array(
    z.object({
      day: z.number(),
      morning: z.string(),
      afternoon: z.string(),
      evening: z.string(),
    }),
  ),
  budget_breakdown: z.object({
    stay: z.number(),
    transit: z.number(),
    meals: z.number(),
    activities: z.number(),
  }),
  agent_labels: z.object({
    transport: z.string(),
    stay: z.string(),
    itinerary: z.string(),
    budget_breakdown: z.string(),
  }),
});

const SYSTEM = `You are Explorion, an Indian travel planning and budgeting expert.

OUTPUT FORMAT (critical): respond with ONE raw JSON object and nothing else.
No markdown, no \`\`\`json code fences, no commentary, no explanation before or after.
The very first character of your reply must be "{" and the very last must be "}".
Numbers are plain integers in INR (no commas, no currency symbols, not strings).

JSON shape:
{"destination":string,"origin":string|null,"needs_origin":boolean,"trip_preference":string,"duration_days":number,"budget_total":number,"month":string,"style":string,"vibe":string,"transport":{"train":{"low":number,"high":number},"flight":{"low":number,"high":number}},"stay":{"name":string,"type":string,"price_per_night":number,"why":string},"itinerary":[{"day":number,"morning":string,"afternoon":string,"evening":string}],"budget_breakdown":{"stay":number,"transit":number,"meals":number,"activities":number},"agent_labels":{"transport":string,"stay":string,"itinerary":string,"budget_breakdown":string}}


Rules:
- Parse destination, duration_days (default 3) and budget_total from the free-text prompt. If no budget is stated, estimate a realistic one.
- origin: if the prompt mentions a starting city ("from Chennai", "leaving from Pune") use it. If no origin is stated and none is supplied, set "origin": null and "needs_origin": true. Never guess an origin.
- transport train/flight low-high are realistic ROUND-TRIP per-person fares for the specific origin→destination pair. If origin is null, give a neutral national-average placeholder but still set needs_origin true.
- train label is like "Train (SL/3A)", flight like "Flight (economy)" — encoded in the style of the plan.
- stay: one specific realistic property with name, type (hotel/homestay/resort/hostel), price_per_night and a one-line "why".
- itinerary: exactly duration_days entries, each with a specific named morning, afternoon and evening activity at the destination, tailored to the detected travel style.
- budget_breakdown: stay + transit + meals + activities must sum to approximately budget_total, and stay.price_per_night × duration_days must roughly match budget_breakdown.stay.
- agent_labels must be exactly: transport "Research Agent", stay "Property Verification Agent", itinerary "Itinerary Builder Agent", budget_breakdown "Budget Optimisation Agent".
- month: the travel month mentioned, else "Anytime".
- style: romantic, solo, luxury, budget, family, adventure or balanced. vibe: a short 3-6 word description of the destination.
- trip_preference: echo back the traveller's free-text preference exactly as supplied (empty string if none was given).

Trip preference shaping (apply ALL signals present, combined):
- Unexplored / hidden / "not touristy": bias activities toward lesser-known spots instead of headline attractions, and in at least one activity string append a short " — why: ..." clause explaining why it fits that preference.
- Calm / relaxed / slow / less travel: fewer, lighter activities per day (repeat "Free time / rest" for a slot when appropriate), no multi-location day trips, and keep the stay and activities clustered in one area.
- Adventurous / adrenaline / active: prioritise outdoor and activity-based items over sightseeing-only ones.
- Food or stay preferences (vegetarian, gluten-free, boutique, beachfront, etc.): meal suggestions and the stay recommendation MUST match; never suggest anything conflicting with a stated preference.
- If trip_preference is empty, produce a balanced default plan.`;

const SLOT_TAGS = ["08:00 – 12:00", "12:00 – 17:00", "17:00 – late"];

export const generateTripPlan = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<TripPlan> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured yet.");

    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);

    const originLine = data.origin
      ? `\nThe traveller is departing from: ${data.origin}. Use it as the origin and set needs_origin to false.`
      : "";

    const preference = data.preference?.trim() ?? "";
    const preferenceLine = preference
      ? `\nTrip preference (free text from the traveller, shape the whole plan around it): ${preference}`
      : `\nThe traveller skipped the preference question — use a balanced default plan and return "trip_preference": "".`;

    let text = "";
    try {
      const result = streamText({
        model: gateway("google/gemini-3.6-flash"),
        system: SYSTEM,
        prompt: `${data.prompt}${originLine}${preferenceLine}\n\nReturn ONLY the raw JSON object described in the system message.`,
      });
      text = await result.text;
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI request failed";
      console.error("[Explorion] AI request failed:", message);
      if (message.includes("429")) throw new Error("Too many requests — try again shortly.");
      if (message.includes("402")) throw new Error("AI credits exhausted for this workspace.");
      throw new Error("Something went wrong generating your trip — try again.");
    }

    console.log("[Explorion] raw AI response:", text);

    const parsed = planSchema.safeParse(extractJson(text));
    if (!parsed.success) {
      console.error("[Explorion] could not parse AI plan:", parsed.error.message, text);
      throw new Error("Something went wrong generating your trip — try again.");
    }
    const raw = parsed.data;


    const origin = data.origin?.trim() || raw.origin?.trim() || null;
    const days = Math.max(1, Math.round(raw.duration_days || raw.itinerary.length || 3));

    const itinerary = raw.itinerary.slice(0, days).map((d, i) => ({
      day: i + 1,
      title:
        i === 0
          ? "Arrival & first impressions"
          : i === days - 1
            ? "Slow morning & departure"
            : `Exploring ${raw.destination}`,
      slots: [d.morning, d.afternoon, d.evening].map((activity, j) => ({
        label: ["Morning", "Afternoon", "Evening"][j] ?? "Morning",
        tag: SLOT_TAGS[j] ?? "",
        activity,
      })),
    }));

    const bb = raw.budget_breakdown;
    const items = [
      { label: "Stay", amount: Math.max(0, Math.round(bb.stay)) },
      { label: "Transit", amount: Math.max(0, Math.round(bb.transit)) },
      { label: "Meals", amount: Math.max(0, Math.round(bb.meals)) },
      { label: "Activities", amount: Math.max(0, Math.round(bb.activities)) },
    ];
    const total = items.reduce((s, b) => s + b.amount, 0) || raw.budget_total || 1;

    return {
      destination: raw.destination,
      origin,
      needsOrigin: !origin,
      days,
      budget: Math.round(raw.budget_total || total),
      month: raw.month || "Anytime",
      transport: {
        train: {
          label: "Train (SL / 3A)",
          min: Math.round(raw.transport.train.low),
          max: Math.round(raw.transport.train.high),
        },
        flight: {
          label: "Flight (economy)",
          min: Math.round(raw.transport.flight.low),
          max: Math.round(raw.transport.flight.high),
        },
      },
      itinerary,
      budgetBreakdown: items.map((b) => ({
        ...b,
        pct: Math.round((b.amount / total) * 100),
      })),
      stay: {
        name: raw.stay.name,
        type: raw.stay.type,
        pricePerNight: Math.round(raw.stay.price_per_night),
        why: raw.stay.why,
      },
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
  });
