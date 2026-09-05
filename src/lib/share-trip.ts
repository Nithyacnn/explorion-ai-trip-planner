import { formatINR, type TripPlan } from "@/lib/trip-planner";
import { normalizePlan } from "@/lib/plan-guard";

/** Plain-text summary of a plan, for messaging apps / clipboard. */
export function buildShareText(plan: TripPlan): string {
  const lines: string[] = [];
  lines.push(`${plan.days} days in ${plan.destination}`);
  const meta = [
    plan.origin ? `From ${plan.origin}` : null,
    plan.travelDates?.startDate ?? plan.month,
    plan.travelerCount ? `${plan.travelerCount} traveller(s)` : null,
    `${formatINR(plan.budget)} per person`,
  ].filter(Boolean);
  lines.push(meta.join(" · "));
  lines.push("");

  const modes = Array.isArray(plan.transport?.modes) ? plan.transport.modes : [];
  if (modes.length) {
    lines.push("Getting there:");
    for (const m of modes) {
      lines.push(`- ${m.label}: ${formatINR(m.min)}–${formatINR(m.max)} (${m.duration})`);
    }
    lines.push("");
  }

  const stay = plan.stayOptions?.[0];
  if (stay) {
    lines.push(`Stay idea: ${stay.name} — ${formatINR(stay.pricePerNight)}/night · ${stay.rating}★`);
    lines.push("");
  }

  for (const day of plan.itinerary ?? []) {
    lines.push(`Day ${day.day} — ${day.title}`);
    for (const slot of day.slots ?? []) {
      const stops = (slot.stops ?? []).map((s) => s.activity).filter(Boolean);
      if (stops.length) lines.push(`  ${slot.label}: ${stops.join(" → ")}`);
    }
    lines.push("");
  }

  lines.push("Planned with Explorion");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

const toBase64Url = (bytes: Uint8Array) => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (value: string) => {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  const bin = atob(value.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

const MAX_TOKEN_CHARS = 200_000; // ~150 KB compressed — far beyond any real plan
const MAX_DECODED_BYTES = 2_000_000; // guards against decompression bombs in the URL hash

async function collect(stream: ReadableStream<Uint8Array>, limit = Infinity) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new Error("Shared trip payload is too large");
      }
    }
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** Encode a plan into a URL-safe token (gzip when the browser supports it). */
export async function encodeSharedPlan(plan: TripPlan): Promise<string> {
  const slim: TripPlan = { ...plan };
  delete slim.debugRaw;
  const json = JSON.stringify(slim);
  const bytes = new TextEncoder().encode(json);
  if (typeof CompressionStream !== "undefined") {
    try {
      const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"));
      return `1${toBase64Url(await collect(stream))}`;
    } catch {
      /* fall through */
    }
  }
  return `0${toBase64Url(bytes)}`;
}

/** Decode a token produced by encodeSharedPlan. Returns null when unreadable. */
export async function decodeSharedPlan(token: string): Promise<TripPlan | null> {
  try {
    if (!token || token.length > MAX_TOKEN_CHARS) return null;
    const mode = token.slice(0, 1);
    if (mode !== "0" && mode !== "1") return null;
    const bytes = fromBase64Url(token.slice(1));
    let json: string;
    if (mode === "1") {
      const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
      json = new TextDecoder().decode(await collect(stream, MAX_DECODED_BYTES));
    } else {
      json = new TextDecoder().decode(bytes);
    }
    // Everything in the token is untrusted: sanitise before it reaches the dashboard.
    return normalizePlan(JSON.parse(json));
  } catch (error) {
    console.error("[Explorion] shared trip could not be read:", error);
    return null;
  }
}

export async function buildShareUrl(plan: TripPlan): Promise<string> {
  const token = await encodeSharedPlan(plan);
  return `${window.location.origin}/shared#t=${token}`;
}
