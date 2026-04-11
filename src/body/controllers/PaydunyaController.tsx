import { invoke } from "../../tauri-bridge";
import { criptKey } from "../../constants/index.ts";
import {
  encrypteRepositoryStructure,
  decrypteRepositoryStructure,
} from "../helpers/helpers";

/**
 * Contrôleur PayDunya - paiements et statut.
 * Appeler enregistrerDerniereDatePaiement après chaque paiement confirmé (retour PayDunya).
 */
export const PaydunyaController = (pays: string) => {
  return {
    verifierStatutPaiement: async (cabinetId: string, tabId: string) => {
      const payload = encrypteRepositoryStructure(
        { id: cabinetId, tabId, pays },
        criptKey
      );
      const res = await invoke<any>("verifier_statut_paiement", { payload });
      return decrypteRepositoryStructure(res, criptKey);
    },

    recupererDatePaiement: async (cabinetId: string, tabId: string) => {
      const payload = encrypteRepositoryStructure(
        { id: cabinetId, tabId, pays },
        criptKey
      );
      const res = await invoke<any>("recuperer_date_paiement", { payload });
      return decrypteRepositoryStructure(res, criptKey);
    },

    payerPaydunya: async (body: { docteur: any; privileges?: any[] }) => {
      const payload = encrypteRepositoryStructure({ body, pays }, criptKey);
      const res = await invoke<any>("payer_paydunya", { payload });
      return decrypteRepositoryStructure(res, criptKey);
    },

    payerPaydunyaMensuel: async (body: {
      docteur: any;
      nombreMois: number;
      montantTotal: number;
      typePaiement?: string;
    }) => {
      const payload = encrypteRepositoryStructure({ body, pays }, criptKey);
      const res = await invoke<any>("payer_paydunya_mensuel", { payload });
      return decrypteRepositoryStructure(res, criptKey);
    },

    /**
     * À appeler après chaque paiement confirmé (ex. retour PayDunya).
     * Enregistre la dernière date de paiement dans le fichier backup chiffré.
     */
    enregistrerDerniereDatePaiement: async (
      cabinetId: string,
      tabId: string,
      dateCreation?: string
    ) => {
      const payload = encrypteRepositoryStructure(
        {
          cabinetId,
          tabId,
          dateCreation:
            dateCreation ||
            new Date().toISOString().slice(0, 19).replace("T", " "),
        },
        criptKey
      );
      const res = await invoke<any>("enregistrer_derniere_date_paiement", {
        payload,
      });
      return decrypteRepositoryStructure(res, criptKey);
    },
  };
};
