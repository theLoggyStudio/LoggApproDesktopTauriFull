import { invoke } from "../../tauri-bridge";
import {
  criptKey,
  getAdminConfig,
  type AdminConfig,
} from "../../constants/index.ts";
import {
  encrypteRepositoryStructure,
  decrypteRepositoryStructure,
} from "../helpers/helpers";

/** Normalise AdminConfig (login/password) ou ConfigCredentials (userId/dbPassword) vers ConfigCredentials */
function toCredentials(auth: ConfigCredentials | AdminConfig): ConfigCredentials {
  return "userId" in auth ? auth : { userId: auth.login, dbPassword: auth.password };
}

export interface ConfigCredentials {
  userId: string;
  dbPassword: string;
}

export interface AppConfig {
  paydunya_mode?: string;
  paydunya_cle_principale?: string;
  paydunya_test_cle_publique?: string;
  paydunya_test_cle_privee?: string;
  paydunya_test_token?: string;
  paydunya_live_cle_publique?: string;
  paydunya_live_cle_privee?: string;
  paydunya_live_token?: string;
  db_type?: string;
  db_path?: string;
  db_type_yellow?: string;
  db_type_green?: string;
  db_type_blue?: string;
  db_type_orange?: string;
  db_type_pink?: string;
  db_path_yellow?: string;
  db_path_green?: string;
  db_path_blue?: string;
  db_path_orange?: string;
  db_path_pink?: string;
  db_host_yellow?: string;
  db_host_green?: string;
  db_host_blue?: string;
  db_host_orange?: string;
  db_host_pink?: string;
  db_port_yellow?: string;
  db_port_green?: string;
  db_port_blue?: string;
  db_port_orange?: string;
  db_port_pink?: string;
  db_name_yellow?: string;
  db_name_green?: string;
  db_name_blue?: string;
  db_name_orange?: string;
  db_name_pink?: string;
  db_user_yellow?: string;
  db_user_green?: string;
  db_user_blue?: string;
  db_user_orange?: string;
  db_user_pink?: string;
  db_password_yellow?: string;
  db_password_green?: string;
  db_password_blue?: string;
  db_password_orange?: string;
  db_password_pink?: string;
  db_ssl_yellow?: string;
  db_ssl_green?: string;
  db_ssl_blue?: string;
  db_ssl_orange?: string;
  db_ssl_pink?: string;
  db_schema_yellow?: string;
  db_schema_green?: string;
  db_schema_blue?: string;
  db_schema_orange?: string;
  db_schema_pink?: string;
}

