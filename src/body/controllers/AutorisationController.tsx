import { invoke } from "../../tauri-bridge";
import { criptKey } from "../../constants/index.ts";
import { decrypteRepositoryStructure, urlEncrypteRepositoryStructure } from "../helpers/helpers";

export default function AutorisationController(pays: string) {
  return {
    recupererPriviliegesDuUser: async (privilegeId: string | null, tabId: string | null) => {
      try {
        /**
         * Option B:
         * On n'envoie plus une URL HTTP, mais un "payload" (string) vers Rust.
         *
         * Ici, ton code faisait:
         * - construire une URL chiffrée (query params encryptés)
         * - GET /api/autorisation/privilege
         * - recevoir un JSON chiffré
         *
         * Maintenant:
         * - on construit un payload (on réutilise ta méthode d'encodage pour garder le même format)
         * - on invoke une commande Rust "get_user_privileges"
         * - Rust renvoie soit:
         *    - un objet chiffré (même format qu'avant) -> on déchiffre ici
         *    - soit directement un objet clair (si tu veux simplifier plus tard)
         */

        // On conserve ton format "url encrypt" pour le moment,
        // mais on ne garde que la partie utile comme payload.
        // (Rust pourra parser/déchiffrer pareil que ton backend Express le faisait.)
        const legacyUrl = urlEncrypteRepositoryStructure(
          "/api/autorisation/privilege",
          [privilegeId ?? "", tabId ?? "", pays ?? ""],
          criptKey ?? ""
        );

        // Appel Tauri (pas HTTP)
        const encryptedData = await invoke<any>("get_user_privileges", {
          payload: legacyUrl,
        });

        // Déchiffrement comme avant
        const data = decrypteRepositoryStructure(encryptedData, criptKey);

        // Retourne les codes (virgule, point-virgule ou espaces — aligné Profil / QR)
        return String(data?.nom ?? "")
          .split(/[,;\s]+/)
          .map((c) => c.trim().toLowerCase())
          .filter(Boolean);
      } catch (error) {
        console.error("Erreur lors de la récupération des privilèges :", error);
        return [];
      }
    },

    verifierStatutPaiement: async (docteurId: string, tabId: string) => {
      try {
        const legacyUrl = urlEncrypteRepositoryStructure(
          "/api/autorisation/verifierStatutPaiement",
          [docteurId, tabId, pays],
          criptKey ?? ""
        );
        const encryptedData = await invoke<any>("verifier_statut_paiement", { payload: legacyUrl });
        return decrypteRepositoryStructure(encryptedData, criptKey);
      } catch (error) {
        console.error("Erreur lors de la vérification du statut de paiement:", error);
        return { statut: "inconnu" as const, derniereDatePaiement: null };
      }
    },

    recupererLaDateDePayement: async (cabinetId: string, tabId: string) => {
      try {
        const legacyUrl = urlEncrypteRepositoryStructure(
          "/api/autorisation/datePayement",
          [cabinetId, tabId, pays],
          criptKey ?? ""
        );
        const encryptedData = await invoke<any>("recuperer_date_paiement", { payload: legacyUrl });
        const result = decrypteRepositoryStructure(encryptedData, criptKey);
        return result && result?.date_creation ? result : null;
      } catch (error) {
        console.debug("Date de paiement non disponible:", error);
        return null;
      }
    },
  };
}
