import { createServerFn } from "@tanstack/react-start";
import type { TripPlan } from "@/lib/trip-planner";
import type { RefinePatch } from "@/lib/trip-ai.core";

export type { RefinePatch };

// Shape checks happen in trip-ai.core (zod) which throws user-friendly messages; here we only
// make sure a non-object payload can't reach it and leak raw validator output.
const asRecord = (input: unknown): Record<string, unknown> => {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("That request wasn't understood — please try again.");
  return input as Record<string, unknown>;
};

export const generateTripPlan = createServerFn({ method: "POST" })
  .inputValidator(asRecord)
  .handler(async ({ data }): Promise<TripPlan> => {
    const core = await import("@/lib/trip-ai.core");
    return core.runGenerateTripPlan(core.parseGenerateInput(data));
  });

export const refineTripPlan = createServerFn({ method: "POST" })
  .inputValidator(asRecord)
  .handler(async ({ data }): Promise<RefinePatch> => {
    const core = await import("@/lib/trip-ai.core");
    return core.runRefineTripPlan(core.parseRefineInput(data));
  });
