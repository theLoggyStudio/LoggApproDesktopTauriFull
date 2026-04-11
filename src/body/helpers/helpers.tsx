import { decryptData, encryptData } from "../controllers/security/security";
import { getAuth } from "../store/authStore";
// import { bcrypt } from "bcryptjs";
import { compare } from "bcryptjs";
import {
    PRIVILEGE_TO_CODE,
    CODES_FOR_PRIVILEGE,
    LEGACY_TO_NEW,
    AUTH_PORTAL_EXTRA_CODES,
    PRIVILEGES,
} from "../../constants/index.ts";


export const upperLow = (nom: string) => {
    if (!nom) return nom; // Retourne le nom tel quel s'il est vide ou undefined

    return nom
        .split(/(\s|-)/) // Divise la chaîne en mots en utilisant les espaces et les tirets comme délimiteurs, tout en gardant les délimiteurs
        .map(word => {
            if (word === ' ' || word === '-') {
                return word; // Ne transforme pas les délimiteurs eux-mêmes
            }
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(); // Transforme chaque mot
        })
        .join(''); // Recombine les mots et les délimiteurs en une seule chaîne
}




//----------------------------------------------------------------------------------------privilege

/**
 * Normalise les jetons renvoyés par l’API (casse, noms sémantiques) et développe les codes
 * legacy listés dans LEGACY_TO_NEW (ex. apy01 → acc01 + pay02) pour aligner le « portail »
 * et CODES_FOR_PRIVILEGE. Les codes legacy non mappés (ex. vpr01) sont conservés tels quels.
 */
function expandPrivilegeTokens(tokens: string[]): string[] {
    const out: string[] = [];
    for (const raw of tokens) {
        const t = String(raw ?? "").trim();
        if (!t) continue;
        const lower = t.toLowerCase();
        // Code 5 caractères (insensible à la casse côté BDD, ex. PAT01)
        if (/^[a-z0-9]{5}$/.test(lower)) {
            const legacy = (LEGACY_TO_NEW as Record<string, readonly string[]>)[lower];
            if (legacy?.length) {
                out.push(...legacy);
            } else {
                out.push(lower);
            }
            continue;
        }
        const code = PRIVILEGE_TO_CODE[t] ?? PRIVILEGE_TO_CODE[lower];
        if (code) {
            out.push(code);
        } else {
            out.push(lower);
        }
    }
    return out;
}

/** Résout le 1er argument de checkPrivilege (code, alias legacy ou clé type patients.view). */
function resolvePrivilegeKey(privilege: string): string {
    const privTrim = String(privilege ?? "").trim();
    if (!privTrim) return "";
    const lower = privTrim.toLowerCase();
    if (/^[a-z0-9]{5}$/.test(lower)) {
        return lower;
    }
    return PRIVILEGE_TO_CODE[privTrim] ?? PRIVILEGE_TO_CODE[lower] ?? lower;
}

export const checkPrivilege = (privilege: string, privs: string[] | string): boolean => {
    if (!privilege || !privs) {
        console.warn("checkPrivilege: privilege ou privs manquant");
        return false;
    }

    let privilegesArray: string[];
    if (typeof privs === "string") {
        privilegesArray = privs
            .split(/[,;\s]+/)
            .map((p) => p.trim().toLowerCase())
            .filter(Boolean);
    } else {
        privilegesArray = privs.map((p) => String(p).trim().toLowerCase()).filter(Boolean);
    }

    privilegesArray = expandPrivilegeTokens(privilegesArray);

    // Portail d'accès : acc01 ou apy01 requis pour que les autres privilèges fonctionnent.
    // Les collaborateurs peuvent n'avoir que pat01/pat02 (sans acc01 explicite) : on les traite
    // comme un accès « module patients » valide pour éviter une liste vide alors que les droits patients sont accordés.
    // Même idée pour profil / collaborateurs / cabinet : sinon col01 ou cab01 seuls ne passent aucun checkPrivilege.
    const accessCodes = ["acc01", "apy01"];
    const patientPortalCodes = ["pat01", "pat02"];
    const profilPortalCodes = ["prf01", "prf02", "col01", "col02", "cab01"];
    const hasKnownPrivilegeCode = privilegesArray.some((p) =>
        Object.prototype.hasOwnProperty.call(PRIVILEGES, p)
    );
    const hasAccess =
        privilegesArray.some((p) => accessCodes.includes(p)) ||
        privilegesArray.some((p) => patientPortalCodes.includes(p)) ||
        privilegesArray.some((p) => profilPortalCodes.includes(p)) ||
        privilegesArray.some((p) => AUTH_PORTAL_EXTRA_CODES.includes(p)) ||
        hasKnownPrivilegeCode;
    if (!hasAccess) return false;

    const privKey = resolvePrivilegeKey(privilege);
    const validCodes = CODES_FOR_PRIVILEGE[privKey] || [privKey];
    return privilegesArray.some((p) => validCodes.includes(p));
};

