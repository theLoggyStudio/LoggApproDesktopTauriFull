/**
 * Mode aperçu : évite le chevauchement entre textes, variables, tableaux et formes.
 * Les images restent en calques absolus (non déplacées par ce module).
 */

import type { Element } from '../PageEtat.js';

const GAP_PX = 8;

function isFunctional(el: Element): boolean {
  return (
    el.type === 'text' ||
    el.type === 'variable' ||
    el.type === 'table' ||
    el.type === 'shape'
  );
}

function rectsOverlap(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number }
): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** Estimation conservative de la hauteur pour détecter les collisions (évite les chevauchements visuels). */
export function estimateFunctionalBlockHeight(el: Element): number {
  const minH = 28;
  if (el.type === 'table') {
    const rows = el.tableData?.length ?? 0;
    const hasHeader = (el.tableColumns?.length ?? 0) > 0;
    const titleH = el.content || el.tableNumber ? 32 : 0;
    const headerH = hasHeader ? 40 : 0;
    const estimated = titleH + headerH + Math.max(rows, 1) * 38 + 20;
    return Math.max(el.height ?? 0, estimated, minH);
  }
  if (el.type === 'shape') {
    return Math.max(el.height ?? minH, minH);
  }
  const fs = el.fontSize ?? 14;
  const w = Math.max(80, el.width ?? 200);
  const pad = 12;
  if (el.type === 'text' || el.type === 'variable') {
    if (el.heightByContent) {
      const content = el.content ?? '';
      const explicitLines = (content.match(/\n/g) || []).length + 1;
      const charsPerLine = Math.max(16, Math.floor((w - pad) / (fs * 0.55)));
      const wrappedLines = Math.ceil(Math.max(content.length, 1) / charsPerLine);
      const totalLines = Math.max(explicitLines, wrappedLines);
      return Math.max(minH, totalLines * fs * 1.38 + pad);
    }
    return Math.max(el.height ?? minH, minH);
  }
  return el.height ?? minH;
}

/**
 * Retourne une copie des éléments avec `y` augmenté pour les blocs fonctionnels
 * afin de supprimer les chevauchements (ordre de traitement : y croissant, puis x, puis ordre d’origine).
 */
export function applyPreviewFunctionalOffsets(elements: Element[]): Element[] {
  if (elements.length === 0) return elements;

  const indexed = elements.map((el, i) => ({ el, i }));
  const functional = indexed.filter(({ el }) => isFunctional(el));
  functional.sort((a, b) => {
    if (a.el.y !== b.el.y) return a.el.y - b.el.y;
    if (a.el.x !== b.el.x) return a.el.x - b.el.x;
    return a.i - b.i;
  });

  const dyById = new Map<string, number>();
  const placed: { left: number; top: number; right: number; bottom: number }[] = [];

  for (const { el } of functional) {
    const w = el.width;
    const h = estimateFunctionalBlockHeight(el);
    const left = el.x;
    let finalTop = el.y;
    let guard = 0;
    while (guard++ < 500) {
      const rect = {
        left,
        top: finalTop,
        right: left + w,
        bottom: finalTop + h,
      };
      let maxPush = 0;
      for (const p of placed) {
        if (rectsOverlap(rect, p)) {
          const need = p.bottom + GAP_PX - finalTop;
          if (need > maxPush) maxPush = need;
        }
      }
      if (maxPush <= 0) break;
      finalTop += maxPush;
    }
    dyById.set(el.id, finalTop - el.y);
    placed.push({
      left,
      top: finalTop,
      right: left + w,
      bottom: finalTop + h,
    });
  }

  return elements.map((el) => {
    if (!isFunctional(el)) return el;
    const dy = dyById.get(el.id) ?? 0;
    if (dy === 0) return el;
    return { ...el, y: el.y + dy };
  });
}
