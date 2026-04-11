import CryptoJS from "crypto-js";

// Fonction de chiffrement avec IV aléatoire
export function encryptData(plainText, key) {
  try {
    if (typeof plainText === "object") {
      plainText = JSON.stringify(plainText);
    } else if (typeof plainText !== "string") {
      try {
        plainText = String(JSON.stringify(plainText));
      } catch {
        plainText = String(plainText);
      }
    }

    const iv = CryptoJS.lib.WordArray.random(16);
    const encrypted = CryptoJS.AES.encrypt(plainText, CryptoJS.enc.Utf8.parse(key), {
      iv: iv,
      padding: CryptoJS.pad.Pkcs7,
      mode: CryptoJS.mode.CBC,
    }).toString();

    // Même format que le mobile (`helpers.tsx`) et que Rust (`crypto::encrypt_data`) : base64(IV) + ':' + ciphertext, puis URL-encode.
    const encryptedWithIv = iv.toString(CryptoJS.enc.Base64) + ':' + encrypted;
    return encodeURIComponent(encryptedWithIv);
  } catch (error: unknown) {
    console.error("Erreur lors du chiffrement des données :", (error as Error)?.message);
    return null;
  }
}

// Fonction de déchiffrement
export function decryptData(encryptedTextWithIv, key) {
  try {
    if (typeof encryptedTextWithIv !== "string") {
      encryptedTextWithIv = String(encryptedTextWithIv);
    }

    const decodedText = decodeURIComponent(encryptedTextWithIv);
    const parts = decodedText.split(':');
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
