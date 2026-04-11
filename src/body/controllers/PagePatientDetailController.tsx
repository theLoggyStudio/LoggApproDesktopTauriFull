import { invoke } from "../../tauri-bridge";
import { criptKey } from "../../constants/index.ts";
import { modeCrud } from "../Modules/Mode";
import {
  urlEncrypteRepositoryStructure,
  decrypteRepositoryStructure,
  encrypteRepositoryStructure,
} from "../helpers/helpers";

export const PagePatientDetailController = (pays: string) => {
  return {
    voirLePatient: async (mode: string, id: string, loggId: string, filename?: string) => {
      if (mode === "admin") {
        const { findPatientById } = modeCrud();
        return findPatientById(id, filename ?? "");
      }

      try {
        const legacyUrl = urlEncrypteRepositoryStructure(
          "/api/pagePatientDetail/patient",
          [id, loggId, pays],
          criptKey
        );

        const encryptedData = await invoke<any>("get_patient_detail", { payload: legacyUrl });
        const raw = decrypteRepositoryStructure(encryptedData, criptKey);
        if (!raw || typeof raw !== "object") return null;
        const u = raw?.user ?? {};
        const p = raw?.patient ?? {};
        const custom: Record<string, string> = {};
        if (p && typeof p === "object") {
          Object.keys(p).forEach((k) => {
            if (!["nomDeJeuneFille", "profession", "adresserPar", "observation", "date_creation", "dateCreation"].includes(k)) {
              const v = (p as any)[k];
              if (v != null) custom[k] = String(v);
            }
          });
        }
        return {
          id: u.id,
          nom: u.nom,
          prenom: u.prenom,
          login: u.login,
          password: u.password,
          telephone: u.telephone,
          naissance: u.naissance,
          role: u.role,
          adresse: u.adresse,
          nomDeJeuneFille: p.nomDeJeuneFille,
          profession: p.profession,
          adresserPar: p.adresserPar,
          observation: p.observation,
          dateCreation: p.date_creation ?? p.dateCreation,
          ...custom,
        };
      } catch (error) {
        console.error("Erreur lors de la récupération des informations du patient:", error);
        return null;
      }
    },

    modifierLePatient: async (mode: string, updatedPatient: any, filename?: string) => {
      if (mode === "admin") {
        const { addOrUpdatePatient } = modeCrud();
        if (filename) addOrUpdatePatient({ ...updatedPatient, pays }, filename);
        return;
      }

      try {
        const payload = encrypteRepositoryStructure({ ...updatedPatient, pays }, criptKey);
        const encryptedData = await invoke<any>("update_patient_detail", { payload });
        return decrypteRepositoryStructure(encryptedData, criptKey);
      } catch (error) {
        console.error("Erreur lors de la modification des informations du patient:", error);
        return null;
      }
    },

    supprimerLePatient: async (mode: string, id: string, tabId: string, filename?: string) => {
      if (mode === "admin") {
        const { deletePatient } = modeCrud();
        if (filename) deletePatient(id, filename);
        return;
      }

      try {
        const legacyUrl = urlEncrypteRepositoryStructure(
          "/api/pagePatientDetail/patient",
          [id, tabId, pays],
          criptKey
        );

        const encryptedData = await invoke<any>("delete_patient", { payload: legacyUrl });
        return decrypteRepositoryStructure(encryptedData, criptKey);
      } catch (error) {
        console.error("Erreur lors de la suppression du patient:", error);
        return null;
      }
    },

    ajouterUnActe: async (mode: string, newActe: any, filename?: string) => {
      if (mode === "admin") {
        const { addOrUpdateActe } = modeCrud();
        if (filename) addOrUpdateActe(newActe.acte.loggId, { ...newActe, pays }, filename);
        return;
      }

      try {
        const payload = encrypteRepositoryStructure({ ...newActe, pays }, criptKey);
        const encryptedData = await invoke<any>("add_acte", { payload });
        return decrypteRepositoryStructure(encryptedData, criptKey);
      } catch (error) {
        console.error("Erreur lors de l'ajout d'un acte:", error);
        return null;
      }
    },

    listerLesActes: async (mode: string, patientId: string, limit: number, tabId: string, filename?: string) => {
      if (mode === "admin") {
        const { findActeByLoggId } = modeCrud();
        return findActeByLoggId(patientId);
      }

      try {
        const legacyUrl = urlEncrypteRepositoryStructure(
          "/api/pagePatientDetail/actes",
          [patientId, limit.toString(), tabId, pays],
          criptKey
        );

        const encryptedData = await invoke<any>("list_actes_by_patient", { payload: legacyUrl });
        const result = decrypteRepositoryStructure(encryptedData, criptKey);
        return result !== null && Array.isArray(result) ? result : [];
      } catch (error) {
        console.error("Erreur lors de la récupération des actes:", error);
        return [];
      }
    },

    modifierUnActe: async (mode: string, updatedActe: any, filename?: string) => {
      if (mode === "admin") {
        const { addOrUpdateActe } = modeCrud();
        if (filename) addOrUpdateActe(updatedActe.acte.loggId, { ...updatedActe, pays }, filename);
        return;
      }

      try {
        const payload = encrypteRepositoryStructure({ ...updatedActe, pays }, criptKey);
        const encryptedData = await invoke<any>("update_acte", { payload });
        return decrypteRepositoryStructure(encryptedData, criptKey);
      } catch (error) {
        console.error("Erreur lors de la modification de l'acte:", error);
        return null;
      }
    },

    supprimerActe: async (
      mode: string,
      patientId: string,
      acteId: string,
      loggId: string,
      tabId: string,
      filename?: string
    ) => {
      if (mode === "admin") {
        const { deleteActe } = modeCrud();
        if (filename) deleteActe(patientId, acteId, loggId, filename);
        return;
      }

      try {
        const legacyUrl = urlEncrypteRepositoryStructure(
          "/api/pagePatientDetail/acte",
          [acteId, loggId, tabId, pays],
          criptKey
        );

        const encryptedData = await invoke<any>("delete_acte", { payload: legacyUrl });
        return decrypteRepositoryStructure(encryptedData, criptKey);
      } catch (error) {
        console.error("Erreur lors de la suppression de l'acte:", error);
        return null;
      }
    },

    voirUnActe: async (mode: string, id: string, tabId: string, filename?: string) => {
      if (mode === "admin") {
        const { findActeByLoggId } = modeCrud();
        return filename ? findActeByLoggId(id) : null;
      }

      try {
        const legacyUrl = urlEncrypteRepositoryStructure(
          "/api/pagePatientDetail/acte",
          [tabId, id, pays],
          criptKey
        );

        const encryptedData = await invoke<any>("get_acte", { payload: legacyUrl });
        return decrypteRepositoryStructure(encryptedData, criptKey);
      } catch (error) {
        console.error("Erreur lors de la récupération de l'acte:", error);
        return null;
      }
    },

    // ---------------------
    // ASSURANCES / ACTES (noms)
    // ---------------------
    listerLesTypeAssurances: async (limit: number, tabId: string) => {
      try {
        const encryptedData = await invoke<any>("list_nom_assurances", {
          payload: encrypteRepositoryStructure({ tabId, limit, pays }, criptKey),
        });
        const result = decrypteRepositoryStructure(encryptedData, criptKey);
        return result != null && Array.isArray(result) ? result : [];
      } catch (error) {
        console.error("Erreur lors de la récupération des assurances:", error);
        return [];
      }
    },

    listerLesTypeActes: async (tabId: string, limit: number) => {
      try {
        const encryptedData = await invoke<any>("list_nom_actes", {
          payload: encrypteRepositoryStructure({ tabId, limit, pays }, criptKey),
        });
        const result = decrypteRepositoryStructure(encryptedData, criptKey);
        return result != null && Array.isArray(result) ? result : [];
      } catch (error) {
        console.error("Erreur lors de la récupération des actes:", error);
        return [];
      }
    },

    // ---------------------
    // AJOUT NOM ACTE / NOM ASSURANCE (profil)
    // ---------------------
    ajouterUnTypeActe: async (newTypeActe: any) => {
      try {
        const payload = encrypteRepositoryStructure({ ...newTypeActe, pays }, criptKey);
        const encryptedData = await invoke<any>("add_nom_acte", { payload });
        return decrypteRepositoryStructure(encryptedData, criptKey);
      } catch (error) {
        console.error("Erreur lors de l'ajout du type d'acte:", error);
        throw error;
      }
    },

    ajouterUnTypeAssurance: async (newTypeAssurance: any) => {
      try {
        const payload = encrypteRepositoryStructure({ ...newTypeAssurance, pays }, criptKey);
        const encryptedData = await invoke<any>("add_nom_assurance", { payload });
        return decrypteRepositoryStructure(encryptedData, criptKey);
      } catch (error) {
        console.error("Erreur lors de l'ajout du type d'assurance:", error);
        throw error;
      }
    },

    // ---------------------
    // MATERIELS
    // ---------------------
    listerLesNomMateriels: async (mode: string, tabId: string, limit: number, filename?: string) => {
      if (mode === "admin") return [];

      try {
        const legacyUrl = urlEncrypteRepositoryStructure(
          "/api/pageProfile/nomMateriels",
          [tabId, limit.toString(), pays],
          criptKey
        );

        const encryptedData = await invoke<any>("list_nom_materiels", { payload: legacyUrl });
        const result = decrypteRepositoryStructure(encryptedData, criptKey);
        return result != null && Array.isArray(result) ? result : [];
      } catch (error) {
        console.error("Erreur lors de la récupération des matériels:", error);
        return [];
      }
    },

    trouverLesMaterielsParActeId: async (mode: string, acteId: string, tabId: string, filename?: string) => {
      if (mode === "admin") return [];

      try {
        const legacyUrl = urlEncrypteRepositoryStructure(
          "/api/pagePatientDetail/materiels",
          [acteId, tabId, pays],
          criptKey
        );

        const encryptedData = await invoke<any>("get_materiels_by_acte", { payload: legacyUrl });
        return decrypteRepositoryStructure(encryptedData, criptKey);
      } catch (error) {
        console.error("Erreur lors de la récupération des matériels de l'acte:", error);
        return [];
      }
    },

    /** Met à jour uniquement la liste des matériels consommés pour un acte (stock réajusté côté serveur). */
    mettreAJourMaterielsActe: async (
      mode: string,
      acteId: string,
      tabId: string,
      materiels: { id: string; quantite: number }[],
      _filename?: string
    ) => {
      if (mode === "admin") return null;

      try {
        const payload = encrypteRepositoryStructure({ tabId, acteId, materiels, pays }, criptKey);
        const encryptedData = await invoke<any>("update_acte_materiels", { payload });
        return decrypteRepositoryStructure(encryptedData, criptKey);
      } catch (error: any) {
        console.error("Erreur lors de la mise à jour des matériels de l'acte:", error);
        const msg =
          typeof error === "string"
            ? error
            : String(error?.message ?? error ?? "Erreur matériels / stock");
        throw new Error(msg);
      }
    },

    ajouterUnNomMateriel: async (mode: string, newNomMateriel: any, tabId?: string, _filename?: string) => {
      if (mode === "admin") return null;

      try {
        const payload = encrypteRepositoryStructure({ ...newNomMateriel, tabId: tabId ?? newNomMateriel.loggId, pays }, criptKey);
        const encryptedData = await invoke<any>("add_nom_materiel", { payload });
        return decrypteRepositoryStructure(encryptedData, criptKey);
      } catch (error) {
        console.error("Erreur lors de l'ajout d'un nom de matériel:", error);
        throw error;
      }
    },

    modifierUnNomMateriel: async (mode: string, updatedNomMateriel: any, tabId?: string, _filename?: string) => {
      if (mode === "admin") return null;
      try {
        const payload = encrypteRepositoryStructure({ ...updatedNomMateriel, tabId: tabId ?? updatedNomMateriel.loggId, pays }, criptKey);
        const encryptedData = await invoke<any>("update_nom_materiel", { payload });
        return decrypteRepositoryStructure(encryptedData, criptKey);
      } catch (error) {
        console.error("Erreur lors de la modification du matériel:", error);
        throw error;
      }
    },

    supprimerUnNomMateriel: async (mode: string, id: string, tabId: string | undefined, _filename?: string) => {
      if (mode === "admin") return null;
      try {
        const legacyUrl = urlEncrypteRepositoryStructure("/api/pageProfile/nomMateriel", [id, tabId ?? "", pays], criptKey);
        const encryptedData = await invoke<any>("delete_nom_materiel", { payload: legacyUrl });
        return decrypteRepositoryStructure(encryptedData, criptKey);
      } catch (error) {
        console.error("Erreur lors de la suppression du matériel:", error);
        throw error;
      }
    },
  };
};
