import { useEffect, useState } from "react";
import { Accessibility, Utensils, X, Trash2, Plus, MapPin, PawPrint } from "lucide-react";
import {
  DIET_LABELS,
  DIET_OPTIONS,
  MAX_NOTES,
  MAX_TAGS,
  MAX_TAG_LEN,
  MOBILITY_LABELS,
  MOBILITY_OPTIONS,
  MAX_ORIGIN_LEN,
  PET_SIZES,
  PET_SIZE_LABELS,
  PET_TYPES,
  PET_TYPE_LABELS,
  SENSORY_LABELS,
  SENSORY_OPTIONS,
  emptyAccessibility,
  emptyDietary,
  emptyPet,
  isEmptyAccessibility,
  isEmptyDietary,
  isEmptyPet,
  normalizeProfile,
  type AccessibilityProfile,
  type DietaryProfile,
  type PetProfile,
  type TravelerProfile,
} from "@/lib/traveler-profile";

type Props = {
  /** The profile currently in effect (saved or session-only). */
  initial: TravelerProfile | null;
  hasSavedProfile: boolean;
  onSave: (profile: TravelerProfile | null, sessionOnly: boolean) => void;
  onClear: () => void;
  onClose: () => void;
};

const chip = (active: boolean) =>
  `rounded-full border px-3 py-1.5 text-xs transition ${
    active
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border text-muted-foreground hover:border-primary hover:text-primary"
  }`;

