import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Compass,
  ArrowRight,
  Sparkles,
  Loader2,
  MapPin,
  RotateCcw,
  Briefcase,
  ChevronDown,
  Users,
  CalendarDays,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { generateTripPlan, refineTripPlan } from "@/lib/trip-ai.functions";
import { destinationVibe, formatINR, type TripPlan } from "@/lib/trip-planner";
import { TripDashboard } from "@/components/TripDashboard";
import { loadSavedTrips, removeSavedTrip, saveTrip, type SavedTrip } from "@/lib/saved-trips";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Explorion — AI Travel Planner for Smarter Trips" },
      {
        name: "description",
        content:
          "Describe your trip in plain words and Explorion builds a day-by-day itinerary, transport options and a full budget breakdown you can refine.",
      },
      { property: "og:title", content: "Explorion — AI Travel Planner" },
      {
        property: "og:description",
        content:
          "Type '3 days in Goa under ₹20,000' and get an instant itinerary, transport comparison and budget split.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const CHIPS = [
  "Weekend in Pondicherry from Chennai, 2 people, ₹12,000 per person, next weekend",
  "5 days in Manali from Delhi, solo, ₹15,000 per person, first week of December",
  "3 days in Goa from Mumbai, family of 4, ₹20,000 per person",
];

const iso = (d: Date) => d.toISOString().slice(0, 10);

const addDays = (d: Date, n: number) => {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
};

const nextSaturday = (weeksAhead: number) => {
  const today = new Date();
  const delta = ((6 - today.getDay() + 7) % 7 || 7) + weeksAhead * 7;
  return addDays(today, delta);
};

const DATE_CHIPS: { label: string; start: () => string; end: () => string }[] = [
  {
    label: "This weekend",
    start: () => iso(nextSaturday(0)),
    end: () => iso(addDays(nextSaturday(0), 1)),
  },
  {
    label: "Next weekend",
    start: () => iso(nextSaturday(1)),
    end: () => iso(addDays(nextSaturday(1), 1)),
  },
  {
    label: "In 2 weeks",
    start: () => iso(addDays(new Date(), 14)),
    end: () => iso(addDays(new Date(), 16)),
  },
];

const prettyDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const ORIGIN_CHIPS = ["Bengaluru", "Delhi", "Mumbai", "Chennai"];

const TRAVELER_CHIPS: { label: string; count: number }[] = [
  { label: "Solo", count: 1 },
  { label: "Couple", count: 2 },
  { label: "Family (4)", count: 4 },
  { label: "Group (6+)", count: 6 },
];

const PREFERENCE_CHIPS = [
  "Take me somewhere unexplored",
  "Keep it calm, minimal travel between stops",
  "Make it adventurous",
  "I have food or stay preferences",
];

