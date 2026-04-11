import { invoke } from "../../tauri-bridge";
import { criptKey } from "../../constants/index.ts";
import { encrypteRepositoryStructure, decrypteRepositoryStructure } from "../helpers/helpers";
import type { DocumentTemplate } from "../Pages/page_etat/templates/documentTemplates";

export function ModeleEtatController(pays: string) {
    return {
        listModeles: async (tabId: string): Promise<DocumentTemplate[]> => {
            const payload = encrypteRepositoryStructure({ pays, tabId }, criptKey);
            const encryptedData = await invoke<any>("list_modeles_etat", { payload });
            const decrypted = decrypteRepositoryStructure(encryptedData, criptKey);
            const parsed = typeof decrypted === "string" ? (() => { try { return JSON.parse(decrypted); } catch { return null; } })() : decrypted;
            const modeles = parsed?.modeles ?? [];
            return modeles.map((m: any) => ({
                id: m.id,
                name: m.name,
                icon: m.icon ?? "📄",
                description: m.description ?? "",
                category: m.category ?? "administratif",
                elements: m.elements ?? []
            }));
        },

        saveModele: async (tabId: string, template: DocumentTemplate): Promise<{ id: string }> => {
            const payload = encrypteRepositoryStructure({
                pays,
                tabId,
                id: template.id,
                name: template.name,
                icon: template.icon,
                description: template.description,
                category: template.category,
                elements: template.elements
            }, criptKey);
            const encryptedData = await invoke<any>("save_modele_etat", { payload });
            const decrypted = decrypteRepositoryStructure(encryptedData, criptKey);
            const parsed = typeof decrypted === "string" ? (() => { try { return JSON.parse(decrypted); } catch { return null; } })() : decrypted;
            return { id: parsed?.id ?? template.id };
        },

        deleteModele: async (tabId: string, id: string): Promise<boolean> => {
            const payload = encrypteRepositoryStructure({ pays, tabId, id }, criptKey);
            const encryptedData = await invoke<any>("delete_modele_etat", { payload });
            const decrypted = decrypteRepositoryStructure(encryptedData, criptKey);
            const parsed = typeof decrypted === "string" ? (() => { try { return JSON.parse(decrypted); } catch { return null; } })() : decrypted;
            return parsed?.success ?? false;
        }
    };
}
