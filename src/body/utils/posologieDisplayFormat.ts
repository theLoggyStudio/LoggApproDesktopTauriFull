/**
 * Formatage affichage posologie / ordonnance (partagé ModalPosologie, fiche acte, etc.)
 */
import { format, isValid, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

export function parseActeDateLoose(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  if (s.includes("T")) {
    const d = parseISO(s);
    if (isValid(d)) return d;
  }
  const ymd = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const d = parseISO(ymd);
    if (isValid(d)) return d;
  }
  const d2 = new Date(s);
  return isValid(d2) ? d2 : null;
}

/** Libellé : [<date acte>] <nom> — actes patient (tab_acte). */
export function formatActePatientOptionLabel(a: { nom: string; date?: string }): string {
  const nom = (a.nom || "").trim() || "—";
  const raw = (a.date || "").trim();
  if (!raw) return nom;
  const d = parseActeDateLoose(raw);
  const short = d ? format(d, "dd/MM/yyyy", { locale: fr }) : raw.split(/\s|T/)[0] || raw;
  return `[${short}] ${nom}`;
}

export type PosologieLineLike = {
  acteId: string;
  medicamentId: string;
  nombreBoites?: number;
  quantite?: number;
  heures?: string[];
};

/** Évite les doublons si l’agrégation par acte renvoie les mêmes lignes plusieurs fois. */
export function dedupePosologieLinesLike(lines: PosologieLineLike[]): PosologieLineLike[] {
  const seen = new Set<string>();
  const out: PosologieLineLike[] = [];
  for (const L of lines) {
    const key = [
      String(L.acteId),
      String(L.medicamentId),
      String(L.nombreBoites ?? 1),
      String(L.quantite ?? 1),
      [...(L.heures || [])].sort().join(","),
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(L);
  }
  return out;
}

type MedRef = { id: string; nom: string; forme?: string };

/** Même caractère que dans {@link parsePosologieTextBulletsToLines} (`U+00B7`). */
const POSOLOGIE_MIDDLE_DOT = "\u00B7";

export function formatPosologieText(
  lines: PosologieLineLike[],
  actes: { id: string; label: string }[],
  meds: { id: string; nom: string }[]
): string {
  const rows: string[] = [];
  for (const L of lines) {
    if (!L.acteId || !L.medicamentId) continue;
    const an = actes.find((a) => a.id === L.acteId)?.label ?? L.acteId;
    const mn = meds.find((m) => m.id === L.medicamentId)?.nom ?? L.medicamentId;
    const hh = (L.heures || []).filter((h) => /^\d{1,2}:\d{2}$/.test((h || "").trim()));
    const slots = hh.map((h) => h.trim().replace(":", "h"));
    const prises = slots.length ? slots.join(", ") : "—";
    const nb = Math.max(1, L.nombreBoites ?? 1);
    const boites = nb === 1 ? "1 boîte" : `${nb} boîtes`;
    rows.push(`• ${an} — ${mn} ${POSOLOGIE_MIDDLE_DOT} ${boites} ${POSOLOGIE_MIDDLE_DOT} × ${L.quantite ?? 1} (${prises})`);
  }
  return rows.join("\n");
}

/**
 * Reconstruit des lignes posologie à partir du texte produit par {@link formatPosologieText}
 * (lignes commençant par « • », segments séparés par ` · `).
 * Utilisé pour ré-enregistrer après édition libre dans un textarea (ex. panneau paiement).
 */
export function parsePosologieTextBulletsToLines(
  text: string,
  opts: {
    defaultActeId: string;
    meds: { id: string; nom: string }[];
  }
): PosologieLineLike[] {
  const acteId = String(opts.defaultActeId ?? "").trim();
  if (!acteId) return [];

  const resolveMedicamentId = (rawName: string): string | null => {
    const t = rawName.trim();
    if (!t) return null;
    const lower = t.toLowerCase();
    const exact = opts.meds.find((m) => m.nom.trim().toLowerCase() === lower);
    if (exact) return exact.id;
    const paren = /^(.+?)\s*\(([^)]+)\)\s*$/.exec(t);
    if (paren) {
      const base = paren[1].trim().toLowerCase();
      const m = opts.meds.find((x) => x.nom.trim().toLowerCase() === base);
      if (m) return m.id;
    }
    return null;
  };

  const out: PosologieLineLike[] = [];
  const rawLines = String(text ?? "").split(/\r?\n/);
  const sep = new RegExp(`\\s*${POSOLOGIE_MIDDLE_DOT}\\s*`);

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "—") continue;
    let rest = trimmed.startsWith("•") ? trimmed.slice(1).trim() : trimmed;

    let prises: string[] = [];
    const parenM = /\(([^)]*)\)\s*$/.exec(rest);
    if (parenM) {
      const inner = parenM[1].trim();
      rest = rest.slice(0, parenM.index).trim();
      if (inner && inner !== "—") {
        prises = inner
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((h) => {
            const hm = /^(\d{1,2})h$/.exec(h);
            if (hm) return `${hm[1].padStart(2, "0")}:00`;
            if (/^\d{1,2}:\d{2}$/.test(h)) return h;
            return h;
          });
      }
    }

    const parts = rest.split(sep).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 3) continue;

    const head = parts[0];
    const boiteStr = parts[1];
    const qStr = parts[2];
    const lastSep = head.lastIndexOf(" — ");
    if (lastSep < 0) continue;
    const medName = head.slice(lastSep + 3).trim();
    const medicamentId = resolveMedicamentId(medName);
    if (!medicamentId) continue;

    const nbMatch = /(\d+)/.exec(boiteStr);
    const nombreBoites = nbMatch ? Math.max(1, parseInt(nbMatch[1], 10) || 1) : 1;
    const qMatch = /×\s*(\d+)/.exec(qStr);
    const quantite = qMatch ? Math.max(1, parseInt(qMatch[1], 10) || 1) : 1;

    out.push({
      acteId,
      medicamentId,
      nombreBoites,
      quantite,
      heures: prises.length ? prises : [],
    });
  }

  return dedupePosologieLinesLike(out);
}

