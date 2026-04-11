import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { TypeActe, TypeAssurance } from "../Entities/entities.js";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { PagePatientDetailController } from "../controllers/PagePatientDetailController.js";
import Alert from './Alert.js';
import { PageParametreController } from "../controllers/PageParametreController.js";
import { useAlert, useMode } from "../context/SearchContext.js";
import { useSession } from "../context/SessionContext.js";
import { checkPrivilege, checkPrivilegeExact } from "../helpers/helpers.js";
import BoutonFermer from "./BoutonFermer.js";
import { themes, ActualthemeNumber } from "../../constants/index.ts";
import { useTheme } from '../context/ThemeContext.js';
import { Modal as ModalGlobal } from '../../items/Modal.tsx';
import { ModalField, ModalSection, ModalGrid, ModalActions } from './ModalFormComponents.js';
import { creerTrace } from "../controllers/TraceController.js";
import { PageProfilController } from "../controllers/PageProfilController.js";
import { PosologieController } from "../controllers/PosologieController.js";
import {
  buildActesPreviewForEtat,
  dedupePosologieLinesLike,
  formatActePatientOptionLabel,
  formatOrdonnanceTextFromPosologieTable,
  formatPosologieText,
  normalizePosologieLineFromApi,
  parsePosologieTextBulletsToLines,
  type PosologieLineLike,
} from "../utils/posologieDisplayFormat.js";
import { DOCUMENT_TEMPLATES } from "../Pages/page_etat/templates/documentTemplates.js";
import type { DocumentTemplate } from "../Pages/page_etat/templates/documentTemplates.js";

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