export default function ConfigController(pays: string) {
  return {
    getDefaultDatabasesDir: async (): Promise<string> => {
      try {
        const result = await invoke<any>("get_default_databases_dir");
        return result != null ? String(result) : "";
      } catch (error) {
        console.error("Erreur getDefaultDatabasesDir:", error);
        return "";
      }
    },

    viderBasesDonnees: async (creds?: ConfigCredentials): Promise<{ success: boolean; deleted: number; message: string }> => {
      const auth = toCredentials(creds ?? getAdminConfig());
      const payload = encrypteRepositoryStructure({ tabId: "main", pays }, criptKey, true, { userId: auth.userId, dbPassword: auth.dbPassword });
      const result = await invoke<any>("vider_bases_donnees", { payload });
      return result as { success: boolean; deleted: number; message: string };
    },

    getConfig: async (tabId: string, creds?: ConfigCredentials): Promise<AppConfig> => {
      try {
        const auth = toCredentials(creds ?? getAdminConfig());
        const payload = encrypteRepositoryStructure({ tabId, pays }, criptKey, true, { userId: auth.userId, dbPassword: auth.dbPassword });
        const encryptedData = await invoke<any>("get_app_config", { payload });
        let parsed = encryptedData;
        if (typeof parsed === "string") {
          try {
            parsed = JSON.parse(parsed);
          } catch {
            return {};
          }
        }
        const decrypted = decrypteRepositoryStructure(parsed, criptKey);
        if (decrypted == null) return {};
        let obj: AppConfig;
        if (typeof decrypted === "string") {
          try {
            obj = JSON.parse(decrypted) as AppConfig;
          } catch {
            return {};
          }
        } else if (typeof decrypted === "object" && decrypted !== null) {
          obj = decrypted as AppConfig;
        } else {
          return {};
        }
        const colors = ["yellow", "green", "blue", "orange", "pink"] as const;
        const result: AppConfig = {
          paydunya_mode: String(obj.paydunya_mode ?? "test"),
          paydunya_cle_principale: String(obj.paydunya_cle_principale ?? '8jDTnfR6-25sS-94kF-fBuh-a5s6C5UJbdtm'),
          paydunya_test_cle_publique: String(obj.paydunya_test_cle_publique ?? 'test_public_UzE0PqlVqhjf7bzmStRpmChXgKI'),
          paydunya_test_cle_privee: String(obj.paydunya_test_cle_privee ?? 'test_private_74LEmZgM65BJLVzuZ5s2ODCoa7M'),
          paydunya_test_token: String(obj.paydunya_test_token ?? '7aILsd4vEPOrKU7qu064'),
          paydunya_live_cle_publique: String(obj.paydunya_live_cle_publique ?? 'live_public_h4ug6k8gw19vlgBLyIkxpcgf71t'),
          paydunya_live_cle_privee: String(obj.paydunya_live_cle_privee ?? 'live_private_lSDpGBMTTSd9VXD4z2NDjfpquNl'),
          paydunya_live_token: String(obj.paydunya_live_token ?? 'xFThh2NhJIWIzfI66ltt'),

          db_type: String(obj.db_type ?? "sqlite"),
          db_path: String(obj.db_path ?? ""),
        };
        for (const c of colors) {
          (result as any)[`db_type_${c}`] = String((obj as any)[`db_type_${c}`] ?? "sqlite");
          (result as any)[`db_path_${c}`] = String((obj as any)[`db_path_${c}`] ?? "");
          (result as any)[`db_host_${c}`] = String((obj as any)[`db_host_${c}`] ?? "");
          (result as any)[`db_port_${c}`] = String((obj as any)[`db_port_${c}`] ?? "");
          (result as any)[`db_name_${c}`] = String((obj as any)[`db_name_${c}`] ?? "");
          (result as any)[`db_user_${c}`] = String((obj as any)[`db_user_${c}`] ?? "");
          (result as any)[`db_password_${c}`] = String((obj as any)[`db_password_${c}`] ?? "");
          (result as any)[`db_ssl_${c}`] = String((obj as any)[`db_ssl_${c}`] ?? "");
          (result as any)[`db_schema_${c}`] = String((obj as any)[`db_schema_${c}`] ?? "");
        }
        return result;
      } catch (error) {
        console.error("Erreur chargement config:", error);
        return {};
      }
    },

    executeSql: async (
      query: string,
      dbColor: string,
      tabId: string,
      pays: string,
      creds?: ConfigCredentials
    ): Promise<{ rows?: any[]; affectedRows?: number; executionTime?: number }> => {
      const auth = toCredentials(creds ?? getAdminConfig());
      const payload = encrypteRepositoryStructure(
        { query, dbColor, tabId, pays },
        criptKey,
        true,
        { userId: auth.userId, dbPassword: auth.dbPassword }
      );
      const result = await invoke<any>("execute_sql", { payload });
      return result as { rows?: any[]; affectedRows?: number; executionTime?: number };
    },

    setConfig: async (
      tabId: string,
      config: AppConfig,
      mode: string,
      creds?: ConfigCredentials
    ): Promise<boolean> => {
      try {
        const auth = toCredentials(creds ?? getAdminConfig());
        // Exclure les mots de passe masqués ou vides (ne pas écraser par placeholder)
        const PASSWORD_KEYS = [
          "db_password_yellow", "db_password_green", "db_password_blue", "db_password_orange", "db_password_pink",
          "paydunya_cle_principale", "paydunya_test_cle_publique", "paydunya_test_cle_privee", "paydunya_test_token",
          "paydunya_live_cle_publique", "paydunya_live_cle_privee", "paydunya_live_token",
        ];
        const filtered: Record<string, unknown> = { tabId, pays, mode };
        for (const [k, v] of Object.entries(config)) {
          if (PASSWORD_KEYS.includes(k) && (v === "********" || v === "" || v == null)) continue;
          (filtered as any)[k] = v;
        }
        const payload = encrypteRepositoryStructure(filtered, criptKey, true, { userId: auth.userId, dbPassword: auth.dbPassword });
        await invoke<any>("set_app_config", { payload });
        return true;
      } catch (error) {
        console.error("Erreur sauvegarde config:", error);
        throw error;
      }
    },
  };
}
