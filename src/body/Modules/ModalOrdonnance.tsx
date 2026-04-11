import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal as ModalGlobal } from "../../items/Modal.tsx";
import OrdonnancePdfSection, { type OrdonnancePdfSectionHandle } from "./OrdonnancePdfSection.js";
import { useAlert } from "../context/SearchContext.js";
import { useSession } from "../context/SessionContext.js";

type Props = {
  show: boolean;
  onClose: () => void;
  patientId: string;
  cabinetTabId: string;
  pays: string;
  patientLabel: string;
  thePatient: Record<string, unknown> | null | undefined;
  theme: { primary: string; secondary: string; shadowViolet?: string };
};

/** Modal autonome « ordonnance seule » (si réutilisé ailleurs). Le flux principal passe par ModalPosologie. */
export default function ModalOrdonnance({
  show,
  onClose,
  patientId,
  cabinetTabId,
  pays,
  patientLabel,
  thePatient,
}: Props) {
  const [posologieText, setPosologieText] = useState("");
  const navigate = useNavigate();
  const { session } = useSession();
  const { setAlertObj } = useAlert();
  const sectionRef = useRef<OrdonnancePdfSectionHandle>(null);

  const openEtatPreview = () => {
    const tpl = sectionRef.current?.getFirstSelectedTemplate?.() ?? null;
    if (!tpl?.elements?.length) {
      setAlertObj({
        type: "warning",
        show: true,
        text: "Sélectionnez un modèle d’ordonnance pour ouvrir l’aperçu sur la Page État.",
      });
      return;
    }
    const uid = session.userId ?? "";
    const tab = cabinetTabId ?? "";
    const py = pays ?? "sn";
    const path = uid && tab && py ? `/etats/${uid}/${tab}/${py}` : "/etats";
    onClose();
    navigate(path, {
      state: {
        posologieEtatPreview: {
          template: tpl,
          patient: thePatient ?? null,
          posologieText,
        },
      },
    });
  };

  if (!show) return null;

  return (
    <ModalGlobal
      show={show}
      onClose={onClose}
      title={`📋 Ordonnance — ${patientLabel}`}
      maxWidth="720px"
      zIndex={10350}
    >
      <div style={{ padding: "12px 16px", maxHeight: "78vh", overflowY: "auto" }}>
        <OrdonnancePdfSection
          ref={sectionRef}
          pays={pays}
          cabinetTabId={cabinetTabId}
          patientId={patientId}
          patientLabel={patientLabel}
          thePatient={thePatient}
          posologieText={posologieText}
          onPosologieTextChange={setPosologieText}
          showPrintButton={false}
        />
        <div className="d-flex gap-2 mt-3 flex-wrap">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => openEtatPreview()}>
            Aperçu Page État (imprimer depuis là)
          </button>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </ModalGlobal>
  );
}
