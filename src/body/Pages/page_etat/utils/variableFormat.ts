/**
 * Utilitaires pour le format des variables : {{patient.nom #2}}
 * Le numéro (#N) doit être À L'INTÉRIEUR des accolades.
 */

/**
 * Parse une variable {{path #N}} ou {{path}} -> { basePath, prefix, index }.
 * Si le texte dans les accolades n’a pas de #N mais `variableLabel` est renseigné (ancien format), l’index vient du label.
 * Accepte aussi {{path#N}} ou {{path  #  2}} (espaces autour du #).
 */
export function parseVariableContent(
  content: string,
  variableLabel?: string | null
): { basePath: string; prefix: string; index: number } | null {
  const match = content.match(/^\{\{\s*(.+?)\s*\}\}$/);
  if (!match) return null;
  const inner = match[1].trim();
  const hashMatch = inner.match(/^(.+?)\s*#\s*(\d+)\s*$/);
  let basePath: string;
  let index: number;
  if (hashMatch) {
    basePath = hashMatch[1].trim();
    index = parseInt(hashMatch[2], 10);
  } else {
    basePath = inner;
    index = 1;
  }
  if (!hashMatch && variableLabel != null && String(variableLabel).trim() !== '') {
    const n = parseInt(String(variableLabel).trim(), 10);
    if (!isNaN(n) && n >= 1) {
      index = n;
    }
  }
  const prefix = basePath.split('.')[0] || '';
  return { basePath, prefix, index };
}

/** Construit le contenu d'une variable : {{path #N}} si N>1, {{path}} si N=1 */
export function    buildVariableContent(basePath: string, index: number | string | undefined): string {
  const n = index === undefined || index === '' ? 1 : (typeof index === 'string' ? parseInt(index, 10) : index);
  if (isNaN(n) || n <= 1) {
    return `{{${basePath}}}`;
  }
  return `{{${basePath} #${n}}}`;
}

/** Extrait le basePath d'un contenu (avec ou sans #N) */
export function getBasePathFromContent(content: string): string {
  const parsed = parseVariableContent(content);
  return parsed?.basePath ?? content.replace(/[{}]/g, '').replace(/\s*#\s*\d+\s*$/i, '').trim();
}

/** Clé de colonne tableau ou dernier segment de chemin : à ne pas exposer dans les documents. */
export function isForbiddenEtatVariableKey(columnKey: string): boolean {
  const k = columnKey.trim().toLowerCase();
  if (k === 'id' || k === 'loggid' || k === 'logg_id') return true;
  if (k === 'mdp' || k === 'password') return true;
  if (k.includes('password')) return true;
  if (k.includes('motdepasse') || k.includes('mot_de_passe')) return true;
  return false;
}

/** Chemin de variable {{patient.id}}, {{user.loggId}}, etc. : masqué à l’aperçu / export. */
export function isForbiddenEtatVariableBasePath(basePath: string): boolean {
  const t = basePath.trim().toLowerCase();
  const segments = t.split('.').filter(Boolean);
  const last = segments[segments.length - 1] || '';
  if (isForbiddenEtatVariableKey(last)) return true;
  if (/password|motdepasse|mot_de_passe|\bmdp\b/.test(t)) return true;
  return false;
}

/** Format affiché quand une variable n'existe pas : {{<VARIABLE>:"inexistant"}} */
export function formatInexistantVariable(innerVariable: string): string {
  return `{{<${innerVariable}>:"inexistant"}}`;
}

/** Vérifie si une chaîne est au format inexistant */
export function isInexistantFormat(s: string): boolean {
  return /^\{\{<[^>]+>:"inexistant"\}\}$/.test(s) || s.includes('>:"inexistant"}}');
}

/** Regex pour trouver les blocs inexistants dans un texte (pour style gras+rouge) */
export const INEXISTANT_REGEX = /\{\{<[^>]+>:"inexistant"\}\}/g;

/** Regex pour trouver toutes les variables {{...}} dans un texte */
const VARIABLE_REGEX = /\{\{\s*([^}]+?)\s*\}\}/g;

/** Extrait les indices uniques par préfixe (patient, acte, collaborateur, etc.) en scannant les éléments */
export function extractUniqueVariableIndices(elements: Array<{ type: string; content?: string; variableLabel?: string; tableNumber?: string; tableColumns?: string[]; tableData?: any[] }>): {
  patientIndices: number[];
  acteIndices: number[];
  collaborateurIndices: number[];
} {
  const patientSet = new Set<number>();
  const acteSet = new Set<number>();
  const collaborateurSet = new Set<number>();

  const processContent = (content: string) => {
    let m;
    VARIABLE_REGEX.lastIndex = 0;
    while ((m = VARIABLE_REGEX.exec(content)) !== null) {
      const inner = m[1].trim();
      const hashMatch = inner.match(/^(.+?)\s*#\s*(\d+)\s*$/);
      const basePath = hashMatch ? hashMatch[1].trim() : inner;
      const index = hashMatch ? parseInt(hashMatch[2], 10) : 1;
      const prefix = basePath.split('.')[0] || '';
      if (prefix === 'patient') patientSet.add(index);
      else if (prefix === 'acte' || prefix === 'actes') acteSet.add(index);
      else if (prefix === 'collaborateur') collaborateurSet.add(index);
      else if (basePath === 'qrcode.patient' || basePath.startsWith('qrcode.patient.')) patientSet.add(index);
      else if (basePath === 'qrcode.posologie' || basePath.startsWith('qrcode.posologie.')) patientSet.add(index);
      else if (basePath === 'qrcode.collaborateur' || basePath.startsWith('qrcode.collaborateur.'))
        collaborateurSet.add(index);
    }
  };

  for (const el of elements) {
    // Scanner tout élément ayant du contenu texte (text, variable, ou content sur d'autres types)
    if (el.content && typeof el.content === 'string') {
      processContent(el.content);
    }
    // Rétrocompat: variableLabel externe ({{path}} + label = #N) — ignorer si le contenu a déjà #N
    if (
      el.type === 'variable' &&
      el.variableLabel &&
      el.content &&
      !/\s*#\s*\d+/.test(el.content)
    ) {
      const n = parseInt(el.variableLabel, 10);
      if (!isNaN(n)) {
        const basePath = getBasePathFromContent(el.content || '');
        if (basePath.startsWith('patient.')) patientSet.add(n);
        else if (basePath.startsWith('acte.') || basePath.startsWith('actes.')) acteSet.add(n);
        else if (basePath.startsWith('collaborateur.')) collaborateurSet.add(n);
        else if (basePath.startsWith('qrcode.patient')) patientSet.add(n);
        else if (basePath.startsWith('qrcode.posologie')) patientSet.add(n);
        else if (basePath.startsWith('qrcode.collaborateur')) collaborateurSet.add(n);
      }
    }
  }

  return {
    patientIndices: Array.from(patientSet).sort((a, b) => a - b),
    acteIndices: Array.from(acteSet).sort((a, b) => a - b),
    collaborateurIndices: Array.from(collaborateurSet).sort((a, b) => a - b),
  };
}

/** Slots uniques {{qrcode.*}} pour chargement d’images en aperçu. */
export function extractQrcodeVariableSlots(
  elements: Array<{ type: string; content?: string; variableLabel?: string }>
): { basePath: string; index: number }[] {
  const seen = new Set<string>();
  const out: { basePath: string; index: number }[] = [];
  const push = (basePath: string, index: number) => {
    if (!basePath.startsWith('qrcode.')) return;
    const k = `${basePath}#${index}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ basePath, index });
  };

  for (const el of elements) {
    if (!el.content || typeof el.content !== 'string') continue;
    let m: RegExpExecArray | null;
    VARIABLE_REGEX.lastIndex = 0;
    while ((m = VARIABLE_REGEX.exec(el.content)) !== null) {
      const parsed = parseVariableContent(
        `{{${m[1].trim()}}}`,
        el.type === 'variable' ? el.variableLabel : undefined
      );
      if (parsed) push(parsed.basePath, parsed.index);
    }
  }
  return out;
}

type ElementLike = { type: string; content?: string; variableLabel?: string };

const POSOLOGIE_OR_ORDONNANCE_IN_CONTENT = /\{\{\s*(posologie|ordonnance)\b/i;

/** True si le canevas contient au moins une variable {{posologie…}} ou {{ordonnance…}}. */
export function elementsContainPosologieOrOrdonnanceVariables(
  elements: Array<{ type: string; content?: string; variableLabel?: string }>
): boolean {
  for (const el of elements) {
    if (!el.content || typeof el.content !== 'string') continue;
    if (POSOLOGIE_OR_ORDONNANCE_IN_CONTENT.test(el.content)) return true;
    if (el.type === 'variable') {
      const parsed = parseVariableContent(el.content, el.variableLabel);
      if (parsed && (parsed.prefix === 'posologie' || parsed.prefix === 'ordonnance')) return true;
    }
  }
  return false;
}

/** True si le canevas utilise au moins une variable dont le préfixe est `root` (ex. collaborateur, user). */
export function elementsUseVariableRoot(elements: ElementLike[], root: string): boolean {
  const scanContent = (content: string) => {
    let m: RegExpExecArray | null;
    VARIABLE_REGEX.lastIndex = 0;
    while ((m = VARIABLE_REGEX.exec(content)) !== null) {
      const parsed = parseVariableContent(`{{${m[1].trim()}}}`);
      if (parsed?.prefix === root) return true;
    }
    return false;
  };

  for (const el of elements) {
    if (el.content && typeof el.content === 'string' && scanContent(el.content)) return true;
    if (el.type === 'variable' && el.variableLabel && el.content) {
      const parsed = parseVariableContent(el.content, el.variableLabel);
      if (parsed?.prefix === root) return true;
    }
  }
  return false;
}
