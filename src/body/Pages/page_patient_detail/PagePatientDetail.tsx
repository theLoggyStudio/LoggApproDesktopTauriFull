import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import "./css/pagePatientDetail.css";
import "../css/pagePatient.css";
import NavTop from "../../Modules/NavTop.js";
import FormGerrerPatient from "../../Modules/FormGerrerPatient.js";
import FormGerrerActe from "../../Modules/FormGerrerActe.js";
import { DataImportExportController } from "../../controllers/DataImportExportController.js";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { TypeActe, TypeAssurance, Patient } from "../../Entities/entities.js";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { PagePatientController } from "../../controllers/PagePatientController.js";
import { PagePatientDetailController } from "../../controllers/PagePatientDetailController.js";
import AutorisationController from "../../controllers/AutorisationController.js";
import { useAlert, useItemsTab, useMode, useSearch } from "../../context/SearchContext.js";
import { useSession } from "../../context/SessionContext.js";
import { useNavigationParams } from "../../hooks/useNavigationParams.js";
import { themes } from "../../../constants/index.ts";
import { useTheme } from "../../context/ThemeContext.js";
import { creerTrace } from "../../controllers/TraceController.js";
import { PageProfilController } from "../../controllers/PageProfilController.js";
import { checkPrivilege, isPotentielCollaborateur } from "../../helpers/helpers.js";
import ModalQRCode from "../../Modules/ModalQRCode.js";
import PatientGestionModal from "../../Modules/PatientGestionModal.js";
import { getPagePatientAccess } from "../../policies/pagePatientPolicy.js";
import { Table as Tables, EmptyTables } from "../../../items/Table.tsx";
import { Modal } from "../../../items/Modal.tsx";
import { Input } from "../../../items/Input.tsx";

// ==================== TYPES ====================
interface PatientInfoRowProps {
    label: string;
    value: string;
    theme: any;
}

interface PatientSidebarProps {
    patient: Patient | undefined;
    theme: any;
    onEditClick: () => void;
    patientId: string;
    tabId: string;
    privs: string[];
    pays: string;
    customColumns: string[];
}

const DEMO_DOC_USER_ID = "loggappro-demo-doc01";

// ==================== COMPOSANTS UI ====================
const PatientInfoRow: React.FC<PatientInfoRowProps> = ({ label, value, theme }) => (
    <div className="row">
        <div className="my-2 mx-3">
            {label}:
            <br />
            <div className="mx-5 all-left-txt text-break small-text" style={{ color: theme.primary }}>
                {value}
            </div>
        </div>
    </div>
);

const columnToLabel = (col: string): string =>
    col.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");

const PatientSidebar: React.FC<PatientSidebarProps> = ({
    patient,
    theme,
    onEditClick,
    patientId,
    tabId,
    privs,
    pays,
    customColumns,
}) => {
    return (
        <div
            className="col-xl-3 bg-white detail-left-page"
            style={{
                backgroundColor: theme.primary,
                color: theme.primary,
                minHeight: "calc(100vh - 80px)",
                height: "100%",
                overflowY: "auto",
            }}
        >
            <ModalQRCode id={patientId} tabId={tabId} privs={privs} pays={pays} />

            <div className="big-text" onClick={onEditClick} style={{ color: theme.primary, cursor: "pointer" }}>
                <div className="row">
                    <div className="mb-5 mx-3 text-break" style={{ fontSize: "30px", color: theme.primary }}>
                        <b>
                            {patient?.nom || "chargement..."} {patient?.prenom || "chargement..."}
                            {patient?.nomDeJeuneFille && ` ndjf: ${patient.nomDeJeuneFille}`}
                        </b>
                    </div>
                </div>

                <PatientInfoRow label="Téléphone" value={patient?.telephone || "chargement..."} theme={theme} />
                <PatientInfoRow label="Email" value={patient?.login || "chargement..."} theme={theme} />
                <PatientInfoRow
                    label="Date de naissance"
                    value={format(patient?.naissance ?? new Date(), "dd MMMM yyyy", { locale: fr })}
                    theme={theme}
                />
                <PatientInfoRow label="Profession" value={patient?.profession || "chargement..."} theme={theme} />
                <PatientInfoRow label="Adresse" value={patient?.adresse || "chargement..."} theme={theme} />
                <PatientInfoRow label="Adressé par" value={patient?.adresserPar || "chargement..."} theme={theme} />
                <PatientInfoRow label="Observation" value={patient?.observation || "chargement..."} theme={theme} />
                {customColumns.map((col) => (
                    <PatientInfoRow key={col} label={`${columnToLabel(col)} *`} value={(patient as any)?.[col] ?? ""} theme={theme} />
                ))}
            </div>
        </div>
    );
};