export function formatOrdonnanceTextFromPosologieTable(
  lines: PosologieLineLike[],
  actes: { id: string; label: string }[],
  meds: MedRef[]
): string {
  const achat: string[] = [];
  let n = 0;
  for (const L of lines) {
    if (!L.medicamentId) continue;
    const m = meds.find((x) => String(x.id) === String(L.medicamentId));
    const mn = m?.nom?.trim() || L.medicamentId;
    const forme = (m?.forme ?? "").trim();
    const libelle = forme ? `${mn} (${forme})` : mn;
    const nb = Math.max(1, L.nombreBoites ?? 1);
    n += 1;
    achat.push(`${n}. ${libelle} — ${nb} boîte${nb > 1 ? "s" : ""} à acheter`);
  }

  if (achat.length === 0) {
    return [
      "MÉDICAMENTS ET BOÎTES À ACHETER",
      "(saisissez au moins un médicament dans le tableau de posologie ci-dessus.)",
      "",
      "—",
    ].join("\n");
  }

  let detail = formatPosologieText(
    lines,
    actes,
    meds.map((x) => ({ id: x.id, nom: x.nom }))
  );
  const medSansActe = lines.filter((L) => L.medicamentId && !L.acteId);
  if (medSansActe.length > 0) {
    const extra: string[] = [];
    for (const L of medSansActe) {
      const m = meds.find((x) => String(x.id) === String(L.medicamentId));
      const mn = m?.nom?.trim() || L.medicamentId;
      const forme = (m?.forme ?? "").trim();
      const libelle = forme ? `${mn} (${forme})` : mn;
      const nb = Math.max(1, L.nombreBoites ?? 1);
      const hh = (L.heures || []).filter((h) => /^\d{1,2}:\d{2}$/.test((h || "").trim()));
      const slots = hh.map((h) => h.trim().replace(":", "h"));
      const prises = slots.length ? slots.join(", ") : "—";
      extra.push(
        `• (acte non renseigné) — ${libelle} ${POSOLOGIE_MIDDLE_DOT} ${nb} boîte${nb > 1 ? "s" : ""} ${POSOLOGIE_MIDDLE_DOT} × ${L.quantite ?? 1} (${prises})`
      );
    }
    detail = [detail.trim(), "", "— Lignes sans acte sélectionné —", ...extra].filter((x) => x !== "").join("\n");
  }

  return [
    "MÉDICAMENTS ET BOÎTES À ACHETER",
    "(déduit automatiquement du tableau de posologie — colonne « Nbre boîtes »)",
    "",
    ...achat,
    "",
    "DÉTAIL POSOLOGIE (acte, dose par prise, heures)",
    "",
    detail.trim() || "—",
  ].join("\n");
}

