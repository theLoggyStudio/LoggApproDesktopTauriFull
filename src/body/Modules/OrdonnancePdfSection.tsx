import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { PosologieController } from "../controllers/PosologieController.js";
import { useAlert } from "../context/SearchContext.js";
import { DOCUMENT_TEMPLATES } from "../Pages/page_etat/templates/documentTemplates.js";
import type { DocumentTemplate } from "../Pages/page_etat/templates/documentTemplates.js";

export type OrdonnancePdfSectionHandle = {
  /** Modèle choisi (radio, un seul), format Page État (aperçu + impression depuis la barre d’outils). */
  getFirstSelectedTemplate: () => DocumentTemplate | null;
};

type Props = {
  pays: string;
  cabinetTabId: string;
  patientId: string;
  patientLabel: string;
  thePatient: Record<string, unknown> | null | undefined;
  posologieText: string;
  onPosologieTextChange: (value: string) => void;
  /** @deprecated Plus de PDF direct : l’aperçu est ouvert depuis le parent (Page État). */
  showPrintButton?: boolean;
  /** Remplace le paragraphe d’aide au-dessus de la zone de texte (ex. remplissage auto depuis le tableau). */
  helpText?: string;
};

function toDocumentTemplate(m: Record<string, unknown> | null | undefined): DocumentTemplate | null {
  if (!m || !Array.isArray(m.elements) || m.elements.length === 0) return null;
  return {
    id: String(m.id ?? ""),
    name: String(m.name ?? "Modèle"),
    icon: String(m.icon ?? "📄"),
    description: String(m.description ?? ""),
    category: String(m.category ?? "prescription"),
    elements: m.elements as DocumentTemplate["elements"],
  };
}

const OrdonnancePdfSection = forwardRef<OrdonnancePdfSectionHandle, Props>(function OrdonnancePdfSection(
  {
    pays,
    cabinetTabId,
    patientId: _patientId,
    patientLabel: _patientLabel,
    thePatient: _thePatient,
    posologieText,
    onPosologieTextChange,
    showPrintButton: _showPrintButton,
    helpText,
  },
  ref
) {
  const { setAlertObj } = useAlert();
  const ctrl = useMemo(() => PosologieController(pays), [pays]);
  const [modelesDb, setModelesDb] = useState<any[]>([]);
  /** Un seul modèle d’état pour l’aperçu (radio). */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const builtinModeles = useMemo(() => {
    return DOCUMENT_TEMPLATES.filter(
      (t) =>
        t.category === "prescription" ||
        t.id === "modele_posologie" ||
        JSON.stringify(t.elements).toLowerCase().includes("posologie")
    ).map((t) => ({
      id: `__builtin__${t.id}`,
      name: `${t.name} (modèle inclus)`,
      icon: t.icon,
      description: t.description,
      category: t.category,
      elements: t.elements,
    }));
  }, []);

  const load = useCallback(async () => {
    if (!cabinetTabId) return;
    setBusy(true);
    try {
      const list = await ctrl.listModelesEtatOrdonnance(cabinetTabId);
      setModelesDb(list);
    } catch {
      setAlertObj({ type: "error", show: true, text: "Chargement des modèles impossible." });
    } finally {
      setBusy(false);
    }
  }, [cabinetTabId, ctrl, setAlertObj]);

  useEffect(() => {
    void load();
  }, [load]);

  const allModeles = useMemo(() => [...builtinModeles, ...modelesDb], [builtinModeles, modelesDb]);

  const getFirstSelectedTemplate = useCallback((): DocumentTemplate | null => {
    const pick =
      selectedId != null ? allModeles.find((m) => String(m.id) === selectedId) : undefined;
    return toDocumentTemplate(pick);
  }, [allModeles, selectedId]);

  useImperativeHandle(ref, () => ({ getFirstSelectedTemplate }), [getFirstSelectedTemplate]);

  return (
    <div className="ordonnance-pdf-section">
      <p className="small text-muted">
        {helpText ? (
          helpText
        ) : (
          <>
            Texte injecté dans <code>{"{{posologie}}"}</code>, <code>{"{{posologie.texte}}"}</code>,{" "}
            <code>{"{{posologie.lignes}}"}</code>, <code>{"{{posologie.date}}"}</code>. L&apos;impression se fait depuis la{" "}
            <b>Page État</b> en mode aperçu (bouton dans la barre d&apos;outils).
          </>
        )}
      </p>
      <textarea
        className="form-control mb-3"
        rows={8}
        placeholder="Ex. : Amoxicilline 500 mg, 1 cp × 2/j pendant 7 jours…"
        value={posologieText}
        onChange={(e) => onPosologieTextChange(e.target.value)}
      />
      <div className="fw-bold mb-2">Modèles d&apos;état (aperçu Page État)</div>
      {busy && allModeles.length === 0 ? (
        <p className="small text-muted">Chargement…</p>
      ) : allModeles.length === 0 ? (
        <p className="small text-muted">
          Aucun modèle. Créez-en un dans Page État (catégorie « prescription » ou avec variable posologie).
        </p>
      ) : (
        <ul
          className="list-unstyled small"
          style={{ maxHeight: "220px", overflowY: "auto" }}
          role="radiogroup"
          aria-label="Modèle d'état pour aperçu Page État"
        >
          {allModeles.map((m) => (
            <li key={m.id} className="mb-1">
              <label className="d-flex align-items-center gap-2" style={{ cursor: "pointer" }}>
                <input
                  type="radio"
                  name="ordonnance-etat-modele-aperçu"
                  checked={selectedId != null && selectedId === String(m.id)}
                  onChange={() => setSelectedId(String(m.id))}
                />
                <span>
                  {m.icon ? `${m.icon} ` : ""}
                  {m.name}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <p className="small text-muted mb-0">
        Choisissez <b>un seul</b> modèle : c&apos;est celui-ci qui sera ouvert en aperçu sur la Page État.
      </p>
    </div>
  );
});

OrdonnancePdfSection.displayName = "OrdonnancePdfSection";

export default OrdonnancePdfSection;
