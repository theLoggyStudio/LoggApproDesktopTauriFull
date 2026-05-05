export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function sortByIsoDate<T>(rows: T[], key: keyof T, order: "asc" | "desc"): T[] {
  const mul = order === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const ta = new Date(String(a[key])).getTime();
    const tb = new Date(String(b[key])).getTime();
    const na = Number.isNaN(ta) ? 0 : ta;
    const nb = Number.isNaN(tb) ? 0 : tb;
    return (na - nb) * mul;
  });
}

export function sortByNumber<T>(rows: T[], key: keyof T, order: "asc" | "desc"): T[] {
  const mul = order === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const na = Number(a[key]);
    const nb = Number(b[key]);
    const x = Number.isFinite(na) ? na : 0;
    const y = Number.isFinite(nb) ? nb : 0;
    return (x - y) * mul;
  });
}

export function buildPrintTableHtml(title: string, headers: string[], bodyRows: string[][]): string {
  const h = headers.map((x) => `<th>${escapeHtml(x)}</th>`).join("");
  const rows = bodyRows
    .map((cells) => `<tr>${cells.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
    .join("");
  return `<h2 style="font-size:15px;margin-top:18px;text-decoration:underline">${escapeHtml(title)}</h2><table><thead><tr>${h}</tr></thead><tbody>${rows}</tbody></table>`;
}

/** Ouvre une fenêtre d’impression avec le HTML fourni (tableaux, titres). */
export function printHtmlPage(documentTitle: string, innerHtml: string): boolean {
  const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
  if (!w) return false;
  const css = `body{font-family:system-ui,-apple-system,sans-serif;padding:16px;font-size:13px} h1{font-size:18px;margin:0 0 12px} table{border-collapse:collapse;width:100%;margin-top:8px} th,td{border:1px solid #ccc;padding:6px 8px;text-align:left} th{background:#f0f0f0}`;
  w.document.write(
    `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(documentTitle)}</title><style>${css}</style></head><body><h1>${escapeHtml(documentTitle)}</h1>`,
  );
  w.document.write(innerHtml);
  w.document.write("</body></html>");
  w.document.close();
  w.focus();
  try {
    w.print();
  } catch {
    /* ignore */
  }
  return true;
}

/** Document HTML complet (balises head/body/styles) — ouverture puis impression. */
export function printFullHtmlDocument(fullDocumentHtml: string): boolean {
  const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
  if (!w) return false;
  w.document.open();
  w.document.write(fullDocumentHtml);
  w.document.close();
  w.focus();
  try {
    w.print();
  } catch {
    /* ignore */
  }
  return true;
}

function sanitizePdfFileName(raw: string): string {
  const base = (raw || "export").trim().replace(/[\\/:*?"<>|]+/g, "_");
  const compact = base.replace(/\s+/g, " ").trim();
  return (compact || "export") + ".pdf";
}

async function htmlToPdfBlobNoMargin(root: HTMLElement): Promise<Blob> {
  const html2canvas = (await import("html2canvas")).default;
  const { jsPDF } = await import("jspdf");
  const canvas = await html2canvas(root, {
    backgroundColor: "#ffffff",
    scale: 2,
    useCORS: true,
    logging: false,
  });
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const imgW = pageW;
  const imgH = (canvas.height * imgW) / canvas.width;

  let rendered = 0;
  let pageIndex = 0;
  while (rendered < imgH - 0.5) {
    if (pageIndex > 0) doc.addPage();
    const sY = (rendered / imgH) * canvas.height;
    const sH = Math.min(((pageH / imgH) * canvas.height), canvas.height - sY);
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = Math.max(1, Math.floor(sH));
    const ctx = pageCanvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(canvas, 0, sY, canvas.width, sH, 0, 0, canvas.width, sH);
      const data = pageCanvas.toDataURL("image/png");
      const drawH = (pageCanvas.height * imgW) / pageCanvas.width;
      doc.addImage(data, "PNG", 0, 0, imgW, drawH, undefined, "FAST");
    }
    rendered += pageH;
    pageIndex += 1;
  }
  return doc.output("blob");
}

function saveBlobAsPdf(blob: Blob, fileName: string): string {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  return fileName;
}

/** Exporte un tableau HTML (innerHtml) en PDF téléchargeable. */
export async function exportHtmlPagePdf(documentTitle: string, innerHtml: string): Promise<string | false> {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "0";
  host.style.top = "0";
  host.style.width = "210mm";
  host.style.minHeight = "297mm";
  host.style.opacity = "0.01";
  host.style.pointerEvents = "none";
  host.style.zIndex = "-1";
  host.innerHTML = `
    <style>
      *{box-sizing:border-box}
      body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:0;font-size:13px}
      .a4{width:210mm;min-height:297mm;background:#fff;padding:0;margin:0}
      h1{font-size:18px;margin:0 0 12px}
      table{border-collapse:collapse;width:100%;margin-top:8px}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
      th{background:#f0f0f0}
    </style>
    <div class="a4">
      ${innerHtml}
    </div>
  `;
  document.body.appendChild(host);
  try {
    const blob = await htmlToPdfBlobNoMargin(host);
    return saveBlobAsPdf(blob, sanitizePdfFileName(documentTitle));
  } catch {
    return false;
  } finally {
    host.remove();
  }
}

/** Exporte un document HTML complet en PDF téléchargeable. */
export async function exportFullHtmlDocumentPdf(documentTitle: string, fullDocumentHtml: string): Promise<string | false> {
  const styleMatch = fullDocumentHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  const bodyMatch = fullDocumentHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const style = styleMatch?.[1] ?? "";
  const body = bodyMatch?.[1] ?? fullDocumentHtml;
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "0";
  host.style.top = "0";
  host.style.width = "210mm";
  host.style.minHeight = "297mm";
  host.style.opacity = "0.01";
  host.style.pointerEvents = "none";
  host.style.zIndex = "-1";
  host.innerHTML = `<style>*{box-sizing:border-box} body{margin:0;padding:0} .a4{width:210mm;min-height:297mm;margin:0;padding:0;background:#fff} ${style}</style><div class="a4">${body}</div>`;
  document.body.appendChild(host);
  try {
    const blob = await htmlToPdfBlobNoMargin(host);
    return saveBlobAsPdf(blob, sanitizePdfFileName(documentTitle));
  } catch {
    return false;
  } finally {
    host.remove();
  }
}
