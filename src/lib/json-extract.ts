/**
 * Pull the first JSON object out of a model response, tolerating markdown code
 * fences, stray prose before/after, and smart quotes.
 */
export function extractJson(text: string): unknown {
  if (!text) return null;

  let candidate = text.trim();

  // Strip ```json ... ``` fences if present.
  const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) candidate = fence[1].trim();

  // Trim anything before the first { and after the last }.
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  candidate = candidate.slice(start, end + 1);

  try {
    return JSON.parse(candidate);
  } catch {
    // Last resort: drop trailing commas and retry once.
    try {
      return JSON.parse(candidate.replace(/,\s*([}\]])/g, "$1"));
    } catch {
      return null;
    }
  }
}
