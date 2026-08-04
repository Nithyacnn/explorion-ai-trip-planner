import { useMemo, useState } from "react";
import {
  Plane,
  TrainFront,
  Sun,
  Sunset,
  Moon,
  Wallet,
  Bookmark,
  Check,
  BedDouble,
  Sparkles,
} from "lucide-react";
import { formatINR, type TripPlan } from "@/lib/trip-planner";

const slotIcons = [Sun, Sunset, Moon];

const STORAGE_KEY = "explorion.saved-trips";

const AI_CAPTION = "AI-estimated ranges, not live pricing.";

function AgentTag({ label }: { label: string | undefined }) {
  if (!label) return null;
  return (
    <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
      <Sparkles className="size-3" /> Curated by {label}
    </span>
  );
}


export function TripDashboard({ plan }: { plan: TripPlan }) {
  const [saved, setSaved] = useState(false);

  const maxPct = useMemo(
    () => Math.max(...plan.budgetBreakdown.map((b) => b.pct)),
    [plan],
  );

  const saveTrip = () => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const list: unknown[] = raw ? JSON.parse(raw) : [];
      list.unshift({ savedAt: new Date().toISOString(), plan });
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 20)));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch {
      /* storage unavailable */
    }
  };

  return (
    <div key={`${plan.destination}-${plan.days}-${plan.budget}-${plan.month}`} className="fade-rise space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.35em] text-primary">Your plan</p>
          <h2 className="font-display text-4xl text-foreground sm:text-5xl">
            {plan.days} days in {plan.destination}
          </h2>
          <p className="text-sm text-muted-foreground">
            {plan.origin ? `${plan.origin} → ${plan.destination} · ` : ""}
            {plan.month} · Budget {formatINR(plan.budget)} · {plan.itinerary.length}-day
            itinerary
          </p>
        </div>
        <button
          onClick={saveTrip}
          aria-live="polite"
          className="inline-flex items-center gap-2 rounded-xl border border-primary px-4 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary hover:text-primary-foreground active:scale-[0.98]"
        >
          {saved ? <Check className="size-4" /> : <Bookmark className="size-4" />}
          {saved ? "Trip saved" : "Save Trip"}
        </button>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Transport */}
        <section className="card-ivory p-6 lg:col-span-1">
          <h3 className="font-display text-xl">Transport estimates</h3>
          <p className="mt-1 text-xs opacity-70">
            Round-trip, per person{plan.origin ? ` · from ${plan.origin}` : ""}
          </p>
          <AgentTag label={plan.agentLabels?.transport} />

          <div className="mt-5 space-y-4">
            {[
              {
                icon: TrainFront,
                ...plan.transport.train,
                note: "Slower, easiest on budget",
              },
              {
                icon: Plane,
                ...plan.transport.flight,
                note: "Fastest, book 3+ weeks ahead",
              },
            ].map((t) => (
              <div
                key={t.label}
                className="flex items-center gap-4 rounded-xl border border-current/10 bg-black/[0.03] p-4"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <t.icon className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider opacity-70">
                    {t.label}
                  </p>
                  <p className="mt-0.5 inline-flex rounded-lg bg-primary/15 px-2.5 py-1 text-lg font-semibold tabular-nums tracking-tight">
                    {formatINR(t.min)} – {formatINR(t.max)}
                  </p>
                  <p className="mt-1 text-xs opacity-70">{t.note}</p>
                </div>
              </div>
            ))}
          </div>

        </section>

        {/* Itinerary */}
        <section className="panel-navy p-6 lg:col-span-2">
          <h3 className="font-display text-xl text-foreground">Day-by-day itinerary</h3>
          <ol className="mt-5 space-y-5 border-l border-border pl-6">
            {plan.itinerary.map((day) => (
              <li key={day.day} className="relative">
                <span className="absolute -left-[31px] top-1 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {day.day}
                </span>
                <div className="card-ivory p-4">
                  <p className="text-sm font-semibold">
                    Day {day.day} · {day.title}
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {day.slots.map((slot, i) => {
                      const Icon = slotIcons[i] ?? Sun;
                      return (
                        <div
                          key={slot.label}
                          className="rounded-lg border border-current/10 bg-black/[0.03] p-3"
                        >
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider opacity-70">
                            <Icon className="size-3" />
                            {slot.label}
                          </div>
                          <p className="mt-1 text-sm leading-snug">{slot.activity}</p>
                          <p className="mt-1 text-[11px] opacity-60">{slot.tag}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {/* Budget */}
      <section className="card-ivory p-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h3 className="font-display flex items-center gap-2 text-xl">
            <Wallet className="size-5" /> Budget breakdown
          </h3>
          <p className="text-sm opacity-70">Total {formatINR(plan.budget)}</p>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          {plan.budgetBreakdown.map((b) => (
            <div key={b.label}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-semibold">{b.label}</span>
                <span className="tabular-nums opacity-80">
                  {formatINR(b.amount)} · {b.pct}%
                </span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-black/10">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
                  style={{ width: `${(b.pct / maxPct) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
