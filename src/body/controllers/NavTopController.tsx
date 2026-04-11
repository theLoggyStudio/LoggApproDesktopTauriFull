import { invoke } from "../../tauri-bridge";
import { criptKey } from "../../constants/index.ts";
import { decrypteRepositoryStructure, urlEncrypteRepositoryStructure } from "../helpers/helpers";

const NavTopController = (pays: string) => {
  return {
    chercherPatients: async (tabId: string, theValueSearch: string) => {
      try {
        // Payload legacy (ancien format URL encryptée)
        const legacyUrl = urlEncrypteRepositoryStructure(
          "/api/navtop/patients/chercher",
          [tabId, theValueSearch, pays],
          criptKey ?? ""
        );

        // Option B: appel direct Rust
        const encryptedData = await invoke<any>("search_patients", { payload: legacyUrl });

        const decryptedData = decrypteRepositoryStructure(encryptedData, criptKey);

        if (typeof decryptedData === "string" || !decryptedData || !Array.isArray(decryptedData)) {
          return [];
        }

        return decryptedData.map((item: any) => ({
          id: item?.user?.id,
          nom: item?.user?.nom,
          prenom: item?.user?.prenom,
          photo: item?.user?.photo,
          login: item?.user?.login,
          email: item?.user?.login,
          password: item?.user?.password,
          telephone: item?.user?.telephone,
          naissance: item?.user?.naissance,
          role: item?.user?.role,
          adresse: item?.user?.adresse,
          loggId: item?.user?.loggId,
          nomDeJeuneFille: item?.patient?.nomDeJeuneFille,
          profession: item?.patient?.profession,
          adresserPar: item?.patient?.adresserPar,
          observation: item?.patient?.observation,
          dateCreation: item?.patient?.dateCreation,
          avoirAnnuelle: item?.patient?.avoirAnnuelle,
        }));
      } catch (error) {
        console.error("Erreur lors de la récupération des patients:", error);
        return [];
      }
    },
  };
};

export default NavTopController;
