import { createServerFn } from "@tanstack/react-start";
import type { TripPlan } from "@/lib/trip-planner";
import type { RefinePatch } from "@/lib/trip-ai.core";

export type { RefinePatch };

export const generateTripPlan = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as Record<string, unknown>)
  .handler(async ({ data }): Promise<TripPlan> => {
    const core = await import("@/lib/trip-ai.core");
    return core.runGenerateTripPlan(core.parseGenerateInput(data));
  });

export const refineTripPlan = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as Record<string, unknown>)
  .handler(async ({ data }): Promise<RefinePatch> => {
    const core = await import("@/lib/trip-ai.core");
    return core.runRefineTripPlan(core.parseRefineInput(data));
  });
