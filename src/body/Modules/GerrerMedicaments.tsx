import React, { useCallback, useEffect, useMemo, useState } from "react";
import { checkPrivilege } from "../helpers/helpers.js";
import { useAlert } from "../context/SearchContext.js";
import { themes } from "../../constants/index.ts";
import { useTheme } from "../context/ThemeContext.js";
import { PosologieController } from "../controllers/PosologieController.js";
import { useSession } from "../context/SessionContext.js";
import { Modal } from "../../items/Modal.tsx";
import { ModalField, ModalSection, ModalActions } from "./ModalFormComponents.js";

type Med = { id?: string; nom?: string; forme?: string; dateCreation?: string };

/** Lecture : catalogue médicaments (gme*, pos01) ou périmètre élargi fiche patient (act02) / référentiel actes (nma*). */
function canReadMedicamentsCatalog(privs: string[]) {
  return (
    checkPrivilege("gme01", privs) ||
    checkPrivilege("gme02", privs) ||
    checkPrivilege("nma01", privs) ||
    checkPrivilege("nma02", privs) ||
    checkPrivilege("pos01", privs) ||
    checkPrivilege("act02", privs)
  );
}

export function GerrerMedicaments({
  tabId: tabIdProp,
  pays,
  privs,
}: {
  tabId?: string;
  pays?: string;
  privs: string[];
}) {
  const { session } = useSession();
  const tabId = tabIdProp ?? session.tabId ?? "";
  const { setAlertObj } = useAlert();
  const { themeNumber } = useTheme();
  const [list, setList] = useState<Med[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [nom, setNom] = useState("");
  const [forme, setForme] = useState("");

  /** Stable entre les rendus : évite de recréer `refresh` à chaque render (boucle useEffect + chargement infini). */
  const ctrl = useMemo(() => PosologieController(pays ?? ""), [pays]);

  const refresh = useCallback(async () => {
    if (!tabId || !pays) return;
    setLoading(true);
    try {
      const m = await ctrl.listMedicaments(tabId);
      const arr = Array.isArray(m) ? m : [];
      setList(arr);
    } catch {
      setList([]);
      setAlertObj({ type: "error", show: true, text: "Impossible de charger les médicaments." });
    } finally {
      setLoading(false);
    }
  }, [tabId, pays, ctrl, setAlertObj]);

  useEffect(() => {
    if (canReadMedicamentsCatalog(privs) && privs.length > 0) {
      void refresh();
    }
  }, [refresh, privs]);

  const canManage =
    checkPrivilege("gme02", privs) || checkPrivilege("pos01", privs);

  const handleAdd = async () => {
    if (!canManage) {
      setAlertObj({ type: "error", show: true, text: "Droits insuffisants pour modifier le catalogue médicaments." });
      return;
    }
    const n = nom.trim();
    if (!n) {
      setAlertObj({ type: "warning", show: true, text: "Indiquez un nom de médicament." });
      return;
    }
    try {
      await ctrl.addMedicament(tabId, n, forme.trim());
      setNom("");
      setForme("");
      setShowModal(false);
      setAlertObj({ type: "success", show: true, text: "Médicament ajouté." });
      await refresh();
    } catch {
      setAlertObj({ type: "error", show: true, text: "Échec de l'ajout." });
    }
  };

  const handleDelete = async (id: string, label: string) => {
    if (!canManage) return;
    if (!window.confirm(`Supprimer « ${label} » du catalogue ?`)) return;
    try {
      await ctrl.deleteMedicament(tabId, id);
      setAlertObj({ type: "success", show: true, text: "Médicament supprimé." });
      await refresh();
    } catch {
      setAlertObj({ type: "error", show: true, text: "Suppression impossible." });
    }
  };

  if (!canReadMedicamentsCatalog(privs)) {
    return (
      <p style={{ color: themes[themeNumber].primary }}>
        Vous n&apos;avez pas accès à la gestion du catalogue médicament.
      </p>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <p style={{ margin: 0, color: "#555", maxWidth: 640 }}>
          Catalogue utilisé dans <b>Posologie / ordonnance</b> (cabinet). Les médicaments sont enregistrés pour ce cabinet.
        </p>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            style={{
              padding: "10px 18px",
              backgroundColor: themes[themeNumber].primary,
              color: themes[themeNumber].secondary,
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + Nouveau médicament
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-muted">Chargement du catalogue…</p>
      ) : list.length === 0 ? (
        <p className="text-muted">Aucun médicament. Ajoutez-en un ici ou depuis la fiche patient (Ordonnance / Posologie).</p>
      ) : (
        <div className="table-responsive" style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${themes[themeNumber].primary}35` }}>
          <table className="table table-sm table-striped table-hover align-middle mb-0">
            <thead>
              <tr style={{ backgroundColor: `${themes[themeNumber].primary}18`, color: themes[themeNumber].primary }}>
                <th scope="col" style={{ padding: "12px 14px" }}>
                  Nom
                </th>
                <th scope="col" style={{ padding: "12px 14px" }}>
                  Forme / précision
                </th>
                {canManage && (
                  <th scope="col" className="text-end" style={{ width: 120, padding: "12px 14px" }}>
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {list.map((m) => {
                const rowKey = m.id != null ? String(m.id) : `row-${m.nom}-${m.forme}`;
                return (
                  <tr key={rowKey}>
                    <td style={{ padding: "10px 14px", fontWeight: 600, color: themes[themeNumber].primary }}>{m.nom ?? "—"}</td>
                    <td style={{ padding: "10px 14px" }} className="text-muted">
                      {m.forme?.trim() ? m.forme : "—"}
                    </td>
                    {canManage && (
                      <td className="text-end" style={{ padding: "10px 14px" }}>
                        {m.id ? (
                          <button
                            type="button"
                            className="btn btn-outline-danger btn-sm"
                            onClick={() => void handleDelete(String(m.id), String(m.nom ?? ""))}
                          >
                            Supprimer
                          </button>
                        ) : (
                          <span className="small text-warning">Id manquant</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal show={showModal} onClose={() => setShowModal(false)} title="Nouveau médicament" maxWidth="480px">
          <ModalSection title="Informations">
            <ModalField id="medNom" label="Nom" value={nom} onChange={(e) => setNom(e.target.value)} fullWidth placeholder="Ex. Amoxicilline 500 mg" />
            <ModalField
              id="medForme"
              label="Forme / précision (optionnel)"
              value={forme}
              onChange={(e) => setForme(e.target.value)}
              fullWidth
              placeholder="Ex. comprimé, sirop…"
            />
          </ModalSection>
          <ModalActions>
            <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
              Annuler
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ backgroundColor: themes[themeNumber].primary, borderColor: themes[themeNumber].primary }}
              onClick={() => void handleAdd()}
            >
              Enregistrer
            </button>
          </ModalActions>
        </Modal>
      )}
    </div>
  );
}