function Home() {
  const [prompt, setPrompt] = useState("");
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string | null>(null);
  const [originInput, setOriginInput] = useState("");
  const [travelerCount, setTravelerCount] = useState<number | null>(null);
  const [travelerInput, setTravelerInput] = useState("");
  const [askingTravelers, setAskingTravelers] = useState(false);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [startInput, setStartInput] = useState("");
  const [endInput, setEndInput] = useState("");
  const [askingDates, setAskingDates] = useState(false);
  const [askingPreference, setAskingPreference] = useState(false);
  const [preference, setPreference] = useState("");
  const [preferenceInput, setPreferenceInput] = useState("");

  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const [selectedStay, setSelectedStay] = useState(0);
  const [refineText, setRefineText] = useState("");
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [changeSummary, setChangeSummary] = useState<string | null>(null);

  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [tripsOpen, setTripsOpen] = useState(false);
  const currentId = useRef<string | undefined>(undefined);
  // Always points at the latest plan so async refine callbacks never read a stale closure.
  const planRef = useRef<TripPlan | null>(null);
  planRef.current = plan;
  const refineSeq = useRef(0);

  const askAi = useServerFn(generateTripPlan);
  const askRefine = useServerFn(refineTripPlan);

  const tripsMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTrips(loadSavedTrips());
  }, []);

  // Close the My Trips menu on outside click / Escape (click-driven, no hover gaps).
  useEffect(() => {
    if (!tripsOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!tripsMenuRef.current?.contains(e.target as Node)) setTripsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTripsOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [tripsOpen]);

  const deleteSavedTrip = (id: string) => {
    const next = removeSavedTrip(id);
    setTrips(next);
    if (currentId.current === id) currentId.current = undefined;
    toast.success("Trip removed from My Trips");
  };

  const persist = (next: TripPlan) => {
    try {
      const list = saveTrip(next, currentId.current);
      currentId.current = list[0]?.id;
      setTrips(list);
    } catch (err) {
      console.error("[Explorion] could not persist trip:", err);
    }
  };

  const run = async (
    text: string,
    from: string | null,
    pref: string,
    count: number | null,
    dates: { start: string | null; end: string | null } = { start: startDate, end: endDate },
  ) => {
    if (!text || loading) return;
    setAskingTravelers(false);
    setAskingDates(false);
    refineSeq.current++; // invalidate any in-flight refinement
    setRefining(false);
    setLoading(true);
    setError(null);
    setPlan(null);
    setMarks({});
    setChangeSummary(null);
    setRefineError(null);
    setSelectedStay(0);
    currentId.current = undefined;
    try {
      const aiPlan = await askAi({
        data: {
          prompt: text,
          origin: from,
          preference: pref,
          travelerCount: count,
          startDate: dates.start,
          endDate: dates.end,
        },
      });
      if (import.meta.env.DEV) {
        console.log("[Explorion] raw AI response:", aiPlan.debugRaw);
        console.log("[Explorion] parsed trip plan:", aiPlan);
      }
      setPlan(aiPlan);
      if (aiPlan.origin && !from) setOrigin(aiPlan.origin);
      if (aiPlan.travelerCount && !count) setTravelerCount(aiPlan.travelerCount);
      if (aiPlan.travelDates?.startDate && !dates.start) {
        setStartDate(aiPlan.travelDates.startDate);
        setEndDate(aiPlan.travelDates.endDate ?? null);
      }
      if (!aiPlan.needsOrigin && !aiPlan.needsTravelerCount && !aiPlan.needsDates)
        persist(aiPlan);
    } catch (err) {
      console.error("[Explorion] trip generation failed for prompt:", text, err);
      setPlan(null);
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Something went wrong generating your trip — try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const openPreference = () => {
    if (!prompt.trim()) return;
    setPreferenceInput(preference);
    setError(null);
    setPlan(null);
    setAskingPreference(true);
  };

  const submitPreference = (pref: string) => {
    const clean = pref.trim();
    setPreference(clean);
    setAskingPreference(false);
    void run(prompt.trim(), origin, clean, travelerCount);
  };

  const handlePlan = () =>
    preference
      ? void run(prompt.trim(), origin, preference, travelerCount)
      : openPreference();

  const chooseOrigin = (city: string) => {
    const clean = city.trim();
    if (!clean) return;
    setOrigin(clean);
    setOriginInput("");
    void run(prompt.trim(), clean, preference, travelerCount);
  };

  const chooseTravelers = (count: number) => {
    if (!Number.isFinite(count) || count < 1) return;
    const clean = Math.round(count);
    setTravelerCount(clean);
    setTravelerInput("");
    void run(prompt.trim(), origin, preference, clean);
  };

  const chooseDates = (start: string, end: string | null) => {
    if (!start) return;
    setStartDate(start);
    setEndDate(end);
    setStartInput("");
    setEndInput("");
    void run(prompt.trim(), origin, preference, travelerCount, { start, end });
  };

  const editDates = () => {
    setStartInput(startDate ?? "");
    setEndInput(endDate ?? "");
    setAskingDates(true);
  };

  const editTravelers = () => {
    setTravelerInput(travelerCount ? String(travelerCount) : "");
    setAskingTravelers(true);
  };

  const editPreference = () => {
    setPreferenceInput(preference);
    setAskingPreference(true);
  };

  const toggleMark = (key: string) =>
    setMarks((prev) => ({ ...prev, [key]: !prev[key] }));

  const runRefine = async () => {
    const request = refineText.trim();
    const basePlan = planRef.current;
    if (!basePlan || refining) return;
    const scope = Object.entries(marks)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (!request && !scope.length) {
      setRefineError("What would you like to change?");
      return;
    }
    if (!request) {
      setRefineError("Tell us what to change about the selected sections.");
      return;
    }
    const requestId = ++refineSeq.current;
    setRefining(true);
    setRefineError(null);
    setChangeSummary(null);
    try {
      // Send the LATEST plan (never a stale closure) and strip debug-only fields.
      const { debugRaw: _debug, ...snapshot } = basePlan as TripPlan & { debugRaw?: unknown };
      const patch = await askRefine({ data: { request, scope, plan: snapshot } });
      if (import.meta.env.DEV) console.log("[Explorion] refinement patch:", patch);
      // A newer refine or a fresh generation superseded this one — drop it.
      if (requestId !== refineSeq.current || planRef.current !== basePlan) return;
      if (!patch.changed.length) {
        setRefineError(patch.summary || "What would you like to change?");
        return;
      }
      const next: TripPlan = { ...basePlan };
      if (patch.transport) next.transport = patch.transport;
      if (patch.stayOptions) {
        next.stayOptions = patch.stayOptions;
        const prevName = basePlan.stayOptions[selectedStay]?.name;
        const keep = patch.stayOptions.findIndex((s) => s.name === prevName);
        setSelectedStay(keep >= 0 ? keep : 0);
      }
      if (patch.budgetBreakdown) next.budgetBreakdown = patch.budgetBreakdown;
      if (patch.budgetTotal) next.budget = patch.budgetTotal;
      if (patch.itineraryDays?.length) {
        next.itinerary = basePlan.itinerary.map((day) => {
          const replacement = patch.itineraryDays?.find((d) => d.day === day.day);
          return replacement ? { ...day, slots: replacement.slots } : day;
        });
      }
      setPlan(next);
      setChangeSummary(patch.summary);
      setMarks({});
      setRefineText("");
      persist(next);
      toast.success(patch.summary || "Trip updated");
    } catch (err) {
      if (requestId !== refineSeq.current) return;
      console.error("[Explorion] refinement failed for request:", request, err);
      const message =
        err instanceof Error && err.message ? err.message : "Couldn't apply that change — try again.";
      setRefineError(message);
      toast.error("Couldn't update the trip", { description: message });
    } finally {
      if (requestId === refineSeq.current) setRefining(false);
    }
  };

  const openSavedTrip = (trip: SavedTrip) => {
    setTripsOpen(false);
    if (trip.broken) return;
    refineSeq.current++; // a refine started on the previous plan must not land on this one
    setRefining(false);
    setRefineText("");
    try {
      currentId.current = trip.id;
      setPlan(trip.plan);
      setOrigin(trip.plan.origin);
      setTravelerCount(trip.plan.travelerCount ?? null);
      setAskingTravelers(false);
      setStartDate(trip.plan.travelDates?.startDate ?? null);
      setEndDate(trip.plan.travelDates?.endDate ?? null);
      setAskingDates(false);
      setPreference(trip.plan.tripPreference ?? "");
      setMarks({});
      setSelectedStay(0);
      setChangeSummary(null);
      setError(null);
      setRefineError(null);
      setAskingPreference(false);
    } catch (err) {
      console.error("[Explorion] saved trip failed to load:", trip.id, err);
      setError("This trip couldn't be loaded.");
    }
  };

  const needsOrigin = !!plan?.needsOrigin;
  const needsTravelers = !needsOrigin && (askingTravelers || !!plan?.needsTravelerCount);
  const needsDates =
    !needsOrigin && !needsTravelers && (askingDates || !!plan?.needsDates);

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

        <div className="relative" ref={tripsMenuRef}>
          <button
            type="button"
            aria-expanded={tripsOpen}
            aria-haspopup="menu"
            onClick={() => setTripsOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full border border-border px-3.5 py-2 text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            <Briefcase className="size-3.5" /> My Trips ({trips.length})
            <ChevronDown className="size-3" />
          </button>
          {tripsOpen ? (
            <div role="menu" className="panel-navy absolute right-0 z-40 mt-2 w-80 p-3">
              {trips.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground">
                  No saved trips yet — plan one and it appears here automatically.
                </p>
              ) : (
                <ul className="max-h-80 space-y-1 overflow-auto">
                  {trips.map((trip) => (
                    <li key={trip.id} className="flex items-center gap-2">
                      <button
                        onClick={() => openSavedTrip(trip)}
                        className="flex-1 rounded-lg px-3 py-2 text-left transition hover:bg-primary/10"
                      >
                        {trip.broken ? (
                          <span className="flex items-center gap-2 text-xs text-muted-foreground">
                            <AlertTriangle className="size-3" /> This trip couldn&apos;t be
                            loaded
                          </span>
                        ) : (
                          <>
                            <p className="text-sm text-foreground">
                              {trip.plan.days} days in {trip.plan.destination}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {trip.plan.month} · {formatINR(trip.plan.budget)}
                              {trip.plan.origin ? ` · from ${trip.plan.origin}` : ""}
                            </p>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSavedTrip(trip.id);
                        }}
                        aria-label="Delete saved trip"
                        className="rounded-lg p-2 text-muted-foreground transition hover:text-primary"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
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
              <p className="text-xs text-muted-foreground">
                {origin ? `Departing from ${origin} · ` : ""}Any budget you mention is
                treated as per person
              </p>
              <button
                onClick={handlePlan}
                disabled={loading || refining || !prompt.trim()}
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

        {askingPreference ? (
          <section className="panel-navy mt-6 space-y-4 p-8">
            <div>
              <h2 className="font-display text-2xl text-foreground">
                How do you want this trip to feel?
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Tell us in your own words — we&apos;ll shape the itinerary, meals and stay
                around it.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {PREFERENCE_CHIPS.map((chip) => (
                <button
                  key={chip}
                  onClick={() => setPreferenceInput(chip)}
                  className="rounded-full border border-border px-4 py-2 text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
                >
                  {chip}
                </button>
              ))}
            </div>
            <textarea
              rows={2}
              value={preferenceInput}
              onChange={(e) => setPreferenceInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitPreference(preferenceInput);
                }
              }}
              placeholder="e.g. calm trip, vegetarian food, avoiding crowds"
              className="w-full resize-none rounded-xl border border-border bg-transparent px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
            />
            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={() => submitPreference(preferenceInput)}
                disabled={!preferenceInput.trim()}
                className="brass-glow inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
              >
                Build my itinerary <ArrowRight className="size-4" />
              </button>
              <button
                onClick={() => submitPreference("")}
                className="text-sm text-muted-foreground underline underline-offset-4 transition hover:text-primary"
              >
                Skip, surprise me
              </button>
            </div>
          </section>
        ) : loading ? (
          <section className="panel-navy mt-6 flex items-center gap-3 p-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary" /> Planning your trip…
          </section>
        ) : error ? (
          <section className="panel-navy mt-6 space-y-4 p-8">
            <p className="text-sm text-foreground">
              {error} Nothing was lost — give it another go.
            </p>
            <button
              onClick={handlePlan}
              className="inline-flex items-center gap-2 rounded-xl border border-primary px-4 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary hover:text-primary-foreground"
            >
              <RotateCcw className="size-4" /> Retry
            </button>
          </section>
        ) : needsOrigin ? (
          <section className="panel-navy mt-6 space-y-4 p-8">
            <p className="flex items-center gap-2 text-sm text-foreground">
              <MapPin className="size-4 text-primary" /> Where are you travelling from? We
              need your starting city for accurate fares.
            </p>
            <div className="flex flex-wrap gap-2">
              {ORIGIN_CHIPS.map((city) => (
                <button
                  key={city}
                  onClick={() => chooseOrigin(city)}
                  className="rounded-full border border-border px-4 py-2 text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
                >
                  {city}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={originInput}
                onChange={(e) => setOriginInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") chooseOrigin(originInput);
                }}
                placeholder="Or type your city"
                className="rounded-xl border border-border bg-transparent px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
              />
              <button
                onClick={() => chooseOrigin(originInput)}
                disabled={!originInput.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
              >
                Use this city <ArrowRight className="size-4" />
              </button>
            </div>
          </section>
        ) : needsTravelers ? (
          <section className="panel-navy mt-6 space-y-4 p-8">
            <p className="flex items-center gap-2 text-sm text-foreground">
              <Users className="size-4 text-primary" /> How many people are travelling? We
              price everything per person.
            </p>
            <div className="flex flex-wrap gap-2">
              {TRAVELER_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  onClick={() => chooseTravelers(chip.count)}
                  className="rounded-full border border-border px-4 py-2 text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
                >
                  {chip.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                min={1}
                value={travelerInput}
                onChange={(e) => setTravelerInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") chooseTravelers(Number(travelerInput));
                }}
                placeholder="Or enter a number"
                className="w-44 rounded-xl border border-border bg-transparent px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
              />
              <button
                onClick={() => chooseTravelers(Number(travelerInput))}
                disabled={!(Number(travelerInput) >= 1)}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
              >
                Use this count <ArrowRight className="size-4" />
              </button>
              {askingTravelers && plan && !plan.needsTravelerCount ? (
                <button
                  onClick={() => setAskingTravelers(false)}
                  className="text-sm text-muted-foreground underline underline-offset-4 transition hover:text-primary"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </section>
        ) : needsDates ? (
          <section className="panel-navy mt-6 space-y-4 p-8">
            <p className="flex items-center gap-2 text-sm text-foreground">
              <CalendarDays className="size-4 text-primary" /> When are you travelling? We
              use real dates for seasonal advice, fares and visa timing.
            </p>
            <div className="flex flex-wrap gap-2">
              {DATE_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  onClick={() => chooseDates(chip.start(), chip.end())}
                  className="rounded-full border border-border px-4 py-2 text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
                >
                  {chip.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-muted-foreground">
                Start date
                <input
                  type="date"
                  value={startInput}
                  onChange={(e) => setStartInput(e.target.value)}
                  className="mt-1 block rounded-xl border border-border bg-transparent px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                End date (optional)
                <input
                  type="date"
                  value={endInput}
                  min={startInput || undefined}
                  onChange={(e) => setEndInput(e.target.value)}
                  className="mt-1 block rounded-xl border border-border bg-transparent px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                />
              </label>
              <button
                onClick={() => chooseDates(startInput, endInput || null)}
                disabled={!startInput}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
              >
                Use these dates <ArrowRight className="size-4" />
              </button>
              {askingDates && plan && !plan.needsDates ? (
                <button
                  onClick={() => setAskingDates(false)}
                  className="text-sm text-muted-foreground underline underline-offset-4 transition hover:text-primary"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </section>
        ) : plan ? (
          <section className="border-t border-border pt-12">
            <p className="mb-6 text-sm text-muted-foreground">
              {plan.vibe ?? destinationVibe(plan.destination)}
              {plan.style ? ` · ${plan.style} style` : ""}
            </p>
            <TripDashboard
              plan={plan}
              onEditPreference={editPreference}
              onEditTravelers={editTravelers}
              onEditDates={editDates}
              marks={marks}
              onToggleMark={toggleMark}
              selectedStay={selectedStay}
              onSelectStay={setSelectedStay}
              changeSummary={changeSummary}
            />

            <section className="panel-navy mt-10 space-y-4 p-6">
              <div>
                <h3 className="font-display text-xl text-foreground">Refine your trip</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Mark sections as “Change” above, or just describe what to adjust — the
                  rest stays exactly as it is.
                </p>
              </div>
              <textarea
                rows={2}
                value={refineText}
                disabled={refining || loading}
                onChange={(e) => setRefineText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void runRefine();
                  }
                }}
                placeholder="e.g. make day 2 calmer, or find a cheaper stay"
                className="w-full resize-none rounded-xl border border-border bg-transparent px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
              />
              <div className="flex flex-wrap items-center gap-4">
                <button
                  onClick={() => void runRefine()}
                  disabled={refining || loading}
                  className="brass-glow inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
                >
                  {refining ? (
                    <>
                      Updating <Loader2 className="size-4 animate-spin" />
                    </>
                  ) : (
                    <>
                      Refine <ArrowRight className="size-4" />
                    </>
                  )}
                </button>
                {refineError ? (
                  <p className="text-sm text-foreground">{refineError}</p>
                ) : null}
              </div>
            </section>
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
