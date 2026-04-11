//! Lit `REACT_APP_CRIPT_KEY` depuis le `.env` à la racine du repo (à côté de `package.json`)
//! et l’embarque en hex pour `cript_key::resolve_cript_key`, afin d’aligner l’exe avec `npm run build`
//! sans dépendre d’une variable système au double-clic.

fn main() {
    embed_react_app_cript_key_from_dotenv();
    tauri_build::build();
}

fn embed_react_app_cript_key_from_dotenv() {
    use std::env;
    use std::fs;
    use std::path::PathBuf;

    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let env_path = manifest_dir.join("..").join(".env");
    println!("cargo:rerun-if-changed={}", env_path.display());

    let Ok(content) = fs::read_to_string(&env_path) else {
        return;
    };

    for raw_line in content.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some(rest) = line.strip_prefix("REACT_APP_CRIPT_KEY=") else {
            continue;
        };
        let mut v = rest.trim().to_string();
        if v.len() >= 2 {
            let bytes = v.as_bytes();
            if (bytes[0] == b'"' && bytes[v.len() - 1] == b'"')
                || (bytes[0] == b'\'' && bytes[v.len() - 1] == b'\'')
            {
                v = v[1..v.len() - 1].to_string();
            }
        }
        if v.is_empty() {
            return;
        }
        let hex: String = v.bytes().map(|b| format!("{:02x}", b)).collect();
        println!("cargo:rustc-env=LOGGAPPRO_EMBED_CRIPT_KEY_HEX={}", hex);
        return;
    }
}
