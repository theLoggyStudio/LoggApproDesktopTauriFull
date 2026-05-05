import type { StockArticle } from "../../lib/stockApi";
import type { StockCollabTaskRow, StockCollabTaskVisibility } from "../../lib/stockApi";

export type ScheduledTaskKind = "reminder" | "low_stock" | "circuit_validate" | "circuit_fill";

export type ScheduledTask = {
  id: string;
  title: string;
  /** ISO 8601 — pour les tâches « stock bas », valeur d’ancrage pour le tri uniquement */
  at: string;
  kind?: ScheduledTaskKind;
  /** Article concerné lorsque `kind === "low_stock"` */
  articleId?: string;
  /** Tâche persistante côté base stock (rappels partagés, circuits). */
  fromServer?: boolean;
  description?: string;
  visibility?: StockCollabTaskVisibility;
  visibleRoleId?: string;
  createdByUserId?: string;
  status?: string;
  /** Tâches circuit (`circuit_fill` / `circuit_validate`). */
  circuitId?: string;
  circuitStepIndex?: number;
};

const KEY = "loggappro_scheduled_tasks_v1";

const DISMISSED_KEY = "loggappro_low_stock_task_dismissed_v1";

const CHANGED = "loggappro-scheduled-tasks";

export const COLAB_TASKS_CHANGED = "loggappro-collab-tasks";

/** À appeler après création / complétion d’une tâche collaborative (API). */
export function dispatchCollabTasksChanged(): void {
  window.dispatchEvent(new CustomEvent(COLAB_TASKS_CHANGED));
}

/** Date sentinelle (passée) : les rappels datés restent triés par `at` réel ; le stock bas est regroupé après. */
const LOW_STOCK_ANCHOR_AT = "2000-01-01T00:00:00.000Z";

const LOW_STOCK_ID_PREFIX = "low-stock-";

function dispatchChanged() {
  window.dispatchEvent(new CustomEvent(CHANGED));
}

function loadDismissedArticleIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return new Set();
    return new Set(p.filter((x): x is string => typeof x === "string" && x.length > 0));
  } catch {
    return new Set();
  }
}

function saveDismissedArticleIds(ids: Set<string>) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

/** Retire l’article de la liste « ignoré » lorsque le stock repasse au-dessus du seuil. */
function pruneDismissedForRecovered(articles: StockArticle[]) {
  const dismissed = loadDismissedArticleIds();
  let changed = false;
  for (const a of articles) {
    if (a.minQty > 0 && a.qty > a.minQty && dismissed.has(a.id)) {
      dismissed.delete(a.id);
      changed = true;
    }
  }
  if (changed) saveDismissedArticleIds(dismissed);
}

export function mapCollabRowToScheduledTask(row: StockCollabTaskRow): ScheduledTask {
  const k = row.kind;
  const kind: ScheduledTaskKind =
    k === "circuit_validate" || k === "circuit_fill" ? k : k === "low_stock" ? "low_stock" : "reminder";
  return {
    id: row.id,
    title: row.title,
    at: row.at,
    kind,
    fromServer: true,
    description: row.description,
    visibility: row.visibility,
    visibleRoleId: row.visibleRoleId,
    createdByUserId: row.createdByUserId,
    status: row.status,
    circuitId: row.circuitId?.trim() || undefined,
    circuitStepIndex:
      typeof row.circuitStepIndex === "number" && !Number.isNaN(row.circuitStepIndex)
        ? row.circuitStepIndex
        : undefined,
  };
}

export function loadScheduledTasks(): ScheduledTask[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    return p
      .filter(
        (x): x is ScheduledTask =>
          typeof x === "object" &&
          x !== null &&
          typeof (x as ScheduledTask).id === "string" &&
          typeof (x as ScheduledTask).title === "string" &&
          typeof (x as ScheduledTask).at === "string",
      )
      .map((x) => {
        const t = x as ScheduledTask;
        const kindRaw = t.kind;
        const kind: ScheduledTaskKind =
          kindRaw === "low_stock"
            ? "low_stock"
            : kindRaw === "circuit_validate" || kindRaw === "circuit_fill"
              ? kindRaw
              : "reminder";
        return { ...t, kind };
      });
  } catch {
    return [];
  }
}

