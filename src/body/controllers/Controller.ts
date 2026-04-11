import { invoke } from "../../tauri-bridge";

/**
 * action attendu:
 * {
 *   command: "nom_commande_rust",
 *   errorText?: string
 * }
 *
 * params: tableau de strings (ex: ["id", "tabId"])
 * obj: payload (optionnel)
 *
 * Côté Rust, tu recevras généralement:
 * - params: Vec<String>
 * - obj: serde_json::Value (ou String chiffrée)
 */
export async function Controller(action: any, params: string[], obj: any | undefined) {
  const command = action?.command;
  if (!command) {
    throw new Error("Controller: action.command is required (Option B)");
  }

  try {
    // payload standard
    const result = await invoke<any>(command, {
      params: params ?? [],
      obj: obj ?? null,
    });

    return result;
  } catch (error) {
    console.error(action?.errorText ?? `Erreur Controller(${command})`, error);
    throw error;
  }
}

/**
 * Même principe, mais gère le cas "photo" partitionnée:
 * - si obj contient part1..part10 -> on envoie part par part
 *
 * action attendu:
 * {
 *   command: "nom_commande_rust",
 *   errorText?: string
 * }
 *
 * Convention proposée:
 * - command "save_photo_part" reçoit { id, partKey, partValue, tabId, ... }
 * - ou command "save_photo" reçoit l'objet complet (recommandé)
 *
 * Ici je conserve ton comportement: envoi par part si détecté.
 */
export async function imgController(action: any, params: string[], obj: any | undefined) {
  const command = action?.command;
  if (!command) {
    throw new Error("imgController: action.command is required (Option B)");
  }

  try {
    // Si c'est une photo partitionnée (part1..)
    if (obj && Object.keys(obj).some((key) => key.startsWith("part"))) {
      const partEntries = Object.entries(obj).filter(
        ([key, value]) => key.startsWith("part") && value
      );

      // Envoi séquentiel (plus stable). Si tu veux parallèle: Promise.all(...)
      for (const [partKey, partValue] of partEntries) {
        const partData = {
          // on conserve ton contrat minimal
          id: obj.id,
          tabId: obj.tabId,
          // part1/part2/...
          [partKey]: partValue,
          // on passe aussi params si tu en avais besoin
          params: params ?? [],
        };

        await invoke(command, { obj: partData });
      }

      return { success: true };
    }

    // Sinon appel normal
    const result = await invoke<any>(command, {
      params: params ?? [],
      obj: obj ?? null,
    });

    return result;
  } catch (error) {
    console.error(action?.errorText ?? `Erreur imgController(${command})`, error);
    throw error;
  }
}
