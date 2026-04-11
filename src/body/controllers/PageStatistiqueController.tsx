import { invoke } from "../../tauri-bridge";
import { criptKey } from "../../constants/index.ts";
import {
  encrypteRepositoryStructure,
  decrypteRepositoryStructure,
  urlEncrypteRepositoryStructure,
} from "../helpers/helpers";

/** Réponse Tauri / HTTP : objet { body } ou chaîne JSON. */
function normalizeInvokePayload(data: unknown): unknown {
  if (data == null) return null;
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }
  return data;
}

export function PageStatistiqueController(pays: string) {
  return {
    // Récupérer tous les noms d'actes uniques sur une période
    recupererLesNomActesExistantes: async (dateDebut: string, dateFin: string, tabId: string) => {
      try {
        const legacyUrl = urlEncrypteRepositoryStructure(
          "/api/statistique/NomActesExistantes",
          [dateDebut, dateFin, tabId, pays],
          criptKey
        );

        const encryptedData = await invoke<any>("stats_list_nom_actes", { payload: legacyUrl });
        const result = decrypteRepositoryStructure(normalizeInvokePayload(encryptedData), criptKey);
        return result != null && Array.isArray(result) ? result : [];
      } catch (err) {
        console.error("Erreur lors de la récupération des noms d'actes:", err);
        return [];
      }
    },

    recupererLesStatisiquesDesActes: async (
      dateDebut: string,
      dateFin: string,
      nomActes: string[],
      tabId: string,
      abscisseType?: string,
      groupByPeriod?: string,
      detailedView?: boolean
    ) => {
      try {
        // addAuth: false — évite d’injecter userId/dbPassword dans le JSON stats (certaines couches perdaient le tableau nomActes).
        const payload = encrypteRepositoryStructure(
          {
            dateDebut,
            dateFin,
            nomActes: Array.isArray(nomActes) ? [...nomActes] : [],
            tabId,
            pays,
            abscisseType: abscisseType || "type_acte",
            groupByPeriod: groupByPeriod || "mois",
            detailedView: detailedView || false,
          },
          criptKey,
          false
        );

        const encryptedData = await invoke<any>("stats_get_info", { payload });

        const decrypted = decrypteRepositoryStructure(normalizeInvokePayload(encryptedData), criptKey);

        // Si c'est un tableau avec message d'erreur, retourner tel quel
        if (Array.isArray(decrypted) && decrypted.length > 0 && (decrypted as any)[0]?.message) {
          return decrypted;
        }

        // Sinon mapper les données
        return Array.isArray(decrypted)
          ? decrypted.map((d: any) => ({
              ...d,
              name:
                d.nomActe ||
                d.periode ||
                d.tranchePrix ||
                d.typeAssurance ||
                d.statutPaiement ||
                d.jourSemaine ||
                "N/A",
            }))
          : [];
      } catch (err) {
        console.error("Erreur lors de la récupération des statistiques des actes:", err);
        return [];
      }
    },
  };
}
