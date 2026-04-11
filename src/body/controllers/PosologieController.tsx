import { invoke } from "../../tauri-bridge";
import { criptKey } from "../../constants/index.ts";
import { decrypteRepositoryStructure, encrypteRepositoryStructure } from "../helpers/helpers";

function call<T>(command: string, body: Record<string, unknown>): Promise<T | null> {
  /** Même principe que ModeleEtatController : `payload` doit rester une chaîne pour les commandes Tauri. */
  const payload = encrypteRepositoryStructure(body, criptKey ?? "");
  return invoke<any>(command, { payload }).then((raw) => {
    const decrypted = decrypteRepositoryStructure(raw, criptKey ?? "");
    if (decrypted == null) return null;
    if (typeof decrypted === "string") {
      try {
        return JSON.parse(decrypted) as T;
      } catch {
        return decrypted as unknown as T;
      }
    }
    return decrypted as T;
  });
}

export function PosologieController(pays: string) {
  return {
    listMedicaments: async (tabId: string) => {
      const d = await call<{ medicaments?: Array<{ id?: string; nom?: string; forme?: string }> }>(
        "list_medicaments",
        { tabId, pays }
      );
      return d?.medicaments ?? [];
    },

    addMedicament: async (tabId: string, nom: string, forme?: string) => {
      return call<{ success?: boolean; id?: string }>("add_medicament", {
        tabId,
        pays,
        nom,
        forme: forme ?? "",
        cabinetId: tabId,
      });
    },

    deleteMedicament: async (tabId: string, id: string) => {
      return call<{ success?: boolean }>("delete_medicament", {
        tabId,
        pays,
        id,
        medicamentId: id,
        cabinetId: tabId,
      });
    },

    listActesIdsInPosologie: async (patientId: string) => {
      const d = await call<{ acteIds?: string[] }>("list_actes_ids_in_posologie", {
        patientId,
        pays,
      });
      return d?.acteIds ?? [];
    },

    /**
     * Lignes de posologie enregistrées pour un acte donné (patient).
     * Commande Tauri attendue : `get_posologie_lines_for_acte` → { lines?: unknown[] }.
     */
    getPosologieLinesForActe: async (params: {
      patientId: string;
      acteId: string;
      tabId: string;
    }) => {
      const d = await call<{ lines?: unknown[] }>("get_posologie_lines_for_acte", {
        patientId: params.patientId,
        acteId: params.acteId,
        tabId: params.tabId,
        pays,
      });
      return Array.isArray(d?.lines) ? d!.lines! : null;
    },

    /**
     * Toutes les lignes de posologie du patient (tous actes confondus).
     * Commande Tauri : `get_posologie_lines_for_patient` → { lines?: unknown[] }.
     * Retourne `null` si la commande échoue / réponse invalide (→ repli agrégation par acte côté UI).
     */
    getPosologieLinesForPatient: async (params: { patientId: string; tabId: string }) => {
      const d = await call<{ lines?: unknown[] }>("get_posologie_lines_for_patient", {
        patientId: params.patientId,
        tabId: params.tabId,
        pays,
      });
      return Array.isArray(d?.lines) ? d!.lines! : null;
    },

    /** Image PNG data URL — même charge utile que l’écran posologie (commande `get_posologie_qrcode`). */
    getPosologieQrcodeDataUrl: async (params: { patientId: string; tabId: string; posologieId?: string }) => {
      const body: Record<string, unknown> = {
        patientId: params.patientId,
        tabId: params.tabId,
        pays,
        cabinetId: params.tabId,
      };
      if (params.posologieId && String(params.posologieId).trim()) {
        body.posologieId = String(params.posologieId).trim();
      }
      const d = await call<{ qrBase64?: string | null }>("get_posologie_qrcode", body);
      const u = d?.qrBase64;
      return typeof u === "string" && u.startsWith("data:") ? u : null;
    },

    listActeColors: async (patientId: string) => {
      const d = await call<{ acteColors?: Record<string, string> }>("list_posologie_acte_colors", {
        patientId,
        pays,
      });
      return d?.acteColors ?? {};
    },

    listModelesEtatPosologie: async (tabId: string) => {
      const d = await call<{ modeles?: any[] }>("list_modeles_etat_posologie", { tabId, pays });
      return d?.modeles ?? [];
    },

    /** Modèles prescription / ordonnance / variable posologie (PDF ordonnance). */
    listModelesEtatOrdonnance: async (tabId: string) => {
      const d = await call<{ modeles?: any[] }>("list_modeles_etat_ordonnance", { tabId, pays });
      return d?.modeles ?? [];
    },

    savePosologie: async (params: {
      patientId: string;
      cabinetTabId: string;
      lines: Array<{
        acteId: string;
        medicamentId: string;
        /** Nombre de boîtes prescrites (côté posologie) */
        nombreBoites: number;
        quantite: number;
        heures?: string[];
      }>;
    }) => {
      return call<{
        success?: boolean;
        posologieId?: string;
        colorHex?: string;
        qrBase64?: string;
        payloadEncrypted?: string;
      }>("save_posologie", {
        patientId: params.patientId,
        cabinetTabId: params.cabinetTabId,
        tabId: params.cabinetTabId,
        pays,
        cabinetId: params.cabinetTabId,
        lines: params.lines,
      });
    },

    /** QR chiffré pour l’app mobile (lignes déjà en base). */
    getPosologieQrcode: async (params: {
      patientId: string;
      tabId: string;
      posologieId?: string | null;
    }) => {
      const body: Record<string, unknown> = {
        patientId: params.patientId,
        tabId: params.tabId,
        cabinetTabId: params.tabId,
        pays,
        cabinetId: params.tabId,
      };
      if (params.posologieId) {
        body.posologieId = params.posologieId;
      }
      return call<{ qrBase64?: string | null }>("get_posologie_qrcode", body);
    },
  };
}
