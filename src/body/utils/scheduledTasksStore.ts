export type ScheduledTask = {
  id: string;
  title: string;
  /** ISO 8601 */
  at: string;
};

const KEY = "loggappro_scheduled_tasks_v1";

const CHANGED = "loggappro-scheduled-tasks";

export function loadScheduledTasks(): ScheduledTask[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    return p.filter(
      (x): x is ScheduledTask =>
        typeof x === "object" &&
        x !== null &&
        typeof (x as ScheduledTask).id === "string" &&
        typeof (x as ScheduledTask).title === "string" &&
        typeof (x as ScheduledTask).at === "string"
    );
  } catch {
    return [];
  }
}

export function saveScheduledTasks(tasks: ScheduledTask[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(tasks));
    window.dispatchEvent(new CustomEvent(CHANGED));
  } catch {
    /* ignore */
  }
}

export function subscribeScheduledTasks(cb: () => void): () => void {
  const fn = () => cb();
  window.addEventListener(CHANGED, fn);
  return () => window.removeEventListener(CHANGED, fn);
}

export function countUpcomingTasks(): number {
  const now = Date.now();
  return loadScheduledTasks().filter((t) => new Date(t.at).getTime() > now).length;
}
