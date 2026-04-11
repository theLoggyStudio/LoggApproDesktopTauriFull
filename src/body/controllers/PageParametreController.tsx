import { invoke } from "../../tauri-bridge";
import { criptKey } from "../../constants/index.ts";
import {
  encrypteRepositoryStructure,
  decrypteRepositoryStructure,
  urlEncrypteRepositoryStructure,
} from "../helpers/helpers";

export const PageParametreController = (pays: string) => {
  return {
    // =========================
    // TYPE ACTE (référentiel des types d'actes)
    // =========================
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

    modifierUnTypeActe: async (id: string, newTypeActe: any) => {
      try {
        const payload = encrypteRepositoryStructure({ id, ...newTypeActe, pays }, criptKey);
        const encryptedData = await invoke<any>("update_nom_acte", { payload });
        return decrypteRepositoryStructure(encryptedData, criptKey);
      } catch (error) {
        console.error("Erreur lors de la modification du type d'acte:", error);
        throw error;
      }
    },

    listerUnTypeActe: async (tabId: string, limit: number) => {
      try {
        const legacyUrl = urlEncrypteRepositoryStructure(
          "/api/pageParametre/nomActes",
          [tabId, limit.toString(), pays],
          criptKey
        );
        const encryptedData = await invoke<any>("list_nom_actes", { payload: legacyUrl });
        const result = decrypteRepositoryStructure(encryptedData, criptKey);
        return result != null && Array.isArray(result) ? result : [];
      } catch (error) {
        console.error("Erreur lors de la récupération des types d'actes:", error);
        return [];
      }
    },

    trouverUnTypeActe: async (id: string, userId: string) => {
      try {
        const legacyUrl = urlEncrypteRepositoryStructure(
          "/api/pageParametre/nomActe",
          [id, userId, pays],
          criptKey
        );
        const encryptedData = await invoke<any>("get_nom_acte", { payload: legacyUrl });
        return decrypteRepositoryStructure(encryptedData, criptKey);
      } catch (error) {
        console.error("Erreur lors de la récupération du type d'acte:", error);
        throw error;
      }
    },

    supprimerUnTypeActe: async (id: string, userId: string) => {
      try {
        const legacyUrl = urlEncrypteRepositoryStructure(
          "/api/pageParametre/nomActe",
          [id, userId, pays],
          criptKey
        );
        const encryptedData = await invoke<any>("delete_nom_acte", { payload: legacyUrl });
        return decrypteRepositoryStructure(encryptedData, criptKey);
      } catch (error) {
        console.error("Erreur lors de la suppression du type d'acte:", error);
        throw error;
      }
    },

    // =========================
    // TYPE ASSURANCE (référentiel des types d'assurances)
    // =========================
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

    modifierUnTypeAssurance: async (newTypeAssurance: any) => {
      try {
        const payload = encrypteRepositoryStructure({ ...newTypeAssurance, pays }, criptKey);
        const encryptedData = await invoke<any>("update_nom_assurance", { payload });
        return decrypteRepositoryStructure(encryptedData, criptKey);
      } catch (error) {
        console.error("Erreur lors de la modification du type d'assurance:", error);
        throw error;
      }
    },

    listerUnTypeAssurance: async (tabId: string, limit: number) => {
      try {
        const legacyUrl = urlEncrypteRepositoryStructure(
          "/api/pageParametre/nomAssurances",
          [tabId, limit.toString(), pays],
          criptKey
        );
        const encryptedData = await invoke<any>("list_nom_assurances", { payload: legacyUrl });
        const result = decrypteRepositoryStructure(encryptedData, criptKey);
        return result != null && Array.isArray(result) ? result : [];
      } catch (error) {
        console.error("Erreur lors de la récupération des types d'assurances:", error);
        return [];
      }
    },

    trouverUnTypeAssurance: async (id: string, userId: string) => {
      try {
        const legacyUrl = urlEncrypteRepositoryStructure(
          "/api/pageParametre/nomAssurance",
          [id, userId, pays],
          criptKey
        );
        const encryptedData = await invoke<any>("get_nom_assurance", { payload: legacyUrl });
        return decrypteRepositoryStructure(encryptedData, criptKey);
      } catch (error) {
        console.error("Erreur lors de la récupération du type d'assurance:", error);
        throw error;
      }
    },

    supprimerUnTypeAssurance: async (id: string, userId: string) => {
      try {
        const legacyUrl = urlEncrypteRepositoryStructure(
          "/api/pageParametre/nomAssurance",
          [id, userId, pays],
          criptKey
        );
        const encryptedData = await invoke<any>("delete_nom_assurance", { payload: legacyUrl });
        return decrypteRepositoryStructure(encryptedData, criptKey);
      } catch (error) {
        console.error("Erreur lors de la suppression du type d'assurance:", error);
        throw error;
      }
    },

  };
};