/**
 * Vérifie la présence du code exact après normalisation (expand, casse), sans les alias
 * {@link CODES_FOR_PRIVILEGE} (ex. nma01 ne compte pas comme mat01).
 * À utiliser quand l’UI doit refléter un droit métier précis (matériels sur acte, etc.).
 */
export const checkPrivilegeExact = (privilege: string, privs: string[] | string): boolean => {
    if (!privilege || !privs) {
        return false;
    }

    let privilegesArray: string[];
    if (typeof privs === "string") {
        privilegesArray = privs
            .split(/[,;\s]+/)
            .map((p) => p.trim().toLowerCase())
            .filter(Boolean);
    } else {
        privilegesArray = privs.map((p) => String(p).trim().toLowerCase()).filter(Boolean);
    }

    privilegesArray = expandPrivilegeTokens(privilegesArray);

    const accessCodes = ["acc01", "apy01"];
    const patientPortalCodes = ["pat01", "pat02"];
    const profilPortalCodes = ["prf01", "prf02", "col01", "col02", "cab01"];
    const hasKnownPrivilegeCode = privilegesArray.some((p) =>
        Object.prototype.hasOwnProperty.call(PRIVILEGES, p)
    );
    const hasAccess =
        privilegesArray.some((p) => accessCodes.includes(p)) ||
        privilegesArray.some((p) => patientPortalCodes.includes(p)) ||
        privilegesArray.some((p) => profilPortalCodes.includes(p)) ||
        privilegesArray.some((p) => AUTH_PORTAL_EXTRA_CODES.includes(p)) ||
        hasKnownPrivilegeCode;
    if (!hasAccess) return false;

    const privKey = resolvePrivilegeKey(privilege);
    if (!privKey) return false;
    return privilegesArray.includes(privKey);
};

/**
 * Collaborateur cabinet (aligné sur PageProfil) : compte distinct du tabId du cabinet,
 * ou rôle assistant / comptable / secrétaire.
 */
export function isPotentielCollaborateur(userId: string, tabId: string, role?: string): boolean {
    if (!userId || !tabId) return false;
    const r = role ?? "";
    return (
        (userId !== tabId && userId !== "admin" && userId !== "sadmin") ||
        r === "assistant" ||
        r === "comptable" ||
        r === "secretaire"
    );
}

/** Chiffre l'objet pour l'envoi au backend.
 * @param addAuth - si true (défaut), ajoute userId et dbPassword pour l'accès aux bases de données.
 *                  false pour auth_connection, create_docteur, create_cabinet.
 * @param overrideAuth - si fourni, utilise ces credentials au lieu de getAuth() (pour config Sadmin).
 */
export const encrypteRepositoryStructure = (obj: any, key: string, addAuth: boolean = true, overrideAuth?: { userId: string; dbPassword: string }) => {
    try {
        let data = { ...obj };
        if (overrideAuth?.userId && overrideAuth?.dbPassword) {
            data = { ...data, userId: overrideAuth.userId, dbPassword: overrideAuth.dbPassword };
        } else if (addAuth) {
            const auth = getAuth();
            if (auth.userId && auth.dbPassword) {
                data = { ...data, userId: auth.userId, dbPassword: auth.dbPassword };
            }
        }
        const jsonString = JSON.stringify(data);
        const encryptedString = encryptData(jsonString, key);
        return JSON.stringify(({ body: encryptedString }));
    } catch (error) {
        console.error("Erreur lors du chiffrement des données :", error);
        return "";
    }
};