export function saveScheduledTasks(tasks: ScheduledTask[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(tasks));
    dispatchChanged();
  } catch {
    /* ignore */
  }
}

export function subscribeScheduledTasks(cb: () => void): () => void {
  const fn = () => cb();
  window.addEventListener(CHANGED, fn);
  return () => window.removeEventListener(CHANGED, fn);
}

export function subscribeCollabTasks(cb: () => void): () => void {
  const fn = () => cb();
  window.addEventListener(COLAB_TASKS_CHANGED, fn);
  return () => window.removeEventListener(COLAB_TASKS_CHANGED, fn);
}

/** Nombre de tâches « stock bas » actives (hors ignorés). */
export function countLowStockTasks(): number {
  return loadScheduledTasks().filter((t) => t.kind === "low_stock").length;
}

/**
 * Nombre de tâches actives dans la liste locale : stock bas, rappels à venir et rappels échus
 * (hors tâches serveur — utiliser le compteur fusionné dans StockLayout).
 */
export function countPendingTasks(): number {
  return loadScheduledTasks().filter((t) => {
    if (t.kind === "low_stock") return true;
    const ts = new Date(t.at).getTime();
    return !Number.isNaN(ts);
  }).length;
}

function sortBucket(t: ScheduledTask): number {
  if (t.kind === "low_stock") return 0;
  if (t.kind === "circuit_validate" || t.kind === "circuit_fill") return 1;
  return 2;
}

function sortTasksForDisplay(a: ScheduledTask, b: ScheduledTask): number {
  const ba = sortBucket(a);
  const bb = sortBucket(b);
  if (ba !== bb) return ba - bb;
  const aLow = a.kind === "low_stock";
  const bLow = b.kind === "low_stock";
  if (aLow && bLow) return a.title.localeCompare(b.title, "fr");
  return new Date(a.at).getTime() - new Date(b.at).getTime();
}

export function sortScheduledTasksForDisplay(tasks: ScheduledTask[]): ScheduledTask[] {
  return [...tasks].sort(sortTasksForDisplay);
}

/** Met à jour les tâches « stock bas » à partir du catalogue articles (seuil min. &gt; 0 et quantité ≤ seuil). */
export function syncLowStockTasksFromArticles(
  articles: StockArticle[],
  buildTitle: (a: StockArticle) => string,
): void {
  pruneDismissedForRecovered(articles);
  const dismissed = loadDismissedArticleIds();
  const current = loadScheduledTasks();
  const reminders = current.filter((t) => t.kind !== "low_stock");
  const lowTasks: ScheduledTask[] = [];
  for (const a of articles) {
    if (a.minQty <= 0) continue;
    if (a.qty > a.minQty) continue;
    if (dismissed.has(a.id)) continue;
    lowTasks.push({
      id: `${LOW_STOCK_ID_PREFIX}${a.id}`,
      kind: "low_stock",
      articleId: a.id,
      title: buildTitle(a),
      at: LOW_STOCK_ANCHOR_AT,
    });
  }
  saveScheduledTasks([...reminders, ...lowTasks]);
}

/** Retire la tâche de la liste locale ; si stock bas, mémorise l’ignorer tant que le stock reste bas. */
export function completeScheduledTask(task: ScheduledTask): void {
  if (task.fromServer) return;
  if (task.kind === "low_stock" && task.articleId) {
    const dismissed = loadDismissedArticleIds();
    dismissed.add(task.articleId);
    saveDismissedArticleIds(dismissed);
  }
  saveScheduledTasks(loadScheduledTasks().filter((t) => t.id !== task.id));
}

/** Rappels locaux uniquement (pour fusion avec l’API). */
export function getReminderTasks(): ScheduledTask[] {
  return loadScheduledTasks().filter((t) => t.kind !== "low_stock");
}

export function saveReminderTasksPreservingLowStock(reminders: ScheduledTask[]): void {
  const lows = loadScheduledTasks().filter((t) => t.kind === "low_stock");
  saveScheduledTasks([...reminders, ...lows]);
}