// ==================== COMPOSANT PRINCIPAL ====================
export default function PagePatientDetail() {
    const navigate = useNavigate();
    const location = useLocation();
    const { patientId: routePatientId } = useParams<{ patientId?: string }>();
    const { session, isAuthenticated, setPatientId, clearSession } = useSession();
    const { userId, tabId, pays, patientId: hookPatientId, role } = useNavigationParams();
    const { mode, modeFileName } = useMode();
    const { themeNumber } = useTheme();
    const { setAlertObj } = useAlert();
    const { itemsTab, setItemsTab } = useItemsTab();
    const { setTheValueSearch } = useSearch();

    const effectiveUserId = userId || session.userId;
    const effectiveTabId = tabId || session.tabId;
    const effectivePays = pays || session.pays || "sn";

    const showListView = !routePatientId || routePatientId === "NaN";
    const detailPatientId = routePatientId && routePatientId !== "NaN" ? routePatientId : "";

    useEffect(() => {
        if (!isAuthenticated && !(effectiveUserId && effectiveTabId)) {
            navigate("/");
        }
    }, [isAuthenticated, effectiveUserId, effectiveTabId, navigate]);

    useEffect(() => {
        const segs = location.pathname.split("/").filter(Boolean);
        if (segs.length === 1 && segs[0] === "patient-detail") {
            setPatientId("");
        }
    }, [location.pathname, setPatientId]);

    useEffect(() => {
        if (routePatientId && routePatientId !== "NaN") {
            setPatientId(routePatientId);
        }
    }, [routePatientId, setPatientId]);

    const [thePatient, setThePatient] = useState<Patient>();
    const [allTypeActes, setAllTypeActes] = useState<TypeActe[]>([]);
    const [allTypeAssurances, setAllTypeAssurances] = useState<TypeAssurance[]>([]);
    const [fullActe, setFullActe] = useState<any[]>([]);
    const [privs, setPrivs] = useState<string[]>([]);
    const [show, setShow] = useState(false);
    const [reloadActe, setReloadActe] = useState(false);
    const [limit, setLimit] = useState(250);
    const [nomUtilisateur, setNomUtilisateur] = useState<string>("");

    const [patients, setPatients] = useState<Patient[]>([]);
    const [listLimit, setListLimit] = useState(50);
    const [showDemoDocEmailModal, setShowDemoDocEmailModal] = useState(false);
    const [nouvelEmailDemoDoc, setNouvelEmailDemoDoc] = useState("");
    const [mdpDemoDoc, setMdpDemoDoc] = useState("");
    const [mdpDemoDocConfirm, setMdpDemoDocConfirm] = useState("");
    const [showEditPatientModal, setShowEditPatientModal] = useState(false);
    const [editingPatientId, setEditingPatientId] = useState("");
    const [editingPatient, setEditingPatient] = useState<Patient | undefined>();
    const [editFormData, setEditFormData] = useState({
        nom: "",
        prenom: "",
        login: "",
        adresse: "",
        telephone: "",
        naissance: "",
        nomDeJeuneFille: "",
        profession: "",
        adresserPar: "",
        observation: "",
    });
    const [editCustomColumns, setEditCustomColumns] = useState<string[]>([]);
    const [editCustomFields, setEditCustomFields] = useState<Record<string, string>>({});
    const [nomUtilisateurTrace, setNomUtilisateurTrace] = useState("");

    const patientAccess = useMemo(() => getPagePatientAccess(privs), [privs]);

    const isCollaborateurCabinet = isPotentielCollaborateur(effectiveUserId ?? "", effectiveTabId ?? "", role);
    const vueRestreinteCollaborateur = isCollaborateurCabinet && !checkPrivilege("act01", privs);

    const [formData, setFormData] = useState({
        nom: "",
        prenom: "",
        login: "",
        adresse: "",
        telephone: "",
        naissance: "",
        nomDeJeuneFille: "",
        profession: "",
        adresserPar: "",
        observation: "",
    });
    const [customColumns, setCustomColumns] = useState<string[]>([]);
    const [customFields, setCustomFields] = useState<Record<string, string>>({});

    const handleFieldChange = (field: string, value: string) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const handleCustomFieldChange = (field: string, value: string) => {
        setCustomFields((prev) => ({ ...prev, [field]: value }));
    };

    const handleClose = () => setShow(false);

    useEffect(() => {
        if (effectiveUserId !== DEMO_DOC_USER_ID) return;
        try {
            if (sessionStorage.getItem("loggappro_show_demo_doc_email_modal") !== "1") return;
        } catch {
            return;
        }
        setShowDemoDocEmailModal(true);
    }, [effectiveUserId, effectiveTabId, effectivePays]);

    const rechargerListePatients = useCallback(async () => {
        try {
            const fetchLimit = Math.max(listLimit, 50);
            const liste = await PagePatientController(effectivePays).listerPatient(mode, effectiveTabId ?? "", fetchLimit, modeFileName);
            setPatients(liste);
            setItemsTab([]);
            setTheValueSearch("");
        } catch (e) {
            console.error("Rechargement liste patients:", e);
        }
    }, [listLimit, effectivePays, mode, effectiveTabId, modeFileName, setItemsTab, setTheValueSearch]);

    useEffect(() => {
        if (!showListView || !effectiveTabId || mode === "admin") return;
        DataImportExportController(effectivePays)
            .listCustomColumns(effectiveTabId)
            .then((res) => setEditCustomColumns(res?.patient ?? []))
            .catch(() => setEditCustomColumns([]));
    }, [showListView, effectiveTabId, effectivePays, mode]);

    useEffect(() => {
        if (!showListView) return;
        const loadNom = async () => {
            try {
                const r = await PageProfilController(effectivePays).voirInfoDocteur(effectiveUserId ?? "", effectiveTabId ?? "");
                if (r?.docteur) {
                    setNomUtilisateurTrace(`${r.docteur.nom} ${r.docteur.prenom}`);
                }
            } catch {
                /* ignore */
            }
        };
        if (effectiveUserId && effectiveTabId && effectivePays) loadNom();
    }, [showListView, effectiveUserId, effectiveTabId, effectivePays]);

    useEffect(() => {
        if (!showListView || !editingPatient) return;
        const g = (v: unknown) => (v != null ? String(v) : "");
        setEditFormData({
            nom: g(editingPatient.nom),
            prenom: g(editingPatient.prenom),
            login: g(editingPatient.login),
            adresse: g(editingPatient.adresse),
            telephone: g(editingPatient.telephone),
            naissance: g(editingPatient.naissance),
            nomDeJeuneFille: g(editingPatient.nomDeJeuneFille),
            profession: g(editingPatient.profession),
            adresserPar: g(editingPatient.adresserPar),
            observation: g(editingPatient.observation),
        });
        setEditCustomFields(() => {
            const next: Record<string, string> = {};
            editCustomColumns.forEach((col) => {
                const v = (editingPatient as Record<string, unknown>)[col];
                next[col] = v != null ? String(v) : "";
            });
            return next;
        });
    }, [showListView, editingPatient, editCustomColumns]);

    useEffect(() => {
        if (!showListView) return;
        const chargerPatients = async () => {
            if (mode === "superAdmin" || effectiveUserId === "sadmin" || session.role === "sadmin") {
                navigate("/profil", { replace: true });
                return;
            }
            try {
                const newPrivs = await AutorisationController(effectivePays).recupererPriviliegesDuUser(
                    effectiveUserId ?? "",
                    effectiveTabId ?? ""
                );
                if (!newPrivs || newPrivs.length === 0) {
                    navigate("/");
                    setAlertObj({ type: "error", show: true, text: "Session invalide. Veuillez vous reconnecter." });
                    return;
                }
                setPrivs(newPrivs);
                if (getPagePatientAccess(newPrivs).canAccessPatientModule) {
                    const fetchLimit = Math.max(listLimit, 50);
                    const next =
                        itemsTab.length <= 0
                            ? await PagePatientController(effectivePays).listerPatient(mode, effectiveTabId ?? "", fetchLimit, modeFileName)
                            : itemsTab;
                    setPatients(next);
                } else {
                    setPatients([]);
                }
            } catch (erreur) {
                navigate("/");
                setAlertObj({ type: "error", show: true, text: "Session expirée. Veuillez vous reconnecter." });
                console.error("Erreur lors du chargement des patients:", erreur);
            }
        };
        void chargerPatients();
    }, [showListView, effectiveUserId, effectiveTabId, itemsTab, mode, listLimit, session.role, navigate, effectivePays, modeFileName, setAlertObj]);

    useEffect(() => {
        if (showListView || !effectiveTabId || mode === "admin") return;
        DataImportExportController(effectivePays)
            .listCustomColumns(effectiveTabId)
            .then((res) => {
                const cols = res?.patient ?? [];
                setCustomColumns(cols);
            })
            .catch(() => setCustomColumns([]));
    }, [showListView, effectiveTabId, effectivePays, mode]);

    useEffect(() => {
        if (showListView) return;
        const fetchDocteurNom = async () => {
            try {
                const docteur = await PageProfilController(effectivePays).voirInfoDocteur(effectiveUserId, effectiveTabId);
                if (docteur && docteur.docteur) {
                    setNomUtilisateur(`${docteur.docteur.nom} ${docteur.docteur.prenom}`);
                }
            } catch (error) {
                console.error("Erreur lors de la récupération du nom du docteur:", error);
            }
        };
        if (effectiveUserId && effectiveTabId && effectivePays) {
            fetchDocteurNom();
        }
    }, [showListView, effectiveUserId, effectiveTabId, effectivePays]);

    useEffect(() => {
        if (showListView || !thePatient) return;
        const getPatientInfo = (info: any) => info || "";
        setFormData({
            nom: getPatientInfo(thePatient.nom),
            prenom: getPatientInfo(thePatient.prenom),
            login: getPatientInfo(thePatient.login),
            adresse: getPatientInfo(thePatient.adresse),
            telephone: getPatientInfo(thePatient.telephone),
            naissance: getPatientInfo(thePatient.naissance),
            nomDeJeuneFille: getPatientInfo(thePatient.nomDeJeuneFille),
            profession: getPatientInfo(thePatient.profession),
            adresserPar: getPatientInfo(thePatient.adresserPar),
            observation: getPatientInfo(thePatient.observation),
        });
        setCustomFields(() => {
            const next: Record<string, string> = {};
            customColumns.forEach((col) => {
                const v = (thePatient as any)[col];
                next[col] = v != null ? String(v) : "";
            });
            return next;
        });
        if (!thePatient.nom || !thePatient.prenom) {
            navigate("/patient-detail", { replace: true });
            setAlertObj({ type: "error", show: true, text: "L'id ne correspond à aucun patient" });
        }
    }, [showListView, thePatient, customColumns, navigate, setAlertObj]);

    useEffect(() => {
        if (showListView || !detailPatientId) return;
        const chargerDonnees = async () => {
            try {
                const [patient, privileges] = await Promise.all([
                    PagePatientDetailController(effectivePays).voirLePatient(mode, detailPatientId, effectiveTabId, modeFileName),
                    AutorisationController(effectivePays).recupererPriviliegesDuUser(effectiveUserId, effectiveTabId),
                ]);
                if (!privileges || privileges.length === 0) {
                    navigate("/");
                    setAlertObj({ type: "error", show: true, text: "Session invalide. Veuillez vous reconnecter." });
                    return;
                }
                if (!patient) {
                    setAlertObj({ type: "error", show: true, text: "L'id ne correspond à aucun patient." });
                    navigate("/patient-detail", { replace: true });
                    return;
                }
                const collab = isPotentielCollaborateur(effectiveUserId ?? "", effectiveTabId ?? "", role);
                const skipActs = collab && !checkPrivilege("act01", privileges);
                let typeActes: TypeActe[] = [];
                let typeAssurances: TypeAssurance[] = [];
                let actes: any[] = [];
                if (!skipActs) {
                    [typeActes, typeAssurances, actes] = await Promise.all([
                        PagePatientDetailController(effectivePays).listerLesTypeActes(effectiveTabId, 100),
                        PagePatientDetailController(effectivePays).listerLesTypeAssurances(100, effectiveTabId),
                        PagePatientDetailController(effectivePays).listerLesActes(mode, detailPatientId, limit, effectiveTabId, modeFileName),
                    ]);
                }
                setThePatient(patient);
                setAllTypeActes(typeActes);
                setAllTypeAssurances(typeAssurances);
                setFullActe(actes);
                setPrivs(privileges);
            } catch (erreur) {
                if (erreur && (erreur as any).response?.status === 401) {
                    navigate("/");
                    setAlertObj({ type: "error", show: true, text: "Session expirée. Veuillez vous reconnecter." });
                } else {
                    setAlertObj({ type: "error", show: true, text: "Erreur lors du chargement des données." });
                }
                console.error("Erreur lors du chargement:", erreur);
            }
        };
        void chargerDonnees();
    }, [
        showListView,
        detailPatientId,
        effectiveTabId,
        mode,
        modeFileName,
        limit,
        effectiveUserId,
        role,
        effectivePays,
        navigate,
        setAlertObj,
    ]);

    useEffect(() => {
        if (showListView || !reloadActe || !detailPatientId) return;
        const rechargerActes = async () => {
            try {
                const actes = await PagePatientDetailController(effectivePays).listerLesActes(
                    mode,
                    detailPatientId,
                    limit,
                    effectiveTabId,
                    modeFileName
                );
                setFullActe(actes);
            } catch (erreur) {
                console.error("Erreur lors du rechargement des actes:", erreur);
            } finally {
                setReloadActe(false);
            }
        };
        void rechargerActes();
    }, [showListView, reloadActe, detailPatientId, effectivePays, mode, limit, effectiveTabId, modeFileName]);

    function formatDateOfBirth(naissance: string) {
        if (!naissance) {
            return <span style={{ color: "var(--danger)" }}>Non renseigné</span>;
        }
        try {
            return format(new Date(naissance), "dd MMMM yyyy", { locale: fr });
        } catch {
            return <span style={{ color: "var(--danger)" }}>Erreur de date</span>;
        }
    }

    const goToDetail = (id: string | number) => {
        const pid = id != null ? String(id) : "";
        setPatientId(pid);
        navigate(`/patient-detail/${pid}`);
    };

    const fermerModalEditionPatient = useCallback(() => {
        setShowEditPatientModal(false);
        setEditingPatientId("");
        setEditingPatient(undefined);
    }, []);

    const ouvrirModalEditionPatient = useCallback(
        async (id: string) => {
            if (!id || !effectiveTabId) return;
            try {
                const p = await PagePatientDetailController(effectivePays).voirLePatient(mode, id, effectiveTabId, modeFileName);
                if (!p) {
                    setAlertObj({ type: "error", show: true, text: "Impossible de charger ce patient." });
                    return;
                }
                setEditingPatientId(id);
                setEditingPatient(p);
                setShowEditPatientModal(true);
            } catch (e) {
                console.error(e);
                setAlertObj({ type: "error", show: true, text: "Erreur lors du chargement du patient." });
            }
        },
        [effectiveTabId, effectivePays, mode, modeFileName, setAlertObj]
    );

    const handleSavePatientListe = async (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        if (!editingPatientId || !effectiveTabId) return;
        try {
            await PagePatientDetailController(effectivePays).modifierLePatient(
                mode,
                {
                    id: editingPatientId,
                    loggId: effectiveUserId,
                    ...editingPatient,
                    ...editFormData,
                    ...editCustomFields,
                    tabId: effectiveTabId,
                },
                modeFileName
            );
            await creerTrace(
                "update",
                "patient",
                `${editFormData.nom} ${editFormData.prenom}`,
                editingPatientId,
                effectiveUserId ?? "",
                nomUtilisateurTrace || "Utilisateur",
                "docteur",
                effectiveTabId ?? "",
                effectiveTabId ?? "",
                effectivePays ?? "",
                `Téléphone: ${editFormData.telephone} - Email: ${editFormData.login}`
            );
            setEditingPatient({
                id: editingPatientId,
                loggId: effectiveUserId,
                ...editingPatient,
                ...editFormData,
                ...editCustomFields,
            } as Patient);
            fermerModalEditionPatient();
            await rechargerListePatients();
            setAlertObj({ type: "success", show: true, text: `Le patient ${editFormData.nom} ${editFormData.prenom} a été modifié` });
        } catch (err) {
            console.error(err);
            setAlertObj({ type: "error", show: true, text: "Erreur lors de la modification du patient." });
        }
    };

    const handleDeletePatientListe = async () => {
        if (!editingPatientId || !effectiveTabId) return;
        try {
            const nomPatient =
                `${editingPatient?.nom || editFormData.nom || ""} ${editingPatient?.prenom || editFormData.prenom || ""}`.trim() ||
                "Patient";
            await PagePatientDetailController(effectivePays).supprimerLePatient(mode, editingPatientId, effectiveTabId, modeFileName);
            await creerTrace(
                "delete",
                "patient",
                nomPatient,
                editingPatientId,
                effectiveUserId ?? "",
                nomUtilisateurTrace || "Utilisateur",
                "docteur",
                effectiveTabId ?? "",
                effectiveTabId ?? "",
                effectivePays ?? "",
                `Téléphone: ${editingPatient?.telephone || editFormData.telephone || ""} - Email: ${editingPatient?.login || editFormData.login || ""}`
            );
            fermerModalEditionPatient();
            setPatientId("");
            await rechargerListePatients();
            setAlertObj({ type: "success", show: true, text: "Patient supprimé avec succès." });
        } catch (err) {
            console.error(err);
            setAlertObj({ type: "error", show: true, text: "Erreur lors de la suppression du patient." });
        }
    };

    const tableContent = {
        columns: ["#", "Nom complet", "Téléphone", "Profession", "Naissance"],
        data: (itemsTab.length ? itemsTab : patients).map((patient: Patient, index: number) => ({
            "#": String(index + 1).padStart(3, "0"),
            "Nom complet":
                patient.nomDeJeuneFille && patient.nomDeJeuneFille.trim() !== ""
                    ? `${patient.nom} ${patient.prenom} ndjf: ${patient.nomDeJeuneFille}`
                    : `${patient.nom} ${patient.prenom}`,
            Téléphone:
                patient.telephone === "" ? (
                    <span style={{ color: "var(--danger)" }}>non renseigné</span>
                ) : (
                    patient.telephone
                ),
            Profession:
                patient.profession === "" ? (
                    <span style={{ color: "var(--danger)" }}>non renseigné</span>
                ) : (
                    patient.profession
                ),
            Naissance: patient.naissance && formatDateOfBirth(patient.naissance),
            id: patient.id,
        })),
    };

    const handleRowClick = (row: any) => {
        const id = row?.id ?? row?.user?.id;
        if (!id) {
            setAlertObj({ type: "error", show: true, text: "ID patient manquant." });
            return;
        }
        if (!patientAccess.canManagePatients) {
            return;
        }
        if (patientAccess.rowClickOpensPatientDetail) {
            goToDetail(id);
            return;
        }
        void ouvrirModalEditionPatient(String(id));
    };

    const fermerModalDemoSansChangement = () => {
        try {
            sessionStorage.removeItem("loggappro_show_demo_doc_email_modal");
        } catch {
            /* ignore */
        }
        setShowDemoDocEmailModal(false);
    };

    const enregistrerNouvelEmailDemoDoc = async () => {
        const em = nouvelEmailDemoDoc.trim().toLowerCase();
        if (!em || !em.includes("@") || em.length < 5) {
            setAlertObj({ type: "warning", show: true, text: "Saisissez une adresse e-mail valide." });
            return;
        }
        if (mdpDemoDoc.length < 4) {
            setAlertObj({
                type: "warning",
                show: true,
                text: "Le mot de passe doit contenir au moins 4 caractères.",
            });
            return;
        }
        if (mdpDemoDoc !== mdpDemoDocConfirm) {
            setAlertObj({ type: "warning", show: true, text: "Les deux mots de passe ne correspondent pas." });
            return;
        }
        try {
            const res = await PageProfilController(effectivePays || "sn").finaliserEmailDemoDocteur(DEMO_DOC_USER_ID, em, mdpDemoDoc);
            const msg =
                (res && typeof res === "object" && "message" in res && typeof (res as { message?: string }).message === "string"
                    ? (res as { message: string }).message
                    : null) ??
                "Compte créé. Reconnectez-vous avec votre e-mail et votre mot de passe.";
            try {
                sessionStorage.removeItem("loggappro_show_demo_doc_email_modal");
            } catch {
                /* ignore */
            }
            setShowDemoDocEmailModal(false);
            setNouvelEmailDemoDoc("");
            setMdpDemoDoc("");
            setMdpDemoDocConfirm("");
            clearSession();
            setAlertObj({
                type: "success",
                show: true,
                text: msg,
            });
            navigate("/");
        } catch (e) {
            console.error(e);
            setAlertObj({
                type: "error",
                show: true,
                text:
                    typeof e === "string"
                        ? e
                        : (e as { message?: string })?.message?.replace(/^[^:]+:\s*/, "") ??
                          "Impossible de finaliser le compte démo.",
            });
        }
    };

    const handleModifie = async (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        try {
            await PagePatientDetailController(effectivePays).modifierLePatient(
                mode,
                {
                    id: detailPatientId,
                    loggId: effectiveUserId,
                    ...thePatient,
                    ...formData,
                    ...customFields,
                    tabId: effectiveTabId,
                },
                modeFileName
            );
            await creerTrace(
                "update",
                "patient",
                `${formData.nom} ${formData.prenom}`,
                detailPatientId ?? "",
                effectiveUserId ?? "",
                nomUtilisateur || "Utilisateur",
                "docteur",
                effectiveTabId ?? "",
                effectiveTabId ?? "",
                effectivePays,
                `Téléphone: ${formData.telephone} - Email: ${formData.login}`
            );
            setThePatient({
                id: detailPatientId,
                loggId: effectiveUserId,
                ...thePatient,
                ...formData,
                ...customFields,
            } as Patient);
            handleClose();
            setAlertObj({ type: "success", show: true, text: `Le patient ${formData.nom} ${formData.prenom} a été modifié` });
        } catch (error) {
            setAlertObj({ type: "error", show: true, text: "Erreur lors de la modification du patient." });
            console.error("Erreur lors de la modification du patient:", error);
        }
    };

    const handleDelect = async () => {
        try {
            const nomPatient = `${thePatient?.nom || ""} ${thePatient?.prenom || ""}`.trim() || "Patient";
            await PagePatientDetailController(effectivePays).supprimerLePatient(mode, detailPatientId, effectiveTabId, modeFileName);
            await creerTrace(
                "delete",
                "patient",
                nomPatient,
                detailPatientId ?? "",
                effectiveUserId ?? "",
                nomUtilisateur || "Utilisateur",
                "docteur",
                effectiveTabId ?? "",
                effectiveTabId ?? "",
                effectivePays,
                `Téléphone: ${thePatient?.telephone || ""} - Email: ${thePatient?.login || ""}`
            );
            setPatientId("");
            navigate("/patient-detail", { replace: true });
            handleClose();
            setAlertObj({ type: "success", show: true, text: "Patient supprimé avec succès." });
        } catch (error) {
            setAlertObj({ type: "error", show: true, text: "Erreur lors de la suppression du patient." });
            console.error("Erreur lors de la suppression du patient:", error);
        }
    };

    const navPatientId = showListView ? "0" : detailPatientId || hookPatientId || "0";

    if (showListView) {
        return (
            <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
                {showDemoDocEmailModal && (
                    <Modal show={showDemoDocEmailModal} onClose={fermerModalDemoSansChangement} title="Compte de démonstration — finaliser" maxWidth="520px">
                        <div style={{ padding: "8px 0", color: themes[themeNumber].primary }}>
                            <p style={{ marginBottom: 12, fontSize: 14 }}>
                                Remplacez l’e-mail générique <strong>doc01@01.com</strong> et définissez un mot de passe : un nouveau compte sera créé et vous serez
                                renvoyé à la connexion. Vous pouvez fermer sans modifier (non recommandé).
                            </p>
                            <label className="form-label">Nouvel e-mail (login)</label>
                            <Input
                                type="email"
                                className="form-control mb-3"
                                value={nouvelEmailDemoDoc}
                                onChange={(e) => setNouvelEmailDemoDoc(e.target.value)}
                                placeholder="vous@exemple.com"
                            />
                            <label className="form-label">Nouveau mot de passe</label>
                            <Input
                                type="password"
                                className="form-control mb-3"
                                value={mdpDemoDoc}
                                onChange={(e) => setMdpDemoDoc(e.target.value)}
                                placeholder="Au moins 4 caractères"
                                autoComplete="new-password"
                            />
                            <label className="form-label">Confirmer le mot de passe</label>
                            <Input
                                type="password"
                                className="form-control mb-3"
                                value={mdpDemoDocConfirm}
                                onChange={(e) => setMdpDemoDocConfirm(e.target.value)}
                                placeholder="Répétez le mot de passe"
                                autoComplete="new-password"
                            />
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                <button type="button" className="btn btn-primary" onClick={enregistrerNouvelEmailDemoDoc}>
                                    Créer mon compte et me reconnecter
                                </button>
                                <button type="button" className="btn btn-outline-secondary" onClick={fermerModalDemoSansChangement}>
                                    Fermer sans changer
                                </button>
                            </div>
                        </div>
                    </Modal>
                )}
                <NavTop userId={effectiveUserId ?? "0"} id={"nav-top"} tabId={effectiveTabId ?? "0"} patientId={"0"} pays={effectivePays ?? ""} />
                <div className="row" style={{ minHeight: "calc(100vh - 80px)", flex: 1 }}>
                    <div
                        className="col-md-6 col-xl-6 "
                        style={{
                            backgroundColor: themes[themeNumber].primary,
                            color: themes[themeNumber].secondary,
                            borderRight: `2px solid ${themes[themeNumber].secondary}`,
                        }}
                    >
                        <h1
                            style={{
                                color: themes[themeNumber].secondary,
                                background: themes[themeNumber].primary,
                                borderRadius: 12,
                                padding: 12,
                            }}
                            className="text-center mb-5"
                        >
                            Informations du Patient :
                        </h1>
                        {patientAccess.canAccessPatientModule ? (
                            <FormGerrerPatient
                                privs={privs}
                                setPatients={setPatients}
                                patients={patients}
                                pays={effectivePays}
                                onPatientListRefresh={rechargerListePatients}
                            />
                        ) : (
                            <div className="mx-5 mb-4 text-center small" style={{ maxWidth: 520, margin: "0 auto", opacity: 0.95 }}>
                                Vous n’avez pas les droits pour consulter ou gérer les patients (privilèges « voir patient » ou « gérer patient » requis).
                            </div>
                        )}
                    </div>
                    <div
                        className="col-md-6 col-xl-6"
                        style={{ backgroundColor: themes[themeNumber].secondary, color: themes[themeNumber].primary }}
                    >
                        {patientAccess.canAccessPatientModule ? (
                            <Tables
                                itmsPerPage={17}
                                tableContent={tableContent}
                                onRowClick={handleRowClick}
                                setLimit={setListLimit}
                                color={themes[themeNumber].primary}
                                backgroundColor={themes[themeNumber].secondary}
                            />
                        ) : (
                            <EmptyTables />
                        )}
                    </div>
                </div>
                <PatientGestionModal
                    show={showEditPatientModal}
                    onClose={fermerModalEditionPatient}
                    formData={editFormData}
                    customColumns={editCustomColumns}
                    customFields={editCustomFields}
                    onFieldChange={(field, value) => setEditFormData((prev) => ({ ...prev, [field]: value }))}
                    onCustomFieldChange={(field, value) => setEditCustomFields((prev) => ({ ...prev, [field]: value }))}
                    onSave={handleSavePatientListe}
                    onDelete={handleDeletePatientListe}
                    theme={themes[themeNumber]}
                />
            </div>
        );
    }

    return (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
            <NavTop
                userId={effectiveUserId}
                id={"nav-top"}
                tabId={effectiveTabId}
                patientId={navPatientId}
                mailPatient={thePatient}
                pays={effectivePays}
            />

            <div style={{ minHeight: "calc(100vh - 80px)", overflow: "hidden", flex: 1 }}>
                <div className="row" style={{ color: themes[themeNumber].primary, minHeight: "calc(100vh - 80px)", margin: 0 }}>
                    {vueRestreinteCollaborateur ? (
                        <div
                            className="col-xl-12"
                            style={{
                                backgroundColor: themes[themeNumber].secondary,
                                color: themes[themeNumber].primary,
                                minHeight: "calc(100vh - 80px)",
                                padding: "32px 24px",
                            }}
                        >
                            <h2 className="mb-4 text-break" style={{ fontSize: 26 }}>
                                {thePatient?.nom || "…"} {thePatient?.prenom || ""}
                            </h2>
                            <p className="mb-4" style={{ opacity: 0.85 }}>
                                Espace collaborateur : seules la modification et la suppression du patient sont disponibles sur cette page.
                            </p>
                            {checkPrivilege("pat02", privs) ? (
                                <button
                                    type="button"
                                    className="btn color-violet px-5 py-2 border-2"
                                    style={{ color: themes[themeNumber].primary, borderColor: themes[themeNumber].primary }}
                                    onClick={() => setShow(true)}
                                >
                                    Modifier ou supprimer le patient
                                </button>
                            ) : (
                                <p style={{ opacity: 0.9 }}>Vous n’avez pas les droits pour modifier ou supprimer ce patient.</p>
                            )}
                        </div>
                    ) : (
                        <>
                            <PatientSidebar
                                patient={thePatient}
                                theme={themes[themeNumber]}
                                onEditClick={() => setShow(true)}
                                patientId={detailPatientId}
                                tabId={effectiveTabId}
                                privs={privs}
                                pays={effectivePays}
                                customColumns={customColumns}
                            />
                            <Suspense fallback={<div style={{ padding: "20px", textAlign: "center" }}>Chargement...</div>}>
                                <FormGerrerActe
                                    allActes={fullActe}
                                    thePatient={thePatient}
                                    allTypeActes={allTypeActes}
                                    allTypeAssurances={allTypeAssurances}
                                    privs={privs}
                                    setAllActes={setFullActe}
                                    setReloadActe={setReloadActe}
                                    setlimit={setLimit}
                                    pays={effectivePays}
                                    patientId={detailPatientId}
                                />
                            </Suspense>
                        </>
                    )}
                </div>
            </div>

            <center>
                <PatientGestionModal
                    show={show}
                    onClose={handleClose}
                    formData={formData}
                    customColumns={customColumns}
                    customFields={customFields}
                    onFieldChange={handleFieldChange}
                    onCustomFieldChange={handleCustomFieldChange}
                    onSave={handleModifie}
                    onDelete={handleDelect}
                    theme={themes[themeNumber]}
                />
            </center>
        </div>
    );
}
