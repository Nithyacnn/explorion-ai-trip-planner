import { useMemo, useState } from "react";
import {
  Plane,
  TrainFront,
  Bus,
  Car,
  Sun,
  Sunset,
  Sunrise,
  Moon,
  Wallet,
  BedDouble,
  Sparkles,
  Pencil,
  Star,
  ExternalLink,
  BadgeCheck,
  Check,
  CircleDot,
  Ticket,
  X,
  Users,
  CalendarDays,
  Stamp,
  AlertTriangle,
  Clock,
} from "lucide-react";
import {
  formatINR,
  isValidTravelerCount,
  VISA_STATUS,
  type Stay,
  type TransportModeId,
  type TripPlan,
} from "@/lib/trip-planner";
import { SectionBoundary } from "@/components/SectionBoundary";
import { staySearchLink, transportSearchLink } from "@/lib/booking-links";

const slotIcons = [Sunrise, Sun, Sunset, Moon];

const MODE_ICONS: Record<TransportModeId, typeof Plane> = {
  flight: Plane,
  train: TrainFront,
  bus: Bus,
  own_vehicle: Car,
};

const AI_CAPTION = "AI-estimated ranges, not live pricing.";
const VISA_CAPTION =
  "Visa requirements are AI-estimated — verify with official sources before travel.";

function CardError({ children }: { children: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-current/25 p-4 text-sm">
      <AlertTriangle className="size-4 shrink-0 opacity-70" />
      <span className="opacity-80">{children}</span>
    </div>
  );
}

function AgentTag({ label }: { label?: string | undefined }) {
  if (!label) return null;
  return (
    <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
      <Sparkles className="size-3" /> Curated by {label}
    </span>
  );
}

function Empty({ children }: { children: string }) {
  return (
    <p className="rounded-xl border border-dashed border-current/20 p-4 text-sm opacity-70">
      {children}
    </p>
  );
}

