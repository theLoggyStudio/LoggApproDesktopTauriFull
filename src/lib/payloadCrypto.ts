import { decryptData, encryptData } from "../crypto/security";

/** Chiffre un objet pour l’envoi au backend (`{ "body": "<payload AES>" }`). */
export function encrypteRepositoryStructure(
  obj: Record<string, unknown>,
  key: string,
  _addAuth = false
): string {
  try {
    const jsonString = JSON.stringify(obj);
    const encryptedString = encryptData(jsonString, key);
    if (!encryptedString) return "";
    return JSON.stringify({ body: encryptedString });
  } catch (error) {
    console.error("Erreur lors du chiffrement des données :", error);
    return "";
  }
}

export function decrypteRepositoryStructure(cryptedBody: unknown, key: string): unknown {
  try {
    let inner: { body?: string } | null = null;
    if (cryptedBody == null) return null;
    if (typeof cryptedBody === "string") {
      inner = JSON.parse(cryptedBody) as { body?: string };
    } else if (typeof cryptedBody === "object") {
      inner = cryptedBody as { body?: string };
    }
    const encryptedString = inner?.body;
    if (!encryptedString) return null;
    const decryptedString = decryptData(encryptedString, key);
    if (decryptedString == null) return null;
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
}

const CONNECTION_ERROR_MAX_LEN = 400;

function truncateConnErr(s: string): string {
  const t = s.trim();
  if (t.length <= CONNECTION_ERROR_MAX_LEN) return t;
  return `${t.slice(0, CONNECTION_ERROR_MAX_LEN)}…`;
}

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
