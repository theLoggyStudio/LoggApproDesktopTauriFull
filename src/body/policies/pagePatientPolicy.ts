import { checkPrivilege } from "../helpers/helpers.js";

/**
 * Politique module Patients (liste + fiche sous `/patient-detail`).
 *
 * Règle d’entrée (OU) : **pat01 (voir) OU pat02 (gérer)** → accès au module
 * (liste + colonne gauche). Sinon : **aucun** accès (ni voir la liste, ni modifier).
 *
 * Sous-conditions (uniquement si accès module) :
 * - pat02 : gérer (formulaire, clic ligne, modal)
 * - pat01 + pat02 + act01 : clic → fiche détail complète
 * - pat01 + pat02 + act01 sans act02 : masquer formulaire d’ajout (message)
 */
export type PagePatientAccess = {
    /** pat01 OU pat02 : sinon tout le reste est faux et l’UI n’affiche pas le module patient */
    canAccessPatientModule: boolean;
    /** pat02 — créer / modifier / supprimer (formulaire actif, clic ligne, modal) */
    canManagePatients: boolean;
    /** Clic sur une ligne → fiche détail (actes, paiement, …) */
    rowClickOpensPatientDetail: boolean;
    /** Clic sur une ligne → modal édition sur la liste */
    rowClickOpensEditModal: boolean;
    /** Message à la place du formulaire d’ajout (profil voir actes sans gérer actes) */
    hideAddPatientForm: boolean;
};

const accesRefuse: PagePatientAccess = {
    canAccessPatientModule: false,
    canManagePatients: false,
    rowClickOpensPatientDetail: false,
    rowClickOpensEditModal: false,
    hideAddPatientForm: false,
};

export function getPagePatientAccess(privs: string[] | string): PagePatientAccess {
    const voirPatient = checkPrivilege("pat01", privs);
    const gererPatient = checkPrivilege("pat02", privs);

    // OU : au moins voir ou gérer → module patient. Sinon rien.
    if (!voirPatient && !gererPatient) {
        return accesRefuse;
    }

    const voirActes = checkPrivilege("act01", privs);
    const gererActes = checkPrivilege("act02", privs);

    const rowClickOpensPatientDetail = voirPatient && gererPatient && voirActes;
    const hideAddPatientForm = voirPatient && gererPatient && voirActes && !gererActes;

    return {
        canAccessPatientModule: true,
        canManagePatients: gererPatient,
        rowClickOpensPatientDetail,
        rowClickOpensEditModal: gererPatient && !rowClickOpensPatientDetail,
        hideAddPatientForm,
    };
}
