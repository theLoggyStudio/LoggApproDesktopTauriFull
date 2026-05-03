import { useEffect, useRef } from "react";
import { getPageTexts } from "../../hooks/usePageTexts";
import { loadScheduledTasks, saveScheduledTasks, type ScheduledTask } from "../utils/scheduledTasksStore";

function showTaskNotification(title: string, body: string) {
  if (typeof Notification === "undefined") return;
  try {
    if (Notification.permission === "granted") {
      new Notification(title, { body, tag: `loggappro-task-${Date.now()}`, requireInteraction: false });
    }
  } catch {
    /* ignore */
  }
}

/**
 * Vérifie régulièrement les tâches dont l'heure est passée et envoie une notification système.
 */
export function useScheduledTaskAlarms(pollMs = 15000) {
  const notifiedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const tasks = loadScheduledTasks();
      const remaining: ScheduledTask[] = [];
      const T = getPageTexts("stockScheduledTasks");
      const notifTitle = T[9] ?? "Rappel";

      for (const t of tasks) {
        const ts = new Date(t.at).getTime();
        if (Number.isNaN(ts)) {
          remaining.push(t);
          continue;
        }
        if (now >= ts) {
          if (!notifiedIds.current.has(t.id)) {
            notifiedIds.current.add(t.id);
            showTaskNotification(notifTitle, t.title.trim() || T[2] || "Tâche");
          }
        } else {
          remaining.push(t);
        }
      }

      if (remaining.length !== tasks.length) {
        saveScheduledTasks(remaining);
        tasks
          .filter((t) => new Date(t.at).getTime() <= now && !Number.isNaN(new Date(t.at).getTime()))
          .forEach((t) => {
            setTimeout(() => notifiedIds.current.delete(t.id), 60_000);
          });
      }
    };

    tick();
    const id = window.setInterval(tick, pollMs);
    return () => window.clearInterval(id);
  }, [pollMs]);
}