export function TravelerProfileEditor({ initial, hasSavedProfile, onSave, onClear, onClose }: Props) {
  const [access, setAccess] = useState<AccessibilityProfile>(initial?.accessibility ?? emptyAccessibility());
  const [diet, setDiet] = useState<DietaryProfile>(initial?.dietary ?? emptyDietary());
  const [pet, setPet] = useState<PetProfile>(initial?.pet ?? emptyPet());
  const [startingPoint, setStartingPoint] = useState(initial?.startingPoint ?? "");
  const [allergyInput, setAllergyInput] = useState("");
  const [sessionOnly, setSessionOnly] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const addAllergy = (raw: string) => {
    const t = raw.trim().replace(/\s+/g, " ").slice(0, MAX_TAG_LEN);
    if (!t) return;
    setDiet((d) => {
      if (d.allergies.length >= MAX_TAGS) return d;
      if (d.allergies.some((a) => a.toLowerCase() === t.toLowerCase())) return d;
      return { ...d, allergies: [...d.allergies, t] };
    });
    setAllergyInput("");
  };

  const toggleSensory = (s: string) =>
    setAccess((a) => ({
      ...a,
      sensory: a.sensory.includes(s) ? a.sensory.filter((x) => x !== s) : [...a.sensory, s],
    }));

  const save = () => {
    const profile = normalizeProfile({
      startingPoint: startingPoint.trim() || null,
      accessibility: isEmptyAccessibility(access) ? null : access,
      dietary: isEmptyDietary(diet) ? null : diet,
      pet: isEmptyPet(pet) ? null : pet,
      updatedAt: new Date().toISOString(),
    });
    onSave(profile, sessionOnly);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-4 backdrop-blur-sm sm:items-center"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        className="panel-navy max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6 sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="profile-title" className="font-display text-2xl text-foreground">
              My travel profile
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Saved on this device and applied to every trip you plan — so you never re-type it. Every section is optional.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full border border-border p-1.5 text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Starting point */}
        <section className="mt-6 space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <MapPin className="size-4 text-primary" /> Starting point
          </h3>
          <input
            value={startingPoint}
            maxLength={MAX_ORIGIN_LEN}
            onChange={(e) => setStartingPoint(e.target.value)}
            placeholder="Your usual departure city (e.g. Bengaluru)"
            className="w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
          <p className="text-xs text-muted-foreground">
            Pre-fills where you travel from. You can still change it for any single trip.
          </p>
        </section>

        {/* Dietary */}
        <section className="mt-6 space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Utensils className="size-4 text-primary" /> Dietary preferences
          </h3>
          <div className="flex flex-wrap gap-2">
            {DIET_OPTIONS.map((t) => (
              <button key={t} type="button" onClick={() => setDiet((d) => ({ ...d, type: t }))} className={chip(diet.type === t)}>
                {DIET_LABELS[t]}
              </button>
            ))}
          </div>
          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">Allergies — press Enter to add each one</p>
            <div className="flex flex-wrap items-center gap-2">
              {diet.allergies.map((a) => (
                <span key={a} className="inline-flex items-center gap-1 rounded-full border border-primary/50 px-2.5 py-1 text-xs text-foreground">
                  {a}
                  <button
                    type="button"
                    aria-label={`Remove ${a}`}
                    onClick={() => setDiet((d) => ({ ...d, allergies: d.allergies.filter((x) => x !== a) }))}
                    className="opacity-60 hover:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <input
                value={allergyInput}
                onChange={(e) => setAllergyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addAllergy(allergyInput);
                  }
                }}
                onBlur={() => addAllergy(allergyInput)}
                maxLength={MAX_TAG_LEN}
                disabled={diet.allergies.length >= MAX_TAGS}
                placeholder={diet.allergies.length >= MAX_TAGS ? "Limit reached" : "e.g. peanuts, shellfish"}
                className="min-w-40 flex-1 rounded-xl border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => addAllergy(allergyInput)}
                disabled={!allergyInput.trim()}
                aria-label="Add allergy"
                className="rounded-full border border-border p-1.5 text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-40"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          </div>
          <textarea
            rows={2}
            value={diet.notes}
            maxLength={MAX_NOTES}
            onChange={(e) => setDiet((d) => ({ ...d, notes: e.target.value }))}
            placeholder="Anything else about food (e.g. no onion/garlic, mild spice only)"
            className="w-full resize-none rounded-xl border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        </section>

        {/* Accessibility */}
        <section className="mt-6 space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Accessibility className="size-4 text-primary" /> Accessibility needs
          </h3>
          <div className="flex flex-wrap gap-2">
            {MOBILITY_OPTIONS.map((m) => (
              <button key={m} type="button" onClick={() => setAccess((a) => ({ ...a, mobility: m }))} className={chip(access.mobility === m)}>
                {MOBILITY_LABELS[m]}
              </button>
            ))}
          </div>
          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">Sensory support (pick any)</p>
            <div className="flex flex-wrap gap-2">
              {SENSORY_OPTIONS.map((s) => (
                <button key={s} type="button" onClick={() => toggleSensory(s)} aria-pressed={access.sensory.includes(s)} className={chip(access.sensory.includes(s))}>
                  {SENSORY_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={access.serviceAnimal}
              onChange={(e) => setAccess((a) => ({ ...a, serviceAnimal: e.target.checked }))}
              className="size-4 accent-primary"
            />
            I travel with a service animal
          </label>
          <textarea
            rows={2}
            value={access.notes}
            maxLength={MAX_NOTES}
            onChange={(e) => setAccess((a) => ({ ...a, notes: e.target.value }))}
            placeholder="Anything else (e.g. avoid long stairs, need ground-floor rooms)"
            className="w-full resize-none rounded-xl border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        </section>

        {/* Pet */}
        <section className="mt-6 space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <PawPrint className="size-4 text-primary" /> Travelling with a pet
          </h3>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={pet.traveling}
              onChange={(e) => setPet((p) => (e.target.checked ? { ...p, traveling: true } : emptyPet()))}
              className="size-4 accent-primary"
            />
            My pet is coming along
          </label>
          {pet.traveling ? (
            <div className="space-y-3 rounded-xl border border-border p-3">
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">Type</p>
                <div className="flex flex-wrap gap-2">
                  {PET_TYPES.map((t) => (
                    <button key={t} type="button" onClick={() => setPet((p) => ({ ...p, type: t }))} className={chip(pet.type === t)}>
                      {PET_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">Size — decides cabin vs. cargo and stay rules</p>
                <div className="flex flex-wrap gap-2">
                  {PET_SIZES.map((sz) => (
                    <button key={sz} type="button" onClick={() => setPet((p) => ({ ...p, size: sz }))} className={chip(pet.size === sz)}>
                      {PET_SIZE_LABELS[sz]}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                rows={2}
                value={pet.notes}
                maxLength={MAX_NOTES}
                onChange={(e) => setPet((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Anything else (e.g. crate-trained, anxious in crowds, needs a garden)"
                className="w-full resize-none rounded-xl border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
              />
            </div>
          ) : null}
        </section>

        {/* Session-only toggle */}
        <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 text-sm text-foreground">
          <input
            type="checkbox"
            checked={sessionOnly}
            onChange={(e) => setSessionOnly(e.target.checked)}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
            <span className="font-semibold">For this trip only</span>
            <span className="block text-xs text-muted-foreground">
              Use these settings for the trip you&apos;re planning now without changing your saved profile.
            </span>
          </span>
        </label>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={save}
              className="brass-glow inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
            >
              {sessionOnly ? "Use for this trip" : "Save profile"}
            </button>
            <button type="button" onClick={onClose} className="text-sm text-muted-foreground underline underline-offset-4 transition hover:text-primary">
              Cancel
            </button>
          </div>
          {hasSavedProfile ? (
            confirmClear ? (
              <span className="flex items-center gap-2 text-xs text-foreground">
                Delete your saved profile?
                <button
                  type="button"
                  onClick={onClear}
                  className="rounded-lg border border-destructive px-2.5 py-1 font-semibold text-destructive transition hover:bg-destructive hover:text-destructive-foreground"
                >
                  Yes, clear it
                </button>
                <button type="button" onClick={() => setConfirmClear(false)} className="underline underline-offset-4">
                  Keep
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-destructive"
              >
                <Trash2 className="size-3.5" /> Clear my profile
              </button>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
