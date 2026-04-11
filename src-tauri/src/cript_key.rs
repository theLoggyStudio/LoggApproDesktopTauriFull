//! Résolution de la clé AES (alignement front Vite / binaire Rust).
//!
//! Ordre : `REACT_APP_CRIPT_KEY` au **lancement** → clé lue depuis `.env` à la **compilation**
//! (`LOGGAPPRO_EMBED_CRIPT_KEY_HEX` via `build.rs`) → défaut dev (identique au front).

use crate::payload::DEFAULT_CRIPT_KEY;

fn decode_hex_embedded() -> Option<String> {
    let hex = option_env!("LOGGAPPRO_EMBED_CRIPT_KEY_HEX")?;
    if hex.is_empty() {
        return None;
    }
    if hex.len() % 2 != 0 {
        return None;
    }
    let mut bytes = Vec::with_capacity(hex.len() / 2);
    for chunk in hex.as_bytes().chunks(2) {
        let h = std::str::from_utf8(chunk).ok()?;
        let b = u8::from_str_radix(h, 16).ok()?;
        bytes.push(b);
    }
    String::from_utf8(bytes).ok().filter(|s| !s.is_empty())
}

/// Même logique que l’ancien `get_cript_key` dans `commands`, avec clé embarquée au build.
pub fn resolve_cript_key() -> String {
    if let Ok(v) = std::env::var("REACT_APP_CRIPT_KEY") {
        let t = v.trim();
        if !t.is_empty() {
            return t.to_string();
        }
    }
    if let Some(s) = decode_hex_embedded() {
        return s;
    }
    DEFAULT_CRIPT_KEY.to_string()
}
