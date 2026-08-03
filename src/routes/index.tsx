import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Compass, ArrowRight, Sparkles, Loader2 } from "lucide-react";
import { generateTripPlan } from "@/lib/trip-ai.functions";
import { planTrip, destinationVibe, type TripPlan } from "@/lib/trip-planner";
import { TripDashboard } from "@/components/TripDashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Explorion — AI Travel Planner for Smarter Trips" },
      {
        name: "description",
        content:
          "Describe your trip in plain words and Explorion builds a day-by-day itinerary, train vs flight estimates and a full budget breakdown.",
      },
      { property: "og:title", content: "Explorion — AI Travel Planner" },
      {
        property: "og:description",
        content:
          "Type '3 days in Goa under ₹20,000' and get an instant itinerary, transport costs and budget split.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const CHIPS = [
  "3 days in Goa under ₹20,000 in October",
  "5 days in Coorg under ₹25,000",
  "Weekend in Pondicherry under ₹12,000",
  "4 days in Manali under ₹30,000 in December",
];

function Home() {
  const [prompt, setPrompt] = useState("");
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const askAi = useServerFn(generateTripPlan);

  const handlePlan = async () => {
    const text = prompt.trim();
    if (!text || loading) return;
    setLoading(true);
    setError(null);
    try {
      const aiPlan = await askAi({ data: { prompt: text } });
      setPlan(aiPlan);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not reach the AI — showing an estimate.",
      );
      setPlan(planTrip(text));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <span className="brass-glow flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Compass className="size-5" />
          </span>
          <div>
            <p className="font-display text-lg leading-tight text-foreground">Explorion</p>
            <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
              AI Travel Planner
            </p>
          </div>
        </div>
        <span className="hidden items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground sm:flex">
          <Sparkles className="size-3 text-primary" /> Plans in seconds
        </span>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24">
        <section className="py-10 sm:py-16">
          <h1 className="font-display max-w-2xl text-5xl leading-[1.05] text-foreground sm:text-6xl">
            Where do you want to go?
          </h1>
          <p className="mt-4 max-w-xl text-muted-foreground">
            Describe the trip in your own words. Explorion turns it into an itinerary,
            travel costs and a budget you can actually follow.
          </p>

          <div className="panel-navy mt-8 max-w-3xl p-5">
            <label htmlFor="trip" className="sr-only">
              Describe your trip
            </label>
            <textarea
              id="trip"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handlePlan();
              }}
              placeholder="Describe your trip (e.g., 3 days in Goa under ₹20,000 in October)"
              className="w-full resize-none bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">Tip: press ⌘/Ctrl + Enter</p>
              <button
                onClick={handlePlan}
                disabled={loading || !prompt.trim()}
                className="brass-glow inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? (
                  <>
                    Planning with AI <Loader2 className="size-4 animate-spin" />
                  </>
                ) : (
                  <>
                    Plan My Trip <ArrowRight className="size-4" />
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {CHIPS.map((chip) => (
              <button
                key={chip}
                onClick={() => setPrompt(chip)}
                className="rounded-full border border-border px-4 py-2 text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
              >
                {chip}
              </button>
            ))}
          </div>
        </section>

        {error ? (
          <p className="mb-4 rounded-xl border border-border px-4 py-3 text-xs text-muted-foreground">
            {error}
          </p>
        ) : null}

        {loading && !plan ? (
          <section className="panel-navy mt-6 flex items-center gap-3 p-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary" /> Explorion AI is designing
            your trip…
          </section>
        ) : plan ? (
          <section className="border-t border-border pt-12">
            <p className="mb-6 text-sm text-muted-foreground">
              {plan.vibe ?? destinationVibe(plan.destination)}
              {plan.style ? ` · ${plan.style} style` : ""}
            </p>
            <TripDashboard plan={plan} />
          </section>
        ) : (
          <section className="panel-navy mt-6 p-8 text-sm text-muted-foreground">
            Your transport estimates, day-by-day timeline and budget breakdown will appear
            here.
          </section>
        )}
      </main>
    </div>
  );
}
