import { invoke } from "../../tauri-bridge";
import { criptKey } from "../../constants/index.ts";
import {
  encrypteRepositoryStructure,
  decrypteRepositoryStructure,
  urlEncrypteRepositoryStructure,
} from "../helpers/helpers";

/** Listes API parfois renvoyées comme tableau ou comme objet avec une clé tableau. */
function asDecryptedList(encryptedData: unknown): any[] {
  const result = decrypteRepositoryStructure(encryptedData, criptKey);
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object") {
    const o = result as Record<string, unknown>;
    for (const k of [
      "types",
      "collaborateurs",
      "assistants",
      "comptables",
      "secretaires",
      "data",
      "list",
      "items",
      "rows",
      "result",
    ]) {
      if (Array.isArray(o[k])) return o[k] as any[];
    }
    const first = Object.values(o).find((v) => Array.isArray(v));
    if (first) return first as any[];
  }
  return [];
}

export const PageProfilController = (pays: string) => {
  return {
    // =========================
    // DOCTEUR
    // =========================
    voirQRCodeDocteur: async (docteurId: string, tabId: string) => {
      const legacyUrl = urlEncrypteRepositoryStructure(
        "/api/pageProfile/docteur/qrcode",
        [docteurId, tabId, pays],
        criptKey
      );
      const encryptedData = await invoke<any>("get_docteur_qrcode", { payload: legacyUrl });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    voirInfoDocteur: async (docteurId: string, tabId: string) => {
      const legacyUrl = urlEncrypteRepositoryStructure(
        "/api/pageProfile/docteur",
        [docteurId, tabId, pays],
        criptKey
      );
      const encryptedData = await invoke<any>("get_docteur_profile", { payload: legacyUrl });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    modifierDocteur: async (updatedDocteur: any) => {
      const payload = encrypteRepositoryStructure({ ...updatedDocteur, pays }, criptKey);
      const encryptedData = await invoke<any>("update_docteur_profile", { payload });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    listerDocteurs: async () => {
      const payload = encrypteRepositoryStructure({ pays }, criptKey);
      const encryptedData = await invoke<any>("list_docteurs", { payload });
      const decrypted = decrypteRepositoryStructure(encryptedData, criptKey);
      if (Array.isArray(decrypted)) return decrypted;
      if (decrypted && typeof decrypted === "object" && Array.isArray((decrypted as { docteurs?: unknown }).docteurs)) {
        return (decrypted as { docteurs: unknown[] }).docteurs;
      }
      return asDecryptedList(encryptedData);
    },

    reinitialiserMotDePasseDocteur: async (docteurId: string) => {
      const payload = encrypteRepositoryStructure({ docteurId, pays }, criptKey);
      const encryptedData = await invoke<any>("reset_docteur_password", { payload });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    /** Compte démo Doc01 : nouvel e-mail + mot de passe → nouveau docteur (UUID), suppression du démo, `reconnect: true`. */
    finaliserEmailDemoDocteur: async (userId: string, newLogin: string, newPassword: string) => {
      const payload = encrypteRepositoryStructure(
        { userId, newLogin, newPassword, pays },
        criptKey
      );
      const encryptedData = await invoke<any>("finalize_demo_docteur_email", { payload });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    // =========================
    // ASSISTANT
    // =========================
    voirQRCodeAssistant: async (assistantId: string, tabId?: string) => {
      const legacyUrl = urlEncrypteRepositoryStructure(
        "/api/pageProfile/assistant/qrcode",
        [assistantId, tabId ?? "main", pays],
        criptKey
      );
      const encryptedData = await invoke<any>("get_assistant_qrcode", { payload: legacyUrl });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    voirInfoAssistant: async (assistantId: string, tabId?: string) => {
      const params = tabId ? [assistantId, tabId, pays] : [assistantId, pays];
      const legacyUrl = urlEncrypteRepositoryStructure(
        "/api/pageProfile/assistant",
        params,
        criptKey
      );
      const encryptedData = await invoke<any>("get_assistant_profile", { payload: legacyUrl });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    modifierAssistant: async (updatedAssistant: any) => {
      const payload = encrypteRepositoryStructure({ ...updatedAssistant, pays }, criptKey);
      const encryptedData = await invoke<any>("update_assistant_profile", { payload });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    changerMotDePasse: async (userId: string, newPassword: string, tabId: string) => {
      const payload = encrypteRepositoryStructure({ userId, newPassword, tabId, pays }, criptKey);
      const encryptedData = await invoke<any>("change_user_password", { payload });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    ajouterAssistant: async (assistant: any) => {
      const payload = encrypteRepositoryStructure({ ...assistant, pays }, criptKey);
      const encryptedData = await invoke<any>("create_assistant", { payload });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    listerAssistants: async (tabId: string, limit: number) => {
      const legacyUrl = urlEncrypteRepositoryStructure(
        "/api/pageProfile/assistants",
        [tabId, limit.toString(), pays],
        criptKey
      );
      const encryptedData = await invoke<any>("list_assistants", { payload: legacyUrl });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    supprimerAssistant: async (assistantId: string, tabId: string) => {
      const legacyUrl = urlEncrypteRepositoryStructure(
        "/api/pageProfile/assistant",
        [assistantId, tabId, pays],
        criptKey
      );
      const encryptedData = await invoke<any>("delete_assistant", { payload: legacyUrl });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    // =========================
    // TYPES COLLABORATEURS & COLLABORATEURS
    // =========================
    listerTypesCollaborateur: async (tabId: string) => {
      const payload = encrypteRepositoryStructure({ tabId, pays }, criptKey);
      const encryptedData = await invoke<any>("list_types_collaborateur", { payload });
      return asDecryptedList(encryptedData);
    },

    creerTypeCollaborateur: async (typeCollab: { nom: string; rolesParDefaut?: string }, tabId: string) => {
      const payload = encrypteRepositoryStructure({ ...typeCollab, tabId, pays }, criptKey);
      const encryptedData = await invoke<any>("create_type_collaborateur", { payload });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    modifierRolesTypeCollaborateur: async (typeId: string, rolesParDefaut: string, tabId: string) => {
      const payload = encrypteRepositoryStructure(
        { typeId, rolesParDefaut, tabId, pays },
        criptKey
      );
      const encryptedData = await invoke<any>("update_type_collaborateur_roles", { payload });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    listerCollaborateursByType: async (typeId: string, tabId: string, limit = 100) => {
      const payload = encrypteRepositoryStructure({ typeId, tabId, limit, pays }, criptKey);
      const encryptedData = await invoke<any>("list_collaborateurs_by_type", { payload });
      return asDecryptedList(encryptedData);
    },

    ajouterCollaborateur: async (collaborateur: any) => {
      const payload = encrypteRepositoryStructure({ collaborateur: { ...collaborateur }, ...collaborateur, pays }, criptKey);
      const encryptedData = await invoke<any>("create_collaborateur", { payload });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    voirInfoCollaborateur: async (collaborateurId: string, tabId: string) => {
      const payload = encrypteRepositoryStructure({ id: collaborateurId, tabId, pays }, criptKey);
      const encryptedData = await invoke<any>("get_collaborateur_profile", { payload });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    modifierCollaborateur: async (updatedCollaborateur: any) => {
      const payload = encrypteRepositoryStructure({ collaborateur: { ...updatedCollaborateur }, ...updatedCollaborateur, pays }, criptKey);
      const encryptedData = await invoke<any>("update_collaborateur_profile", { payload });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    supprimerCollaborateur: async (collaborateurId: string, tabId: string) => {
      const payload = encrypteRepositoryStructure({ id: collaborateurId, tabId, pays }, criptKey);
      const encryptedData = await invoke<any>("delete_collaborateur", { payload });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    voirQRCodeCollaborateur: async (collaborateurId: string, tabId: string, role: string) => {
      const legacyUrl = urlEncrypteRepositoryStructure(
        "/api/pageProfile/collaborateur/qrcode",
        [collaborateurId, tabId, role, pays],
        criptKey
      );
      const encryptedData = await invoke<any>("get_collaborateur_qrcode", { payload: legacyUrl });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    // =========================
    // COMPTABLE
    // =========================
    voirQRCodeComptable: async (comptableId: string, tabId?: string) => {
      const legacyUrl = urlEncrypteRepositoryStructure(
        "/api/pageProfile/comptable/qrcode",
        [comptableId, tabId ?? "main", pays],
        criptKey
      );
      const encryptedData = await invoke<any>("get_comptable_qrcode", { payload: legacyUrl });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    voirInfoComptable: async (comptableId: string, tabId?: string) => {
      const params = tabId ? [comptableId, tabId, pays] : [comptableId, pays];
      const legacyUrl = urlEncrypteRepositoryStructure(
        "/api/pageProfile/comptable",
        params,
        criptKey
      );
      const encryptedData = await invoke<any>("get_comptable_profile", { payload: legacyUrl });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    modifierComptable: async (updatedComptable: any) => {
      const payload = encrypteRepositoryStructure({ ...updatedComptable, pays }, criptKey);
      const encryptedData = await invoke<any>("update_comptable_profile", { payload });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    ajouterComptable: async (comptable: any) => {
      const payload = encrypteRepositoryStructure({ ...comptable, pays }, criptKey);
      const encryptedData = await invoke<any>("create_comptable", { payload });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    listerComptables: async (tabId: string, limit: number) => {
      const legacyUrl = urlEncrypteRepositoryStructure(
        "/api/pageProfile/comptables",
        [tabId, limit.toString(), pays],
        criptKey
      );
      const encryptedData = await invoke<any>("list_comptables", { payload: legacyUrl });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    supprimerComptable: async (comptableId: string, loggId: string) => {
      const legacyUrl = urlEncrypteRepositoryStructure(
        "/api/pageProfile/comptable",
        [comptableId, loggId, pays],
        criptKey
      );
      const encryptedData = await invoke<any>("delete_comptable", { payload: legacyUrl });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    // =========================
    // SECRETAIRE
    // =========================
    voirQRCodeSecretaire: async (secretaireId: string, tabId?: string) => {
      const legacyUrl = urlEncrypteRepositoryStructure(
        "/api/pageProfile/secretaire/qrcode",
        [secretaireId, tabId ?? "main", pays],
        criptKey
      );
      const encryptedData = await invoke<any>("get_secretaire_qrcode", { payload: legacyUrl });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    voirInfoSecretaire: async (secretaireId: string, tabId?: string) => {
      const params = tabId ? [secretaireId, tabId, pays] : [secretaireId, pays];
      const legacyUrl = urlEncrypteRepositoryStructure(
        "/api/pageProfile/secretaire",
        params,
        criptKey
      );
      const encryptedData = await invoke<any>("get_secretaire_profile", { payload: legacyUrl });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    modifierSecretaire: async (updatedSecretaire: any) => {
      const payload = encrypteRepositoryStructure({ ...updatedSecretaire, pays }, criptKey);
      const encryptedData = await invoke<any>("update_secretaire_profile", { payload });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    ajouterSecretaire: async (secretaire: any) => {
      const payload = encrypteRepositoryStructure({ ...secretaire, pays }, criptKey);
      const encryptedData = await invoke<any>("create_secretaire", { payload });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    listerSecretaires: async (tabId: string, limit: number) => {
      const legacyUrl = urlEncrypteRepositoryStructure(
        "/api/pageProfile/secretaires",
        [tabId, limit.toString(), pays],
        criptKey
      );
      const encryptedData = await invoke<any>("list_secretaires", { payload: legacyUrl });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    supprimerSecretaire: async (secretaireId: string, tabId: string) => {
      const legacyUrl = urlEncrypteRepositoryStructure(
        "/api/pageProfile/secretaire",
        [secretaireId, tabId, pays],
        criptKey
      );
      const encryptedData = await invoke<any>("delete_secretaire", { payload: legacyUrl });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    // =========================
    // PRIVILEGES
    // =========================
    trouverPrivilege: async (privilegeId: string, loggId: string) => {
      const legacyUrl = urlEncrypteRepositoryStructure(
        "/api/pageProfile/privilege",
        [privilegeId, loggId, pays],
        criptKey
      );
      const encryptedData = await invoke<any>("get_privilege", { payload: legacyUrl });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    modifierUnPrivilege: async (privilege: any) => {
      const payload = encrypteRepositoryStructure({ ...privilege, pays }, criptKey);
      const encryptedData = await invoke<any>("update_privilege", { payload });
      return decrypteRepositoryStructure(encryptedData, criptKey);
    },

    verifierStatutPaiement: async (docteurId: string, tabId: string) => {
      try {
        const legacyUrl = urlEncrypteRepositoryStructure(
          "/api/autorisation/verifierStatutPaiement",
          [docteurId, tabId, pays],
          criptKey
        );
        const encryptedData = await invoke<any>("verifier_statut_paiement", { payload: legacyUrl });
        return decrypteRepositoryStructure(encryptedData, criptKey);
      } catch (error) {
        console.error("Erreur lors de la vérification du statut de paiement:", error);
        return { statut: "inconnu" as const, derniereDatePaiement: null };
      }
    },

    payerAvecPaydounia: async (docteur: any, privileges: string[]) => {
      try {
        const payload = encrypteRepositoryStructure(
          { docteur, privileges, pays },
          criptKey
        );
        const encryptedData = await invoke<any>("payer_paydunya", { payload });
        const result = decrypteRepositoryStructure(encryptedData, criptKey);
        return result?.urlDePaiement ?? result?.response_text ?? null;
      } catch (error) {
        console.error("Erreur lors du paiement Paydounia:", error);
        throw error;
      }
    },

    payerAvecPaydouniaMensuel: async (
      docteur: any,
      privileges: string[],
      nombreMois: number,
      montantTotal: number,
      typePaiement: string
    ) => {
      try {
        const payload = encrypteRepositoryStructure(
          { docteur, privileges, nombreMois, montantTotal, typePaiement, pays },
          criptKey
        );
        const encryptedData = await invoke<any>("payer_paydunya_mensuel", { payload });
        const result = decrypteRepositoryStructure(encryptedData, criptKey);
        return result?.urlDePaiement ?? result?.response_text ?? null;
      } catch (error) {
        console.error("Erreur lors du paiement Paydounia mensuel:", error);
        throw error;
      }
    },

    /**
     * À appeler après chaque paiement confirmé (retour PayDunya).
     * Enregistre la dernière date de paiement dans le fichier backup.
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

export default PageProfilController;
