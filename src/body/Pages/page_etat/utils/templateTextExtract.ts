/** Extrait le texte brut d’un modèle Page État (éléments canvas) pour export PDF. */

function stripHtml(s: string): string {
  if (typeof document === "undefined") return s.replace(/<[^>]+>/g, " ");
  const d = document.createElement("div");
  d.innerHTML = s;
  return (d.textContent || d.innerText || "").replace(/\s+/g, " ").trim();
}

export function extractTextFromTemplateElements(elements: unknown): string {
  if (!elements) return "";
  if (typeof elements === "string") return elements;
  if (!Array.isArray(elements)) {
    const o = elements as Record<string, unknown>;
    if (o.content != null) return String(o.content);
    if (o.html) return stripHtml(String(o.html));
    if (o.text) return String(o.text);
    if (o.children) return extractTextFromTemplateElements(o.children);
    return "";
  }
  return elements.map((el) => extractTextFromTemplateElements(el)).filter(Boolean).join("\n");
}
