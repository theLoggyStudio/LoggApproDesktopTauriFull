import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal as ModalGlobal } from "../../items/Modal.tsx";
import OrdonnancePdfSection, { type OrdonnancePdfSectionHandle } from "./OrdonnancePdfSection.js";
import { PosologieController } from "../controllers/PosologieController.js";
import { useAlert } from "../context/SearchContext.js";
import type { DocumentTemplate } from "../Pages/page_etat/templates/documentTemplates.js";
import { useSession } from "../context/SessionContext.js";
import {
  buildActesPreviewForEtat,
  formatActePatientOptionLabel,
  formatOrdonnanceTextFromPosologieTable,
  formatPosologieText,
} from "../utils/posologieDisplayFormat.js";

export type PosologieLine = {
  key: string;
  acteId: string;
  medicamentId: string;
  /** Nombre de boîtes prescrites */
  nombreBoites: number;
  quantite: number;
  /** Heures de prise « HH:MM » (ex. 08:30) */
  heures: string[];
};

type MedRef = { id: string; nom: string; forme?: string };

function getCategoryColor(category: string): string {
  switch (category) {
    case "consultation":
      return "#3498db";
    case "prescription":
      return "#e74c3c";
    case "certificat":
      return "#2ecc71";
    case "devis":
      return "#f39c12";
    case "administratif":
      return "#9b59b6";
    default:
      return "#95a5a6";
  }
}

