import CryptoJS from "crypto-js";

export function encryptData(plainText: unknown, key: string) {
  try {
    let text: string;
    if (typeof plainText === "object" && plainText !== null) {
      text = JSON.stringify(plainText);
    } else if (typeof plainText !== "string") {
      try {
        text = String(JSON.stringify(plainText));
      } catch {
        text = String(plainText);
      }
    } else {
      text = plainText;
    }

    const iv = CryptoJS.lib.WordArray.random(16);
    const encrypted = CryptoJS.AES.encrypt(text, CryptoJS.enc.Utf8.parse(key), {
      iv: iv,
      padding: CryptoJS.pad.Pkcs7,
      mode: CryptoJS.mode.CBC,
    }).toString();

    const encryptedWithIv = iv.toString(CryptoJS.enc.Base64) + ":" + encrypted;
    return encodeURIComponent(encryptedWithIv);
  } catch (error: unknown) {
    console.error("Erreur lors du chiffrement des données :", (error as Error)?.message);
    return null;
  }
}

export function decryptData(encryptedTextWithIv: unknown, key: string) {
  try {
    let s =
      typeof encryptedTextWithIv !== "string"
        ? String(encryptedTextWithIv)
        : encryptedTextWithIv;

    const decodedText = decodeURIComponent(s);
    const parts = decodedText.split(":");
    if (parts.length !== 2) {
      throw new Error("Le texte chiffré n'est pas au format attendu.");
    }

    const iv = CryptoJS.enc.Base64.parse(parts[0]);
    const encryptedText = parts[1];

    const bytes = CryptoJS.AES.decrypt(encryptedText, CryptoJS.enc.Utf8.parse(key), {
      iv: iv,
      padding: CryptoJS.pad.Pkcs7,
      mode: CryptoJS.mode.CBC,
    });
    const decryptedText = bytes.toString(CryptoJS.enc.Utf8);

    try {
      return JSON.parse(decryptedText);
    } catch {
      return decryptedText;
    }
  } catch (error: unknown) {
    console.error("Erreur lors du déchiffrement des données :", (error as Error)?.message);
    return null;
  }
}
