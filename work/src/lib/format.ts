export function eurFromCents(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

/** `earnings.amount` is stored as euros (numeric), not cents. */
export function eurFromEuroAmount(amount: number): string {
  return Number(amount).toFixed(2).replace(".", ",") + " €";
}

/** Format a price (or range) in euros. Shows integers without decimals.
 *  Examples: 8 → "8 €", 15.5 → "15,50 €", 15 + 25 → "15–25 €" */
export function formatPriceEur(minCents: number, maxCents?: number | null): string {
  const fmt = (c: number) => {
    const e = c / 100;
    return Number.isInteger(e) ? String(e) : e.toFixed(2).replace(".", ",");
  };
  if (maxCents && maxCents > minCents) {
    return `${fmt(minCents)}–${fmt(maxCents)} €`;
  }
  return `${fmt(minCents)} €`;
}
