import { invoke } from "../../tauri-bridge";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { criptKey } from "../../constants/index.ts";
import {
  urlEncrypteRepositoryStructure,
  decrypteRepositoryStructure,
  encrypteRepositoryStructure,
} from "../helpers/helpers";

export interface RadioPending {
  id: string;
  docteur_id?: string | null;
  patient_id?: string | null;
  acte_id?: string | null;
  logg_id?: string | null;
  file_path?: string | null;
  thumbnail_path?: string | null;
  status?: string;
  metadata?: any;
  created_at?: string;
  updated_at?: string;
}

export interface RadioPreviewResponse {
  mimeType: string;
  base64: string;
  id: string;
  metadata?: any;
}

export const RadioController = (pays: string) => {
  return {
    listerPending: async (tabId: string): Promise<RadioPending[]> => {
      try {
        const legacyUrl = urlEncrypteRepositoryStructure(
          "/api/radios/pending",
          [tabId, pays],
          criptKey
        );

        const encryptedData = await invoke<any>("radios_list_pending", { payload: legacyUrl });
        const decrypted = decrypteRepositoryStructure(encryptedData, criptKey);

        if (!Array.isArray(decrypted)) return [];
        return decrypted as RadioPending[];
      } catch (error) {
        console.error("Erreur lors du listing des radios en attente:", error);
        return [];
      }
    },

    associer: async (
      tabId: string,
      radioId: string,
      data: {
        patientId?: string | null;
        acteId?: string | null;
        statut?: string;
        metadata?: any;
        loggId?: string;
        userId?: string;
        userNom?: string;
        userRole?: string;
      }
    ) => {
      try {
        const payloadObj = { ...data, tabId, pays, radioId };

        // Option B: invoke PATCH-equivalent
        const payload = encrypteRepositoryStructure(payloadObj, criptKey);
        const encryptedData = await invoke<any>("radios_associer", { payload });

        return decrypteRepositoryStructure(encryptedData, criptKey);
      } catch (error) {
        console.error("Erreur lors de l'association de la radio:", error);
        throw error;
      }
    },

    telecharger: async (tabId: string, radioId: string): Promise<RadioPreviewResponse | null> => {
      try {
        const legacyUrl = urlEncrypteRepositoryStructure(
          "/api/radios/file",
          [radioId, tabId, pays],
          criptKey
        );

        const encryptedData = await invoke<any>("radios_download_preview", { payload: legacyUrl });
        const decrypted = decrypteRepositoryStructure(encryptedData, criptKey);

        if (!decrypted || typeof decrypted !== "object") return null;
        return decrypted as RadioPreviewResponse;
      } catch (error) {
        console.error("Erreur lors du téléchargement de la radio:", error);
        return null;
      }
    },

    /**
     * Option B (Desktop pur):
     * Au lieu d'un URL SSE/WebSocket HTTP, on utilise les events Tauri.
     *
     * Côté Rust tu feras:
     *   app_handle.emit_all("radios:event", payload)
     */
    subscribeEvents: async (
      handler: (payload: any) => void,
      eventName: string = "radios:event"
    ): Promise<UnlistenFn> => {
      return await listen(eventName, (event) => handler(event.payload));
    },

    // Si tu veux garder la compat en attendant, tu peux conserver l’ancien builder URL,
    // mais il ne servira plus une fois Express supprimé.
    // getEventsUrl: (tabId: string) => {
    //   return urlEncrypteRepositoryStructure(
    //     `${getUrlBack()}/api/radios/events`,
    //     [tabId, pays],
    //     criptKey
    //   );
    // },
  };
};
