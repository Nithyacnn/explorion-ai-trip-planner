import { formatINR, type TripPlan } from "@/lib/trip-planner";

const money = (n: number) => formatINR(n).replace(/₹/g, "Rs. ");

const NAVY: [number, number, number] = [11, 19, 43];
const GOLD: [number, number, number] = [166, 130, 30];
const INK: [number, number, number] = [40, 44, 58];
const MUTED: [number, number, number] = [110, 116, 132];

/** Build a printable PDF document of the trip plan. */
export async function buildTripPdf(plan: TripPlan) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 48;
  const W = pageW - M * 2;
  let y = 0;

  const space = (need: number) => {
    if (y + need > pageH - 56) {
      doc.addPage();
      y = M;
    }
  };

  const text = (
    value: string,
    opts: { size?: number; bold?: boolean; color?: [number, number, number]; indent?: number; gap?: number } = {},
  ) => {
    const { size = 10, bold = false, color = INK, indent = 0, gap = 4 } = opts;
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(value, W - indent) as string[];
    for (const line of lines) {
      space(size + gap);
      doc.text(line, M + indent, y + size);
      y += size + gap;
    }
  };

  const heading = (value: string) => {
    space(40);
    y += 10;
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(1.5);
    doc.line(M, y, M + 26, y);
    y += 8;
    text(value.toUpperCase(), { size: 11, bold: true, color: GOLD, gap: 8 });
  };

  // Cover band
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageW, 132, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(212, 175, 55);
  doc.text("EXPLORION", M, 44);
  doc.setFontSize(24);
  doc.setTextColor(255, 255, 255);
  doc.text(doc.splitTextToSize(`${plan.days} days in ${plan.destination}`, W) as string[], M, 76);
  const meta = [
    plan.origin ? `From ${plan.origin}` : null,
    plan.travelDates?.startDate
      ? [plan.travelDates.startDate, plan.travelDates.endDate].filter(Boolean).join(" - ")
      : plan.month,
    plan.travelerCount ? `${plan.travelerCount} traveller${plan.travelerCount > 1 ? "s" : ""}` : null,
    `${money(plan.budget)} per person`,
  ].filter(Boolean) as string[];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(215, 220, 232);
  doc.text(meta.join("  ·  "), M, 104);

  y = 160;

  if (plan.vibe) text(plan.vibe, { size: 10, color: MUTED, gap: 6 });

  const modes = Array.isArray(plan.transport?.modes) ? plan.transport.modes : [];
  if (modes.length) {
    heading("Getting there");
    for (const m of modes) {
      text(`${m.label} — ${money(m.min)} to ${money(m.max)} · ${m.duration}`, { bold: true, indent: 4, gap: 2 });
      if (m.notes) text(m.notes, { size: 9, color: MUTED, indent: 14, gap: 6 });
    }
    if (plan.transport?.recommendedReason) {
      text(`Recommended: ${plan.transport.recommendedMode} — ${plan.transport.recommendedReason}`, {
        size: 9,
        color: MUTED,
        indent: 4,
        gap: 6,
      });
    }
  }

  if (plan.stayOptions?.length) {
    heading("Where to stay");
    for (const s of plan.stayOptions) {
      text(`${s.name} (${s.type}) — ${money(s.pricePerNight)}/night · ${s.rating} star`, {
        bold: true,
        indent: 4,
        gap: 2,
      });
      if (s.why) text(s.why, { size: 9, color: MUTED, indent: 14, gap: 6 });
    }
  }

  if (plan.itinerary?.length) {
    heading("Day-by-day itinerary");
    for (const day of plan.itinerary) {
      space(48);
      text(`Day ${day.day} — ${day.title}`, { size: 12, bold: true, color: NAVY, gap: 5 });
      for (const slot of day.slots ?? []) {
        const stops = (slot.stops ?? []).filter((s) => s.activity);
        if (!stops.length) continue;
        text(slot.label, { size: 9, bold: true, color: GOLD, indent: 6, gap: 3 });
        for (const stop of stops) {
          const travel = stop.travelTimeFromPrevious ? ` — ${stop.travelTimeFromPrevious} away` : "";
          text(`• ${stop.activity}${stop.optional ? " (optional)" : ""}${travel}`, { indent: 14, gap: 2 });
          if (stop.why) text(stop.why, { size: 9, color: MUTED, indent: 26, gap: 4 });
        }
        y += 2;
      }
      y += 6;
    }
  }

  if (plan.budgetBreakdown?.length) {
    heading("Budget breakdown (per person)");
    for (const row of plan.budgetBreakdown) {
      space(20);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...INK);
      doc.text(`${row.label}`, M + 4, y + 10);
      doc.text(`${money(row.amount)}  (${row.pct}%)`, pageW - M, y + 10, { align: "right" });
      y += 15;
      doc.setFillColor(232, 234, 240);
      doc.roundedRect(M + 4, y, W - 8, 4, 2, 2, "F");
      doc.setFillColor(...GOLD);
      doc.roundedRect(M + 4, y, Math.max(2, ((W - 8) * Math.min(100, row.pct)) / 100), 4, 2, 2, "F");
      y += 14;
    }
    space(24);
    text(`Total — ${money(plan.budget)} per person`, { size: 11, bold: true, color: NAVY, gap: 6 });
  }

  const visa = plan.visa;
  if (plan.international && visa) {
    heading("Visa");
    text(visa.required ? `Required — ${visa.type.replace(/_/g, " ")}` : "No visa required", { bold: true, indent: 4 });
    if (visa.estimatedCost)
      text(`Estimated cost: ${visa.estimatedCost.low}-${visa.estimatedCost.high} ${visa.estimatedCost.currency}`, {
        indent: 4,
      });
    if (visa.processingTime) text(`Processing time: ${visa.processingTime}`, { indent: 4 });
    if (visa.applyBy) text(`Apply by: ${visa.applyBy}`, { indent: 4 });
    if (visa.howToApply) text(visa.howToApply, { size: 9, color: MUTED, indent: 4, gap: 6 });
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("Planned with Explorion · estimates only, prices vary by date and availability", M, pageH - 28);
    doc.text(`${i} / ${pages}`, pageW - M, pageH - 28, { align: "right" });
  }

  const slug = `${plan.destination}-${plan.days}-days`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return { doc, filename: `explorion-${slug || "trip"}.pdf` };
}

/** Build and download a printable PDF of the trip plan. */
export async function downloadTripPdf(plan: TripPlan) {
  const { doc, filename } = await buildTripPdf(plan);
  doc.save(filename);
}
