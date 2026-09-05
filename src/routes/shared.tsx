import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Compass, Loader2 } from "lucide-react";
import { TripDashboard } from "@/components/TripDashboard";
import { decodeSharedPlan } from "@/lib/share-trip";
import type { TripPlan } from "@/lib/trip-planner";

export const Route = createFileRoute("/shared")({
  head: () => ({
    meta: [
      { title: "A shared trip plan | Explorion" },
      {
        name: "description",
        content:
          "View a travel itinerary shared with you: day-by-day plan, transport estimates, stay ideas and a per-person budget.",
      },
      { property: "og:title", content: "A shared trip plan | Explorion" },
      {
        property: "og:description",
        content: "Someone shared their Explorion itinerary with you — see the full day-by-day plan.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SharedTripPage,
});

function SharedTripPage() {
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("t");
    if (!token) {
      setState("error");
      return;
    }
    let active = true;
    void decodeSharedPlan(token).then((result) => {
      if (!active) return;
      if (result) {
        setPlan(result);
        setState("ready");
      } else {
        setState("error");
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
      <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
        <Link to="/" className="inline-flex items-center gap-2 text-primary">
          <Compass className="size-5" />
          <span className="font-display text-xl">Explorion</span>
        </Link>
        <Link
          to="/"
          className="brass-glow inline-flex items-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
        >
          Plan your own trip
        </Link>
      </header>

      {state === "loading" ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Opening the shared trip…
        </p>
      ) : state === "error" || !plan ? (
        <div className="panel-navy space-y-3 p-6">
          <h1 className="font-display text-2xl text-foreground">This trip link didn’t open</h1>
          <p className="text-sm text-muted-foreground">
            The link may be incomplete or was copied only partly. Ask for it again, or plan a fresh
            trip of your own.
          </p>
        </div>
      ) : (
        <>
          <h1 className="sr-only">
            Shared trip: {plan.days} days in {plan.destination}
          </h1>
          <p className="mb-6 text-xs uppercase tracking-[0.35em] text-primary">Shared with you</p>
          <TripDashboard
            plan={plan}
            marks={{}}
            onToggleMark={() => {}}
            selectedStay={0}
            onSelectStay={() => {}}
            shareable={false}
          />
        </>
      )}
    </main>
  );
}
