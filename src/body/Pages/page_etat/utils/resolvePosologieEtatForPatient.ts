import { PosologieController } from '../../../controllers/PosologieController.js';
import PageEtatController from '../../../controllers/PageEtatController.js';
import {
  dedupePosologieLinesLike,
  formatActePatientOptionLabel,
  formatOrdonnanceTextFromPosologieTable,
  formatPosologieText,
  normalizePosologieLineFromApi,
  type PosologieLineLike,
} from '../../../utils/posologieDisplayFormat.js';

export type PosologieEtatResolved = {
  ordonnance: string;
  posologie: string;
  /** Message pour le modal si aucune ligne ; null si des lignes existent */
  hint: string | null;
};

/**
 * Charge le texte posologie / ordonnance pour la Page État (modal + aperçu automatique).
 */
export async function resolvePosologieEtatForPatient(params: {
  patientId: string;
  tabId: string;
  pays: string;
}): Promise<PosologieEtatResolved> {
  const { patientId, tabId, pays } = params;
  const pid = String(patientId ?? '').trim();
  const tab = String(tabId ?? '');
  const py = pays || 'sn';
  if (!pid || !tab) {
    return {
      ordonnance: '',
      posologie: '',
      hint: "Sélectionnez d’abord un patient (section Données : variables patient ou tableau des patients).",
    };
  }

  const ctrl = PosologieController(py);
  const controller = PageEtatController(py);

  try {
    const actesBrut = await controller.listerLesActes('', pid, 300, tab);
    const actesPatientOptions = Array.isArray(actesBrut)
      ? actesBrut.map((item: any) => {
          const a = item.acte || item;
          return {
            id: String(a.id ?? ''),
            nom: String(a.nom ?? a.nomActe ?? ''),
            date: String(a.date ?? a.date_creation ?? ''),
            description: String(a.description ?? ''),
          };
        })
      : [];

    const [medicaments, acteIdsPos, fromPatient] = await Promise.all([
      ctrl.listMedicaments(tab),
      ctrl.listActesIdsInPosologie(pid).catch(() => [] as string[]),
      ctrl.getPosologieLinesForPatient({ patientId: pid, tabId: tab }).catch(() => null),
    ]);

    let rawLines: unknown[] = [];
    if (fromPatient !== null && fromPatient.length > 0) {
      rawLines = fromPatient;
    } else if (fromPatient === null || (fromPatient.length === 0 && acteIdsPos.length > 0)) {
      const ids = acteIdsPos.map((id) => String(id));
      const chunks = await Promise.all(
        ids.map((acteId) =>
          ctrl
            .getPosologieLinesForActe({ patientId: pid, acteId, tabId: tab })
            .then((rows) => (Array.isArray(rows) ? rows : []))
            .catch(() => [] as unknown[])
        )
      );
      rawLines = chunks.flat();
    }

    const medLbl = medicaments.map((m: any) => ({
      id: String(m.id ?? ''),
      nom: String(m.nom ?? ''),
      forme: m.forme != null ? String(m.forme) : undefined,
    }));
    const acteLbl = actesPatientOptions.map((a) => ({
      id: String(a.id),
      label: formatActePatientOptionLabel({ nom: a.nom, date: a.date }),
    }));

    const lines: PosologieLineLike[] = dedupePosologieLinesLike(
      rawLines
        .map((r) => normalizePosologieLineFromApi(r))
        .filter((x): x is PosologieLineLike => x != null)
    );

    if (lines.length === 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const acteIdsPosAny = acteIdsPos as any[];
      const hint =
        !acteIdsPosAny || acteIdsPosAny.length === 0
          ? 'Aucune posologie enregistrée pour ce patient.'
          : 'Une posologie est liée à des actes, mais les lignes n’ont pas pu être chargées. Vérifiez la fiche patient.';
      return { ordonnance: '', posologie: '', hint };
    }

    return {
      ordonnance: formatOrdonnanceTextFromPosologieTable(lines, acteLbl, medLbl),
      posologie: formatPosologieText(lines, acteLbl, medLbl),
      hint: null,
    };
  } catch (e) {
    console.error(e);
    return {
      ordonnance: '',
      posologie: '',
      hint: 'Erreur lors du chargement. Réessayez.',
    };
  }
}