function defaultLine(): PosologieLine {
  return {
    key: `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    acteId: "",
    medicamentId: "",
    nombreBoites: 1,
    quantite: 1,
    heures: ["08:00"],
  };
}

/** Réexport pour les modules qui importaient depuis ModalPosologie. */
export { formatActePatientOptionLabel };

type PatientActeOption = {
  id: string;
  nom: string;
  /** Date de l’acte (champ `acte.date` côté API) */
  date?: string;
  /** Description (infobulle / title sur l’option) */
  description?: string;
};

type Props = {
  show: boolean;
  onClose: () => void;
  patientId: string;
  cabinetTabId: string;
  pays: string;
  patientLabel: string;
  /** Données patient pour variables Page État */
  patientForEtat?: Record<string, unknown> | null;
  /** Actes réels du dossier patient (liste détail), pas le référentiel `tab_nom_acte`. */
  actesOptions: PatientActeOption[];
  theme: { primary: string; secondary: string; shadowViolet?: string };
  /** Droit posologie : sinon l’option et l’enregistrement posologie sont masqués. */
  allowPosologie?: boolean;
  /** Droit ordonnance PDF : sinon l’option et le bloc ordonnance sont masqués. */
  allowOrdonnance?: boolean;
};

export default function ModalPosologie({
  show,
  onClose,
  patientId,
  cabinetTabId,
  pays,
  patientLabel,
  patientForEtat,
  actesOptions,
  theme,
  allowPosologie = true,
  allowOrdonnance = true,
}: Props) {
  const navigate = useNavigate();
  const { session } = useSession();
  const userId = session.userId;
  const { setAlertObj } = useAlert();
  const ctrl = useMemo(() => PosologieController(pays), [pays]);
  const ordonnanceRef = useRef<OrdonnancePdfSectionHandle>(null);

  const [medicaments, setMedicaments] = useState<Array<{ id?: string; nom?: string; forme?: string }>>([]);
  const [actesUsed, setActesUsed] = useState<string[]>([]);
  const [modeles, setModeles] = useState<any[]>([]);
  const [lines, setLines] = useState<PosologieLine[]>([defaultLine()]);
  const [qrImg, setQrImg] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [showMedModal, setShowMedModal] = useState(false);
  const [newMedNom, setNewMedNom] = useState("");
  const [newMedForme, setNewMedForme] = useState("");
  const [medModalLineKey, setMedModalLineKey] = useState<string | null>(null);

  const [ordonnanceText, setOrdonnanceText] = useState("");
  const [ordonnanceTextDirty, setOrdonnanceTextDirty] = useState(false);

  const load = useCallback(async () => {
    if (!show || !patientId || !cabinetTabId) return;
    try {
      const [m, used, mod] = await Promise.all([
        ctrl.listMedicaments(cabinetTabId),
        ctrl.listActesIdsInPosologie(patientId),
        ctrl.listModelesEtatPosologie(cabinetTabId),
      ]);
      setMedicaments(m);
      setActesUsed(used);
      setModeles(mod);
    } catch (e) {
      console.error(e);
      setAlertObj({ type: "error", show: true, text: "Chargement posologie impossible." });
    }
  }, [show, patientId, cabinetTabId, ctrl, setAlertObj]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!show) {
      setShowMedModal(false);
    }
  }, [show]);

  /** À l’ouverture : reprendre le texte ordonnance depuis le tableau. */
  useEffect(() => {
    if (!show) return;
    setOrdonnanceTextDirty(false);
  }, [show]);

  const posTextFromLines = useMemo(() => {
    const acteLbl = actesOptions.map((a) => ({
      id: String(a.id),
      label: formatActePatientOptionLabel({ nom: a.nom, date: a.date }),
    }));
    const medLbl: MedRef[] = medicaments.map((m) => ({
      id: String(m.id ?? ""),
      nom: String(m.nom ?? ""),
      forme: m.forme != null ? String(m.forme) : undefined,
    }));
    return formatOrdonnanceTextFromPosologieTable(lines, acteLbl, medLbl);
  }, [lines, medicaments, actesOptions]);

  /** Synchroniser le texte ordonnance avec le tableau tant que l’utilisateur ne l’a pas modifié à la main. */
  useEffect(() => {
    if (!show || !allowOrdonnance || ordonnanceTextDirty) return;
    setOrdonnanceText(posTextFromLines);
  }, [show, allowOrdonnance, ordonnanceTextDirty, posTextFromLines]);

  const acteChoices = useMemo(() => {
    const usedSet = new Set(actesUsed);
    return actesOptions.map((a) => {
      const labelFmt = formatActePatientOptionLabel({ nom: a.nom, date: a.date });
      const desc = (a.description ?? "").trim();
      return {
        id: String(a.id),
        /** Texte visible du select : [date] nom (acte dossier patient / tab_acte). */
        label: labelFmt,
        disabledGlobally: usedSet.has(String(a.id)),
        /** Infobulle : description + libellé [date] nom si les deux existent. */
        title: desc ? `${desc} — ${labelFmt}` : labelFmt,
      };
    });
  }, [actesOptions, actesUsed]);

  const addRow = () => {
    setLines((prev) => [...prev, defaultLine()]);
  };

  const removeRow = (key: string) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));
  };

  const updateLine = (key: string, patch: Partial<PosologieLine>) => {
    setLines((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const lineHasPrise = (L: PosologieLine): boolean =>
    (L.heures || []).some((h) => /^\d{1,2}:\d{2}$/.test((h || "").trim()));

  const validate = (): string | null => {
    for (const L of lines) {
      if (!L.acteId || !L.medicamentId) return "Remplissez acte et médicament sur chaque ligne.";
      if (!lineHasPrise(L)) return "Chaque ligne : indiquez au moins une heure de prise (hh:mm).";
      if ((L.nombreBoites ?? 0) < 1) return "Chaque ligne : indiquez au moins 1 boîte.";
      /** Même acte autorisé sur plusieurs lignes ; interdit seulement s’il est déjà dans une autre posologie enregistrée. */
      if (actesUsed.includes(L.acteId))
        return "Un acte choisi est déjà lié à une autre posologie enregistrée.";
    }
    return null;
  };

  const savePosologieAsync = async (): Promise<boolean> => {
    const err = validate();
    if (err) {
      setAlertObj({ type: "warning", show: true, text: err });
      return false;
    }
    setQrImg("");
    try {
      const res = await ctrl.savePosologie({
        patientId,
        cabinetTabId,
        lines: lines.map((L) => ({
          acteId: L.acteId,
          medicamentId: L.medicamentId,
          nombreBoites: Math.max(1, L.nombreBoites ?? 1),
          quantite: L.quantite,
          heures: (L.heures || []).filter((h) => /^\d{1,2}:\d{2}$/.test((h || "").trim())),
        })),
      });
      if (!res?.success) {
        setAlertObj({ type: "error", show: true, text: "Enregistrement posologie refusé." });
        return false;
      }
      if (res.qrBase64) setQrImg(res.qrBase64);
      setAlertObj({ type: "success", show: true, text: "Posologie enregistrée. QR prêt pour l’app mobile." });
      await load();
      if (typeof window !== "undefined" && (window as any).dispatchEvent) {
        window.dispatchEvent(new CustomEvent("loggappro-posologie-saved", { detail: { patientId } }));
      }
      return true;
    } catch (e: any) {
      setAlertObj({
        type: "error",
        show: true,
        text: e?.message?.includes?.("acte") ? String(e.message) : "Erreur lors de l’enregistrement.",
      });
      return false;
    }
  };

  /** Navigation vers Page État en mode aperçu (variables remplies ; impression depuis la barre d’outils). */
  const navigateToEtatPreviewMode = useCallback(
    (
      template: DocumentTemplate,
      posologieTextForVars: string,
      actesPreview?: Array<{ id: string; nom: string; date: string; description?: string; prix?: string }>
    ) => {
      const uid = userId ?? "";
      const tab = cabinetTabId ?? "";
      const py = pays ?? "sn";
      const path = uid && tab && py ? `/etats/${uid}/${tab}/${py}` : "/etats";
      navigate(path, {
        state: {
          posologieEtatPreview: {
            template,
            patient: patientForEtat ?? null,
            posologieText: posologieTextForVars,
            ...(actesPreview && actesPreview.length > 0 ? { actesPreview } : {}),
          },
        },
      });
    },
    [navigate, userId, cabinetTabId, pays, patientForEtat]
  );

  const handleApply = async () => {
    if (!allowPosologie && !allowOrdonnance) {
      setAlertObj({
        type: "warning",
        show: true,
        text: "Aucune action disponible (droits posologie / ordonnance).",
      });
      return;
    }
    setBusy(true);
    try {
      if (allowPosologie) {
        const ok = await savePosologieAsync();
        if (!ok) {
          if (!allowOrdonnance) {
            return;
          }
          setAlertObj({
            type: "warning",
            show: true,
            text: "La posologie n’a pas été enregistrée (QR / app). Vérifiez le tableau ou les actes déjà en posologie. L’aperçu ordonnance s’ouvre tout de même.",
          });
        }
      }
      if (allowOrdonnance) {
        const tpl = ordonnanceRef.current?.getFirstSelectedTemplate?.() ?? null;
        if (!tpl?.elements?.length) {
          setAlertObj({
            type: "warning",
            show: true,
            text: "Sélectionnez un modèle d’ordonnance ci-dessous pour ouvrir l’aperçu sur la Page État.",
          });
          return;
        }
        onClose();
        const actesPv = buildActesPreviewForEtat(lines, actesOptions);
        const textForPreview = ordonnanceTextDirty ? ordonnanceText : posTextFromLines;
        navigateToEtatPreviewMode(tpl, textForPreview, actesPv);
      }
    } finally {
      setBusy(false);
    }
  };

  const openNouveauMed = (lineKey: string) => {
    setMedModalLineKey(lineKey);
    setNewMedNom("");
    setNewMedForme("");
    setShowMedModal(true);
  };

  const handleSaveNewMed = async () => {
    const n = newMedNom.trim();
    if (!n) {
      setAlertObj({ type: "warning", show: true, text: "Nom du médicament requis." });
      return;
    }
    setBusy(true);
    try {
      const res = await ctrl.addMedicament(cabinetTabId, n, newMedForme.trim());
      const newId = res?.id;
      const m = await ctrl.listMedicaments(cabinetTabId);
      setMedicaments(m);
      if (newId && medModalLineKey) {
        updateLine(medModalLineKey, { medicamentId: String(newId) });
      }
      setShowMedModal(false);
      setAlertObj({ type: "success", show: true, text: "Médicament créé et sélectionné." });
    } catch {
      setAlertObj({ type: "error", show: true, text: "Impossible de créer le médicament." });
    } finally {
      setBusy(false);
    }
  };

  const addHeureLigne = (key: string) => {
    const L = lines.find((x) => x.key === key);
    const next = [...(L?.heures || []), "08:00"];
    updateLine(key, { heures: next });
  };

  const setHeureAt = (key: string, index: number, value: string) => {
    const L = lines.find((x) => x.key === key);
    if (!L) return;
    const next = [...(L.heures || [])];
    next[index] = value;
    updateLine(key, { heures: next });
  };

  const removeHeureAt = (key: string, index: number) => {
    const L = lines.find((x) => x.key === key);
    if (!L) return;
    const next = (L.heures || []).filter((_, i) => i !== index);
    updateLine(key, { heures: next });
  };

  /** Clic sur une carte modèle (même apparence que 📄 Modèles sur Page État) → Page État en aperçu. */
  const openPosologiePreviewForModel = (mod: any) => {
    if (!allowPosologie) return;
    const err = validate();
    if (err) {
      setAlertObj({ type: "warning", show: true, text: err });
      return;
    }
    if (!mod || !Array.isArray(mod.elements) || mod.elements.length === 0) {
      setAlertObj({ type: "error", show: true, text: "Modèle introuvable ou vide." });
      return;
    }
    const acteLbl = actesOptions.map((a) => ({
      id: String(a.id),
      label: formatActePatientOptionLabel({ nom: a.nom, date: a.date }),
    }));
    const medLbl = medicaments.map((m) => ({ id: String(m.id ?? ""), nom: String(m.nom ?? "") }));
    const posText = formatPosologieText(lines, acteLbl, medLbl);

    const template: DocumentTemplate = {
      id: String(mod.id),
      name: String(mod.name || "Modèle"),
      icon: mod.icon ?? "📄",
      description: String(mod.description ?? ""),
      category: String(mod.category ?? "administratif"),
      elements: mod.elements,
    };

    onClose();
    const actesPv = buildActesPreviewForEtat(lines, actesOptions);
    navigateToEtatPreviewMode(template, posText, actesPv);
  };

  /**
   * Compatibilité : évite ReferenceError si un ancien rendu / cache référence encore `goToEtatPreview`.
   * Un seul modèle → ouverture directe ; sinon message pour cliquer une carte « 📄 Modèles ».
   */
  const goToEtatPreview = () => {
    if (!allowPosologie) return;
    if (modeles.length === 0) {
      setAlertObj({ type: "warning", show: true, text: "Aucun modèle disponible." });
      return;
    }
    if (modeles.length === 1) {
      openPosologiePreviewForModel(modeles[0]);
      return;
    }
    setAlertObj({
      type: "info",
      show: true,
      text: "Cliquez sur une carte sous « 📄 Modèles » pour ouvrir l’aperçu Page État.",
    });
  };

  if (!show) return null;

  return (
    <>
      <ModalGlobal
        show={show}
        onClose={onClose}
        title={`💊 Ordonnance / Posologie — ${patientLabel}`}
        maxWidth="1040px"
        style={{ boxShadow: `0 25px 70px rgba(0,0,0,0.25)` }}
        zIndex={10300}
      >
        <div style={{ padding: "12px 16px", maxHeight: "78vh", overflowY: "auto" }}>
          <p className="small text-muted">
            Renseignez le tableau, choisissez un <b>modèle d&apos;ordonnance</b> (cases à cocher), éventuellement éditez le texte,
            puis <b>Valider</b>
            {allowPosologie && allowOrdonnance
              ? " : enregistrement de la posologie (QR / app) et ouverture de la Page État en aperçu."
              : allowPosologie
                ? " : enregistrement de la posologie (QR / app)."
                : " : ouverture de la Page État en aperçu."}{" "}
            Vous pouvez aussi cliquer une carte <b>📄 Modèles</b> pour un aperçu « posologie » direct. L&apos;impression se fait depuis la
            Page État. <b>Même acte</b> sur plusieurs lignes possible ; « déjà posologie » = acte déjà lié à une autre posologie
            enregistrée. Prises : hh:mm.
          </p>

          <div style={{ overflowX: "auto" }}>
            <table className="table table-sm table-bordered align-middle">
              <thead>
                <tr style={{ backgroundColor: theme.primary, color: theme.secondary }}>
                  <th>Acte (patient)</th>
                  <th>Médicament</th>
                  <th style={{ width: "88px" }} title="Nombre de boîtes prescrites">
                    Nbre boîtes
                  </th>
                  <th style={{ width: "72px" }}>Qté a prendre</th>
                  <th style={{ minWidth: "200px" }}>Heures de prise</th>
                  <th style={{ width: "48px" }} />
                </tr>
              </thead>
              <tbody>
                {lines.map((L) => (
                  <tr key={L.key}>
                    <td>
                      <select
                        className="form-select form-select-sm"
                        value={L.acteId}
                        onChange={(e) => updateLine(L.key, { acteId: e.target.value })}
                      >
                        <option value="">— Acte —</option>
                        {acteChoices.map((a) => {
                          const blocked = a.disabledGlobally;
                          return (
                            <option key={a.id} value={a.id} disabled={blocked} title={a.title}>
                              {a.label}
                              {a.disabledGlobally ? " (déjà posologie)" : ""}
                            </option>
                          );
                        })}
                      </select>
                    </td>
                    <td>
                      <div className="d-flex gap-1 align-items-stretch">
                        <select
                          className="form-select form-select-sm flex-grow-1"
                          style={{ minWidth: 0 }}
                          value={L.medicamentId}
                          onChange={(e) => updateLine(L.key, { medicamentId: e.target.value })}
                        >
                          <option value="">— Médicament —</option>
                          {medicaments.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.nom}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-sm text-nowrap"
                          onClick={() => openNouveauMed(L.key)}
                          title="Créer un médicament"
                        >
                          + Nouveau
                        </button>
                      </div>
                    </td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        className="form-control form-control-sm"
                        title="Nombre de boîtes"
                        value={L.nombreBoites ?? 1}
                        onChange={(e) =>
                          updateLine(L.key, { nombreBoites: Math.max(1, parseInt(e.target.value, 10) || 1) })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        className="form-control form-control-sm"
                        value={L.quantite}
                        onChange={(e) => updateLine(L.key, { quantite: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                      />
                    </td>
                    <td>
                      <div className="d-flex flex-column gap-1 align-items-start w-100">
                        <div className="small text-muted mb-1">hh:mm</div>
                        {(L.heures || []).map((h, idx) => (
                          <div key={idx} className="d-flex gap-1 align-items-center mb-1">
                            <input
                              type="time"
                              className="form-control form-control-sm"
                              style={{ maxWidth: "120px" }}
                              value={/^\d{1,2}:\d{2}$/.test((h || "").trim()) ? (h || "").trim() : ""}
                              onChange={(e) => setHeureAt(L.key, idx, e.target.value)}
                            />
                            <button
                              type="button"
                              className="btn btn-link text-danger p-0 btn-sm"
                              onClick={() => removeHeureAt(L.key, idx)}
                              title="Retirer cette heure"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => addHeureLigne(L.key)}>
                          + Heure
                        </button>
                      </div>
                    </td>
                    <td>
                      <button type="button" className="btn btn-link text-danger p-0" onClick={() => removeRow(L.key)}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button type="button" className="btn btn-outline-primary btn-sm mb-3" onClick={addRow}>
            + Ligne
          </button>

          {allowOrdonnance && (
            <div className="mb-3 border rounded p-3" style={{ backgroundColor: "#fafafa" }}>
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                <div className="fw-bold">📋 Ordonnance — aperçu Page État</div>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  title="Réapplique le texte calculé à partir du tableau (médicaments, boîtes à acheter, détail des prises)"
                  onClick={() => setOrdonnanceTextDirty(false)}
                >
                  ↻ Reprendre depuis le tableau
                </button>
              </div>
              <OrdonnancePdfSection
                ref={ordonnanceRef}
                pays={pays}
                cabinetTabId={cabinetTabId}
                patientId={patientId}
                patientLabel={patientLabel}
                thePatient={patientForEtat ?? undefined}
                posologieText={ordonnanceText}
                onPosologieTextChange={(s) => {
                  setOrdonnanceTextDirty(true);
                  setOrdonnanceText(s);
                }}
                showPrintButton={false}
                helpText={
                  "Choisissez un seul modèle (bouton radio), puis Valider en bas : ouverture de la Page État en aperçu. Impression depuis la barre d’outils. Variables : {{posologie}}, {{posologie.texte}}, {{posologie.lignes}}, {{posologie.date}}."
                }
              />
            </div>
          )}

        </div>

        <div className="d-flex flex-wrap gap-2 align-items-center">
          <button
            type="button"
            className="btn"
            style={{ backgroundColor: theme.primary, color: theme.secondary }}
            disabled={busy}
            onClick={() => void handleApply()}
          >
            {allowPosologie && allowOrdonnance
              ? "Valider"
              : allowPosologie
                ? "Enregistrer la posologie"
                : "Ouvrir l’aperçu Page État"}
          </button>
          <button type="button" className="btn btn-outline-dark" onClick={onClose}>
            Fermer
          </button>
        </div>

        {qrImg && (
          <div className="mt-3 text-center">
            <div className="small text-muted mb-1">QR chiffré (patient + posologie) — à scanner avec l’app mobile</div>
            <img src={qrImg} alt="QR posologie" style={{ maxWidth: "260px", height: "auto" }} />
          </div>
        )}

      </ModalGlobal>

      {showMedModal && (
        <ModalGlobal
          show={showMedModal}
          onClose={() => setShowMedModal(false)}
          title="Nouveau médicament"
          maxWidth="440px"
          zIndex={10400}
        >
          <div className="p-3">
            <label className="form-label small">Nom</label>
            <input className="form-control mb-2" value={newMedNom} onChange={(e) => setNewMedNom(e.target.value)} placeholder="Ex. Amoxicilline 500 mg" />
            <label className="form-label small">Forme (optionnel)</label>
            <input className="form-control mb-3" value={newMedForme} onChange={(e) => setNewMedForme(e.target.value)} placeholder="comprimé, sirop…" />
            <div className="d-flex gap-2 justify-content-end">
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setShowMedModal(false)}>
                Annuler
              </button>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void handleSaveNewMed()}>
                Créer
              </button>
            </div>
          </div>
        </ModalGlobal>
      )}
    </>
  );
}
