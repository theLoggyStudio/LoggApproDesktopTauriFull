//! Chiffrement/déchiffrement AES-CBC compatible avec CryptoJS

use aes::cipher::{block_padding::Pkcs7, BlockDecryptMut, BlockEncryptMut, KeyIvInit};
use base64::Engine;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use std::str;

type Aes128CbcEnc = cbc::Encryptor<aes::Aes128>;
type Aes128CbcDec = cbc::Decryptor<aes::Aes128>;
type Aes256CbcEnc = cbc::Encryptor<aes::Aes256>;
type Aes256CbcDec = cbc::Decryptor<aes::Aes256>;

/// Déchiffre une chaîne au format CryptoJS: base64(iv):base64(ciphertext)
/// Après decodeURIComponent côté JS
pub fn decrypt_data(encrypted_with_iv: &str, key: &str) -> Result<String, String> {
    let decoded = url_decode(encrypted_with_iv)?;
    let parts: Vec<&str> = decoded.splitn(2, ':').collect();
    if parts.len() != 2 {
        return Err("Format invalide: attendu iv:ciphertext".to_string());
    }

    let iv_b64 = parts[0];
    let ciphertext_b64 = parts[1];

    let iv = base64::engine::general_purpose::STANDARD
        .decode(iv_b64)
        .map_err(|e| format!("IV base64 invalide: {}", e))?;

    let mut ciphertext = base64::engine::general_purpose::STANDARD
        .decode(ciphertext_b64)
        .map_err(|e| format!("Ciphertext base64 invalide: {}", e))?;

    let key_bytes = key.as_bytes();

    let plaintext = if key_bytes.len() >= 32 {
        let key_32: [u8; 32] = key_bytes[..32].try_into().map_err(|_| "Clé invalide")?;
        let iv_16: [u8; 16] = iv.as_slice().try_into().map_err(|_| "IV invalide (16 bytes)")?;
        Aes256CbcDec::new_from_slices(&key_32, &iv_16)
            .map_err(|e| format!("Decrypt init: {}", e))?
            .decrypt_padded_mut::<Pkcs7>(&mut ciphertext)
            .map_err(|e| format!("Decrypt: {}", e))?
    } else {
        let key_16: [u8; 16] = pad_key_16(key_bytes);
        let iv_16: [u8; 16] = iv.as_slice().try_into().map_err(|_| "IV invalide")?;
        Aes128CbcDec::new_from_slices(&key_16, &iv_16)
            .map_err(|e| format!("Decrypt init: {}", e))?
            .decrypt_padded_mut::<Pkcs7>(&mut ciphertext)
            .map_err(|e| format!("Decrypt: {}", e))?
    };

    str::from_utf8(plaintext).map_err(|e| format!("UTF-8: {}", e)).map(String::from)
}

/// Chiffre une chaîne au format CryptoJS
pub fn encrypt_data(plain_text: &str, key: &str) -> Result<String, String> {
    use rand_core::RngCore;
    use rand_core::OsRng;
    let mut iv = [0u8; 16];
    OsRng.fill_bytes(&mut iv);

    let key_bytes = key.as_bytes();

    let plain_bytes = plain_text.as_bytes();
    let block_size = 16;
    let padded_len = ((plain_bytes.len() + block_size - 1) / block_size + 1) * block_size;
    let mut buf = vec![0u8; padded_len];
    buf[..plain_bytes.len()].copy_from_slice(plain_bytes);

    let ciphertext = if key_bytes.len() >= 32 {
        let key_32: [u8; 32] = key_bytes[..32].try_into().map_err(|_| "Clé invalide")?;
        let enc = Aes256CbcEnc::new_from_slices(&key_32, &iv)
            .map_err(|e| format!("Encrypt init: {}", e))?;
        enc.encrypt_padded_mut::<Pkcs7>(&mut buf, plain_bytes.len())
            .map_err(|e| format!("Encrypt: {}", e))?
            .to_vec()
    } else {
        let key_16: [u8; 16] = pad_key_16(key_bytes);
        let enc = Aes128CbcEnc::new_from_slices(&key_16, &iv)
            .map_err(|e| format!("Encrypt init: {}", e))?;
        enc.encrypt_padded_mut::<Pkcs7>(&mut buf, plain_bytes.len())
            .map_err(|e| format!("Encrypt: {}", e))?
            .to_vec()
    };

    let iv_b64 = base64::engine::general_purpose::STANDARD.encode(iv);
    let ct_b64 = base64::engine::general_purpose::STANDARD.encode(ciphertext);
    let result = format!("{}:{}", iv_b64, ct_b64);
    Ok(url_encode(&result))
}

fn pad_key_16(key: &[u8]) -> [u8; 16] {
    let mut k = [0u8; 16];
    let len = key.len().min(16);
    k[..len].copy_from_slice(&key[..len]);
    k
}

fn url_decode(s: &str) -> Result<String, String> {
    percent_encoding::percent_decode_str(s)
        .decode_utf8()
        .map_err(|e| format!("URL decode: {}", e))
        .map(|s| s.to_string())
}

fn url_encode(s: &str) -> String {
    percent_encoding::percent_encode(s.as_bytes(), percent_encoding::NON_ALPHANUMERIC).to_string()
}

/// Chemin du fichier contenant la clé de chiffrement des clés Paydunya (UUID)
fn paydunya_keys_key_file() -> PathBuf {
    let dir = crate::db::get_databases_dir();
    let parent = dir.parent().unwrap_or(&dir);
    parent.join("lpd_paydunya_enc.key")
}

