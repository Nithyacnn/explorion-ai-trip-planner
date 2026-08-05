import { createServerFn } from "@tanstack/react-start";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
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
Return ONLY valid JSON matching the given schema. Numbers are plain integers in INR.

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
- style: romantic, solo, luxury, budget, family, adventure or balanced. vibe: a short 3-6 word description of the destination.`;

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

    let raw: z.infer<typeof planSchema>;
    try {
      const { output } = await generateText({
        model: gateway("google/gemini-3.6-flash"),
        system: SYSTEM,
        prompt: `${data.prompt}${originLine}`,
        output: Output.object({ schema: planSchema }),
      });
      raw = output;
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        throw new Error("The AI returned an unreadable plan. Please try again.");
      }
      const message = error instanceof Error ? error.message : "AI request failed";
      if (message.includes("429")) throw new Error("Too many requests — try again shortly.");
      if (message.includes("402")) throw new Error("AI credits exhausted for this workspace.");
      throw new Error(message);
    }

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
      style: raw.style,
      vibe: raw.vibe,
    };
  });
