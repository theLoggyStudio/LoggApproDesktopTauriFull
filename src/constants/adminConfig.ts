/**
 * Configuration Sadmin - logique dans le code, chiffrée (pas en base de données).
 */

import { decryptData } from "../crypto/security";

const SADMIN_CRYPT_KEY = "L0ggP4t13nt_S4dm1n_K3y_2024!!";

const ENC_LOGIN = "ASNFZ4mrze8BI0VniavN7w==:U2FsdGVkX1+TTj1YeJFUu5nT31eSawWrPEj0wzlutQA=";
const ENC_PASSWORD_PREFIX = "ASNFZ4mrze8BI0VniavN7w==:U2FsdGVkX1/l2siwgp6GOreBSTJ1ckN3XGGj+/3f6pc=";

function decryptSadmin(s: string): string {
  const d = decryptData(s, SADMIN_CRYPT_KEY);
  return typeof d === "string" ? d : "";
}

function getDefaultSadminLogin(): string {
  return decryptSadmin(ENC_LOGIN) || "sadmin";
}

export function getDefaultSadminPassword(): string {
  const prefix = decryptSadmin(ENC_PASSWORD_PREFIX) || "706";
  const now = new Date();
  const jj = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const aaaa = String(now.getFullYear());
  return `${prefix}${jj}${mm}${aaaa}`;
}

export interface AdminConfig {
  login: string;
  password: string;
}

export function getAdminConfig(): AdminConfig {
  if (typeof window === "undefined") {
    return { login: getDefaultSadminLogin(), password: getDefaultSadminPassword() };
  }
  const login = localStorage.getItem("loggappro_admin_login") || getDefaultSadminLogin();
  const password = localStorage.getItem("loggappro_admin_password") || getDefaultSadminPassword();
  return { login, password };
}

export function setAdminConfig(config: AdminConfig): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("loggappro_admin_login", config.login.trim() || getDefaultSadminLogin());
  localStorage.setItem("loggappro_admin_password", config.password || getDefaultSadminPassword());
}

export function checkAdminCredentials(login: string, password: string): boolean {
  const { login: expectedLogin, password: expectedFromStorage } = getAdminConfig();
  const loginOk = login.trim().toLowerCase() === expectedLogin.trim().toLowerCase();
  if (!loginOk) return false;
  if (password === expectedFromStorage) return true;
  if (password === getDefaultSadminPassword()) return true;
  return false;
}

export function clearAdminConfigFromStorage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("loggappro_admin_login");
    localStorage.removeItem("loggappro_admin_password");
  } catch {
    /* ignore */
  }
}