export const decrypteRepositoryStructure = (cryptedBody: any, key: string) => {
    try {
        if (cryptedBody == null || cryptedBody === undefined) {
            return null;
        }
        if (typeof (cryptedBody) === "string") { 
            cryptedBody = JSON.parse(cryptedBody);
        }
        if (cryptedBody == null || cryptedBody === undefined) {
            return null;
        }
        
        // Extraire la chaîne chiffrée du corps
        const encryptedString = cryptedBody?.body;
        if (!encryptedString) {
            return null;
        }
        
        // Décrypter la chaîne
        const decryptedString = decryptData(encryptedString, key);
        if (decryptedString == null) return null;
        // decryptData parse déjà le JSON ; si la réponse invoke est double-encodée, chaîne "[...]"
        if (typeof decryptedString === "string") {
            const t = decryptedString.trim();
            if ((t.startsWith("[") && t.endsWith("]")) || (t.startsWith("{") && t.endsWith("}"))) {
                try {
                    return JSON.parse(t);
                } catch {
                    return decryptedString;
                }
            }
        }
        return decryptedString;
    } catch (error) {
        console.error("Erreur lors du déchiffrement des données :", error);
        return null;
    }
};



export const urlEncrypteRepositoryStructure = (url: string, params: string[], key: string) => {
    const encryptedParams: string[] = [];
    params.forEach((param) => {
        if (param !== null) {
            const encryptedParam = encryptData(param, key);
            if (encryptedParam) {
                encryptedParams.push(encryptedParam);
            }
        }
    });
    return encryptedParams.length ? `${url}/${encryptedParams.join('/')}` : url;
}

export const urlDencrypteRepositoryStructure = (url: string, key: string) => {
    const decryptedParams: string[] = [];
    const parts = url.split("/");

    parts.forEach((part, index) => {
        if (index !== 0 && part !== null) {
            const decryptedParam = decryptData(part, key);
            if (decryptedParam) {
                decryptedParams.push(decryptedParam);
            }
        }
    });

    return decryptedParams.length ? `${parts[0]}/${decryptedParams.join('/')}` : url;
}

//------------------passwordasync
// export async function isTheRightText(plainText, hash) {
//     try {
//       return await bcrypt.compare(plainText, hash);
//     } catch (error) {
//       console.error("Erreur lors du chiffrement des données :", error.message);
//     }
//   }
/** Vérifie si le mot de passe saisi correspond au mot de passe stocké.
 * Gère à la fois les mots de passe en clair et les hash bcrypt ($2a$, $2b$, $2y$). */
export async function isTheRightText(plainText: any, stored: any): Promise<boolean> {
    if (!stored || stored === "") return false;
    if (!plainText) return false;
    try {
        const s = String(stored);
        if (s.startsWith("$2a$") || s.startsWith("$2b$") || s.startsWith("$2y$")) {
            return await compare(plainText, s);
        }
        return plainText === s;
    } catch (error: any) {
        console.error("Erreur lors de la vérification du mot de passe :", error?.message);
        return false;
    }
}

const CONNECTION_ERROR_MAX_LEN = 400;

/** Extrait un message lisible depuis une erreur Tauri / invoke (pour affichage utilisateur). */
export function formatConnectionError(error: unknown): string {
    if (error == null) return "Erreur inconnue.";
    if (typeof error === "string") return truncateConnErr(error);
    const e = error as { message?: string };
    if (e.message && typeof e.message === "string") return truncateConnErr(e.message);
    try {
        const s = String(error);
        if (s !== "[object Object]") return truncateConnErr(s);
    } catch {
        /* ignore */
    }
    try {
        return truncateConnErr(JSON.stringify(error));
    } catch {
        return "Erreur de connexion.";
    }
}

function truncateConnErr(s: string): string {
    const t = s.trim();
    if (t.length <= CONNECTION_ERROR_MAX_LEN) return t;
    return `${t.slice(0, CONNECTION_ERROR_MAX_LEN)}…`;
}