/** Normalise une ligne renvoyée par l’API (snake_case ou champs alternatifs). */
export function normalizePosologieLineFromApi(raw: any): PosologieLineLike | null {
  if (!raw || typeof raw !== "object") return null;
  const medicamentId = String(raw.medicamentId ?? raw.medicament_id ?? "").trim();
  if (!medicamentId) return null;
  const acteId = String(raw.acteId ?? raw.acte_id ?? "").trim();
  const heuresRaw = raw.heures ?? raw.heures_prises ?? raw.hours;
  const heures = Array.isArray(heuresRaw)
    ? heuresRaw.map((h: any) => String(h ?? "").trim()).filter(Boolean)
    : [];
  return {
    acteId,
    medicamentId,
    nombreBoites: Math.max(1, Number(raw.nombreBoites ?? raw.nombre_boites ?? 1) || 1),
    quantite: Math.max(1, Number(raw.quantite ?? raw.quantite_prise ?? 1) || 1),
    heures,
  };
}

export type ActePreviewForEtat = {
  id: string;
  nom: string;
  date: string;
  description?: string;
  prix?: string;
};

/** Actes uniques des lignes de posologie → variables `{{acte.*}}` sur la Page État. */
/** Première ligne « bullet » (format {@link formatPosologieText}) pour variables Page État. */
export type ParsedPosologieBulletFirst = {
  acte: string;
  medicament: string;
  boites: string;
  dose: string;
  prises: string;
};

/**
 * Extrait acte, médicament, boîtes, dose (× n) et prises depuis le texte posologie (1re ligne valide).
 * Ex. : `• [07/04/2026] consultation — Efferalgan · 1 boîte · × 3 (08h00, 12h00)`
 */
export function parseFirstPosologieBulletForEtat(text: string): ParsedPosologieBulletFirst | null {
  const lines = String(text ?? "").split(/\r?\n/);
  const sep = new RegExp(`\\s*${POSOLOGIE_MIDDLE_DOT}\\s*`);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("•")) continue;
    const withoutBullet = trimmed.replace(/^\s*•\s*/, "").trim();
    const dashParts = withoutBullet.split(/\s*—\s*/);
    if (dashParts.length < 2) continue;
    const acte = dashParts[0]!.trim();
    const tail = dashParts.slice(1).join(" — ").trim();
    const chunks = tail.split(sep).map((c) => c.trim()).filter(Boolean);
    if (chunks.length < 3) continue;
    const medicament = chunks[0]!;
    const boites = chunks[1]!;
    const dosePart = chunks.slice(2).join(` ${POSOLOGIE_MIDDLE_DOT} `).trim();
    const m = /^×\s*(\d+)\s*\(([^)]*)\)\s*$/.exec(dosePart);
    if (!m) continue;
    const quantite = m[1]!;
    const prises = m[2]!.trim();
    return {
      acte,
      medicament,
      boites,
      dose: `× ${quantite}`,
      prises,
    };
  }
  return null;
}

export function buildActesPreviewForEtat(
  lines: PosologieLineLike[],
  actesOptions: Array<{ id: string; nom: string; date?: string; description?: string }>
): ActePreviewForEtat[] {
  const seen = new Set<string>();
  const out: ActePreviewForEtat[] = [];
  for (const L of lines) {
    const aid = String(L.acteId || "").trim();
    if (!aid || seen.has(aid)) continue;
    seen.add(aid);
    const a = actesOptions.find((x) => String(x.id) === aid);
    if (!a) continue;
    const rawD = (a.date ?? "").trim();
    const d = rawD ? parseActeDateLoose(rawD) : null;
    const dateStr = d ? format(d, "dd/MM/yyyy", { locale: fr }) : rawD;
    out.push({
      id: aid,
      nom: a.nom,
      date: dateStr,
      description: (a.description ?? "").trim() || undefined,
    });
  }
  return out;
}