function MarkToggle({
  marked,
  onToggle,
  tone = "light",
}: {
  marked: boolean;
  onToggle: () => void;
  tone?: "light" | "dark";
}) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={marked}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition ${
        marked
          ? "border-primary bg-primary text-primary-foreground"
          : tone === "dark"
            ? "border-border text-muted-foreground hover:border-primary hover:text-primary"
            : "border-current/25 opacity-70 hover:opacity-100"
      }`}
    >
      {marked ? <CircleDot className="size-3" /> : <Check className="size-3" />}
      {marked ? "Change" : "Keep"}
    </button>
  );
}

export type DashboardProps = {
  plan: TripPlan;
  onEditPreference?: () => void;
  onEditTravelers?: () => void;
  onEditDates?: () => void;
  marks: Record<string, boolean>;
  onToggleMark: (key: string) => void;
  selectedStay: number;
  onSelectStay: (index: number) => void;
  changeSummary?: string | null;
};

export function TripDashboard({
  plan,
  onEditPreference,
  onEditTravelers,
  onEditDates,
  marks,
  onToggleMark,
  selectedStay,
  onSelectStay,
  changeSummary,
}: DashboardProps) {
  const [booking, setBooking] = useState<string | null>(null);
  const [booked, setBooked] = useState(false);

  const modes = Array.isArray(plan.transport?.modes) ? plan.transport.modes : [];
  const stays: Stay[] = Array.isArray(plan.stayOptions) ? plan.stayOptions : [];
  const days = Array.isArray(plan.itinerary) ? plan.itinerary : [];
  const stay = stays[Math.min(selectedStay, Math.max(stays.length - 1, 0))];

  const breakdown = useMemo(() => {
    const base = Array.isArray(plan.budgetBreakdown) ? plan.budgetBreakdown : [];
    if (!base.length) return [];
    const items = base.map((b) =>
      b.label === "Stay" && stay
        ? { ...b, amount: Math.round(stay.pricePerNight * Math.max(1, plan.days)) }
        : { ...b },
    );
    const visa = plan.international ? plan.visa : null;
    if (visa?.required && visa.estimatedCost.currency.toUpperCase() === "INR") {
      const avg = Math.round((visa.estimatedCost.low + visa.estimatedCost.high) / 2);
      if (avg > 0) items.push({ label: "Visa (est.)", amount: avg, pct: 0 });
    }
    const total = items.reduce((s, b) => s + b.amount, 0) || 1;
    return items.map((b) => ({ ...b, pct: Math.round((b.amount / total) * 100) }));
  }, [plan.budgetBreakdown, plan.days, plan.international, plan.visa, stay]);

  const total = breakdown.reduce((s, b) => s + b.amount, 0) || plan.budget;
  const travelers = isValidTravelerCount(plan.travelerCount) ? plan.travelerCount : null;
  const budgetOk = travelers !== null;
  const maxPct = Math.max(1, ...breakdown.map((b) => b.pct));

  const startBooking = () => {
    if (booked) return;
    setBooked(true);
    setBooking(
      `EXP-${plan.destination.slice(0, 3).toUpperCase()}-${Math.random()
        .toString(36)
        .slice(2, 8)
        .toUpperCase()}`,
    );
    window.setTimeout(() => setBooked(false), 1500);
  };

  return (
    <div className="fade-rise space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        {onEditPreference ? (
          <button
            onClick={onEditPreference}
            className="inline-flex max-w-full items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3.5 py-1.5 text-xs text-primary transition hover:bg-primary hover:text-primary-foreground"
          >
            <Sparkles className="size-3 shrink-0" />
            <span className="truncate">
              {plan.tripPreference
                ? `Planned for: ${plan.tripPreference}`
                : "No preference set — tap to add one"}
            </span>
            <Pencil className="size-3 shrink-0 opacity-70" />
          </button>
        ) : null}
        {onEditTravelers ? (
          <button
            onClick={onEditTravelers}
            className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3.5 py-1.5 text-xs text-primary transition hover:bg-primary hover:text-primary-foreground"
          >
            <Users className="size-3 shrink-0" />
            <span>
              {isValidTravelerCount(plan.travelerCount)
                ? `${plan.travelerCount} ${plan.travelerCount === 1 ? "traveller" : "travellers"}`
                : "Set traveller count"}
            </span>
            <Pencil className="size-3 shrink-0 opacity-70" />
          </button>
        ) : null}
        {onEditDates ? (
          <button
            onClick={onEditDates}
            className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3.5 py-1.5 text-xs text-primary transition hover:bg-primary hover:text-primary-foreground"
          >
            <CalendarDays className="size-3 shrink-0" />
            <span>
              {plan.travelDates?.startDate
                ? `${formatTripDate(plan.travelDates.startDate)}${
                    plan.travelDates.endDate
                      ? ` – ${formatTripDate(plan.travelDates.endDate)}`
                      : ""
                  }`
                : "Set travel dates"}
            </span>
            <Pencil className="size-3 shrink-0 opacity-70" />
          </button>
        ) : null}
        {changeSummary ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1.5 text-xs text-primary">
            <BadgeCheck className="size-3" /> {changeSummary}
          </span>
        ) : null}
      </div>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.35em] text-primary">Your plan</p>
          <h2 className="font-display text-4xl text-foreground sm:text-5xl">
            {plan.days} days in {plan.destination}
          </h2>
          <p className="text-sm text-muted-foreground">
            {plan.origin ? `${plan.origin} → ${plan.destination} · ` : ""}
            {plan.month} · Budget {formatINR(total)} per person
            {travelers && travelers > 1
              ? ` · ${formatINR(total * travelers)} for ${travelers} travellers`
              : ""}{" "}
            · {days.length}-day itinerary
          </p>
        </div>
        <button
          onClick={startBooking}
          disabled={booked}
          className="brass-glow inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
        >
          <Ticket className="size-4" /> Book this trip
        </button>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Transport + visa */}
        <div className="space-y-6 lg:col-span-1">
        <SectionBoundary name="transport">
          <section className="card-ivory p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-xl">Transport options</h3>
                <p className="mt-1 text-xs opacity-70">
                  Round-trip fares shown per person{plan.origin ? ` · from ${plan.origin}` : ""}
                </p>
              </div>
              <MarkToggle
                marked={!!marks["transport"]}
                onToggle={() => onToggleMark("transport")}
              />
            </div>
            <AgentTag label={plan.agentLabels?.transport} />

            {plan.transport?.recommendedReason ? (
              <p className="mt-4 rounded-xl bg-primary/12 p-3 text-xs leading-snug">
                <span className="font-semibold uppercase tracking-wider">
                  Recommended · {plan.transport.recommendedMode?.replace("_", " ")}
                </span>
                <br />
                {plan.transport.recommendedReason}
              </p>
            ) : null}

            <div className="mt-4 space-y-4">
              {modes.length === 0 ? (
                <Empty>No options found for this route.</Empty>
              ) : (
                modes.map((t) => {
                  const Icon = MODE_ICONS[t.mode] ?? Plane;
                  const link = transportSearchLink(t.mode, plan.origin, plan.destination, plan.month);
                  const isRec = t.mode === plan.transport?.recommendedMode;
                  return (
                    <div
                      key={t.mode}
                      className={`flex items-start gap-4 rounded-xl border p-4 ${
                        isRec ? "border-primary bg-primary/10" : "border-current/10 bg-black/[0.03]"
                      }`}
                    >
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Icon className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wider opacity-70">
                          {t.label}
                        </p>
                        <p className="mt-0.5 inline-flex rounded-lg bg-primary/15 px-2.5 py-1 text-lg font-semibold tabular-nums tracking-tight">
                          {formatINR(t.min)} – {formatINR(t.max)}
                        </p>
                        {t.duration ? (
                          <p className="mt-1 text-xs opacity-70">{t.duration}</p>
                        ) : null}
                        <p className="mt-1 text-xs opacity-70">{t.notes}</p>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-4"
                        >
                          Search on {link.provider} <ExternalLink className="size-3" />
                        </a>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <p className="mt-4 text-[11px] opacity-60">{AI_CAPTION}</p>
          </section>
        </SectionBoundary>

        {plan.international ? (
          <SectionBoundary name="visa">
            <section className="card-ivory p-6">
              <h3 className="font-display flex items-center gap-2 text-xl">
                <Stamp className="size-5" /> Visa info
              </h3>
              {!plan.visa ? (
                <div className="mt-4">
                  <CardError>
                    Couldn&apos;t determine visa requirements — please verify with the
                    destination&apos;s embassy or official immigration site.
                  </CardError>
                </div>
              ) : (
                <>
                  <span
                    className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${
                      VISA_STATUS[plan.visa.type].tone === "ok"
                        ? "bg-emerald-500/20 text-emerald-700"
                        : VISA_STATUS[plan.visa.type].tone === "warn"
                          ? "bg-amber-500/20 text-amber-700"
                          : "bg-red-500/20 text-red-700"
                    }`}
                  >
                    <BadgeCheck className="size-3" /> {VISA_STATUS[plan.visa.type].label}
                  </span>

                  {plan.visa.type === "advance_visa" || plan.visa.type === "e_visa" ? (
                    <p className="mt-3 flex items-start gap-2 rounded-xl bg-primary/12 p-3 text-xs font-semibold leading-snug">
                      <Clock className="mt-0.5 size-3.5 shrink-0" /> {plan.visa.applyBy}
                    </p>
                  ) : null}

                  <dl className="mt-4 space-y-2 text-xs">
                    <div className="flex justify-between gap-3">
                      <dt className="opacity-70">Estimated fee (per traveller)</dt>
                      <dd className="text-right font-semibold tabular-nums">
                        {plan.visa.estimatedCost.currency}{" "}
                        {plan.visa.estimatedCost.low.toLocaleString("en-IN")} –{" "}
                        {plan.visa.estimatedCost.high.toLocaleString("en-IN")}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="opacity-70">Processing time</dt>
                      <dd className="text-right font-semibold">{plan.visa.processingTime}</dd>
                    </div>
                  </dl>

                  {plan.visa.howToApply ? (
                    <p className="mt-3 text-xs leading-snug opacity-80">
                      <span className="font-semibold">How to apply · </span>
                      {plan.visa.howToApply}
                    </p>
                  ) : null}
                  {plan.visa.notes ? (
                    <p className="mt-2 text-xs italic leading-snug opacity-70">
                      {plan.visa.notes}
                    </p>
                  ) : null}
                </>
              )}
              <p className="mt-4 text-[11px] opacity-60">{VISA_CAPTION}</p>
            </section>
          </SectionBoundary>
        ) : null}
        </div>

        {/* Itinerary */}
        <SectionBoundary name="itinerary">
          <section className="panel-navy p-6 lg:col-span-2">
            <h3 className="font-display text-xl text-foreground">Day-by-day itinerary</h3>
            <AgentTag label={plan.agentLabels?.itinerary} />
            {days.length === 0 ? (
              <div className="mt-5 text-sm text-muted-foreground">
                No itinerary days to show yet.
              </div>
            ) : (
              <ol className="mt-5 space-y-5 border-l border-border pl-6">
                {days.map((day) => (
                  <li key={day.day} className="relative">
                    <span className="absolute -left-[31px] top-1 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                      {day.day}
                    </span>
                    <div className="card-ivory p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold">
                          Day {day.day}
                          {day.title ? ` · ${day.title}` : ""}
                        </p>
                        <MarkToggle
                          marked={!!marks[`day:${day.day}`]}
                          onToggle={() => onToggleMark(`day:${day.day}`)}
                        />
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        {(Array.isArray(day.slots) ? day.slots : []).map((slot, i) => {
                          const Icon = slotIcons[i] ?? Sun;
                          const stops = Array.isArray(slot.stops) ? slot.stops : [];
                          return (
                            <div
                              key={slot.label}
                              className="rounded-lg border border-current/10 bg-black/[0.03] p-3"
                            >
                              <div className="flex items-center justify-between gap-1.5">
                                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider opacity-70">
                                  <Icon className="size-3" />
                                  {slot.label}
                                </div>
                                {slot.overpacked ? (
                                  <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-600">
                                    Tight fit
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-1.5 space-y-2">
                                {stops.length === 0 ? (
                                  <p className="text-sm leading-snug opacity-70">Free time</p>
                                ) : (
                                  stops.map((stop, si) => (
                                    <div key={si}>
                                      {si > 0 && stop.travelTimeFromPrevious ? (
                                        <p className="mb-1 text-[10px] italic opacity-50">
                                          ↳ {stop.travelTimeFromPrevious}
                                        </p>
                                      ) : null}
                                      <p className="text-sm leading-snug">
                                        {stop.activity}
                                        {stop.optional ? (
                                          <span className="ml-1.5 rounded-full bg-current/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide opacity-60">
                                            optional
                                          </span>
                                        ) : null}
                                      </p>
                                      {stop.why ? (
                                        <p className="mt-0.5 text-[11px] italic opacity-60">
                                          why: {stop.why}
                                        </p>
                                      ) : null}
                                    </div>
                                  ))
                                )}
                              </div>
                              <p className="mt-2 text-[11px] opacity-60">{slot.tag}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </SectionBoundary>
      </div>

      {/* Stay options */}
      <SectionBoundary name="stay">
        <section className="card-ivory p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-display flex items-center gap-2 text-xl">
                <BedDouble className="size-5" /> Where to stay
              </h3>
              <p className="mt-1 text-xs opacity-70">
              Tap an option to use it in your budget. Nightly prices are the per-person share.
            </p>
            </div>
            <MarkToggle marked={!!marks["stay"]} onToggle={() => onToggleMark("stay")} />
          </div>
          <AgentTag label={plan.agentLabels?.stay} />

          {stays.length === 0 ? (
            <div className="mt-4">
              <Empty>No stay options found for this route.</Empty>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {stays.map((option, i) => {
                const active = option === stay;
                const link = staySearchLink(option.name, plan.destination, plan.month);
                return (
                  <div
                    key={`${option.name}-${i}`}
                    className={`rounded-xl border p-4 text-left transition ${
                      active ? "border-primary bg-primary/10" : "border-current/10 bg-black/[0.03]"
                    }`}
                  >
                    <button
                      onClick={() => onSelectStay(i)}
                      className="w-full text-left"
                      aria-pressed={active}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold">{option.name}</p>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-[11px] font-semibold tabular-nums">
                          <Star className="size-3" /> {option.rating.toFixed(1)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs uppercase tracking-wider opacity-70">
                        {option.type}
                      </p>
                      <p className="mt-2 inline-flex rounded-lg bg-primary/15 px-2.5 py-1 text-base font-semibold tabular-nums">
                        {formatINR(option.pricePerNight)} / night
                      </p>
                      <p className="mt-2 text-xs leading-snug opacity-75">{option.why}</p>
                      {active ? (
                        <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider">
                          <Check className="size-3" /> Selected
                        </p>
                      ) : null}
                    </button>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-4"
                    >
                      Search on {link.provider} <ExternalLink className="size-3" />
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </SectionBoundary>

      {/* Budget */}
      <SectionBoundary name="budget">
        <section className="card-ivory p-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h3 className="font-display flex items-center gap-2 text-xl">
              <Wallet className="size-5" /> Budget breakdown
            </h3>
            <div className="flex items-center gap-3">
              <p className="text-sm opacity-70">
                Total {formatINR(total)} · per person
                {travelers && travelers > 1
                  ? ` · ${formatINR(total * travelers)} for ${travelers} travellers`
                  : ""}
              </p>
              <MarkToggle marked={!!marks["budget"]} onToggle={() => onToggleMark("budget")} />
            </div>
          </div>
          <AgentTag label={plan.agentLabels?.budget} />

          {!budgetOk ? (
            <div className="mt-4">
              <CardError>
                Couldn&apos;t load this part — traveller count is missing, so per-person costs
                can&apos;t be calculated. Set the traveller count above and retry.
              </CardError>
            </div>
          ) : breakdown.length === 0 ? (
            <div className="mt-4">
              <Empty>No budget breakdown available.</Empty>
            </div>
          ) : (
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              {breakdown.map((b) => (
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
          )}
          <p className="mt-5 text-[11px] opacity-60">
            All figures are per person. {AI_CAPTION}
          </p>
        </section>
      </SectionBoundary>

      {booking ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
          role="dialog"
          aria-modal="true"
        >
          <div className="card-ivory fade-rise w-full max-w-md p-7">
            <div className="flex items-start justify-between gap-3">
              <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <BadgeCheck className="size-6" />
              </span>
              <button
                onClick={() => setBooking(null)}
                aria-label="Close"
                className="opacity-60 transition hover:opacity-100"
              >
                <X className="size-5" />
              </button>
            </div>
            <h3 className="font-display mt-4 text-2xl">Demo booking held</h3>
            <p className="mt-2 text-sm opacity-80">
              This is a simulated confirmation — no payment was taken and nothing has been booked
              with any provider. Use the “Search on …” links to book for real.
            </p>
            <p className="mt-4 rounded-xl bg-primary/15 px-4 py-3 text-sm font-semibold tracking-wide">
              Booking reference · {booking}
            </p>
            <p className="mt-3 text-xs opacity-70">
              We&apos;ll keep monitoring this trip and flag changes to fares and stays.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
