import { invoke } from "../../tauri-bridge";
import { criptKey } from "../../constants/index.ts";
import { modeCrud } from "../Modules/Mode";
import {
  encrypteRepositoryStructure,
  decrypteRepositoryStructure,
  urlEncrypteRepositoryStructure,
} from "../helpers/helpers";

export const PagePatientController = (pays: string) => {
  return {
    createPatient: async (mode: string, newPatient: any, filename?: string) => {
      if (mode === "admin") {
        const { addOrUpdatePatient } = modeCrud();
        if (filename) addOrUpdatePatient({ ...newPatient, role: "patient", pays }, filename);
        return;
      }

      try {
        // POST /api/pagePatient/patient -> upsert_patient
        const payload = encrypteRepositoryStructure({ ...newPatient, role: "patient", pays }, criptKey);
        await invoke("upsert_patient", { payload });
      } catch (error) {
        console.error("Erreur lors de la création du patient:", error);
        throw error;
      }
    },

    listerPatient: async (mode: string, tabId: string, limit: number, fileName?: string) => {
      if (mode === "admin") {
        const patients = fileName && modeCrud().listPatients(fileName);
        return patients ?? [];
      }

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
          loggId: item?.user?.loggId,
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

    voirQrCode: async (id: string, tabId: string) => {
      const result: any = {
        id,
        part1: "",
        part2: "",
        part3: "",
        part4: "",
        part5: "",
        part6: "",
        part7: "",
        part8: "",
        part9: "",
        part10: "",
        loggId: id,
        pays,
        dateCreation: "",
      };

      try {
        // Une seule requête : le QR est généré à la demande (pas de stockage)
        const legacyUrl = urlEncrypteRepositoryStructure(
          "/api/pagePatient/qrcode",
          [id, "1", tabId, pays],
          criptKey
        );
        const encryptedItem = await invoke<any>("get_qrcode_part", { payload: legacyUrl });
        const item = decrypteRepositoryStructure(encryptedItem, criptKey);
        result.part1 = item?.part1 || "";
        result.loggId = item?.loggId || item?.logg_id || id;
        result.dateCreation = item?.date_creation || "";
        result.pays = item?.pays || pays;
        return result;
      } catch (err) {
        console.error(err);
        throw err;
      }
    },
  };
};