/// Retourne la clé de chiffrement pour les clés Paydunya (UUID créé à la volée si absent).
/// Utilisée pour chiffrer/déchiffrer symétriquement les clés API Paydunya en base.
pub fn get_paydunya_keys_encryption_key() -> Result<String, String> {
    let path = paydunya_keys_key_file();
    if path.exists() {
        let uuid = fs::read_to_string(&path).map_err(|e| format!("Lecture clé: {}", e))?;
        let uuid = uuid.trim().to_string();
        if uuid.len() >= 32 {
            return Ok(format!("{}-loggappro-paydunya-keys-32", uuid));
        }
    }
    let new_uuid = uuid::Uuid::new_v4().to_string();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&path, &new_uuid).map_err(|e| format!("Écriture clé: {}", e))?;
    Ok(format!("{}-loggappro-paydunya-keys-32", new_uuid))
}

/// Chiffre une clé Paydunya pour stockage en base
pub fn encrypt_paydunya_key(plain: &str) -> Result<String, String> {
    if plain.is_empty() {
        return Ok(String::new());
    }
    let key = get_paydunya_keys_encryption_key()?;
    encrypt_data(plain, &key)
}

/// Chiffrement déterministe pour les colonnes admin (même entrée → même sortie).
/// Permet les recherches par WHERE sur les valeurs chiffrées.
pub fn encrypt_admin_deterministic(plain: &str, key: &str, column_hint: &str) -> Result<String, String> {
    if plain.is_empty() {
        return Ok(String::new());
    }
    let mut hasher = Sha256::new();
    hasher.update(key.as_bytes());
    hasher.update(b"::admin::");
    hasher.update(column_hint.as_bytes());
    let hash = hasher.finalize();
    let iv: [u8; 16] = hash[..16].try_into().map_err(|_| "IV invalide")?;

    let key_bytes = key.as_bytes();
    let plain_bytes = plain.as_bytes();
    let block_size = 16;
    let padded_len = ((plain_bytes.len() + block_size - 1) / block_size + 1) * block_size;
    let mut buf = vec![0u8; padded_len];
    buf[..plain_bytes.len()].copy_from_slice(plain_bytes);

    let ciphertext = if key_bytes.len() >= 32 {
        let key_32: [u8; 32] = key_bytes[..32].try_into().map_err(|_| "Clé invalide")?;
        let enc = Aes256CbcEnc::new_from_slices(&key_32, &iv)
            .map_err(|e| format!("Encrypt init: {}", e))?;
        enc.encrypt_padded_mut::<Pkcs7>(&mut buf, plain_bytes.len())
            .map_err(|e| format!("Encrypt: {}", e))?
            .to_vec()
    } else {
        let key_16: [u8; 16] = pad_key_16(key_bytes);
        let enc = Aes128CbcEnc::new_from_slices(&key_16, &iv)
            .map_err(|e| format!("Encrypt init: {}", e))?;
        enc.encrypt_padded_mut::<Pkcs7>(&mut buf, plain_bytes.len())
            .map_err(|e| format!("Encrypt: {}", e))?
            .to_vec()
    };

    let ct_b64 = base64::engine::general_purpose::STANDARD.encode(ciphertext);
    Ok(url_encode(&ct_b64))
}

/// Déchiffrement déterministe (inverse de encrypt_admin_deterministic).
pub fn decrypt_admin_deterministic(encrypted: &str, key: &str, column_hint: &str) -> Result<String, String> {
    if encrypted.is_empty() {
        return Ok(String::new());
    }
    let decoded = url_decode(encrypted)?;
    let ciphertext = base64::engine::general_purpose::STANDARD
        .decode(&decoded)
        .map_err(|e| format!("Base64 invalide: {}", e))?;

    let mut hasher = Sha256::new();
    hasher.update(key.as_bytes());
    hasher.update(b"::admin::");
    hasher.update(column_hint.as_bytes());
    let hash = hasher.finalize();
    let iv: [u8; 16] = hash[..16].try_into().map_err(|_| "IV invalide")?;

    let key_bytes = key.as_bytes();
    let mut buf = ciphertext;

    let plaintext = if key_bytes.len() >= 32 {
        let key_32: [u8; 32] = key_bytes[..32].try_into().map_err(|_| "Clé invalide")?;
        Aes256CbcDec::new_from_slices(&key_32, &iv)
            .map_err(|e| format!("Decrypt init: {}", e))?
            .decrypt_padded_mut::<Pkcs7>(&mut buf)
            .map_err(|e| format!("Decrypt: {}", e))?
    } else {
        let key_16: [u8; 16] = pad_key_16(key_bytes);
        Aes128CbcDec::new_from_slices(&key_16, &iv)
            .map_err(|e| format!("Decrypt init: {}", e))?
            .decrypt_padded_mut::<Pkcs7>(&mut buf)
            .map_err(|e| format!("Decrypt: {}", e))?
    };

    str::from_utf8(plaintext).map_err(|e| format!("UTF-8: {}", e)).map(String::from)
}

/// Déchiffre une clé Paydunya lue depuis la base (retourne la valeur brute si déchiffrement échoue)
pub fn decrypt_paydunya_key(encrypted: &str) -> String {
    if encrypted.is_empty() {
        return String::new();
    }
    let key = match get_paydunya_keys_encryption_key() {
        Ok(k) => k,
        Err(_) => return encrypted.to_string(),
    };
    decrypt_data(encrypted, &key).unwrap_or_else(|_| encrypted.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let key = "clechiffredeboutenbout0123456789";
        let plain = r#"{"nom":"Test","pays":"SN"}"#;
        let enc = encrypt_data(plain, key).unwrap();
        let dec = decrypt_data(&enc, key).unwrap();
        assert_eq!(plain, dec);
    }

}
