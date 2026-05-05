import { useEffect, useRef } from "react";
import { getPageTexts } from "../../hooks/usePageTexts";
import type { SessionUser } from "../context/SessionContext";
import { fetchStockCollabTasks } from "../../lib/stockApi";
import { getReminderTasks, mapCollabRowToScheduledTask } from "../utils/scheduledTasksStore";

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
 * Vérifie régulièrement les rappels dont l’heure est passée et envoie une notification système.
 * Les tâches restent dans la liste jusqu’à ce que l’utilisateur les coche comme faites dans la modale.
 */
export function useScheduledTaskAlarms(session: SessionUser | null, pollMs = 15000) {
  const notifiedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const tick = async () => {
      const now = Date.now();
      const local = getReminderTasks();
      const merged: { id: string; title: string; at: string; kind?: string }[] = local.map((t) => ({
        id: t.id,
        title: t.title,
        at: t.at,
        kind: t.kind,
      }));
      if (session?.id && (session.role === "stock_user" || session.role === "sadmin")) {
        try {
          const srv = await fetchStockCollabTasks({
            requesterUserId: session.id,
            requesterRole: session.role ?? "",
          });
          for (const row of srv) {
            const m = mapCollabRowToScheduledTask(row);
            merged.push({ id: m.id, title: m.title, at: m.at, kind: m.kind });
          }
        } catch {
          /* hors ligne */
        }
      }
      const T = getPageTexts("stockScheduledTasks");
      const notifTitle = T[9] ?? "Rappel";

      for (const t of merged) {
        if (t.kind === "low_stock") continue;
        const ts = new Date(t.at).getTime();
        if (Number.isNaN(ts)) continue;
        if (now >= ts) {
          if (!notifiedIds.current.has(t.id)) {
            notifiedIds.current.add(t.id);
            showTaskNotification(notifTitle, t.title.trim() || T[2] || "Tâche");
          }
        }
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), pollMs);
    return () => window.clearInterval(id);
  }, [pollMs, session?.id, session?.role]);
}
