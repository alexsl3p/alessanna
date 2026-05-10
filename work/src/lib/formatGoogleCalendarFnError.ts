/** Human-readable error from `google-calendar-sync` (website_booking, test_event, …). */

export function formatGoogleCalendarFnError(data: unknown, fallback = "Запись не создана."): string {
  if (!data || typeof data !== "object") return fallback;
  const d = data as Record<string, unknown>;
  const err = d.error != null && String(d.error).trim() !== "" ? String(d.error) : fallback;
  const g = d.google as { httpStatus?: number; body?: unknown } | undefined;
  if (!g) return err;
  const bodyStr =
    g.body === undefined
      ? ""
      : typeof g.body === "string"
        ? g.body
        : JSON.stringify(g.body, null, 2);
  return [err, g.httpStatus != null ? `HTTP ${g.httpStatus}` : null, bodyStr.trim() ? bodyStr : null]
    .filter(Boolean)
    .join("\n\n");
}
