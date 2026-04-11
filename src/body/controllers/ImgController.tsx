import { invoke } from "../../tauri-bridge";
import { criptKey } from "../../constants/index.ts";
import {
  encrypteRepositoryStructure,
  decrypteRepositoryStructure,
  urlEncrypteRepositoryStructure,
} from "../helpers/helpers";

export const ImgController = (pays: string) => {
  return {
    voirPhoto: async (imgId: string, userId: string) => {
      const result: any = {
        id: imgId,
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
        loggId: "",
        pays,
        dateCreation: "",
      };

      try {
        // Même logique qu’avant: récupérer 10 parties
        const invokePromises = Array.from({ length: 10 }, (_, index) => {
          const partNum = index + 1;

          // On conserve ton ancien format d’URL encryptée comme payload "legacy"
          // (utile pour migrer sans casser ton chiffrement côté backend)
          const legacyUrl = urlEncrypteRepositoryStructure(
            "/api/img/photo",
            [imgId, partNum.toString(), userId, pays],
            criptKey ?? ""
          );

          return invoke<any>("get_photo_part", { payload: legacyUrl });
        });

        const responses = await Promise.allSettled(invokePromises);

        for (let index = 0; index < responses.length; index++) {
          const partNum = index + 1;
          const partKey = `part${partNum}` as keyof typeof result;

          const settled = responses[index];
          if (settled.status === "rejected") {
            result[partKey] = "";
            continue;
          }

          let encryptedItem = settled.value;

          // Si le backend renvoie une string JSON, on parse (comme ton code)
          if (typeof encryptedItem === "string") {
            try {
              encryptedItem = JSON.parse(encryptedItem);
            } catch {
              result[partKey] = "";
              continue;
            }
          }

          if (!encryptedItem || typeof encryptedItem !== "object") {
            result[partKey] = "";
            continue;
          }

          try {
            const item = decrypteRepositoryStructure(encryptedItem, criptKey);

            // Sur la 1ère part, on récupère metadata si dispo
            if (item && index === 0) {
              result.loggId = item.loggId || item.logg_id || "";
              result.dateCreation = item.date_creation || "";
              result.pays = pays;
            }

            result[partKey] = item?.[partKey] || "";
          } catch (decryptErr) {
            console.error(`Erreur déchiffrement part${partNum}:`, decryptErr);
            result[partKey] = "";
          }
        }

        return result;
      } catch (err) {
        console.error("Error fetching photo:", err);
        throw err;
      }
    },

    ajouterPhoto: async (img: any) => {
      try {
        const encryptedImg = encrypteRepositoryStructure({ ...img, pays }, criptKey);

        // Option B: save via invoke
        const encryptedResult = await invoke<any>("save_photo", {
          payload: encryptedImg,
        });

        const result = decrypteRepositoryStructure(encryptedResult, criptKey);
        return result;
      } catch (err) {
        console.error("Erreur lors de la sauvegarde de la photo:", err);
        throw err;
      }
    },

    // OBSOLETE: compat (une seule radio)
    voirRadio: async (acteId: string, tabId: string) => {
      try {
        const radioId = acteId;
        const photoData = await ImgController(pays).voirPhoto(radioId, tabId);

        const radioComplete =
          (photoData.part1 || "") +
          (photoData.part2 || "") +
          (photoData.part3 || "") +
          (photoData.part4 || "") +
          (photoData.part5 || "") +
          (photoData.part6 || "") +
          (photoData.part7 || "") +
          (photoData.part8 || "") +
          (photoData.part9 || "") +
          (photoData.part10 || "");

        return radioComplete || null;
      } catch (err) {
        console.error("Error fetching radio:", err);
        return null;
      }
    },

    supprimerRadio: async (radioId: string, tabId: string) => {
      try {
        const photoData = {
          id: radioId,
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
          loggId: tabId,
          tabId,
          pays,
        };

        await ImgController(pays).ajouterPhoto(photoData);
        return { success: true };
      } catch (err) {
        console.error("Error deleting radio:", err);
        return { success: false, error: err };
      }
    },

    ajouterRadio: async (radioData: {
      acteId: string;
      radioIndex: number;
      imageBase64: string;
      tabId: string;
    }) => {
      try {
        const { acteId, imageBase64, tabId } = radioData;

        // ID unique timestamp (comme ton code)
        const radioId = new Date().getTime().toString();

        const nombrePartitions = 10;
        const partitions: Record<string, string> = {};
        const taillePartition = Math.floor(imageBase64.length / nombrePartitions);
        const reste = imageBase64.length % nombrePartitions;

        for (let i = 0; i < nombrePartitions; i++) {
          const debut = i * taillePartition + Math.min(i, reste);
          const fin = debut + taillePartition + (i < reste ? 1 : 0);
          partitions[`part${i + 1}`] = imageBase64.substring(debut, fin);
        }

        const photoData = {
          id: radioId,
          part1: partitions.part1 || "",
          part2: partitions.part2 || "",
          part3: partitions.part3 || "",
          part4: partitions.part4 || "",
          part5: partitions.part5 || "",
          part6: partitions.part6 || "",
          part7: partitions.part7 || "",
          part8: partitions.part8 || "",
          part9: partitions.part9 || "",
          part10: partitions.part10 || "",
          loggId: acteId, // loggId = acteId
          tabId,
          pays,
        };

        return await ImgController(pays).ajouterPhoto(photoData);
      } catch (err) {
        console.error("Erreur lors de l'ajout de la radio:", err);
        throw err;
      }
    },

    voirRadiosParActe: async (acteId: string, tabId: string) => {
      try {
        // Payload legacy (ancien format URL encryptée)
        const legacyUrl = urlEncrypteRepositoryStructure(
          "/api/img/radios",
          [acteId, tabId, pays],
          criptKey ?? ""
        );

        const encryptedPhotos = await invoke<any>("get_radios_by_acte", {
          payload: legacyUrl,
        });

        let parsed = encryptedPhotos;

        if (typeof parsed === "string") {
          try {
            parsed = JSON.parse(parsed);
          } catch {
            return [];
          }
        }

        const photos = decrypteRepositoryStructure(parsed, criptKey);

        if (!photos || !Array.isArray(photos)) {
          return [];
        }

        return photos
          .map((photo: any) => ({
            id: photo.id,
            imageData:
              (photo.part1 || "") +
              (photo.part2 || "") +
              (photo.part3 || "") +
              (photo.part4 || "") +
              (photo.part5 || "") +
              (photo.part6 || "") +
              (photo.part7 || "") +
              (photo.part8 || "") +
              (photo.part9 || "") +
              (photo.part10 || ""),
            dateCreation: photo.date_creation || "",
            acteId: photo.logg_id || photo.loggId || acteId,
          }))
          .filter((radio: any) => radio.imageData && radio.imageData.includes("data:image"));
      } catch (err) {
        console.error("Erreur lors de la récupération des radios par acte:", err);
        return [];
      }
    },
  };
};
