import { checkPrivilege } from "../helpers/helpers.js";
import {
    PAGE_PARAMETRE_NAV_CODES,
    PAGE_PARAMETRE_PAGE_ACCESS_CODES,
} from "../../constants/index.ts";

/**
 * Accès aux modules depuis la barre de navigation (même logique « voir OU gérer » que la page Patients).
 * Si aucune branche du OU n’est vraie → pas de lien menu (l’utilisateur ne peut ni consulter ni agir sur ce module via l’UI prévue).
 */

/**
 * Profil : prf01/prf02 (fiche perso), col01/col02 (collaborateurs), cab01 (paramètres cabinet).
 * Sans au moins une de ces bribes, pas d’entrée menu / page — même si l’utilisateur a d’autres modules.
 */
export function canAccessProfilModule(privs: string[] | string): boolean {
    return (
        checkPrivilege("prf01", privs) ||
        checkPrivilege("prf02", privs) ||
        checkPrivilege("col01", privs) ||
        checkPrivilege("col02", privs) ||
        checkPrivilege("cab01", privs)
    );
}

/** Statistiques : stt01 (seul code dédié dans l’app actuellement) */
export function canAccessStatistiqueModule(privs: string[] | string): boolean {
    return checkPrivilege("stt01", privs);
}

/** Page États / modèles (menu Autres pages) : voir ou gérer, ou droits historiques impression / ordonnance */
export function canAccessEtatsModule(privs: string[] | string): boolean {
    return (
        checkPrivilege("pet01", privs) ||
        checkPrivilege("pet02", privs) ||
        checkPrivilege("prt01", privs) ||
        checkPrivilege("oso01", privs)
    );
}

/** Édition complète (toolbar, enregistrement, impression) — pas le seul mode « voir » (pet01). */
export function canManageEtatsPage(privs: string[] | string): boolean {
    return checkPrivilege("pet02", privs) || checkPrivilege("prt01", privs);
}

/**
 * Lien « Gestion des éléments de base » dans NavTop : uniquement {@link PAGE_PARAMETRE_NAV_CODES} (edb01).
 */
export function canShowElementsBaseNav(privs: string[] | string): boolean {
    return PAGE_PARAMETRE_NAV_CODES.some((code) => checkPrivilege(code, privs));
}

/**
 * Accès à la route / page Paramètres (au moins une section ou edb01 / act02…).
 */
export function canAccessParametrePage(privs: string[] | string): boolean {
    return PAGE_PARAMETRE_PAGE_ACCESS_CODES.some((code) => checkPrivilege(code, privs));
}

/** @deprecated Préférer {@link canAccessParametrePage} */
export function canAccessParametreModule(privs: string[] | string): boolean {
    return canAccessParametrePage(privs);
}

/** Accordéon « Gestion des actes médicaux » (référentiel noms d’actes) — incl. act02 (accès page paramètres / gestion actes patient). */
export function canVoirAccordeonParametreActes(privs: string[] | string): boolean {
    return (
        checkPrivilege("gam01", privs) ||
        checkPrivilege("gam02", privs) ||
        checkPrivilege("act02", privs)
    );
}

/** Accordéon « Assurances » */
export function canVoirAccordeonParametreAssurances(privs: string[] | string): boolean {
    return checkPrivilege("gas01", privs) || checkPrivilege("gas02", privs);
}

/** Accordéon « Matériels » */
export function canVoirAccordeonParametreMateriels(privs: string[] | string): boolean {
    return checkPrivilege("gmt01", privs) || checkPrivilege("gmt02", privs);
}

/** Accordéon « Médicaments (catalogue posologie) » */
export function canVoirAccordeonParametreMedicaments(privs: string[] | string): boolean {
    return (
        checkPrivilege("gme01", privs) ||
        checkPrivilege("gme02", privs) ||
        checkPrivilege("pos01", privs)
    );
}

/** Accordéon « Types de collaborateurs » */
export function canVoirAccordeonParametreTypesCollaborateurs(privs: string[] | string): boolean {
    return checkPrivilege("gtc01", privs) || checkPrivilege("gtc02", privs);
}
