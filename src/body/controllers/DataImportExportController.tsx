import { invoke } from "../../tauri-bridge";
import { criptKey } from "../../constants/index.ts";
import { encrypteRepositoryStructure, decrypteRepositoryStructure } from "../helpers/helpers";

export function DataImportExportController(pays: string, tabId: string = "main") {
    return {
        listTables: async () => {
            const payload = encrypteRepositoryStructure({ pays, tabId }, criptKey);
            const encryptedData = await invoke<any>("data_export_list_tables", { payload });
            const decrypted = decrypteRepositoryStructure(encryptedData, criptKey);
            const parsed = typeof decrypted === "string" ? (() => { try { return JSON.parse(decrypted); } catch { return null; } })() : decrypted;
            return parsed?.tables ?? [];
        },

        exportTable: async (tableName: string, dbColor: string) => {
            const payload = encrypteRepositoryStructure(
                { pays, tableName, dbColor, tabId },
                criptKey
            );
            const encryptedData = await invoke<any>("data_export_table", { payload });
            const decrypted = decrypteRepositoryStructure(encryptedData, criptKey);
            const parsed = typeof decrypted === "string" ? (() => { try { return JSON.parse(decrypted); } catch { return null; } })() : decrypted;
            return parsed?.csv ?? "";
        },

        listCustomColumns: async (tabId: string) => {
            const payload = encrypteRepositoryStructure({ pays, tabId }, criptKey);
            const encryptedData = await invoke<any>("data_list_custom_columns", { payload });
            const decrypted = decrypteRepositoryStructure(encryptedData, criptKey);
            const parsed = typeof decrypted === "string" ? (() => { try { return JSON.parse(decrypted); } catch { return null; } })() : decrypted;
            return parsed ?? { patient: [], acte: [] };
        },

        importTable: async (
            tableName: string,
            dbColor: string,
            csvContent: string,
            confirmModify?: boolean,
            /** Conservé pour compat ; le backend déduit le droit NEW_ depuis tab_privilege (iex03) + userId. */
            _allowNewColumns?: boolean
        ) => {
            const payload = encrypteRepositoryStructure(
                {
                    pays,
                    tableName,
                    dbColor,
                    tabId,
                    csvContent,
                    confirmModify: !!confirmModify,
                },
                criptKey
            );
            const encryptedData = await invoke<any>("data_import_table", { payload });
            const decrypted = decrypteRepositoryStructure(encryptedData, criptKey);
            const parsed = typeof decrypted === "string" ? (() => { try { return JSON.parse(decrypted); } catch { return null; } })() : decrypted;
            return parsed ?? { success: false, rowsInserted: 0 };
        },
    };
}
