import { invoke } from "../../tauri-bridge";
import { criptKey } from "../../constants/index.ts";
import {
  encrypteRepositoryStructure,
  decrypteRepositoryStructure,
} from "../helpers/helpers";

export interface Task {
  id: string;
  titre: string;
  description?: string;
  dateRappel?: string | null;
  dateCreation?: string | null;
  userId?: string | null;
  userNom?: string | null;
  loggId?: string | null;
  statut?: string;
}

export default function TaskController(pays: string) {
  return {
    ajouterTask: async (
      task: Omit<Task, "id" | "dateCreation">,
      tabId: string
    ) => {
      try {
        const taskData = {
          id: new Date().getTime().toString(),
          ...task,
          tabId,
          pays,
        };
        const payload = encrypteRepositoryStructure(taskData, criptKey);
        const encryptedResult = await invoke<any>("task_add", { payload });
        let parsed = encryptedResult;
        if (typeof parsed === "string") {
          try {
            parsed = JSON.parse(parsed);
          } catch {
            return null;
          }
        }
        return decrypteRepositoryStructure(parsed, criptKey);
      } catch (error) {
        console.error("Erreur lors de l'ajout de la tâche:", error);
        return null;
      }
    },

    listerTasks: async (tabId: string, limit: number = 100): Promise<Task[]> => {
      try {
        const payload = encrypteRepositoryStructure(
          { tabId, pays, limit },
          criptKey
        );
        const encryptedData = await invoke<any>("task_list", { payload });
        let parsed = encryptedData;
        if (typeof parsed === "string") {
          try {
            parsed = JSON.parse(parsed);
          } catch {
            return [];
          }
        }
        const tasks = decrypteRepositoryStructure(parsed, criptKey);
        return Array.isArray(tasks) ? (tasks as Task[]) : [];
      } catch (error) {
        console.error("Erreur lors du chargement des tâches:", error);
        return [];
      }
    },

    listerRappelsPending: async (
      tabId: string
    ): Promise<Task[]> => {
      try {
        const payload = encrypteRepositoryStructure(
          { tabId, pays },
          criptKey
        );
        const encryptedData = await invoke<any>("task_list_rappels_pending", {
          payload,
        });
        let parsed = encryptedData;
        if (typeof parsed === "string") {
          try {
            parsed = JSON.parse(parsed);
          } catch {
            return [];
          }
        }
        const tasks = decrypteRepositoryStructure(parsed, criptKey);
        return Array.isArray(tasks) ? (tasks as Task[]) : [];
      } catch (error) {
        console.error("Erreur lors du chargement des rappels:", error);
        return [];
      }
    },

    marquerRappelAffiche: async (taskId: string, tabId: string) => {
      try {
        const payload = encrypteRepositoryStructure(
          { id: taskId, tabId, pays },
          criptKey
        );
        await invoke<any>("task_marquer_rappel_affiche", { payload });
      } catch (error) {
        console.error("Erreur lors du marquage du rappel:", error);
      }
    },

    updateStatut: async (
      taskId: string,
      statut: string,
      tabId: string
    ) => {
      try {
        const payload = encrypteRepositoryStructure(
          { id: taskId, statut, tabId, pays },
          criptKey
        );
        await invoke<any>("task_update_statut", { payload });
      } catch (error) {
        console.error("Erreur lors de la mise à jour du statut:", error);
      }
    },

    supprimerTask: async (taskId: string, tabId: string) => {
      try {
        const payload = encrypteRepositoryStructure(
          { id: taskId, tabId, pays },
          criptKey
        );
        await invoke<any>("task_delete", { payload });
      } catch (error) {
        console.error("Erreur lors de la suppression de la tâche:", error);
      }
    },
  };
}
