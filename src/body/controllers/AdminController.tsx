import { invoke } from "../../tauri-bridge";
import { criptKey } from "../../constants/index.ts";
import { decrypteRepositoryStructure, encrypteRepositoryStructure } from "../helpers/helpers";

/**
 * Option B (Tauri/Rust) :
 * - Plus de fetch HTTP
 * - Appel direct vers les commands Rust via invoke()
 *
 * Pré-requis côté Rust:
 * - #[tauri::command] async fn upsert_patient(payload: String) -> Result<serde_json::Value, String>
 * - #[tauri::command] async fn add_acte(payload: String) -> Result<serde_json::Value, String>
 *
 * Remarque: payload est ici un STRING JSON (chiffré ou non).
 * Côté Rust tu déchiffres (si tu veux garder le chiffrement) puis tu insert en SQLite.
 */
export const adminController = (setAlertObj: any, pays: string) => {
  return {
    exportJsonContent: async (patients: any[]) => {
      try {
        setAlertObj({ type: "warning", text: "chargement...", show: true });

        if (!patients?.length) {
          setAlertObj({ type: "info", text: "Aucun patient à importer", show: true });
          return;
        }

        for (const p of patients) {
          // 1) patient
          const patientPayload = encrypteRepositoryStructure(
            { ...p.patient, role: "patient", pays },
            criptKey
          );

          // Appel direct Rust (pas de HTTP)
          // Rust doit gérer: decrypt + insert/update
          await invoke("upsert_patient", { payload: patientPayload });

          // 2) actes
          if (Array.isArray(p.actes) && p.actes.length) {
            for (const a of p.actes) {
              try {
                const actePayload = encrypteRepositoryStructure({ ...a, pays }, criptKey);

                const encryptedResponse = await invoke<any>("add_acte", { payload: actePayload });

                // Si côté Rust tu renvoies une réponse chiffrée (optionnel)
                // tu peux la déchiffrer comme avant
                // sinon tu peux directement retourner encryptedResponse
                // Ici je garde ton comportement existant :
                const decrypted = decrypteRepositoryStructure(encryptedResponse, criptKey);

                // ⚠️ IMPORTANT:
                // Dans ton code d’origine tu "return" dès le premier acte (ça stoppe toute la boucle).
                // Ça ressemble à un bug. Je corrige: on NE return PAS ici.
                // Si tu veux collecter des résultats, stocke-les dans un tableau.
                // Exemple: results.push(decrypted);
                void decrypted;
              } catch (error) {
                console.error("Erreur lors de l'ajout d'un acte:", error);
              }
            }
          }
        }

        setAlertObj({
          type: "success",
          text: "Les patients ont été ajoutés avec succès",
          show: true,
        });
      } catch (e: any) {
        console.error(e);
        setAlertObj({
          type: "danger",
          text: `Erreur import: ${e?.message ?? String(e)}`,
          show: true,
        });
      }
    },
  };
};
