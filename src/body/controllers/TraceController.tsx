import { invoke } from "../../tauri-bridge";
import { criptKey } from "../../constants/index.ts";
import {
  encrypteRepositoryStructure,
  decrypteRepositoryStructure,
  urlEncrypteRepositoryStructure,
} from "../helpers/helpers";

export interface Trace {
  id: string;
  action: "create" | "update" | "delete" | "login" | "logout";
  type_entite: string;
  nom_entite: string;
  id_entite: string;
  date_action: Date | string;
  user_id: string;
  user_nom: string;
  user_role: string;
  details?: string;
  logg_id: string;
}

// Helper pour créer une trace facilement (inchangé)
export const creerTrace = async (
  action: "create" | "update" | "delete" | "login" | "logout",
  typeEntite: string,
  nomEntite: string,
  idEntite: string,
  userId: string,
  userNom: string,
  userRole: string,
  loggId: string,
  tabId: string,
  pays: string,
  details?: string
) => {
  try {
    await TraceController(pays).ajouterTrace(
      {
        action,
        type_entite: typeEntite,
        nom_entite: nomEntite,
        id_entite: idEntite,
        user_id: userId,
        user_nom: userNom,
        user_role: userRole,
        logg_id: loggId,
        details,
      },
      tabId
    );
  } catch (error) {
    // Échec silencieux pour ne pas bloquer l'action principale
    console.error("Erreur trace:", error);
  }
};

export default function TraceController(pays: string) {
  return {
    // Ajouter une trace
    ajouterTrace: async (trace: Omit<Trace, "id" | "date_action">, tabId: string) => {
      try {
        const traceData = {
          id: new Date().getTime().toString(),
          date_action: new Date(),
          ...trace,
          tabId,
          pays,
        };

        const payload = encrypteRepositoryStructure(traceData, criptKey);

        const encryptedResult = await invoke<any>("trace_add", { payload });

        let parsed = encryptedResult;
        if (typeof parsed === "string") {
          try {
            parsed = JSON.parse(parsed);
          } catch (parseErr) {
            console.error("Erreur parse trace:", parseErr);
            return null;
          }
        }

        return decrypteRepositoryStructure(parsed, criptKey);
      } catch (error) {
        console.error("Erreur lors de l'ajout de la trace:", error);
        return null;
      }
    },

    // Lister toutes les traces
    listerTraces: async (tabId: string, limit: number = 100): Promise<Trace[]> => {
      try {
        const legacyUrl = urlEncrypteRepositoryStructure(
          "/api/trace",
          [tabId, pays, limit.toString()],
          criptKey ?? ""
        );

        const encryptedTraces = await invoke<any>("trace_list_all", { payload: legacyUrl });

        let parsed = encryptedTraces;
        if (typeof parsed === "string") {
          try {
            parsed = JSON.parse(parsed);
          } catch {
            return [];
          }
        }

        const traces = decrypteRepositoryStructure(parsed, criptKey);
        return Array.isArray(traces) ? (traces as Trace[]) : [];
      } catch (error) {
        console.error("Erreur lors de la récupération des traces:", error);
        return [];
      }
    },

    // Lister les traces par loggId (docteur)
    listerTracesParLoggId: async (
      loggId: string,
      tabId: string,
      limit: number = 100
    ): Promise<Trace[]> => {
      try {
        const legacyUrl = urlEncrypteRepositoryStructure(
          "/api/trace/loggId",
          [loggId, tabId, pays, limit.toString()],
          criptKey ?? ""
        );

        const encryptedTraces = await invoke<any>("trace_list_by_logg_id", { payload: legacyUrl });

        let parsed = encryptedTraces;
        if (typeof parsed === "string") {
          try {
            parsed = JSON.parse(parsed);
          } catch {
            return [];
          }
        }

        const traces = decrypteRepositoryStructure(parsed, criptKey);
        return Array.isArray(traces) ? (traces as Trace[]) : [];
      } catch (error) {
        console.error("Erreur lors de la récupération des traces par loggId:", error);
        return [];
      }
    },

    // Lister les traces avec pagination (offset et limit)
    listerTracesAvecPagination: async (
      tabId: string,
      limit: number = 20,
      offset: number = 0
    ): Promise<Trace[]> => {
      try {
        const legacyUrl = urlEncrypteRepositoryStructure(
          "/api/trace/pagination",
          [tabId, pays, limit.toString(), offset.toString()],
          criptKey ?? ""
        );

        const encryptedTraces = await invoke<any>("trace_list_pagination", { payload: legacyUrl });

        let parsed = encryptedTraces;
        if (typeof parsed === "string") {
          try {
            parsed = JSON.parse(parsed);
          } catch {
            return [];
          }
        }

        const traces = decrypteRepositoryStructure(parsed, criptKey);
        return Array.isArray(traces) ? (traces as Trace[]) : [];
      } catch (error) {
        console.error("Erreur lors de la récupération des traces avec pagination:", error);
        return [];
      }
    },
  };
}
