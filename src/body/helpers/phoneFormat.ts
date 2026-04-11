/**
 * Format téléphone international : obligatoirement « + » puis chiffres,
 * avec espacement automatique par blocs de 3 (ex. +221 700 123 456).
 */
export function normalizePhoneInput(raw: string): string {
  let s = raw.replace(/[^\d+]/g, "");
  if (!s.startsWith("+")) {
    const digits = s.replace(/\D/g, "");
    s = digits.length ? `+${digits}` : "";
  }
  const digitsOnly = s.slice(1).replace(/\D/g, "");
  if (!digitsOnly) return "+";
  const groups: string[] = [];
  for (let i = 0; i < digitsOnly.length; i += 3) {
    groups.push(digitsOnly.slice(i, i + 3));
  }
  return `+${groups.join(" ")}`;
}

export function isPhoneInternationalValid(value: string): boolean {
  const t = value.trim();
  if (!t.startsWith("+")) return false;
  const digits = t.replace(/\D/g, "");
  return digits.length >= 8;
}

export function phoneOnChangeHandler(
  e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  setter: (v: string) => void
): void {
  const next = normalizePhoneInput(e.target.value);
  setter(next);
}
