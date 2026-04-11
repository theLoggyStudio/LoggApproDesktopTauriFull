/**
 * Configuration Sadmin - logique dans le code, chiffrée (pas en base de données).
 * Les identifiants par défaut sont stockés chiffrés dans le code.
 */

import { decryptData } from "../controllers/security/security";

// Clé de chiffrement pour les constantes Sadmin (32 caractères pour AES-256)
const SADMIN_CRYPT_KEY = "L0ggP4t13nt_S4dm1n_K3y_2024!!";

// Constantes chiffrées (AES-256-CBC) - login "sadmin", préfixe mot de passe "706"
const ENC_LOGIN = "ASNFZ4mrze8BI0VniavN7w==:U2FsdGVkX1+TTj1YeJFUu5nT31eSawWrPEj0wzlutQA=";
const ENC_PASSWORD_PREFIX = "ASNFZ4mrze8BI0VniavN7w==:U2FsdGVkX1/l2siwgp6GOreBSTJ1ckN3XGGj+/3f6pc=";

function decryptSadmin(s: string): string {
    const d = decryptData(s, SADMIN_CRYPT_KEY);
    return typeof d === "string" ? d : "";
}

/** Login Sadmin par défaut (déchiffré depuis le code) */
function getDefaultSadminLogin(): string {
    return decryptSadmin(ENC_LOGIN) || "sadmin";
}

/** Mot de passe Sadmin par défaut : préfixe + JJ + MM + AAAA (date du jour, ex. 70630032026 le 30/03/2026) */
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

/**
 * Vérifie login + mot de passe Sadmin.
 * Accepte : (1) le couple enregistré dans localStorage (Profil) ; (2) le mot de passe du jour (706+JJMMYYYY),
 * pour éviter le blocage après une install fraîche (pas de localStorage) ou un profil différent dev / installé.
 */
export function checkAdminCredentials(login: string, password: string): boolean {
    const { login: expectedLogin, password: expectedFromStorage } = getAdminConfig();
    const loginOk = login.trim().toLowerCase() === expectedLogin.trim().toLowerCase();
    if (!loginOk) return false;
    if (password === expectedFromStorage) return true;
    if (password === getDefaultSadminPassword()) return true;
    return false;
}

/** Réinitialise les surcharges localStorage (login/mot de passe admin) — utile si identifiants enregistrés bloquent la connexion. */
export function clearAdminConfigFromStorage(): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.removeItem("loggappro_admin_login");
        localStorage.removeItem("loggappro_admin_password");
    } catch {
        /* ignore */
    }
}