export default function PayementDetail({
  theActeAssuranceFacture,
  setTheActeAssuranceFacture,
  allTypeActes,
  privs,
  pays,
  patientId,
  thePatient,
  actesPatientOptions,
}: {
  theActeAssuranceFacture: any;
  setTheActeAssuranceFacture: (v: any) => void;
  allTypeActes: any[];
  privs: any;
  pays: string;
  /** Patient du dossier (fiche acte) — pour le libellé dans le modal posologie */
  patientId?: string;
  thePatient?: any;
  /** Actes du patient (libellés pour l’affichage des lignes de posologie / ordonnance par acte). */
  actesPatientOptions?: Array<{ id: string; nom: string; date?: string; description?: string }>;
}) {
    const [acteAssuranceFacture, setActeAssuranceFacture] = useState<any>(null);
    const [show, setShow] = useState(false);
    const [typeAssurances, setTypeAssurances] = useState<TypeAssurance[]>([]);
    const [description, setDescription] = useState<string>("");
    const [prixDeLacte, setPrixDeLacte] = useState<any>("0");
    const [nomDeLacte, setNomDeLacte] = useState<any>("");
    const [lAssuranceDoitPayer, setLAssuranceDoitPayer] = useState<any>("0");
    const [selectAssurancePourcentage, setSelectAssurancePourcentage] = useState<any>("0");
    const [selectAssuranceNom, setSelectAssuranceNom] = useState<any>("non-assuré");
    const [montantDejaPayer, setMontantDejaPayer] = useState<any>("0");
    const [delaiModificationDepacer, setDelaiModificationDepacer] = useState<boolean>(true);
    const [nomUtilisateur, setNomUtilisateur] = useState<string>("");
    const [showModalMateriels, setShowModalMateriels] = useState<boolean>(false);
    /** Brouillon éditable dans le modal matériels (clé stable pour React) */
    const [materielsDraft, setMaterielsDraft] = useState<
        {
            key: string;
            materielId: string;
            nom: string;
            quantite: number;
            prixUnitaire: number;
            /** Qté déjà sur l'acte à l'ouverture du modal → max = stock catalogue + ceci */
            quantiteInitialeActe: number;
        }[]
    >([]);
    const [catalogMateriels, setCatalogMateriels] = useState<any[]>([]);
    const [selectMaterielId, setSelectMaterielId] = useState<string>("");
    const [savingMateriels, setSavingMateriels] = useState(false);
    const [showModalPosologieActe, setShowModalPosologieActe] = useState(false);
    const [posologieActeLoading, setPosologieActeLoading] = useState(false);
    const [posologieActePosText, setPosologieActePosText] = useState("");
    const [posologieActeOrdonnanceText, setPosologieActeOrdonnanceText] = useState("");
    const [posologieActeHint, setPosologieActeHint] = useState<string | null>(null);
    /** Lignes chargées (acte courant) pour variables `{{acte.*}}` sur la Page État */
    const [posologieActeLinesForEtat, setPosologieActeLinesForEtat] = useState<PosologieLineLike[]>([]);
    const [posologieEtatModeles, setPosologieEtatModeles] = useState<any[]>([]);
    /** Un seul modèle d’état pour l’aperçu / impression (radio). */
    const [posologieEtatSelectedId, setPosologieEtatSelectedId] = useState<string | null>(null);
    /** QR posologie (même format qu’après enregistrement dans ModalPosologie) */
    const [posologieQrImg, setPosologieQrImg] = useState<string>("");
    const [savingPosologieDetail, setSavingPosologieDetail] = useState(false);
    const posologieCtrl = useMemo(() => PosologieController(pays ?? ""), [pays]);

    /** Voir le paiement : act01/vac01 ; ouvrir le modal de correction (prix, assurance, etc.) : act02 uniquement. */
    const peutOuvrirModalCorrectionPaiement = checkPrivilege("act02", privs);

    /** Même règles que le bouton « Ordonnance / Posologie » sur FormGerrerActe (pas de dérogation act02). */
    const allowPosologieDepuisPaiement = useMemo(() => checkPrivilege("pos01", privs), [privs]);
    const allowOrdonnanceDepuisPaiement = useMemo(() => checkPrivilege("oso01", privs), [privs]);
    const afficherBoutonPosologieOrdonnanceActe =
        allowPosologieDepuisPaiement || allowOrdonnanceDepuisPaiement;

    /** mat01 / mat02 uniquement (checkPrivilege associe nma01→mat01 : incorrect pour ce bouton). */
    const allowMaterielsVoirDepuisPaiement = useMemo(() => checkPrivilegeExact("mat01", privs), [privs]);
    const allowMaterielsGererDepuisPaiement = useMemo(() => checkPrivilegeExact("mat02", privs), [privs]);
    const afficherBoutonMaterielsUtilises =
        allowMaterielsVoirDepuisPaiement || allowMaterielsGererDepuisPaiement;
    const peutModifierMateriels = allowMaterielsGererDepuisPaiement;

    const { mode, modeFileName } = useMode();
    const { setAlertObj } = useAlert();
    const navigate = useNavigate();
    const { session } = useSession();
    const { userId, tabId } = session;
    const { themeNumber } = useTheme();

    const builtinEtatModeles = useMemo(
        () =>
            DOCUMENT_TEMPLATES.filter(
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
            })),
        []
    );

    const allEtatModelesLotPatient = useMemo(
        () => [...builtinEtatModeles, ...posologieEtatModeles],
        [builtinEtatModeles, posologieEtatModeles]
    );

    const ouvrirApercuEtatDepuisModalLotPatient = useCallback(() => {
        const pick =
            posologieEtatSelectedId != null
                ? allEtatModelesLotPatient.find((m) => String(m.id) === posologieEtatSelectedId)
                : undefined;
        if (!allowOrdonnanceDepuisPaiement) {
            setAlertObj({
                type: "warning",
                show: true,
                text: "L'aperçu ordonnance sur la Page État nécessite le privilège ordonnance PDF (oso01).",
            });
            return;
        }
        const template = toDocumentTemplate(pick);
        if (!template?.elements?.length) {
            setAlertObj({
                type: "warning",
                show: true,
                text: "Sélectionnez un modèle d'état pour ouvrir l'aperçu sur la Page État.",
            });
            return;
        }
        const actesPreview = buildActesPreviewForEtat(posologieActeLinesForEtat, actesPatientOptions ?? []);
        const uid = userId ?? "";
        const tab = tabId ?? "";
        const py = pays ?? "sn";
        const path = uid && tab && py ? `/etats/${uid}/${tab}/${py}` : "/etats";
        navigate(path, {
            state: {
                posologieEtatPreview: {
                    template,
                    patient: (thePatient as Record<string, unknown> | null | undefined) ?? null,
                    posologieText: posologieActeOrdonnanceText || "",
                    ...(actesPreview.length > 0 ? { actesPreview } : {}),
                },
            },
        });
        setShowModalPosologieActe(false);
    }, [
        allEtatModelesLotPatient,
        posologieEtatSelectedId,
        posologieActeLinesForEtat,
        actesPatientOptions,
        userId,
        tabId,
        pays,
        navigate,
        thePatient,
        posologieActeOrdonnanceText,
        setAlertObj,
        allowOrdonnanceDepuisPaiement,
    ]);

    const reloadPage = () => {
        navigate(0);
    };

    const handleClose = () => {
        // reloadPage();
        setShow(false);
    };

    const handleOpen = (dateActePrevue) => {
        const maintenant = new Date();
        const moisDiff = (maintenant.getFullYear() - dateActePrevue.getFullYear()) * 12 + maintenant.getMonth() - dateActePrevue.getMonth();
        if (moisDiff <= 4) {
            setShow(true);
            setDelaiModificationDepacer(true);
        } else {
            setShow(false);
            setDelaiModificationDepacer(false);
            setTimeout(() => setDelaiModificationDepacer(true), 6 * 1000);
        }
    };

    useEffect(() => {
        setActeAssuranceFacture(theActeAssuranceFacture);
        setNomDeLacte(theActeAssuranceFacture?.acte?.nom ?? "");
        setSelectAssurancePourcentage(theActeAssuranceFacture?.assurance?.pourcentage ?? "0");
        setSelectAssuranceNom(theActeAssuranceFacture?.assurance?.nom ?? "non-assuré");
        setDescription(theActeAssuranceFacture?.acte?.description ?? "");
    }, [theActeAssuranceFacture]);

    useEffect(() => {
        const chargerTypeAssurance = async () => {
            if ((checkPrivilege("nma01", privs) || checkPrivilege("nma02", privs))) {
                const result = await PageParametreController(pays).listerUnTypeAssurance(tabId ?? "", 50);
                setTypeAssurances(Array.isArray(result) ? result : []);
            } else {
                setTypeAssurances([]);
            }
        };
        chargerTypeAssurance();
    }, [show, privs, tabId]);

    // Récupérer le nom du docteur
    useEffect(() => {
        if (!nomUtilisateur && tabId) {
            const fetchDocteurNom = async () => {
                try {
                    const r = await PageProfilController(pays ?? "").voirInfoDocteur(tabId ?? "", tabId ?? "");
                    if (r && r.docteur) {
                        setNomUtilisateur(`${r.docteur.nom} ${r.docteur.prenom}`);
                    }
                } catch (error) {
                    console.error("Erreur récupération nom docteur:", error);
                }
            };
            fetchDocteurNom();
        }
    }, [tabId, nomUtilisateur]);

    const handleModifie = async (e) => {
        e.preventDefault()
        if (!checkPrivilege("act02", privs)) {
            return setAlertObj({ type: "warning", show: true, text: "Vous n'avez pas les droits pour modifier cet acte, veuillez demander les autorisations à votre Docteur." });
        }

        const nouveauPrixActe = Number(prixDeLacte) || acteAssuranceFacture.facture.prixActe;
        const nouvelleAssuranceDoitPayer = Number(lAssuranceDoitPayer) || acteAssuranceFacture.facture.argentAssurance;
        const nouveauMontantDejaPayer = Number(montantDejaPayer) + Number(acteAssuranceFacture.facture.argentRecuActe);
        const nouveauPourcentage = Number(lAssuranceDoitPayer) !== 0 ? (nouvelleAssuranceDoitPayer / nouveauPrixActe) * 100 : selectAssurancePourcentage;
        const nouveauArgentRestantActe = Number(nouveauPrixActe) - Number(nouvelleAssuranceDoitPayer) - Number(nouveauMontantDejaPayer);

        if (acteAssuranceFacture && acteAssuranceFacture.facture && acteAssuranceFacture.acte && acteAssuranceFacture.assurance) {
            let aaf;
            try {
                await PagePatientDetailController(pays).modifierUnActe(mode, {
                    tabId: tabId,
                    facture: {
                        id: acteAssuranceFacture.acte.id,
                        prixActe: nouveauPrixActe,
                        argentRecuActe: nouveauMontantDejaPayer,
                        argentRestantActe: nouveauArgentRestantActe,
                        argentAssurance: nouvelleAssuranceDoitPayer,
                        loggId: acteAssuranceFacture.acte.loggId
                    },
                    assurance: {
                        id: acteAssuranceFacture.acte.id,
                        pourcentage: nouveauPourcentage,
                        nom: selectAssuranceNom,
                        loggId: acteAssuranceFacture.acte.loggId
                    },
                    acte: {
                        ...acteAssuranceFacture.acte,
                        prix: nouveauPrixActe,
                        nom: nomDeLacte,
                        description: description,
                        loggId: acteAssuranceFacture.acte.loggId
                    }
                }, modeFileName);
                aaf = {
                    tabId: tabId,
                    facture: {
                        id: acteAssuranceFacture.acte.id,
                        prixActe: nouveauPrixActe,
                        argentRecuActe: nouveauMontantDejaPayer,
                        argentRestantActe: nouveauArgentRestantActe,
                        argentAssurance: nouvelleAssuranceDoitPayer,
                        loggId: acteAssuranceFacture.acte.loggId
                    },
                    assurance: {
                        id: acteAssuranceFacture.acte.id,
                        pourcentage: nouveauPourcentage,
                        nom: selectAssuranceNom,
                        loggId: acteAssuranceFacture.acte.loggId
                    },
                    acte: {
                        ...acteAssuranceFacture.acte,
                        prix: nouveauPrixActe,
                        nom: nomDeLacte,
                        description: description,
                        loggId: acteAssuranceFacture.acte.loggId
                    }
                }
                setActeAssuranceFacture(aaf)

                // Ajouter la trace de modification de l'acte
                await creerTrace(
                    'update',
                    'acte',
                    nomDeLacte || acteAssuranceFacture.acte.nom,
                    acteAssuranceFacture.acte.id,
                    userId ?? "",
                    nomUtilisateur || "Utilisateur",
                    "docteur",
                    tabId ?? "",
                    tabId ?? "",
                    pays,
                    `Prix: ${nouveauPrixActe} FCFA - Assurance: ${selectAssuranceNom} (${nouveauPourcentage}%) - Montant payé: ${nouveauMontantDejaPayer} FCFA`
                );

                setAlertObj({ type: "success", show: true, text: `L'acte ${acteAssuranceFacture.acte.nom} de date ${format(acteAssuranceFacture.acte.date, "dd MMMM yyyy")} a été modifié` });
                setTheActeAssuranceFacture(aaf);
                setActeAssuranceFacture(aaf)
                handleClose()
                // reloadPage();
            } catch (error) {
                console.error("Erreur lors de la modification de l'acte:", error);
                setAlertObj({ type: "error", show: true, text: "Erreur lors de la modification de l'acte. Veuillez réessayer." });
            }
        }
    };

    const handleDelete = async (e) => {
        e.preventDefault()
        if (!checkPrivilege("act02", privs)) {
            return setAlertObj({ type: "warning", show: true, text: "Vous n'avez pas les droits pour supprimer cet acte, veuillez demander les autorisations à votre Docteur." });
        }

        if (acteAssuranceFacture && acteAssuranceFacture.acte && acteAssuranceFacture.facture && acteAssuranceFacture.assurance) {
            try {
                await PagePatientDetailController(pays).supprimerActe(
                    mode,
                    acteAssuranceFacture.acte.loggId,
                    acteAssuranceFacture.acte.id,
                    acteAssuranceFacture.acte.loggId,
                    tabId ?? "0",
                    modeFileName
                );

                // Ajouter la trace de suppression de l'acte
                await creerTrace(
                    'delete',
                    'acte',
                    acteAssuranceFacture.acte.nom,
                    acteAssuranceFacture.acte.id,
                    userId ?? "",
                    nomUtilisateur || "Utilisateur",
                    "docteur",
                    tabId ?? "",
                    tabId ?? "",
                    pays,
                    `Prix: ${acteAssuranceFacture.facture.prixActe} FCFA - Date: ${format(acteAssuranceFacture.acte.date, "dd/MM/yyyy")}`
                );

                setAlertObj({ type: "success", show: true, text: `L'acte ${acteAssuranceFacture.acte.nom} de date ${format(acteAssuranceFacture.acte.date, "dd MMMM yyyy")} a été supprimé.` });

                // Mise à jour des états
                setActeAssuranceFacture(null);
                setTheActeAssuranceFacture(null);

                handleClose();
            } catch (error) {
                console.error("Erreur lors de la suppression de l'acte:", error);
                setAlertObj({ type: "error", show: true, text: "Erreur lors de la suppression de l'acte. Veuillez réessayer." });
            }
        }
    };

    const stockCataloguePour = (materielId: string) => {
        const c = catalogMateriels.find((x: any) => String(x.id) === String(materielId));
        const n = Number(c?.quantite_defaut ?? c?.quantiteDefaut ?? 0);
        return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    };

    const maxQuantiteAutorisee = (row: { materielId: string; quantiteInitialeActe: number }) =>
        stockCataloguePour(row.materielId) + Math.max(0, Math.floor(row.quantiteInitialeActe || 0));

    const majQuantiteDraft = (key: string, valeur: string) => {
        const n = Math.max(0, Math.floor(Number(valeur) || 0));
        setMaterielsDraft((rows) =>
            rows.map((r) => {
                if (r.key !== key) return r;
                const maxQ = maxQuantiteAutorisee(r);
                return { ...r, quantite: Math.min(n, maxQ) };
            })
        );
    };

    const incrementerQuantite = (key: string) => {
        setMaterielsDraft((rows) =>
            rows.map((r) => {
                if (r.key !== key) return r;
                const maxQ = maxQuantiteAutorisee(r);
                if (r.quantite >= maxQ) {
                    setAlertObj({
                        type: "warning",
                        show: true,
                        text: `Stock insuffisant : maximum ${maxQ} pour « ${r.nom} » (stock + déjà réservé sur cet acte).`,
                    });
                    return r;
                }
                return { ...r, quantite: r.quantite + 1 };
            })
        );
    };

    const decrementerQuantite = (key: string) => {
        setMaterielsDraft((rows) =>
            rows.map((r) => (r.key === key ? { ...r, quantite: Math.max(0, r.quantite - 1) } : r))
        );
    };

    const supprimerLigneDraft = (key: string) => {
        setMaterielsDraft((rows) => rows.filter((r) => r.key !== key));
    };

    const ajouterMaterielAuDraft = () => {
        if (!selectMaterielId) {
            setAlertObj({ type: "warning", show: true, text: "Sélectionnez un matériel dans la liste." });
            return;
        }
        const item = catalogMateriels.find((c: any) => String(c.id) === selectMaterielId);
        if (!item) return;
        const mid = String(item.id);
        const pu = Number(item.prix_defaut ?? item.prixDefaut) || 0;
        const stock = stockCataloguePour(mid);
        setMaterielsDraft((rows) => {
            const exist = rows.find((r) => r.materielId === mid);
            if (exist) {
                const maxQ = maxQuantiteAutorisee(exist);
                if (exist.quantite >= maxQ) {
                    setAlertObj({
                        type: "warning",
                        show: true,
                        text:
                            stock <= 0 && exist.quantiteInitialeActe <= 0
                                ? "Stock à 0 : impossible d'ajouter ce matériel."
                                : `Quantité max atteinte (${maxQ}) pour « ${exist.nom} ».`,
                    });
                    return rows;
                }
                return rows.map((r) =>
                    r.materielId === mid ? { ...r, quantite: Math.min(maxQ, r.quantite + 1) } : r
                );
            }
            if (stock < 1) {
                setAlertObj({
                    type: "warning",
                    show: true,
                    text: "Stock à 0 dans le catalogue : impossible d'ajouter ce matériel à l'acte.",
                });
                return rows;
            }
            return [
                ...rows,
                {
                    key: `new-${Date.now()}-${mid}`,
                    materielId: mid,
                    nom: String(item.nom || "Matériel"),
                    quantite: 1,
                    prixUnitaire: pu,
                    quantiteInitialeActe: 0,
                },
            ];
        });
    };

    const enregistrerMaterielsActe = async () => {
        if (!acteAssuranceFacture?.acte?.id || !peutModifierMateriels) {
            if (!peutModifierMateriels) {
                setAlertObj({
                    type: "warning",
                    show: true,
                    text: "Vous n'avez pas les droits pour modifier les matériels (mat02).",
                });
            }
            return;
        }
        setSavingMateriels(true);
        try {
            const payload = materielsDraft
                .filter((r) => r.materielId && r.quantite > 0)
                .map((r) => ({ id: r.materielId, quantite: r.quantite }));
            const res = await PagePatientDetailController(pays).mettreAJourMaterielsActe(
                mode,
                acteAssuranceFacture.acte.id.toString(),
                tabId ?? "",
                payload
            );
            if (res && (res as any).success !== false) {
                const refreshed = await PagePatientDetailController(pays).trouverLesMaterielsParActeId(
                    mode,
                    acteAssuranceFacture.acte.id.toString(),
                    tabId ?? ""
                );
                const list = Array.isArray(refreshed) ? refreshed : [];
                setMaterielsDraft(
                    list.map((am: any, i: number) => {
                        const m = am.materiel || {};
                        const q = Number(am.quantite_utilisee) || 0;
                        return {
                            key: String(am.id || `row-${am.materiel_id}-${i}`),
                            materielId: String(am.materiel_id || m.id || ""),
                            nom: String(m.nom || "Matériel inconnu"),
                            quantite: q,
                            prixUnitaire: Number(m.prix_defaut) || 0,
                            quantiteInitialeActe: q,
                        };
                    })
                );
                const cat = await PagePatientDetailController(pays).listerLesNomMateriels(mode, tabId ?? "", 500);
                setCatalogMateriels(Array.isArray(cat) ? cat : []);
                setAlertObj({ type: "success", show: true, text: "Matériels et stock mis à jour." });
            } else {
                setAlertObj({
                    type: "error",
                    show: true,
                    text: "Impossible d'enregistrer les matériels. Réessayez.",
                });
            }
        } catch (err: any) {
            console.error(err);
            const msg =
                typeof err === "string"
                    ? err
                    : String(err?.message ?? err ?? "").replace(/^[^:]*:\s*/, "") || "Erreur lors de l'enregistrement des matériels.";
            setAlertObj({ type: "error", show: true, text: msg });
        } finally {
            setSavingMateriels(false);
        }
    };

    const ouvrirModalPosologiePourActe = async () => {
        if (!acteAssuranceFacture?.acte?.id) return;
        if (!allowPosologieDepuisPaiement && !allowOrdonnanceDepuisPaiement) {
            setAlertObj({
                type: "warning",
                show: true,
                text: "Posologie (pos01) ou ordonnance PDF (oso01) requis pour ouvrir ce panneau.",
            });
            return;
        }
        const pid = (patientId ?? "").trim();
        if (!pid || !tabId) {
            setAlertObj({
                type: "warning",
                show: true,
                text: "Patient ou cabinet non identifié : impossible de charger la posologie.",
            });
            return;
        }
        setPosologieActeLoading(true);
        setPosologieActeHint(null);
        setPosologieActePosText("");
        setPosologieActeOrdonnanceText("");
        setPosologieActeLinesForEtat([]);
        setPosologieEtatSelectedId(null);
        setPosologieEtatModeles([]);
        setPosologieQrImg("");
        setShowModalPosologieActe(true);
        try {
            const currentActeId = String(acteAssuranceFacture.acte.id ?? "").trim();
            const lineBelongsToCurrentActe = (raw: unknown): boolean => {
                if (!raw || typeof raw !== "object") return false;
                const r = raw as Record<string, unknown>;
                const aid = String(r.acteId ?? r.acte_id ?? "").trim();
                return aid === currentActeId;
            };

            const [medicaments, acteIdsPos, fromPatient, modelesOrdonnance, linesForCurrentActe] = await Promise.all([
                posologieCtrl.listMedicaments(tabId ?? ""),
                posologieCtrl.listActesIdsInPosologie(pid).catch(() => [] as string[]),
                posologieCtrl.getPosologieLinesForPatient({ patientId: pid, tabId: tabId ?? "" }).catch(() => null),
                allowOrdonnanceDepuisPaiement
                    ? posologieCtrl.listModelesEtatOrdonnance(tabId ?? "").catch(() => [] as any[])
                    : Promise.resolve([] as any[]),
                posologieCtrl
                    .getPosologieLinesForActe({
                        patientId: pid,
                        acteId: currentActeId,
                        tabId: tabId ?? "",
                    })
                    .then((rows) => (Array.isArray(rows) ? rows : []))
                    .catch(() => [] as unknown[]),
            ]);
            setPosologieEtatModeles(Array.isArray(modelesOrdonnance) ? modelesOrdonnance : []);

            /** Afficher uniquement la posologie de l’acte du panneau paiement (pas le lot complet du patient). */
            let rawLines: unknown[] = [];
            if (linesForCurrentActe.length > 0) {
                rawLines = linesForCurrentActe;
            } else if (fromPatient !== null && fromPatient.length > 0) {
                const filtered = fromPatient.filter(lineBelongsToCurrentActe);
                if (filtered.length > 0) {
                    rawLines = filtered;
                }
            }
            /* Plus d’agrégation « tous les actes » : évite d’afficher la posologie d’autres actes. */
            const medLbl = medicaments.map((m: any) => ({
                id: String(m.id ?? ""),
                nom: String(m.nom ?? ""),
                forme: m.forme != null ? String(m.forme) : undefined,
            }));
            const opts = actesPatientOptions ?? [];
            const acteLbl = opts.map((a) => ({
                id: String(a.id),
                label: formatActePatientOptionLabel({ nom: a.nom, date: a.date }),
            }));
            let lines: PosologieLineLike[] = dedupePosologieLinesLike(
                rawLines
                    .map((r) => normalizePosologieLineFromApi(r))
                    .filter((x): x is PosologieLineLike => x != null)
            );
            setPosologieActeLinesForEtat(lines);
            if (lines.length === 0) {
                const idsNorm = acteIdsPos.map((id) => String(id).trim());
                const acteDansListePoso = idsNorm.includes(currentActeId);
                if (!acteDansListePoso) {
                    setPosologieActeHint(
                        "Aucune posologie enregistrée pour cet acte. Utilisez « Ordonnance / Posologie » sur la fiche patient pour lier des médicaments à cet acte."
                    );
                } else {
                    setPosologieActeHint(
                        "Une posologie est liée à cet acte, mais les lignes n’ont pas pu être chargées. Réessayez ou ouvrez « Ordonnance / Posologie » depuis la fiche patient."
                    );
                }
            } else {
                if (allowPosologieDepuisPaiement) {
                    setPosologieActePosText(formatPosologieText(lines, acteLbl, medLbl));
                } else {
                    setPosologieActePosText("");
                }
                if (allowOrdonnanceDepuisPaiement) {
                    setPosologieActeOrdonnanceText(formatOrdonnanceTextFromPosologieTable(lines, acteLbl, medLbl));
                } else {
                    setPosologieActeOrdonnanceText("");
                }
                if (allowPosologieDepuisPaiement) {
                    try {
                        const actePosoId =
                            acteAssuranceFacture?.acte?.posologieId ??
                            acteAssuranceFacture?.acte?.posologie_id ??
                            null;
                        const qrRes = await posologieCtrl.getPosologieQrcode({
                            patientId: pid,
                            tabId: tabId ?? "",
                            posologieId: actePosoId != null && String(actePosoId).trim() !== "" ? String(actePosoId) : null,
                        });
                        if (qrRes?.qrBase64 && typeof qrRes.qrBase64 === "string") {
                            setPosologieQrImg(qrRes.qrBase64);
                        } else {
                            setPosologieQrImg("");
                        }
                    } catch (qrErr) {
                        console.warn("QR posologie (paiement détail):", qrErr);
                        setPosologieQrImg("");
                    }
                } else {
                    setPosologieQrImg("");
                }
            }
        } catch (e) {
            console.error(e);
            setPosologieActeHint("Erreur lors du chargement de la posologie. Réessayez plus tard.");
            setPosologieActeLinesForEtat([]);
            setPosologieEtatModeles([]);
            setPosologieQrImg("");
        } finally {
            setPosologieActeLoading(false);
        }
    };

    const enregistrerDetailPosologieActe = async () => {
        if (!allowPosologieDepuisPaiement) {
            setAlertObj({
                type: "warning",
                show: true,
                text: "La modification du détail posologie nécessite le privilège posologie (pos01).",
            });
            return;
        }
        const pid = (patientId ?? "").trim();
        const tab = tabId ?? "";
        const currentActeId = String(acteAssuranceFacture?.acte?.id ?? "").trim();
        if (!pid || !tab || !currentActeId) {
            setAlertObj({
                type: "warning",
                show: true,
                text: "Patient ou acte non identifié : impossible d'enregistrer la posologie.",
            });
            return;
        }
        setSavingPosologieDetail(true);
        try {
            const medicaments = await posologieCtrl.listMedicaments(tab);
            const medLbl = medicaments.map((m: { id?: string; nom?: string; forme?: string }) => ({
                id: String(m.id ?? ""),
                nom: String(m.nom ?? ""),
                forme: m.forme != null ? String(m.forme) : undefined,
            }));
            const opts = actesPatientOptions ?? [];
            const acteLbl = opts.map((a) => ({
                id: String(a.id),
                label: formatActePatientOptionLabel({ nom: a.nom, date: a.date }),
            }));

            const parsed = parsePosologieTextBulletsToLines(posologieActePosText, {
                defaultActeId: currentActeId,
                meds: medLbl.map((m) => ({ id: m.id, nom: m.nom })),
            });

            if (!posologieActePosText.trim()) {
                setAlertObj({
                    type: "warning",
                    show: true,
                    text: "Le détail posologie est vide.",
                });
                return;
            }
            if (parsed.length === 0) {
                setAlertObj({
                    type: "error",
                    show: true,
                    text:
                        "Impossible d'interpréter le texte. Conservez le format des lignes : « • … — nom du médicament · N boîte(s) · × quantité (heures) » (noms alignés sur le catalogue).",
                });
                return;
            }

            const fromPatient = await posologieCtrl
                .getPosologieLinesForPatient({ patientId: pid, tabId: tab })
                .catch(() => null);
            if (fromPatient == null) {
                setAlertObj({
                    type: "error",
                    show: true,
                    text: "Impossible de charger la posologie du patient pour fusionner les actes. Réessayez.",
                });
                return;
            }

            const others = fromPatient
                .map((r: unknown) => normalizePosologieLineFromApi(r))
                .filter((x): x is PosologieLineLike => x != null)
                .filter((l) => String(l.acteId) !== currentActeId);

            const merged = dedupePosologieLinesLike([...others, ...parsed]);
            const res = await posologieCtrl.savePosologie({
                patientId: pid,
                cabinetTabId: tab,
                lines: merged.map((l) => ({
                    acteId: l.acteId,
                    medicamentId: l.medicamentId,
                    nombreBoites: l.nombreBoites ?? 1,
                    quantite: l.quantite ?? 1,
                    heures: l.heures?.length ? l.heures : undefined,
                })),
            });

            if (res != null && typeof res === "object" && (res as { success?: boolean }).success === false) {
                setAlertObj({
                    type: "error",
                    show: true,
                    text: "Enregistrement de la posologie refusé. Vérifiez les droits ou réessayez.",
                });
                return;
            }

            const linesAfter = await posologieCtrl.getPosologieLinesForActe({
                patientId: pid,
                acteId: currentActeId,
                tabId: tab,
            });
            const rawLines = Array.isArray(linesAfter) ? linesAfter : [];
            const lines: PosologieLineLike[] = dedupePosologieLinesLike(
                rawLines
                    .map((r: unknown) => normalizePosologieLineFromApi(r))
                    .filter((x): x is PosologieLineLike => x != null)
            );
            setPosologieActeLinesForEtat(lines);
            setPosologieActePosText(formatPosologieText(lines, acteLbl, medLbl));
            if (allowOrdonnanceDepuisPaiement) {
                setPosologieActeOrdonnanceText(
                    formatOrdonnanceTextFromPosologieTable(lines, acteLbl, medLbl)
                );
            }

            const resPosId =
                res != null && typeof res === "object"
                    ? String((res as { posologieId?: string }).posologieId ?? "").trim()
                    : "";
            const acteFallback = String(
                acteAssuranceFacture?.acte?.posologieId ??
                    acteAssuranceFacture?.acte?.posologie_id ??
                    ""
            ).trim();
            const actePosoId = resPosId || acteFallback || null;

            try {
                const qrRes = await posologieCtrl.getPosologieQrcode({
                    patientId: pid,
                    tabId: tab,
                    posologieId: actePosoId,
                });
                if (qrRes?.qrBase64 && typeof qrRes.qrBase64 === "string") {
                    setPosologieQrImg(qrRes.qrBase64);
                } else {
                    setPosologieQrImg("");
                }
            } catch (qrErr) {
                console.warn("QR posologie après enregistrement (paiement):", qrErr);
                setPosologieQrImg("");
            }

            setAlertObj({
                type: "success",
                show: true,
                text: "Détail posologie enregistré.",
            });
        } catch (e) {
            console.error(e);
            setAlertObj({
                type: "error",
                show: true,
                text: "Erreur lors de l'enregistrement du détail posologie.",
            });
        } finally {
            setSavingPosologieDetail(false);
        }
    };

    const libellePatientHeader = `${thePatient?.nom ?? ""} ${thePatient?.prenom ?? ""}`.trim() || "Patient";

    return (
        <>
            <Alert />
            {(checkPrivilege("vac01", privs) || checkPrivilege("act02", privs)) ? (
                <>
                    {acteAssuranceFacture && acteAssuranceFacture.facture && acteAssuranceFacture.assurance && (
                        <div
                            onClick={
                                peutOuvrirModalCorrectionPaiement
                                    ? () => handleOpen(new Date(acteAssuranceFacture.acte.date))
                                    : undefined
                            }
                            style={{ cursor: peutOuvrirModalCorrectionPaiement ? "pointer" : "default" }}
                        >
                            <div className="row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <h1 className="mb-5 mt-2 mx-3 text-break modal-big" style={{ color:themes[themeNumber].primary, flex: 1 }}>
                                    Payement:
                                    <input className="form-check-input mx-5" style={{ opacity: 100 }} type="checkbox" checked={(acteAssuranceFacture.facture.prixActe - (Number(acteAssuranceFacture.facture.argentAssurance) + Number(acteAssuranceFacture.facture.argentRecuActe))) <= 0} disabled />
                                </h1>
                                
                            </div>
                            <div className={"m-3" + (delaiModificationDepacer ? "" : " luminaissance")} style={{ borderWidth: "5px", borderColor: themes[themeNumber].danger, borderStyle: "double", padding: "10px", borderRadius: "2px", color: themes[themeNumber].danger, margin: "10px 0", display: delaiModificationDepacer ? "none" : "block" }}>
                                <center>
                                    <p>Vous ne pouvez plus modifier ces informations parce qu'elles datent de plus de 3 mois.</p>
                                </center>
                            </div>
                            <div className="row">
                                <div className="my-2 mx-3 modal-medium-text">
                                    Prix de l'acte: <br />
                                    <div className="mx-5 all-left-txt ">
                                        {acteAssuranceFacture.acte.prix !== "" ? acteAssuranceFacture.facture.prixActe : "0"}
                                    </div>
                                </div>
                            </div>
                            <div className="row mx-3">
                                <div className="input-group mb-3">
                                    <select className="form-select color-jaune" id="mySelect" disabled>
                                        <option value={acteAssuranceFacture.assurance.nom}>
                                            {acteAssuranceFacture.assurance.nom !== "" || acteAssuranceFacture.assurance.nom !== "0" ? acteAssuranceFacture.assurance.nom : "non-assuré"}
                                        </option>
                                    </select>
                                    <input type="number" className="form-control" id="myInput" disabled value={acteAssuranceFacture.assurance.pourcentage !== "" ? acteAssuranceFacture.assurance.pourcentage : "0"} />
                                </div>
                            </div>
                            <div className="row">
                                <div className="my-2 mx-3 modal-medium-text">
                                    L'assurance doit payer:<br />
                                    <div className="mx-5 all-left-txt ">
                                        {"" + acteAssuranceFacture.facture.argentAssurance !== "" ? "" + acteAssuranceFacture.facture.argentAssurance : "0"}
                                    </div>
                                </div>
                            </div>
                            <div className="row">
                                <div className="my-2 mx-3 modal-medium-text">
                                    Le patient doit payer au total: <br />
                                    <div className="mx-5 all-left-txt ">{"" + (Number(acteAssuranceFacture.facture.prixActe) - Number(acteAssuranceFacture.facture.argentAssurance)) !== "" ? "" + (Number(acteAssuranceFacture.facture.prixActe) - Number(acteAssuranceFacture.facture.argentAssurance)) : "0"}</div>
                                </div>
                            </div>
                            <div className="row">
                                <div className="my-2 mx-3 modal-medium-text">
                                    Montant déjà payé:<br />
                                    <div className="mx-5 all-left-txt ">
                                        {"" + acteAssuranceFacture.facture.argentRecuActe !== "" ? "" + acteAssuranceFacture.facture.argentRecuActe : "0"}
                                    </div>
                                </div>
                            </div>
                            <div className="row">
                                <div className="my-2 mx-3 modal-medium-text" style={{fontWeight:"bold", color: (acteAssuranceFacture.facture.prixActe - (Number(acteAssuranceFacture.facture.argentAssurance) + Number(acteAssuranceFacture.facture.argentRecuActe))) <= 0 ? themes[themeNumber].success:themes[themeNumber].danger}}>
                                    {(acteAssuranceFacture.facture.prixActe - (Number(acteAssuranceFacture.facture.argentAssurance) + Number(acteAssuranceFacture.facture.argentRecuActe))) <= 0 ? "Avoir" : "Dû"}:<br />
                                    <div className="mx-5 all-left-txt ">
                                        {valeurNonNegative(acteAssuranceFacture.facture.prixActe - (Number(acteAssuranceFacture.facture.argentAssurance) + Number(acteAssuranceFacture.facture.argentRecuActe))) !== 0 ?
                                            "" + valeurNonNegative(acteAssuranceFacture.facture.prixActe - (Number(acteAssuranceFacture.facture.argentAssurance) + Number(acteAssuranceFacture.facture.argentRecuActe))) :
                                            "0"}
                                    </div>
                                </div>
                            </div>
                            <center style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
                                {afficherBoutonMaterielsUtilises && (
                                <span
                                    onClick={async (e) => {
                                        e.stopPropagation();
                                        try {
                                            const materiels = await PagePatientDetailController(pays).trouverLesMaterielsParActeId(
                                                mode,
                                                acteAssuranceFacture.acte.id.toString(),
                                                tabId ?? ""
                                            );
                                            const list = Array.isArray(materiels) ? materiels : [];
                                            setMaterielsDraft(
                                                list.map((am: any, i: number) => {
                                                    const m = am.materiel || {};
                                                    const q0 = Number(am.quantite_utilisee) || 0;
                                                    return {
                                                        key: String(am.id || `row-${am.materiel_id}-${i}`),
                                                        materielId: String(am.materiel_id || m.id || ""),
                                                        nom: String(m.nom || "Matériel inconnu"),
                                                        quantite: q0,
                                                        prixUnitaire: Number(m.prix_defaut) || 0,
                                                        quantiteInitialeActe: q0,
                                                    };
                                                })
                                            );
                                            if (allowMaterielsGererDepuisPaiement) {
                                                const cat = await PagePatientDetailController(pays).listerLesNomMateriels(
                                                    mode,
                                                    tabId ?? "",
                                                    500
                                                );
                                                setCatalogMateriels(Array.isArray(cat) ? cat : []);
                                            } else {
                                                setCatalogMateriels([]);
                                            }
                                            setSelectMaterielId("");
                                            setShowModalMateriels(true);
                                        } catch (error) {
                                            console.error("Erreur lors du chargement des matériels:", error);
                                            setAlertObj({ type: "error", show: true, text: "Erreur lors du chargement des matériels utilisés." });
                                        }
                                    }}
                                    style={{
                                        color: themes[themeNumber].primary,
                                        textDecoration: 'none',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        fontWeight: 'normal',
                                        backgroundColor: themes[themeNumber].secondary,
                                        width:'15vw',
                                        minWidth: '180px',
                                        margin:'12px 0 0 0',
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        display: 'inline-block',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.color = themes[themeNumber].secondary;
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.color = themes[themeNumber].primary;
                                    }}
                                    className="btn"
                                >
                                    Matériels utilisés
                                </span>
                                )}
                                {afficherBoutonPosologieOrdonnanceActe && (
                                <button
                                    type="button"
                                    className="btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        void ouvrirModalPosologiePourActe();
                                    }}
                                    style={{
                                        color: themes[themeNumber].primary,
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        fontWeight: 'normal',
                                        backgroundColor: themes[themeNumber].secondary,
                                        width:'15vw',
                                        minWidth: '180px',
                                        margin: '0 0 8px 0',
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        border: `1px solid ${themes[themeNumber].primary}40`,
                                    }}
                                >
                                    Posologie & ordonnance (cet acte)
                                </button>
                                )}
                            </center>
                            
                        </div>
                    )}

                    <ModalGlobal
                        show={show}
                        onClose={handleClose}
                        title="Modifier les informations sur le paiement"
                        maxWidth="800px"
                    >
                        {acteAssuranceFacture && acteAssuranceFacture.facture && acteAssuranceFacture.assurance && (
                            <>
                                <ModalSection title="Informations de l'acte">
                                    <ModalField
                                        id="typeActeSelect"
                                        label="Type d'acte"
                                        value={nomDeLacte}
                                        onChange={(e) => setNomDeLacte(e.target.value)}
                                        fullWidth
                                        options={[
                                            { value: "non-definie", label: "Sélectionnez un acte" },
                                            ...allTypeActes.map((typeActe: any) => ({ 
                                                value: typeActe.nom, 
                                                label: typeActe.nom 
                                            }))
                                        ]}
                                    />
                                    
                                    <div style={{ 
                                        fontSize: '13px', 
                                        color: themes[themeNumber].primary, 
                                        marginTop: '8px',
                                        fontStyle: 'italic'
                                    }}>
                                        Actuel : {acteAssuranceFacture.acte.nom || "non-mentionné"}
                                    </div>

                                    <ModalField
                                        id="descriptionActe"
                                        label="Description"
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        placeholder="Description de l'acte"
                                        rows={3}
                                        fullWidth
                                    />

                                    <ModalGrid columns={2}>
                                        <ModalField
                                            id="prixActe"
                                            label="Prix de l'acte (FCFA)"
                                            type="number"
                                            value={prixDeLacte}
                                            onChange={(e) => setPrixDeLacte(e.target.value)}
                                            placeholder="montant en FCFA"
                                            step="1000"
                                            min="0"
                                        />
                                        <div style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center',
                                            fontSize: '14px',
                                            color: themes[themeNumber].primary
                                        }}>
                                            Actuel : {acteAssuranceFacture.facture.prixActe} FCFA
                                        </div>
                                    </ModalGrid>
                                </ModalSection>

                                <ModalSection title="Gestion de l'Assurance">
                                    <ModalGrid columns={2}>
                                        <ModalField
                                            id="selectAssurance"
                                            label="Assurance"
                                            value={selectAssuranceNom}
                                            onChange={(e) => setSelectAssuranceNom(e.target.value)}
                                            options={[
                                                { value: "Nouveau", label: "+ Créer Nouveau" },
                                                ...typeAssurances.map((na: any) => ({
                                                    value: na.nom,
                                                    label: na.nom
                                                }))
                                            ]}
                                        />
                                        <ModalField
                                            id="pourcentageAssurance"
                                            label="Pourcentage (%)"
                                            type="number"
                                            value={selectAssurancePourcentage}
                                            onChange={(e) => setSelectAssurancePourcentage(e.target.value)}
                                            placeholder="0-100"
                                            min="0"
                                            max="100"
                                        />
                                    </ModalGrid>

                                    <ModalGrid columns={2}>
                                        <ModalField
                                            id="assuranceDoitPayer"
                                            label="L'Assurance doit payer (FCFA)"
                                            type="number"
                                            value={lAssuranceDoitPayer}
                                            onChange={(e) => setLAssuranceDoitPayer(e.target.value)}
                                            placeholder="montant en FCFA"
                                            step="1000"
                                            min="0"
                                        />
                                        <div style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center',
                                            fontSize: '14px',
                                            color: themes[themeNumber].primary
                                        }}>
                                            Actuel : {acteAssuranceFacture.facture.argentAssurance} FCFA
                                        </div>
                                    </ModalGrid>

                                    <div style={{ 
                                        padding: '12px', 
                                        backgroundColor: themes[themeNumber].secondary + '15',
                                        borderRadius: '8px',
                                        marginTop: '10px'
                                    }}>
                                        <strong>Le patient doit payer au total :</strong>{' '}
                                        {(Number(acteAssuranceFacture.facture.prixActe) - Number(acteAssuranceFacture.facture.argentAssurance))} FCFA
                                    </div>
                                </ModalSection>

                                <ModalSection title="Paiement du patient">
                                    <ModalGrid columns={2}>
                                        <ModalField
                                            id="montantDejaPaye"
                                            label="Montant déjà payé (FCFA)"
                                            type="number"
                                            value={montantDejaPayer}
                                            onChange={(e) => setMontantDejaPayer(e.target.value)}
                                            placeholder="montant en FCFA"
                                            step="1000"
                                            min="0"
                                        />
                                        <div style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center',
                                            fontSize: '14px',
                                            color: themes[themeNumber].primary
                                        }}>
                                            Actuel : {acteAssuranceFacture.facture.argentRecuActe} FCFA
                                        </div>
                                    </ModalGrid>

                                    <div style={{ 
                                        padding: '12px', 
                                        backgroundColor: (acteAssuranceFacture.facture.prixActe - (Number(acteAssuranceFacture.facture.argentAssurance) + Number(acteAssuranceFacture.facture.argentRecuActe))) <= 0 ? '#8EFF3020' : '#ef444420',
                                        borderRadius: '8px',
                                        marginTop: '10px',
                                        border: `2px solid ${(acteAssuranceFacture.facture.prixActe - (Number(acteAssuranceFacture.facture.argentAssurance) + Number(acteAssuranceFacture.facture.argentRecuActe))) <= 0 ? '#8EFF30' : '#ef4444'}`
                                    }}>
                                        <strong style={{ 
                                            color: (acteAssuranceFacture.facture.prixActe - (Number(acteAssuranceFacture.facture.argentAssurance) + Number(acteAssuranceFacture.facture.argentRecuActe))) <= 0 ? '#8EFF30' : '#ef4444'
                                        }}>
                                            {(acteAssuranceFacture.facture.prixActe - (Number(acteAssuranceFacture.facture.argentAssurance) + Number(acteAssuranceFacture.facture.argentRecuActe))) <= 0 ? 'Avoir' : 'Dû'} :
                                        </strong>{' '}
                                        {valeurNonNegative((acteAssuranceFacture.facture.prixActe - (Number(acteAssuranceFacture.facture.argentAssurance) + Number(acteAssuranceFacture.facture.argentRecuActe))))} FCFA
                                    </div>
                                </ModalSection>

                                <ModalActions>
                                    <button
                                        type="button"
                                        className="btn btn-outline-danger"
                                        onClick={handleDelete}
                                    >
                                        Supprimer l&apos;acte
                                    </button>
                                    <button type="button" className="btn btn-primary" onClick={handleModifie}>
                                        Modifier l&apos;acte et fermer
                                    </button>
                                </ModalActions>
                            </>
                        )}
                    </ModalGlobal>

                    {/* Modal pour afficher les matériels utilisés */}
                    <ModalGlobal
                        show={showModalMateriels}
                        onClose={() => setShowModalMateriels(false)}
                        title="Matériels médicaux utilisés pour cet acte"
                        maxWidth="700px"
                    >
                        <ModalSection>
                            <p style={{ fontSize: "13px", color: themes[themeNumber].primary, marginBottom: "12px", lineHeight: 1.45 }}>
                                <strong>Stock :</strong> l&apos;enregistrement met à jour les quantités du catalogue. Vous pouvez{" "}
                                <strong>ajouter</strong> un matériel, <strong>retirer</strong> une ligne ou <strong>modifier les quantités</strong>{" "}
                                (+/− ou saisie). La quantité ne peut pas dépasser le stock affiché + la quantité déjà sur cet acte ; si le stock catalogue est à 0, vous ne pouvez plus augmenter l&apos;usage sur l&apos;acte (seulement diminuer ou retirer).
                            </p>
                            {peutModifierMateriels && catalogMateriels.length > 0 && (
                                <div
                                    style={{
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        gap: '10px',
                                        alignItems: 'center',
                                        marginBottom: '16px',
                                        padding: '12px',
                                        backgroundColor: themes[themeNumber].secondary + '12',
                                        borderRadius: '8px',
                                    }}
                                >
                                    <label style={{ color: themes[themeNumber].primary, fontWeight: 600 }}>
                                        Ajouter un matériel :
                                    </label>
                                    <select
                                        className="form-select"
                                        style={{ maxWidth: '280px' }}
                                        value={selectMaterielId}
                                        onChange={(e) => setSelectMaterielId(e.target.value)}
                                    >
                                        <option value="">— Choisir —</option>
                                        {catalogMateriels.map((c: any) => {
                                            const st = Number(c.quantite_defaut ?? c.quantiteDefaut ?? 0) || 0;
                                            return (
                                            <option key={String(c.id)} value={String(c.id)}>
                                                {(c.nom || c.id) + ` (stock ${st})`}
                                            </option>
                                        );})}
                                    </select>
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-primary"
                                        onClick={ajouterMaterielAuDraft}
                                    >
                                        Ajouter
                                    </button>
                                </div>
                            )}
                            {materielsDraft.length === 0 ? (
                                <div style={{
                                    padding: '40px',
                                    textAlign: 'center',
                                    color: themes[themeNumber].primary,
                                    fontSize: '14px'
                                }}>
                                    Aucun matériel médical n'est associé à cet acte. Ajoutez-en depuis le catalogue ci-dessus.
                                </div>
                            ) : (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{
                                        width: '100%',
                                        borderCollapse: 'collapse',
                                        fontSize: '13px'
                                    }}>
                                        <thead>
                                            <tr style={{
                                                backgroundColor: themes[themeNumber].primary + '20',
                                                borderBottom: `2px solid ${themes[themeNumber].primary}`
                                            }}>
                                                <th style={{
                                                    padding: '12px',
                                                    textAlign: 'left',
                                                    color: themes[themeNumber].primary,
                                                    fontWeight: 'bold'
                                                }}>
                                                    Matériel
                                                </th>
                                                <th style={{
                                                    padding: '12px',
                                                    textAlign: 'center',
                                                    color: themes[themeNumber].primary,
                                                    fontWeight: 'bold'
                                                }}>
                                                    Quantité
                                                </th>
                                                <th style={{
                                                    padding: '12px',
                                                    textAlign: 'center',
                                                    color: themes[themeNumber].primary,
                                                    fontWeight: 'bold',
                                                    fontSize: '12px'
                                                }}>
                                                    Max autorisé
                                                </th>
                                                {peutModifierMateriels && (
                                                    <th style={{
                                                        padding: '12px',
                                                        textAlign: 'center',
                                                        color: themes[themeNumber].primary,
                                                        fontWeight: 'bold',
                                                        width: '90px'
                                                    }}>
                                                    </th>
                                                )}
                                                <th style={{
                                                    padding: '12px',
                                                    textAlign: 'right',
                                                    color: themes[themeNumber].primary,
                                                    fontWeight: 'bold'
                                                }}>
                                                    Prix unitaire
                                                </th>
                                                <th style={{
                                                    padding: '12px',
                                                    textAlign: 'right',
                                                    color: themes[themeNumber].primary,
                                                    fontWeight: 'bold'
                                                }}>
                                                    Total
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {materielsDraft.map((row, index: number) => {
                                                const total = row.quantite * row.prixUnitaire;
                                                const maxQ = maxQuantiteAutorisee(row);
                                                const stock = stockCataloguePour(row.materielId);
                                                return (
                                                    <tr
                                                        key={row.key}
                                                        style={{
                                                            borderBottom: `1px solid ${themes[themeNumber].primary}20`,
                                                            backgroundColor: index % 2 === 0 ? '#fff' : themes[themeNumber].secondary + '05'
                                                        }}
                                                    >
                                                        <td style={{ padding: '12px', color: themes[themeNumber].primary, fontWeight: '600' }}>
                                                            {row.nom}
                                                        </td>
                                                        <td style={{ padding: '12px', textAlign: 'center', color: themes[themeNumber].primary }}>
                                                            {peutModifierMateriels ? (
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                                    <button
                                                                        type="button"
                                                                        className="btn btn-sm btn-outline-secondary"
                                                                        title="Diminuer"
                                                                        onClick={() => decrementerQuantite(row.key)}
                                                                        disabled={row.quantite <= 0}
                                                                    >
                                                                        −
                                                                    </button>
                                                                    <input
                                                                        type="number"
                                                                        min={0}
                                                                        max={maxQ}
                                                                        step={1}
                                                                        className="form-control form-control-sm"
                                                                        style={{ maxWidth: '80px', margin: '0 auto' }}
                                                                        value={row.quantite}
                                                                        onChange={(e) => majQuantiteDraft(row.key, e.target.value)}
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        className="btn btn-sm btn-outline-secondary"
                                                                        title="Augmenter"
                                                                        onClick={() => incrementerQuantite(row.key)}
                                                                        disabled={row.quantite >= maxQ}
                                                                    >
                                                                        +
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                row.quantite
                                                            )}
                                                        </td>
                                                        <td style={{ padding: '12px', textAlign: 'center', color: themes[themeNumber].primary, fontSize: '12px' }}>
                                                            <strong>{maxQ}</strong>
                                                            <div style={{ opacity: 0.85 }}>stock {stock} + acte {row.quantiteInitialeActe}</div>
                                                        </td>
                                                        {peutModifierMateriels && (
                                                            <td style={{ padding: '12px', textAlign: 'center' }}>
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-sm btn-outline-danger"
                                                                    onClick={() => supprimerLigneDraft(row.key)}
                                                                >
                                                                    Retirer
                                                                </button>
                                                            </td>
                                                        )}
                                                        <td style={{ padding: '12px', textAlign: 'right', color: themes[themeNumber].primary }}>
                                                            {row.prixUnitaire.toLocaleString('fr-FR')} FCFA
                                                        </td>
                                                        <td style={{ padding: '12px', textAlign: 'right', color: themes[themeNumber].primary, fontWeight: 'bold' }}>
                                                            {total.toLocaleString('fr-FR')} FCFA
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot>
                                            <tr style={{
                                                backgroundColor: themes[themeNumber].primary + '10',
                                                borderTop: `2px solid ${themes[themeNumber].primary}`,
                                                fontWeight: 'bold'
                                            }}>
                                                <td
                                                    colSpan={peutModifierMateriels ? 5 : 4}
                                                    style={{
                                                    padding: '12px',
                                                    textAlign: 'right',
                                                    color: themes[themeNumber].primary
                                                }}
                                                >
                                                    Total général:
                                                </td>
                                                <td style={{
                                                    padding: '12px',
                                                    textAlign: 'right',
                                                    color: themes[themeNumber].primary,
                                                    fontSize: '15px'
                                                }}>
                                                    {materielsDraft.reduce(
                                                        (sum, r) => sum + r.quantite * r.prixUnitaire,
                                                        0
                                                    ).toLocaleString('fr-FR')} FCFA
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                            {!peutModifierMateriels && (
                                <p style={{ fontSize: '13px', color: themes[themeNumber].primary, marginTop: '12px' }}>
                                    Lecture seule : privilège requis pour modifier les matériels (mat02).
                                </p>
                            )}
                        </ModalSection>
                        <ModalActions>
                            {peutModifierMateriels && (
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={enregistrerMaterielsActe}
                                    disabled={savingMateriels}
                                    style={{ cursor: savingMateriels ? "wait" : "pointer" }}
                                >
                                    {savingMateriels ? "Enregistrement…" : "Enregistrer"}
                                </button>
                            )}
                            <button
                                type="button"
                                className="btn btn-outline-secondary"
                                onClick={() => setShowModalMateriels(false)}
                            >
                                Fermer
                            </button>
                        </ModalActions>
                    </ModalGlobal>

                    <ModalGlobal
                        show={showModalPosologieActe}
                        onClose={() => setShowModalPosologieActe(false)}
                        title="Posologie & ordonnance — acte du paiement"
                        maxWidth="720px"
                        zIndex={10280}
                    >
                        {acteAssuranceFacture?.acte && (
                            <>
                                <ModalSection title="Référence">
                                    <p style={{ fontSize: "14px", color: themes[themeNumber].primary, margin: 0, lineHeight: 1.5 }}>
                                        <strong>Patient :</strong> {libellePatientHeader}
                                        <br />
                                        <span style={{ fontSize: "12px", opacity: 0.9 }}>
                                            <strong>Acte affiché (panneau paiement) :</strong>{" "}
                                            {acteAssuranceFacture.acte.nom || "—"}
                                            {acteAssuranceFacture.acte.date != null && acteAssuranceFacture.acte.date !== "" ? (
                                                <>
                                                    {" "}
                                                    —{" "}
                                                    {(() => {
                                                        try {
                                                            return format(
                                                                new Date(acteAssuranceFacture.acte.date),
                                                                "dd/MM/yyyy"
                                                            );
                                                        } catch {
                                                            return String(acteAssuranceFacture.acte.date);
                                                        }
                                                    })()}
                                                </>
                                            ) : null}
                                        </span>
                                        <br />
                                        <em style={{ fontSize: "12px", display: "block", marginTop: "8px" }}>
                                            Affichage de la posologie et de l&apos;ordonnance{" "}
                                            <strong>pour l&apos;acte sélectionné</strong> dans ce panneau de paiement (une posologie
                                            par acte).
                                        </em>
                                    </p>
                                </ModalSection>
                                {posologieActeLoading ? (
                                    <div className="text-center py-4" style={{ color: themes[themeNumber].primary }}>
                                        Chargement…
                                    </div>
                                ) : (
                                    <>
                                        {posologieActeHint && (
                                            <div
                                                className="alert alert-info"
                                                style={{ fontSize: "13px", lineHeight: 1.45 }}
                                            >
                                                {posologieActeHint}
                                            </div>
                                        )}
                                        {!posologieActeHint &&
                                            allowOrdonnanceDepuisPaiement &&
                                            posologieActeOrdonnanceText && (
                                            <ModalSection title="Ordonnance (texte type pharmacie)">
                                                <pre
                                                    style={{
                                                        whiteSpace: "pre-wrap",
                                                        fontSize: "12px",
                                                        lineHeight: 1.45,
                                                        padding: "12px",
                                                        background: themes[themeNumber].secondary + "18",
                                                        borderRadius: "8px",
                                                        maxHeight: "240px",
                                                        overflowY: "auto",
                                                        margin: 0,
                                                    }}
                                                >
                                                    {posologieActeOrdonnanceText}
                                                </pre>
                                            </ModalSection>
                                        )}
                                        {!posologieActeHint &&
                                            allowPosologieDepuisPaiement &&
                                            (posologieActePosText.trim() !== "" ||
                                                posologieActeLinesForEtat.length > 0) && (
                                            <ModalSection title="Détail posologie (prises, boîtes)">
                                                <p
                                                    style={{
                                                        fontSize: "12px",
                                                        color: themes[themeNumber].primary,
                                                        opacity: 0.92,
                                                        margin: "0 0 10px 0",
                                                        lineHeight: 1.45,
                                                    }}
                                                >
                                                    Modifiez le texte ci-dessous puis cliquez sur « Enregistrer ». Pour que la
                                                    sauvegarde retrouve les médicaments, gardez le format des lignes (• … —{" "}
                                                    <em>nom exact du médicament</em> · nombre de boîtes · × prises · (heures)).
                                                </p>
                                                <textarea
                                                    className="form-control"
                                                    rows={10}
                                                    value={posologieActePosText}
                                                    onChange={(e) => setPosologieActePosText(e.target.value)}
                                                    style={{
                                                        width: "100%",
                                                        fontSize: "12px",
                                                        lineHeight: 1.45,
                                                        padding: "12px",
                                                        background: themes[themeNumber].secondary + "18",
                                                        borderRadius: "8px",
                                                        border: `1px solid ${themes[themeNumber].primary}33`,
                                                        resize: "vertical",
                                                        minHeight: "168px",
                                                    }}
                                                    aria-label="Détail posologie, prises et boîtes"
                                                />
                                                <div style={{ marginTop: "12px" }}>
                                                    <button
                                                        type="button"
                                                        className="btn btn-primary btn-sm"
                                                        onClick={() => void enregistrerDetailPosologieActe()}
                                                        disabled={savingPosologieDetail || posologieActeLoading}
                                                    >
                                                        {savingPosologieDetail
                                                            ? "Enregistrement…"
                                                            : "Enregistrer le détail posologie"}
                                                    </button>
                                                </div>
                                            </ModalSection>
                                        )}
                                        {allowPosologieDepuisPaiement && posologieQrImg ? (
                                            <ModalSection title="QR code posologie (app mobile)">
                                                <p
                                                    style={{
                                                        fontSize: "12px",
                                                        color: themes[themeNumber].primary,
                                                        opacity: 0.9,
                                                        marginBottom: "10px",
                                                        lineHeight: 1.45,
                                                    }}
                                                >
                                                    QR chiffré (patient + posologie) — à scanner avec l&apos;application mobile,
                                                    comme sur la fiche patient.
                                                </p>
                                                <div className="text-center">
                                                    <img
                                                        src={posologieQrImg}
                                                        alt="QR posologie"
                                                        style={{ maxWidth: "260px", height: "auto" }}
                                                    />
                                                </div>
                                            </ModalSection>
                                        ) : null}
                                        {allowOrdonnanceDepuisPaiement &&
                                            posologieActeLinesForEtat.length > 0 && (
                                            <ModalSection title="États possibles pour impression">
                                                <p
                                                    style={{
                                                        fontSize: "13px",
                                                        color: themes[themeNumber].primary,
                                                        margin: "0 0 10px 0",
                                                        lineHeight: 1.45,
                                                    }}
                                                >
                                                    Modèles d&apos;ordonnance / prescription (cabinet + modèles inclus). Le texte
                                                    injecté dans <code>{"{{posologie}}"}</code> correspond au bloc « Ordonnance »
                                                    ci-dessus. Choisissez <strong>un seul</strong> modèle puis ouvrez l&apos;aperçu —{" "}
                                                    <strong>impression depuis la barre d&apos;outils</strong> de la Page État.
                                                </p>
                                                {allEtatModelesLotPatient.length === 0 ? (
                                                    <p style={{ fontSize: "13px", margin: 0, opacity: 0.85 }}>
                                                        Aucun modèle. Créez-en dans Page État (catégorie « prescription » ou avec
                                                        variable posologie).
                                                    </p>
                                                ) : (
                                                    <ul
                                                        className="list-unstyled"
                                                        style={{
                                                            maxHeight: "220px",
                                                            overflowY: "auto",
                                                            fontSize: "13px",
                                                            margin: 0,
                                                            paddingLeft: 0,
                                                        }}
                                                        role="radiogroup"
                                                        aria-label="Modèle d'état pour impression"
                                                    >
                                                        {allEtatModelesLotPatient.map((m) => (
                                                            <li key={m.id} className="mb-2">
                                                                <label
                                                                    className="d-flex align-items-center gap-2"
                                                                    style={{ cursor: "pointer" }}
                                                                >
                                                                    <input
                                                                        type="radio"
                                                                        name="posologie-etat-modele-impression"
                                                                        checked={
                                                                            posologieEtatSelectedId != null &&
                                                                            posologieEtatSelectedId === String(m.id)
                                                                        }
                                                                        onChange={() => setPosologieEtatSelectedId(String(m.id))}
                                                                    />
                                                                    <span style={{ color: themes[themeNumber].primary }}>
                                                                        {m.icon ? `${m.icon} ` : ""}
                                                                        {m.name}
                                                                    </span>
                                                                </label>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                                <div style={{ marginTop: "14px" }}>
                                                    <button
                                                        type="button"
                                                        className="btn btn-primary"
                                                        onClick={() => void ouvrirApercuEtatDepuisModalLotPatient()}
                                                        disabled={
                                                            allEtatModelesLotPatient.length === 0 || posologieEtatSelectedId == null
                                                        }
                                                    >
                                                        Ouvrir l&apos;aperçu (Page État)
                                                    </button>
                                                </div>
                                            </ModalSection>
                                        )}
                                    </>
                                )}
                                <ModalActions>
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={() => setShowModalPosologieActe(false)}
                                    >
                                        Fermer
                                    </button>
                                </ModalActions>
                            </>
                        )}
                    </ModalGlobal>
                </>
            ) : (
                <div className="alert alert-danger text-center" >
                    Vous n'avez pas les droits nécessaires pour voir ou modifier cet acte. Veuillez demander les autorisations à votre Docteur.
                </div>
            )}
        </>
    );
}

function valeurNonNegative(valeur) {
    if (valeur) {
        const numValue = typeof valeur == 'string' ? Number(valeur) : valeur;
        if (isNaN(numValue)) {
            console.error('La valeur' + numValue + ' fournie n\'est pas un nombre valide');
        }
        return Math.abs(numValue);
    } else {

        return 0;
    }
}
