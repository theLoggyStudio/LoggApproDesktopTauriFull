function splitString(inputString: string) {
    // Utiliser la méthode split pour diviser le string en un tableau
    const resultArray = inputString.split("/");
    // Retourner le tableau
    return resultArray;
}

/** Réseau local (RFC1918) : pas d’API Node sur 7063 dans le déploiement Tauri + fichiers statiques. */
function isPrivateLanHost(hostname: string): boolean {
    if (!hostname) return false;
    if (hostname === "localhost" || hostname === "127.0.0.1") return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    return /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname);
}

// Cache pour les variables d'environnement chargées depuis la base dbla
let envConfigCache: {
    REACT_APP_BACK_URL?: string;
    REACT_APP_FRONT_URL?: string;
    REACT_APP_BACK_PORT?: string;
    REACT_APP_CRIPT_KEY?: string;
    REACT_APP_CRIPT_KEY_FRONT?: string;
    REACT_APP_CRIPT_KEY_URL?: string;
    REACT_APP_ADMIN?: string;
} | null = null;

let envConfigLoading: Promise<void> | null = null;

/**
 * Charge les variables d'environnement depuis la base dbla via l'API backend
 * En mode Tauri (desktop), on utilise directement le .env (pas d'API Node)
 */
const loadEnvFromDB = async (): Promise<void> => {
    if (envConfigCache) {
        return; // Déjà chargé
    }

    if (envConfigLoading) {
        return envConfigLoading; // Déjà en cours de chargement
    }

    // Pas d’API Node sur 7063 : Tauri, localhost, Vite dev, ou LAN privé (sauf VITE_FETCH_ENV_FROM_NODE=true)
    const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;
    const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const isViteDev = import.meta.env.DEV;
    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const forceNodeEnvApi = import.meta.env.VITE_FETCH_ENV_FROM_NODE === 'true';
    const skipNode7063 =
        isTauri || isLocalhost || isViteDev || (isPrivateLanHost(hostname) && !forceNodeEnvApi);

    envConfigLoading = (async () => {
        try {
            if (skipNode7063) {
                throw new Error('Skip Node 7063 — use build .env');
            }
            // Déterminer l'URL du backend pour charger la config
            const defaultBackendUrl = `http://${hostname}:7063`;
            
            // Essayer de charger depuis l'API backend
            const response = await fetch(`${defaultBackendUrl}/api/env/config`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (response.ok) {
                envConfigCache = await response.json();
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            // Fallback sur les variables d'environnement du build
            const env = import.meta.env;
            envConfigCache = {
                REACT_APP_BACK_URL: env.REACT_APP_BACK_URL,
                REACT_APP_FRONT_URL: env.REACT_APP_FRONT_URL,
                REACT_APP_BACK_PORT: env.REACT_APP_BACK_PORT,
                REACT_APP_CRIPT_KEY: env.REACT_APP_CRIPT_KEY,
                REACT_APP_CRIPT_KEY_FRONT: env.REACT_APP_CRIPT_KEY_FRONT,
                REACT_APP_CRIPT_KEY_URL: env.REACT_APP_CRIPT_KEY_URL,
                REACT_APP_ADMIN: env.REACT_APP_ADMIN,
            };
        }
    })();

    return envConfigLoading;
};

/**
 * Obtient une variable d'environnement depuis le cache (dbla) ou le .env
 */
const getEnvVar = (key: string, defaultValue: string = ""): string => {
    if (envConfigCache && envConfigCache[key as keyof typeof envConfigCache]) {
        return envConfigCache[key as keyof typeof envConfigCache] || defaultValue;
    }
    return (import.meta.env as Record<string, string | undefined>)[key] || defaultValue;
};

/**
 * Obtient l'URL du backend de manière dynamique
 * Utilise d'abord la base dbla, puis fallback sur l'environnement
 */
export const getUrlBack = (): string => {
    // Si on est côté serveur (SSR) ou dans un contexte sans window
    if (typeof window === 'undefined') {
        const envUrl = getEnvVar('REACT_APP_BACK_URL') || import.meta.env.REACT_APP_BACK_URL;
        if (envUrl && !envUrl.includes(':8081')) {
            return envUrl;
        }
        return "http://localhost:7063";
    }

    // URL depuis la base dbla ou l'environnement
    const staticUrl = getEnvVar('REACT_APP_BACK_URL') || import.meta.env.REACT_APP_BACK_URL;
    
    // Ignorer si l'URL contient le port 8081 (ancien port) ou si on est en localhost
    if (staticUrl && !staticUrl.includes(':8081') && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        return staticUrl;
    }

    // Sinon : même hôte que la page. Sur LAN sans config Node, l’API Tauri est le 7062 (pas 7063).
    const hostname = window.location.hostname;
    const fromEnv = getEnvVar("REACT_APP_BACK_PORT") || import.meta.env.REACT_APP_BACK_PORT;
    const backendPort =
      fromEnv || (isPrivateLanHost(hostname) ? "7062" : "7063");
    return `http://${hostname}:${backendPort}`;
};

/**
 * URL du backend (statique, pour compatibilité avec l'ancien code)
 * @deprecated Utilisez getUrlBack() pour une URL dynamique
 */
export const urlBack = getEnvVar('REACT_APP_BACK_URL') || import.meta.env.REACT_APP_BACK_URL || "";

export const urlFront = getEnvVar('REACT_APP_FRONT_URL') || import.meta.env.REACT_APP_FRONT_URL || "";

/**
 * Règles sécurité (ne pas contourner) :
 * - Ne pas placer de clés sensibles sous C:\\ProgramData\\LoggAppro (partagé machine, hors profil utilisateur).
 * - Pas de « sécurité par obscurité » : une clé dans le bundle JS reste extractible — la prod doit utiliser des variables au build.
 * - Internet public : définir REACT_APP_CRIPT_KEY* au build (aligné Rust).
 * - Dev Vite : repli DEV_LOCAL_CRIPT_KEY.
 * - Accès prod sur LAN / localhost sans clé au build : même repli que le défaut Rust (DEFAULT_CRIPT_KEY), pour éviter /invoke 500.
 */
const DEV_LOCAL_CRIPT_KEY = "clechiffredeboutenbout0123456789";

const readEnvKey = (name: string): string => {
  const v = (import.meta.env as Record<string, string | undefined>)[name];
  return typeof v === "string" ? v.trim() : "";
};

/**
 * Résout une clé de chiffrement : env spécifique, optionnellement env générique, sinon dev seulement, sinon chaîne vide en prod.
 */
function resolveCriptKey(specificEnv: string, fallbackEnv?: string): string {
  const a = readEnvKey(specificEnv);
  if (a) return a;
  if (fallbackEnv) {
    const b = readEnvKey(fallbackEnv);
    if (b) return b;
  }
  if (import.meta.env.DEV) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn(
        `[LoggAppro] ${specificEnv}${fallbackEnv ? ` / ${fallbackEnv}` : ""} absents — repli DEV_LOCAL uniquement (jamais en production livrée).`
      );
    }
    return DEV_LOCAL_CRIPT_KEY;
  }
  // Build « dist » sans REACT_APP_CRIPT_KEY : sur LAN/localhost, aligner sur le défaut Rust (sinon POST /invoke → 500).
  if (typeof window !== "undefined") {
    const h = window.location.hostname;
    if (isPrivateLanHost(h)) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn(
          `[LoggAppro] ${specificEnv} absent au build — repli clé LAN = défaut Rust (${DEV_LOCAL_CRIPT_KEY.slice(0, 8)}…). ` +
            "Pour un site exposé sur Internet, définir REACT_APP_CRIPT_KEY au build."
        );
      }
      return DEV_LOCAL_CRIPT_KEY;
    }
  }
  if (typeof console !== "undefined" && console.error) {
    console.error(
      `[LoggAppro] Clé manquante : définir ${specificEnv}${fallbackEnv ? ` ou ${fallbackEnv}` : ""} au build ` +
        `(obligatoire si l’app est servie hors réseau local).`
    );
  }
  return "";
}

export const criptKey = resolveCriptKey("REACT_APP_CRIPT_KEY");
export const criptKeyFront = resolveCriptKey("REACT_APP_CRIPT_KEY_FRONT", "REACT_APP_CRIPT_KEY");
export const criptKeyUrl = resolveCriptKey("REACT_APP_CRIPT_KEY_URL", "REACT_APP_CRIPT_KEY");
export const admins = splitString(getEnvVar('REACT_APP_ADMIN') || import.meta.env.REACT_APP_ADMIN || "");

// Charger les variables d'environnement au démarrage si on est dans le navigateur
if (typeof window !== 'undefined') {
    loadEnvFromDB().catch(() => {
        // Erreur silencieuse, utilisation du fallback .env
    });
}




