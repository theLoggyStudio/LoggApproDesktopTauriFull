/** Valeurs stockées côté base pour `payment_period` des emplacements. */
export type StockLocationPaymentPeriodKey =
  | ""
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "yearly"
  | "one_time";

export function labelForPaymentPeriod(
  key: string,
  L: string[],
): string {
  const k = (key ?? "").trim();
  switch (k) {
    case "monthly":
      return L[19] ?? k;
    case "quarterly":
      return L[20] ?? k;
    case "semiannual":
      return L[21] ?? k;
    case "yearly":
      return L[22] ?? k;
    case "one_time":
      return L[23] ?? k;
    default:
      return L[18] ?? "—";
  }
}

export function paymentPeriodSelectOptions(L: string[]) {
  return [
    { value: "" as const, label: L[18] ?? "—" },
    { value: "monthly" as const, label: L[19] ?? "Mensuel" },
    { value: "quarterly" as const, label: L[20] ?? "Trimestriel" },
    { value: "semiannual" as const, label: L[21] ?? "Semestriel" },
    { value: "yearly" as const, label: L[22] ?? "Annuel" },
    { value: "one_time" as const, label: L[23] ?? "Ponctuel" },
  ];
}
