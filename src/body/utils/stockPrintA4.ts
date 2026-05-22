function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Format A4 portrait @ 96 px/in — dimensions fixes (pas de mm ni %). */
export const A4_WIDTH_PX = 794;
export const A4_HEIGHT_PX = 1123;
export const A4_PADDING_PX = 20;
export const A4_CONTENT_WIDTH_PX = A4_WIDTH_PX - A4_PADDING_PX * 2;

/** CSS de base : feuille A4 en pixels + zone de contenu. */
export function a4PrintBaseCss(userCss = ""): string {
  return `
@page { size: ${A4_WIDTH_PX}px ${A4_HEIGHT_PX}px; margin: 0; }
html, body {
  margin: 0;
  padding: 0;
  width: ${A4_WIDTH_PX}px;
  background: #f3f4f6;
  font-family: system-ui, -apple-system, sans-serif;
}
.print-a4-viewport {
  width: ${A4_WIDTH_PX}px;
  min-height: ${A4_HEIGHT_PX}px;
  margin: 0 auto;
  padding: 12px 0;
  box-sizing: border-box;
}
.print-a4-sheet {
  width: ${A4_WIDTH_PX}px;
  height: ${A4_HEIGHT_PX}px;
  box-sizing: border-box;
  background: #fff;
  overflow: hidden;
  position: relative;
  box-shadow: 0 0 0 1px #d9d9d9;
}
.print-a4-content {
  width: ${A4_CONTENT_WIDTH_PX}px;
  min-height: ${A4_HEIGHT_PX - A4_PADDING_PX * 2}px;
  padding: ${A4_PADDING_PX}px;
  box-sizing: border-box;
  transform-origin: top left;
}
${userCss}
@media print {
  html, body { background: #fff; padding: 0; width: ${A4_WIDTH_PX}px; }
  .print-a4-viewport { padding: 0; }
  .print-a4-sheet { box-shadow: none; }
}
`.trim();
}

/** Ajuste le contenu pour tenir dans la feuille A4 (échelle ≤ 1, origine en haut à gauche). */
export function a4FitScaleScript(): string {
  return `<script>
(function(){
  function fit(){
    var sheet=document.querySelector(".print-a4-sheet");
    var el=document.querySelector(".print-a4-content");
    if(!sheet||!el)return;
    el.style.transform="none";
    el.style.width="${A4_CONTENT_WIDTH_PX}px";
    var sw=${A4_WIDTH_PX}, sh=${A4_HEIGHT_PX};
    var cw=el.scrollWidth, ch=el.scrollHeight;
    if(cw<1||ch<1)return;
    var s=Math.min(1, sw/cw, sh/ch);
    if(s<0.999){
      el.style.transform="scale("+s+")";
      sheet.style.height=Math.max(${A4_HEIGHT_PX}, Math.ceil(ch*s))+"px";
    } else {
      sheet.style.height="${A4_HEIGHT_PX}px";
    }
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",fit);
  else fit();
  window.addEventListener("beforeprint",fit);
})();
</script>`;
}

export function buildA4HtmlDocument(
  title: string,
  bodyHtml: string,
  userCss = "",
  opts?: { preview?: boolean },
): string {
  const css = a4PrintBaseCss(userCss);
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title><style>${css}</style></head><body><div class="print-a4-viewport"><div class="print-a4-sheet"><div class="print-a4-content">${bodyHtml}</div></div></div>${a4FitScaleScript()}</body></html>`;
}

/** Enveloppe le HTML d’un modèle (corps + CSS utilisateur). */
export function wrapPrintModelHtml(htmlBody: string, cssContent: string): string {
  return buildA4HtmlDocument("Aperçu", htmlBody, cssContent, { preview: true });
}

/** Même logique que le script d’aperçu / impression (export PDF hors navigateur). */
export function applyA4FitScaleToElement(root: HTMLElement): void {
  const sheet = root.querySelector(".print-a4-sheet") as HTMLElement | null;
  const el = root.querySelector(".print-a4-content") as HTMLElement | null;
  if (!sheet || !el) return;
  el.style.transform = "none";
  el.style.width = `${A4_CONTENT_WIDTH_PX}px`;
  const cw = el.scrollWidth;
  const ch = el.scrollHeight;
  if (cw < 1 || ch < 1) return;
  const s = Math.min(1, A4_WIDTH_PX / cw, A4_HEIGHT_PX / ch);
  if (s < 0.999) {
    el.style.transform = `scale(${s})`;
    sheet.style.height = `${Math.max(A4_HEIGHT_PX, Math.ceil(ch * s))}px`;
  } else {
    sheet.style.height = `${A4_HEIGHT_PX}px`;
  }
}
