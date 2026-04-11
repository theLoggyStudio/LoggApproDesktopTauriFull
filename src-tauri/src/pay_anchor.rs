//! Date d'inscription de référence pour le paiement : stockée dans dblaadmin (`tab_pay_anchor`),
//! 10 colonnes de dates toutes chiffrées, une seule est la vraie (indice `pay_anchor_real_slot` du schéma).

use sqlx::any::Any;
use sqlx::Row;

use crate::admin_schema::{self, AdminSchema};

/// Dates factices (clair avant chiffrement) pour les 9 colonnes leurre.
const DECOY_DATE_STRS: [&str; 12] = [
    "2017-02-18 11:22:33",
    "2018-09-05 16:45:10",
    "2019-01-30 08:00:00",
    "2020-06-14 12:15:45",
    "2021-03-21 19:30:12",
    "2022-10-08 07:55:20",
    "2023-04-27 14:18:06",
    "2024-01-09 09:09:09",
    "2024-08-16 22:40:58",
    "2025-02-01 13:33:00",
    "2026-05-20 10:10:10",
    "2016-12-31 23:59:59",
];

/// Enregistre ou remplace la ligne d'ancrage pour un cabinet (date d'inscription + leurres chiffrés).
pub async fn upsert_inscription_anchor(
    conn: &mut sqlx::AnyConnection,
    schema: &AdminSchema,
    cabinet_id: &str,
    inscription_iso: &str,
) -> Result<(), String> {
    if !schema.tables.contains_key("tab_pay_anchor") {
        return Err("Schéma tab_pay_anchor manquant".to_string());
    }
    let cols = admin_schema::TAB_PAY_ANCHOR_COLS;
    let ins = schema.insert_cols("tab_pay_anchor", cols);
    let enc_cab = schema.encrypt_value("tab_pay_anchor", "cabinet_id", cabinet_id)?;

    let slot = schema.pay_anchor_real_slot.min(9);
    let mut decoy_i = 0usize;
    let mut binds: Vec<String> = Vec::with_capacity(11);
    binds.push(enc_cab);
    for i in 0..10u8 {
        let logical = format!("anchor_{}", i);
        let plain = if i == slot {
            inscription_iso.to_string()
        } else {
            let s = DECOY_DATE_STRS[decoy_i % DECOY_DATE_STRS.len()];
            decoy_i += 1;
            s.to_string()
        };
        let enc = schema.encrypt_value("tab_pay_anchor", &logical, &plain)?;
        binds.push(enc);
    }

    let placeholders = (1..=binds.len())
        .map(|i| format!("?{}", i))
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "INSERT OR REPLACE INTO tab_pay_anchor ({}) VALUES ({})",
        ins, placeholders
    );
    let mut q = sqlx::query::<Any>(&sql);
    for b in binds {
        q = q.bind(b);
    }
    q.execute(&mut *conn)
        .await
        .map_err(|e| format!("pay_anchor insert: {}", e))?;
    Ok(())
}

/// Lit la date d'inscription de référence (déchiffrée), si une ligne existe.
pub async fn read_inscription_anchor_date(
    conn: &mut sqlx::AnyConnection,
    schema: &AdminSchema,
    cabinet_id: &str,
) -> Result<Option<String>, String> {
    if !schema.tables.contains_key("tab_pay_anchor") {
        return Ok(None);
    }
    let cabinet_col = schema.col_or_logical("tab_pay_anchor", "cabinet_id");
    let enc_cab = schema.encrypt_value("tab_pay_anchor", "cabinet_id", cabinet_id)?;
    let slot = schema.pay_anchor_real_slot.min(9);
    let logical = format!("anchor_{}", slot);
    let anchor_col = schema.col_or_logical("tab_pay_anchor", &logical);
    let sql = format!(
        "SELECT CAST({} AS TEXT) FROM tab_pay_anchor WHERE {} = ?1 LIMIT 1",
        anchor_col, cabinet_col
    );
    let row_opt = sqlx::query::<Any>(&sql)
        .bind(&enc_cab)
        .fetch_optional(&mut *conn)
        .await
        .map_err(|e| format!("pay_anchor select: {}", e))?;
    let Some(r) = row_opt else {
        return Ok(None);
    };
    let enc_val: String = r.try_get(0).map_err(|e| format!("pay_anchor col: {}", e))?;
    if enc_val.is_empty() {
        return Ok(None);
    }
    let plain = schema.decrypt_value_or_fail("tab_pay_anchor", &logical, &enc_val)?;
    Ok(Some(plain))
}

/// Supprime la ligne d'ancrage paiement pour un cabinet (ex. ancien id démo après migration).
pub async fn delete_inscription_anchor(
    conn: &mut sqlx::AnyConnection,
    schema: &AdminSchema,
    cabinet_id: &str,
) -> Result<(), String> {
    if !schema.tables.contains_key("tab_pay_anchor") {
        return Ok(());
    }
    let cabinet_col = schema.col_or_logical("tab_pay_anchor", "cabinet_id");
    let enc_cab = schema.encrypt_value("tab_pay_anchor", "cabinet_id", cabinet_id)?;
    let sql = format!("DELETE FROM tab_pay_anchor WHERE {} = ?1", cabinet_col);
    sqlx::query::<Any>(&sql)
        .bind(enc_cab)
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("pay_anchor delete: {}", e))?;
    Ok(())
}
