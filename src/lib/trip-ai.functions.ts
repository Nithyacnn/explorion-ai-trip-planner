import { createServerFn } from "@tanstack/react-start";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import type { TripPlan } from "@/lib/trip-planner";

const Input = z.object({ prompt: z.string() });

const slotSchema = z.object({
  label: z.string(),
  tag: z.string(),
  activity: z.string(),
});

const planSchema = z.object({
  destination: z.string(),
  days: z.number(),
  budget: z.number(),
  month: z.string(),
  style: z.string(),
  vibe: z.string(),
  train: z.object({ label: z.string(), min: z.number(), max: z.number() }),
  flight: z.object({ label: z.string(), min: z.number(), max: z.number() }),
  itinerary: z.array(
    z.object({ day: z.number(), title: z.string(), slots: z.array(slotSchema) }),
  ),
  budgetBreakdown: z.array(z.object({ label: z.string(), amount: z.number() })),
});

const SYSTEM = `You are Explorion, an Indian travel budgeting expert.
Given a free-form trip description, return a realistic plan in INR.
Rules:
- Infer destination, number of days (default 3), total budget in INR (estimate a sensible one if not given) and travel month (default "Anytime").
- "style" is the travel style you detect: romantic, solo, luxury, budget, family, adventure or balanced. Tailor activities to it.
- "vibe" is a short 3-6 word description of the destination.
- train.label like "Train (SL/3A)", flight.label like "Flight (economy)". min/max are realistic ROUND-TRIP per-person rupee amounts from a major Indian metro.
- itinerary has exactly one entry per day; each day has exactly 3 slots with label "Morning", "Afternoon", "Evening", a 1-3 word tag, and a specific named activity at that destination.
- budgetBreakdown has exactly 4 entries labelled Stay, Transit, Meals, Activities whose amounts sum to the total budget.
Numbers must be plain integers.`;

export const generateTripPlan = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<TripPlan> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured yet.");

    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);

    let raw: z.infer<typeof planSchema>;
    try {
      const { output } = await generateText({
        model: gateway("google/gemini-3.6-flash"),
        system: SYSTEM,
        prompt: data.prompt,
        output: Output.object({ schema: planSchema }),
      });
      raw = output;
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        throw new Error("The AI could not plan that trip. Try rephrasing it.");
      }
      const message = error instanceof Error ? error.message : "AI request failed";
      if (message.includes("429")) throw new Error("Too many requests — try again shortly.");
      if (message.includes("402")) throw new Error("AI credits exhausted for this workspace.");
      throw new Error(message);
    }

    const days = Math.max(1, Math.round(raw.days || raw.itinerary.length || 3));
    const itinerary = raw.itinerary.slice(0, days).map((d, i) => ({
      day: i + 1,
      title: d.title,
      slots: d.slots.slice(0, 3),
    }));

    const items = raw.budgetBreakdown.filter((b) => Number.isFinite(b.amount));
    const total = items.reduce((s, b) => s + Math.max(0, b.amount), 0) || raw.budget || 1;

    return {
      destination: raw.destination,
      days,
      budget: Math.round(raw.budget || total),
      month: raw.month || "Anytime",
      transport: {
        train: { ...raw.train, min: Math.round(raw.train.min), max: Math.round(raw.train.max) },
        flight: {
          ...raw.flight,
          min: Math.round(raw.flight.min),
          max: Math.round(raw.flight.max),
        },
      },
      itinerary,
      budgetBreakdown: items.map((b) => ({
        label: b.label,
        amount: Math.round(b.amount),
        pct: Math.round((Math.max(0, b.amount) / total) * 100),
      })),
      style: raw.style,
      vibe: raw.vibe,
    };
  });
