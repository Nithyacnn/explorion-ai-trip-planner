import { useEffect, useRef, useState } from "react";
import { Share2, Link2, ClipboardCopy, Send } from "lucide-react";
import { toast } from "sonner";
import type { TripPlan } from "@/lib/trip-planner";
import { buildShareText, buildShareUrl } from "@/lib/share-trip";

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ShareTrip({ plan }: { plan: TripPlan }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const title = `${plan.days} days in ${plan.destination}`;

  const run = async (kind: "native" | "link" | "text") => {
    setBusy(true);
    try {
      const url = await buildShareUrl(plan);
      if (kind === "link") {
        const ok = await copy(url);
        toast[ok ? "success" : "error"](ok ? "Link copied — paste it anywhere" : "Couldn't copy the link");
      } else if (kind === "text") {
        const ok = await copy(`${buildShareText(plan)}\n\n${url}`);
        toast[ok ? "success" : "error"](ok ? "Itinerary copied" : "Couldn't copy the itinerary");
      } else if (navigator.share) {
        await navigator.share({ title, text: buildShareText(plan), url });
      } else {
        const ok = await copy(url);
        toast[ok ? "success" : "error"](ok ? "Link copied — paste it anywhere" : "Couldn't copy the link");
      }
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") {
        console.error("[Explorion] share failed:", error);
        toast.error("Sharing failed — please try again.");
      }
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  const canNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary hover:text-primary-foreground disabled:opacity-60"
      >
        <Share2 className="size-4" /> Share
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-card p-1.5 text-card-foreground shadow-xl">
          {canNativeShare ? (
            <button
              onClick={() => void run("native")}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-primary/10"
            >
              <Send className="size-4 opacity-70" /> Share via apps
            </button>
          ) : null}
          <button
            onClick={() => void run("link")}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-primary/10"
          >
            <Link2 className="size-4 opacity-70" /> Copy shareable link
          </button>
          <button
            onClick={() => void run("text")}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-primary/10"
          >
            <ClipboardCopy className="size-4 opacity-70" /> Copy itinerary as text
          </button>
          <p className="px-3 py-2 text-[11px] leading-snug opacity-60">
            The link carries the whole plan inside it — anyone with it can view this itinerary.
          </p>
        </div>
      ) : null}
    </div>
  );
}
