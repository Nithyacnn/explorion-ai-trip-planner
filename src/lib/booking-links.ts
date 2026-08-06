import type { TransportModeId } from "@/lib/trip-planner";

const q = (s: string) => encodeURIComponent(s);

export function transportSearchLink(
  mode: TransportModeId,
  origin: string | null,
  destination: string,
): { provider: string; url: string } {
  const from = origin ?? "";
  switch (mode) {
    case "flight":
      return {
        provider: "Google Flights",
        url: `https://www.google.com/travel/flights?q=${q(`flights from ${from} to ${destination}`)}`,
      };
    case "train":
      return {
        provider: "IRCTC",
        url: from
          ? `https://www.google.com/search?q=${q(`IRCTC trains ${from} to ${destination}`)}`
          : `https://www.irctc.co.in/nget/train-search`,
      };
    case "bus":
      return {
        provider: "RedBus",
        url: `https://www.redbus.in/search?fromCityName=${q(from)}&toCityName=${q(destination)}`,
      };
    case "own_vehicle":
      return {
        provider: "Google Maps",
        url: `https://www.google.com/maps/dir/${q(from || "My location")}/${q(destination)}`,
      };
    default:
      return {
        provider: "Google",
        url: `https://www.google.com/search?q=${q(`travel ${from} to ${destination}`)}`,
      };
  }
}

export function staySearchLink(name: string, destination: string) {
  return {
    provider: "Booking.com",
    url: `https://www.booking.com/searchresults.html?ss=${q(`${name} ${destination}`)}`,
  };
}
