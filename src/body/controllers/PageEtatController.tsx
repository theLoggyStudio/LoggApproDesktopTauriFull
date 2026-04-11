import { invoke } from "../../tauri-bridge";
import { criptKey } from "../../constants/index.ts";
import { modeCrud } from "../Modules/Mode";
import { urlEncrypteRepositoryStructure, decrypteRepositoryStructure } from "../helpers/helpers";

const PageEtatController = (pays: string) => {
  return {
    listerPatient: async (mode: string, tabId: string, limit: number, fileName?: string) => {
      // Mode admin: lecture locale (inchangé)
      if (mode === "admin") {
        const patients = fileName && modeCrud().listPatients(fileName);
        return patients ?? [];
      }

      // Option B: même logique pour client et autres modes
      try {
        const legacyUrl = urlEncrypteRepositoryStructure(
          "/api/pagePatient/patients",
          [tabId, limit.toString(), pays],
          criptKey
        );

        const encryptedData = await invoke<any>("list_patients", { payload: legacyUrl });
        const data = decrypteRepositoryStructure(encryptedData, criptKey);

        if (!data || !Array.isArray(data)) return [];

        return data.map((item: any) => ({
          id: item?.user?.id,
          nom: item?.user?.nom,
          prenom: item?.user?.prenom,
          photo: item?.user?.photo,
          login: item?.user?.login,
          password: item?.user?.password,
          telephone: item?.user?.telephone,
          naissance: item?.user?.naissance,
          role: item?.user?.role,
          adresse: item?.user?.adresse,
          nomDeJeuneFille: item?.patient?.nomDeJeuneFille,
          profession: item?.patient?.profession,
          adresserPar: item?.patient?.adresserPar,
          observation: item?.patient?.observation,
          dateCreation: item?.patient?.date_creation ?? item?.patient?.dateCreation,
          pays,
        }));
      } catch (error) {
        console.error("Erreur lors de la récupération des patients:", error);
        return [];
      }
    },

    listerLesActes: async (
      mode: string,
      patientId: string,
      limit: number,
      tabId: string,
      filename?: string
    ) => {
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

    voirInfoDocteur: async (docteurId: string, tabId: string) => {
      try {
        const legacyUrl = urlEncrypteRepositoryStructure(
          "/api/pageProfile/docteur",
          [docteurId, tabId, pays],
          criptKey
        );

        const encryptedData = await invoke<any>("get_docteur_profile", { payload: legacyUrl });
        return decrypteRepositoryStructure(encryptedData, criptKey);
      } catch (error) {
        console.error("Erreur lors de la récupération du docteur:", error);
        return null;
      }
    },
  };
};

export default PageEtatController;
