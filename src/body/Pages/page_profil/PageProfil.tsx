import React, { useEffect, useMemo, useState } from "react";
import "./css/pageProfil.css";
import "../../style.css";
import NavTop from "../../Modules/NavTop.js";
import ButtonModifier from "../../Modules/BouttonModifier.js";
import type { Assistant, Cabinet, Comptable, Docteur, Privilege, Secretaire, TypeCollaborateur, Collaborateur } from "../../Entities/entities.js";
import { emptyAssistant, emptyCabinet, emptyComptable, emptyDocteur, emptyPrivilege, emptySecretaire, emptyCollaborateur } from "../../Entities/entities.js";
import { useNavigate } from "react-router-dom";
import ProfilePhoto from "../../Modules/ProfilPhoto.js";
import ModalQRCode from "../../Modules/ModalQRCode.js";
import AutorisationController from "../../controllers/AutorisationController.js";
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import CountryList from 'react-select-country-list';
import { PageProfilController } from "../../controllers/PageProfilController.js";
import { useAlert, useMode } from "../../context/SearchContext.js";
import { useSession } from "../../context/SessionContext.js";
import { useNavigationParams } from "../../hooks/useNavigationParams.js";
import { checkPrivilege, isTheRightText } from "../../helpers/helpers.js";
import { canAccessProfilModule } from "../../policies/navModulePolicies.js";
import { Table as Tables } from "../../../items/Table.tsx";
import { Accordion } from "react-bootstrap";
import {
    themes,
    ALL_KNOWN_PRIVILEGE_CODES,
    encodePrivileges,
    PRIVILEGE_SELECTION_ROWS,
    normalizeToNewCodes,
    getAdminConfig,
    setAdminConfig,
} from "../../../constants/index.ts";
import { useTheme } from '../../context/ThemeContext.js';
import { creerTrace } from "../../controllers/TraceController.js";
import { Modal } from "../../../items/Modal.tsx";
import { Input } from "../../../items/Input.tsx";
import { ModalField, ModalSection, ModalGrid, ModalActions } from '../../Modules/ModalFormComponents.js';
import ButtonAjouter from "../../Modules/ButtonAjouter.js";
import ButtonSupprimer from "../../Modules/ButtonSupprimer.js";
import BoutonPayement from "../../Modules/BoutonPayement.js";
import PageOuvertureController from "../../controllers/PageOuvertureController.js";
import { phoneOnChangeHandler } from "../../helpers/phoneFormat.ts";

/** Contenu modal : privilèges par défaut du type (`roles_par_defaut`), cases synchronisées avec la base. */
function TypeCollaborateurPrivilegesDefautModalContent({
    typeCollab,
    pays,
    effectiveTabId,
    themeNumber,
    canEdit,
    setAlertObj,
    onRolesSaved,
    onRequestClose,
}: {
    typeCollab: TypeCollaborateur;
    pays: string;
    effectiveTabId: string;
    themeNumber: number;
    canEdit: boolean;
    setAlertObj: (a: { type: string; show: boolean; text: string }) => void;
    onRolesSaved: (typeId: string) => void | Promise<void>;
    onRequestClose: () => void;
}) {
    const rolesCsv =
        (typeCollab as { rolesParDefaut?: string }).rolesParDefaut ??
        (typeCollab as { roles_par_defaut?: string }).roles_par_defaut ??
        "";
    const normalizedFromDb = useMemo(
        () =>
            normalizeToNewCodes(
                String(rolesCsv)
                    .split(/[,;]/)
                    .map((s) => s.trim())
                    .filter(Boolean)
            ),
        [rolesCsv]
    );
    const [selectedCodes, setSelectedCodes] = useState<string[]>(normalizedFromDb);

    useEffect(() => {
        setSelectedCodes(normalizedFromDb);
    }, [normalizedFromDb, typeCollab.id]);

    const toggleCode = (code: string) => {
        setSelectedCodes((prev) => {
            let next = prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code];
            if (next.length > 0 && !next.includes("acc01")) {
                next = ["acc01", ...next];
            }
            return next;
        });
    };

    const handleSave = async () => {
        if (!canEdit || !typeCollab.id) return;
        try {
            const rolesStr = encodePrivileges(selectedCodes);
            await PageProfilController(pays).modifierRolesTypeCollaborateur(typeCollab.id, rolesStr, effectiveTabId);
            setAlertObj({ type: "success", show: true, text: "Privilèges par défaut du type enregistrés." });
            await onRolesSaved(typeCollab.id);
        } catch (e) {
            console.error(e);
            setAlertObj({ type: "error", show: true, text: "Erreur lors de l'enregistrement des privilèges du type." });
        }
    };

    return (
        <div style={{ color: themes[themeNumber].primary }}>
            <p style={{ fontSize: 13, opacity: 0.9, marginBottom: 14 }}>
                Nouveaux comptes du type <strong>« {typeCollab.nom ?? "…"} »</strong> : chaque case correspond aux codes
                enregistrés pour ce type (<strong>edb01</strong> = lien « Gestion des éléments de base » dans Autres pages ;
                <strong>gam/gas/gmt/gme/gtc</strong> ou équivalents nma/asr/mat/pos/col pour les accordéons ;
                <strong>pet01/pet02</strong> pour la page Modèles d’état). Les droits d’un compte déjà créé se gèrent dans la
                fenêtre « Modifier le collaborateur » (photo / privilèges individuels).
            </p>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                    gap: 10,
                    marginBottom: 16,
                    maxHeight: "min(55vh, 420px)",
                    overflowY: "auto",
                    paddingRight: 6,
                }}
            >
                {PRIVILEGE_SELECTION_ROWS.map((row, rowIdx) =>
                    row.type === "heading" ? (
                        <div
                            key={row.id}
                            style={{
                                gridColumn: "1 / -1",
                                marginTop: rowIdx > 0 ? 14 : 0,
                                paddingBottom: 6,
                                borderBottom: `1px solid ${themes[themeNumber].secondary}35`,
                            }}
                        >
                            <div style={{ fontSize: 14, fontWeight: 700, color: themes[themeNumber].secondary }}>
                                {row.title}
                            </div>
                            {row.hint ? (
                                <div style={{ fontSize: 11, opacity: 0.88, marginTop: 4, lineHeight: 1.4 }}>
                                    {row.hint}
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <label
                            key={row.code}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                cursor: canEdit ? "pointer" : "default",
                                padding: "8px 10px",
                                borderRadius: 8,
                                background: selectedCodes.includes(row.code)
                                    ? themes[themeNumber].secondary + "40"
                                    : themes[themeNumber].primary + "12",
                                border: `1px solid ${themes[themeNumber].secondary}30`,
                                opacity: canEdit ? 1 : 0.88,
                            }}
                        >
                            <Input
                                type="checkbox"
                                checked={selectedCodes.includes(row.code)}
                                disabled={!canEdit}
                                onChange={() => toggleCode(row.code)}
                            />
                            <span style={{ fontSize: 13 }}>{row.label}</span>
                        </label>
                    )
                )}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "flex-end" }}>
                <button
                    type="button"
                    className="btn btn-sm"
                    style={{
                        backgroundColor: themes[themeNumber].primary,
                        color: themes[themeNumber].secondary,
                        border: `1px solid ${themes[themeNumber].secondary}`,
                    }}
                    onClick={onRequestClose}
                >
                    Fermer
                </button>
                {canEdit && (
                    <button
                        type="button"
                        className="btn btn-sm"
                        style={{
                            backgroundColor: themes[themeNumber].secondary,
                            color: themes[themeNumber].primary,
                            fontWeight: 600,
                        }}
                        onClick={() => void handleSave()}
                    >
                        Enregistrer les privilèges du type
                    </button>
                )}
            </div>
        </div>
    );
}

export default function PageProfil() {
    const navigate = useNavigate();
    const { isAuthenticated, session } = useSession();
    const { userId, tabId, pays, role } = useNavigationParams();
    const [limitAssistant, setLimitAssistant] = useState<number>(10)
    const [limitComptable, setLimitComptable] = useState<number>(10)
    const [limitSecretaire, setLimitSecretaire] = useState<number>(10)

    useEffect(() => {
        // Ne pas rediriger si on a des params URL (rafraîchissement ou accès direct) - la session sera synchronisée
        if (!isAuthenticated && !(userId && tabId)) {
            navigate("/");
        }
    }, [isAuthenticated, userId, tabId, navigate]);

    const [comptables, setComptables] = useState<Comptable[]>([]);
    const [secretaires, setSecretaires] = useState<Secretaire[]>([]);
    const [assistants, setAssistants] = useState<Assistant[]>([]);

    const [comptable, setComptable] = useState<Comptable>(emptyComptable);
    const [secretaire, setSecretaire] = useState<Secretaire>(emptySecretaire);
    const [assistant, setAssistant] = useState<Assistant>(emptyAssistant);
    const [theDocteur, setTheDocteur] = useState<Docteur>(emptyDocteur);
    const [theCabinet, setTheCabinet] = useState<Cabinet>(emptyCabinet);
    const [theCollaborateurProfil, setTheCollaborateurProfil] = useState<Collaborateur>(emptyCollaborateur);
    const [isCollaborateurProfil, setIsCollaborateurProfil] = useState(false);
    const [collaborateurProfilType, setCollaborateurProfilType] = useState<"collaborateur" | "assistant" | "comptable" | "secretaire">("collaborateur");
    const [privilege, setPrivilege] = useState<Privilege>({ id: "", loggId: "", nom: "" });
    const [casSecretaire, setCasSecretaire] = useState<"ajouter" | "updateDelect">("ajouter");
    const [casComptable, setCasComptable] = useState<"ajouter" | "updateDelect">("ajouter");
    const [casAssistant, setCasAssistant] = useState<"ajouter" | "updateDelect">("ajouter");
    const [showModalAssistant, setShowModalAssistant] = useState<boolean>(false);
    const [showModalComptable, setShowModalComptable] = useState<boolean>(false);
    const [showModalSecretaire, setShowModalSecretaire] = useState<boolean>(false);
    const [newPassword, setNewPassword] = useState<string>("");
    const [actualPassword, setActualPassword] = useState<string>("");
    const [adminLogin, setAdminLogin] = useState<string>("");
    const [adminPassword, setAdminPassword] = useState<string>("");
    const [isLoadingAssistant, setIsLoadingAssistant] = useState(false);
    const [isLoadingComptable, setIsLoadingComptable] = useState(false);
    const [isLoadingSecretaire, setIsLoadingSecretaire] = useState(false);
    const [isTheGoodpwd, setIsTheGoodpwd] = useState(false);

    const [typesCollaborateurs, setTypesCollaborateurs] = useState<TypeCollaborateur[]>([]);
    const [collaborateursByType, setCollaborateursByType] = useState<Record<string, Collaborateur[]>>({});
    const [collaborateur, setCollaborateur] = useState<Collaborateur>(emptyCollaborateur);
    const [selectedTypeId, setSelectedTypeId] = useState<string>("");
    const [casCollaborateur, setCasCollaborateur] = useState<"ajouter" | "updateDelect">("ajouter");
    const [showModalCollaborateur, setShowModalCollaborateur] = useState(false);
    /** Type dont on affiche les privilèges par défaut (modal) */
    const [modalRolesDefautType, setModalRolesDefautType] = useState<TypeCollaborateur | null>(null);
    const [showModalNouveauType, setShowModalNouveauType] = useState(false);
    const [nomNouveauType, setNomNouveauType] = useState("");
    const [rolesNouveauType, setRolesNouveauType] = useState<string[]>([]);

    const [docteurs, setDocteurs] = useState<Docteur[]>([]);
    /** Sadmin : fiche docteur (privilèges, QR…) — même logique que les collaborateurs */
    const [showModalDocteurSadmin, setShowModalDocteurSadmin] = useState(false);
    const [docteurSadminEdition, setDocteurSadminEdition] = useState<Docteur>(emptyDocteur);
    /** Privilèges du docteur édité par le Sadmin — séparés de `privilege` pour éviter tout écrasement par loadProfil / alertes. */
    const [privilegeDocteurSadmin, setPrivilegeDocteurSadmin] = useState<Privilege>(emptyPrivilege);
    const [showModalNouveauDocteur, setShowModalNouveauDocteur] = useState(false);
    const [newDocteur, setNewDocteur] = useState<Docteur>(emptyDocteur);
    const [newCabinet, setNewCabinet] = useState<Cabinet>({ id: "", adresse: "", limit: 100, pays: "", nom: "" });
    const [isLoadingDocteurs, setIsLoadingDocteurs] = useState(false);

    const [value, setValue] = useState<string>("");
    const options = CountryList()?.getData();
    const { alertObj, setAlertObj } = useAlert();
    const { mode } = useMode();
    const isAdminMode = mode === "admin" || mode === "superAdmin" || userId === "admin" || userId === "sadmin";
    /** Connexion Sadmin : pas de « Mon profil » ni colonne photo (déjà l’accordéon Connexion admin / gestion docteurs). */
    const estSadminProfil = mode === "superAdmin" || userId === "sadmin";
    const defaultAccordionProfilKey = estSadminProfil
        ? mode === "superAdmin"
            ? "gestionDocteurs"
            : "adminConfig"
        : "profil";
    const [privs, setPrivs] = useState<string[]>([]);
    /** Évite d’afficher « accès refusé » avant la fin du chargement API des privilèges. */
    const [profilPrivsLoaded, setProfilPrivsLoaded] = useState(false);
    const { themeNumber } = useTheme();

    // Quand tabId === userId (profil du docteur), les données sont dans "main"
    const effectiveTabId = (tabId === userId ? "main" : tabId) ?? "main";

    const peutVoirPageProfil = isAdminMode || canAccessProfilModule(privs);
    const accesProfilRefuse = profilPrivsLoaded && !peutVoirPageProfil;
    /** Docteur / collaborateur : identité & coordonnées uniquement (prf02), pas le cabinet. */
    const peutModifierMonProfil = isAdminMode || checkPrivilege("prf02", privs);
    /** col01 = voir listes / fiches ; col02 = ajouter, modifier, supprimer, types. */
    const peutVoirCollaborateurs = useMemo(
        () => isAdminMode || checkPrivilege("col01", privs) || checkPrivilege("col02", privs),
        [isAdminMode, privs]
    );
    const peutGererCollaborateurs = useMemo(
        () => isAdminMode || checkPrivilege("col02", privs),
        [isAdminMode, privs]
    );
    /** Paramètres du cabinet (nom, pays, adresse, mot de passe par défaut) : cab01. */
    const peutModifierCabinet = useMemo(
        () => isAdminMode || checkPrivilege("cab01", privs),
        [isAdminMode, privs]
    );

    const modalPrivilegesCss = `
        .modal-privileges-container .checkBox-overflow {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 12px 20px;
            padding: 20px;
            min-height: 300px;
            background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
            border-radius: 12px;
            border: 1px solid ${themes[themeNumber].secondary}20;
        }
        .modal-privileges-container .form-check {
            margin-bottom: 0;
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 15px;
            background: white;
            border-radius: 8px;
            border: 1px solid ${themes[themeNumber].primary}15;
            transition: all 0.2s ease;
            cursor: pointer;
        }
        .modal-privileges-container .form-check:hover {
            background: ${themes[themeNumber].primary}08;
            border-color: ${themes[themeNumber].primary}30;
            transform: translateY(-1px);
            box-shadow: 0 2px 8px ${themes[themeNumber].primary}15;
        }
        .modal-privileges-container .form-check-input {
            margin-top: 0;
            flex-shrink: 0;
            width: 20px;
            height: 20px;
            cursor: pointer;
            border: 2px solid ${themes[themeNumber].primary}50;
            border-radius: 4px;
            transition: all 0.2s ease;
        }
        .modal-privileges-container .form-check-input:checked {
            background-color: ${themes[themeNumber].primary};
            border-color: ${themes[themeNumber].primary};
            background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3e%3cpath fill='none' stroke='%23fff' stroke-linecap='round' stroke-linejoin='round' stroke-width='3' d='M6 10l3 3l6-6'/%3e%3c/svg%3e");
        }
        .modal-privileges-container .form-check-input:focus {
            border-color: ${themes[themeNumber].primary};
            box-shadow: 0 0 0 3px ${themes[themeNumber].primary}20;
        }
        .modal-privileges-container .form-check-label {
            flex: 1;
            margin-left: 0;
            font-size: 14px;
            font-weight: 500;
            color: #333;
            cursor: pointer;
            user-select: none;
        }
        .modal-privileges-container .form-check-input:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .modal-privileges-container .form-check-input:disabled + .form-check-label {
            opacity: 0.7;
            cursor: not-allowed;
        }
    `;

    useEffect(() => {
        let isMounted = true;
        setProfilPrivsLoaded(false);
        const remplirPrivs = async () => {
            try {
                if (mode === "superAdmin") {
                    if (isMounted) {
                        setPrivs([...ALL_KNOWN_PRIVILEGE_CODES]);
                        setProfilPrivsLoaded(true);
                    }
                    return;
                }
                const privs = await AutorisationController(pays ?? "").recupererPriviliegesDuUser(userId ?? "", tabId ?? "");
                
                if (!privs || privs.length === 0) {
                    navigate('/');
                    setAlertObj({ type: "error", show: true, text: "Session invalide. Veuillez vous reconnecter." });
                    return;
                }
                
                if (isMounted) {
                    setPrivs(privs);
                    setProfilPrivsLoaded(true);
                }
            } catch (erreur) {
                if (isMounted && mode !== "superAdmin") {
                    navigate('/');
                    setAlertObj({ type: "error", show: true, text: "Session expirée. Veuillez vous reconnecter." });
                }
                console.error("Erreur lors de la récupération des privilèges:", erreur);
            }
        };
        remplirPrivs();

        return () => {
            isMounted = false;
        };
    }, [userId, tabId, mode, navigate, setAlertObj, pays]);


    const [windowSize, setWindowSize] = useState({ w: window.innerWidth, h: window.innerHeight });
    useEffect(() => {
        const onResize = () => setWindowSize({ w: window.innerWidth, h: window.innerHeight });
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);
    useEffect(() => {
        const navTopConf = () => {
            const el = document.getElementById('nav-top');
            const height = el?.clientHeight ?? 0;
            document.getElementById('navTopConf')?.setAttribute('style', `margin-top: ${Number(height) + 5}px;`);
        };
        navTopConf();
    }, [windowSize.w, windowSize.h]);

    useEffect(() => {
        if (!isAdminMode && (!peutVoirCollaborateurs || tabId !== userId)) {
            setAssistants([]);
            setIsLoadingAssistant(false);
            return;
        }
        const loadAssistant = async () => {
            setIsLoadingAssistant(true);
            try {
                const data = await PageProfilController(pays ?? "").listerAssistants(effectiveTabId, limitAssistant);
                setAssistants(data);
            } catch (err) {
                console.error("Erreur chargement assistants:", err);
                setAlertObj({ type: "error", show: true, text: "Erreur lors du chargement des assistants." });
            } finally {
                setIsLoadingAssistant(false);
            }
        };
        void loadAssistant();
    }, [effectiveTabId, isAdminMode, limitAssistant, pays, peutVoirCollaborateurs, tabId, userId]);

    useEffect(() => {
        if (!isAdminMode && (!peutVoirCollaborateurs || tabId !== userId)) {
            setComptables([]);
            setIsLoadingComptable(false);
            return;
        }
        const loadComptable = async () => {
            setIsLoadingComptable(true);
            try {
                const data = await PageProfilController(pays ?? "").listerComptables(effectiveTabId, limitComptable);
                setComptables(data);
            } catch (err) {
                console.error("Erreur chargement comptables:", err);
                setAlertObj({ type: "error", show: true, text: "Erreur lors du chargement des comptables." });
            } finally {
                setIsLoadingComptable(false);
            }
        };
        void loadComptable();
    }, [effectiveTabId, isAdminMode, limitComptable, pays, peutVoirCollaborateurs, tabId, userId]);

    useEffect(() => {
        if (!isAdminMode && (!peutVoirCollaborateurs || tabId !== userId)) {
            setSecretaires([]);
            setIsLoadingSecretaire(false);
            return;
        }
        const loadSecretaire = async () => {
            setIsLoadingSecretaire(true);
            try {
                const data = await PageProfilController(pays ?? "").listerSecretaires(effectiveTabId, limitSecretaire);
                setSecretaires(data);
            } catch (err) {
                console.error("Erreur chargement secrétaires:", err);
                setAlertObj({ type: "error", show: true, text: "Erreur lors du chargement des secrétaires." });
            } finally {
                setIsLoadingSecretaire(false);
            }
        };
        void loadSecretaire();
    }, [effectiveTabId, isAdminMode, limitSecretaire, pays, peutVoirCollaborateurs, tabId, userId]);

    useEffect(() => {
        const loadTypes = async () => {
            try {
                const data = await PageProfilController(pays ?? "").listerTypesCollaborateur(effectiveTabId);
                setTypesCollaborateurs(Array.isArray(data) ? data : []);
            } catch (err) {
                console.error("Erreur chargement types collaborateurs:", err);
                setTypesCollaborateurs([]);
            }
        };
        if ((tabId === userId && peutVoirCollaborateurs) || isCollaborateurProfil) void loadTypes();
    }, [effectiveTabId, isCollaborateurProfil, pays, peutVoirCollaborateurs, tabId, userId]);

    useEffect(() => {
        const loadCollaborateurs = async () => {
            const byType: Record<string, Collaborateur[]> = {};
            for (const t of typesCollaborateurs) {
                if (!t.id) continue;
                try {
                    const data = await PageProfilController(pays ?? "").listerCollaborateursByType(t.id, effectiveTabId, 100);
                    byType[t.id] = Array.isArray(data) ? data : [];
                } catch {
                    byType[t.id] = [];
                }
            }
            setCollaborateursByType(byType);
        };
        if (typesCollaborateurs.length > 0 && tabId === userId && peutVoirCollaborateurs) void loadCollaborateurs();
    }, [typesCollaborateurs, effectiveTabId, tabId, userId, pays, peutVoirCollaborateurs]);

    const [isLoadingDocteur, setIsLoadingDocteur] = useState(true);
    useEffect(() => {
        const loadProfil = async () => {
            if (!userId || !tabId) {
                setIsLoadingDocteur(false);
                return;
            }
            setIsLoadingDocteur(true);
            try {
                // Collaborateur : userId !== tabId OU role explicite (assistant/comptable/secretaire) car logg_id peut être vide
                const isPotentielCollaborateur = (userId !== tabId && userId !== "admin" && userId !== "sadmin") || role === "assistant" || role === "comptable" || role === "secretaire";
                if (isPotentielCollaborateur) {
                    const ctrl = PageProfilController(pays ?? "");
                    let collabData: Collaborateur | null = null;
                    // 1. Essayer tab_collaborateur (nouveaux collaborateurs) - avec tabId puis "main"
                    const tabForCollab = tabId ?? "";
                    let r = await ctrl.voirInfoCollaborateur(userId ?? "", tabForCollab || "main");
                    if (!r?.collaborateur && tabForCollab && tabForCollab !== "main") {
                        r = await ctrl.voirInfoCollaborateur(userId ?? "", "main");
                    }
                    if (r?.collaborateur) {
                        collabData = { ...r.collaborateur, loggId: tabForCollab || "main" };
                        setCollaborateurProfilType("collaborateur");
                    }
                    // 2. Si pas trouvé, essayer assistant/comptable/secretaire (ordre selon role si dispo, sinon tous)
                    // Les collaborateurs peuvent être dans tab_xxx{tabId} OU tab_xxx_main (cabinet principal)
                    if (!collabData) {
                        const tab = tabId ?? "";
                        const tryTab = (t: string) => t || "main";
                        const tryBothTabs = async (fn: (id: string, t: string) => Promise<any>, key: "assistant" | "comptable" | "secretaire") => {
                            let res = await fn(userId ?? "", tryTab(tab));
                            if (!res?.[key] && tab !== "main") res = await fn(userId ?? "", "main");
                            return res;
                        };
                        if (role === "assistant") {
                            const ra = await tryBothTabs(ctrl.voirInfoAssistant.bind(ctrl), "assistant");
                            if (ra?.assistant) {
                                const a = ra.assistant;
                                collabData = { id: a.id, nom: a.nom, prenom: a.prenom, login: a.login, telephone: a.telephone, naissance: a.naissance, adresse: a.adresse, loggId: tab };
                                setCollaborateurProfilType("assistant");
                            }
                        }
                        if (!collabData && role === "comptable") {
                            const rc = await tryBothTabs(ctrl.voirInfoComptable.bind(ctrl), "comptable");
                            if (rc?.comptable) {
                                const c = rc.comptable;
                                collabData = { id: c.id, nom: c.nom, prenom: c.prenom, login: c.login, telephone: c.telephone, naissance: c.naissance, adresse: c.adresse, loggId: tab };
                                setCollaborateurProfilType("comptable");
                            }
                        }
                        if (!collabData && role === "secretaire") {
                            const rs = await tryBothTabs(ctrl.voirInfoSecretaire.bind(ctrl), "secretaire");
                            if (rs?.secretaire) {
                                const s = rs.secretaire;
                                collabData = { id: s.id, nom: s.nom, prenom: s.prenom, login: s.login, telephone: s.telephone, naissance: s.naissance, adresse: s.adresse, loggId: tab };
                                setCollaborateurProfilType("secretaire");
                            }
                        }
                        // 3. Fallback : essayer les 3 tables si role vide ou non reconnu (avec tabId puis "main")
                        if (!collabData) {
                            const tabsToTry = [tryTab(tab)];
                            if (tab !== "main") tabsToTry.push("main");
                            for (const t of tabsToTry) {
                                const [ra, rc, rs] = await Promise.all([
                                    ctrl.voirInfoAssistant(userId ?? "", t),
                                    ctrl.voirInfoComptable(userId ?? "", t),
                                    ctrl.voirInfoSecretaire(userId ?? "", t),
                                ]);
                                const a = ra?.assistant; const c = rc?.comptable; const s = rs?.secretaire;
                                if (a) { collabData = { id: a.id, nom: a.nom, prenom: a.prenom, login: a.login, telephone: a.telephone, naissance: a.naissance, adresse: a.adresse, loggId: tab }; setCollaborateurProfilType("assistant"); break; }
                                if (c) { collabData = { id: c.id, nom: c.nom, prenom: c.prenom, login: c.login, telephone: c.telephone, naissance: c.naissance, adresse: c.adresse, loggId: tab }; setCollaborateurProfilType("comptable"); break; }
                                if (s) { collabData = { id: s.id, nom: s.nom, prenom: s.prenom, login: s.login, telephone: s.telephone, naissance: s.naissance, adresse: s.adresse, loggId: tab }; setCollaborateurProfilType("secretaire"); break; }
                            }
                        }
                    }
                    if (collabData) {
                        setTheCollaborateurProfil(collabData);
                        setIsCollaborateurProfil(true);
                        setTheDocteur(emptyDocteur);
                        setTheCabinet(emptyCabinet);
                        try {
                            const priv = await PageProfilController(pays ?? "").trouverPrivilege(collabData.id ?? "", effectiveTabId);
                            setPrivilege(priv ?? emptyPrivilege);
                        } catch {
                            setPrivilege(emptyPrivilege);
                        }
                        setIsLoadingDocteur(false);
                        return;
                    }
                }
                setIsCollaborateurProfil(false);
                setTheCollaborateurProfil(emptyCollaborateur);
                setCollaborateurProfilType("collaborateur");
                // Docteur: userId === tabId. Assistant/secrétaire/comptable: tabId = loggId. Admin: userId === "admin" ou "sadmin" → premier docteur
                const docteurIdToLoad = (userId === "admin" || userId === "sadmin") ? userId : (userId === tabId ? userId : tabId);
                const r = await PageProfilController(pays ?? "").voirInfoDocteur(docteurIdToLoad ?? "", tabId ?? "");
                if (r != null) {
                    const docteur = r?.docteur ? { ...r.docteur, role: r.docteur.role || "docteur" } : emptyDocteur;
                    const cabinet = r?.cabinet ? { ...r.cabinet, passwordDefaut: r.cabinet.passwordDefaut || r.cabinet.password_defaut || "1234" } : emptyCabinet;
                    setTheDocteur(docteur);
                    setTheCabinet(cabinet);
                    setValue(r?.cabinet?.pays ?? "");
                    try {
                        const priv = await PageProfilController(pays ?? "").trouverPrivilege(docteur?.id ?? docteurIdToLoad ?? "", effectiveTabId);
                        setPrivilege(priv ?? emptyPrivilege);
                    } catch {
                        setPrivilege(emptyPrivilege);
                    }
                } else {
                    setTheDocteur(emptyDocteur);
                    setTheCabinet(emptyCabinet);
                }
            } catch (err) {
                console.error("Erreur chargement profil:", err);
                setAlertObj({ type: "error", show: true, text: "Erreur lors du chargement du profil." });
                setTheDocteur(emptyDocteur);
                setTheCabinet(emptyCabinet);
                setTheCollaborateurProfil(emptyCollaborateur);
                setIsCollaborateurProfil(false);
                setCollaborateurProfilType("collaborateur");
            } finally {
                setIsLoadingDocteur(false);
            }
        };
        loadProfil();
    }, [userId, tabId, pays, role, setAlertObj]);

    useEffect(() => {
        const cfg = getAdminConfig();
        setAdminLogin(cfg.login);
        setAdminPassword(cfg.password);
    }, []);

    useEffect(() => {
        const isSadminUi =
            mode === "superAdmin" ||
            userId === "sadmin" ||
            role === "sadmin" ||
            session.role === "sadmin";
        const loadDocteurs = async () => {
            // Aligné sur estSadminProfil : sans mode superAdmin (timing / contexte), la liste ne se chargeait jamais.
            if (!isSadminUi) return;
            setIsLoadingDocteurs(true);
            try {
                const list = await PageProfilController(pays ?? "").listerDocteurs();
                setDocteurs(Array.isArray(list) ? list : []);
            } catch (err) {
                console.error("Erreur chargement docteurs:", err);
                setDocteurs([]);
            } finally {
                setIsLoadingDocteurs(false);
            }
        };
        void loadDocteurs();
    }, [mode, pays, userId, role, session.role]);


    useEffect(() => {
        const isTheGoodPassword = async () => {
            if (!theDocteur) {
                setIsTheGoodpwd(false);
                return;
            }
            if (await isTheRightText(actualPassword, theDocteur.password ?? "")) {
                setIsTheGoodpwd(true)
            } else {
                setIsTheGoodpwd(false)
            }
        }
        isTheGoodPassword()
    }, [actualPassword, theDocteur])





    function upperLow(nom: string | undefined) {
        if (!nom) return nom;
        return nom.charAt(0).toUpperCase() + nom.slice(1).toLowerCase();
    }

    //-----------------------------------------------------assistant
    const addAssistant = async (e?: React.FormEvent) => {
        e?.preventDefault();
        
        if (!checkPrivilege("col02", privs)) {
            setAlertObj({ type: "warning", show: true, text: "Vous n'avez pas les droits nécessaires pour ajouter un assistant." });
            return;
        }

        // Validation des champs obligatoires
        const champsManquants: string[] = [];
        if (!assistant.nom || assistant.nom.trim() === "") champsManquants.push("Nom");
        if (!assistant.prenom || assistant.prenom.trim() === "") champsManquants.push("Prénom");
        if (!assistant.login || assistant.login.trim() === "") champsManquants.push("Adresse e-mail");
        if (!assistant.naissance || assistant.naissance.trim() === "") champsManquants.push("Date de naissance");
        
        if (champsManquants.length > 0) {
            setAlertObj({ 
                type: "error", 
                show: true, 
                text: `Veuillez remplir les champs obligatoires suivants : ${champsManquants.join(", ")}` 
            });
            return;
        }

        const syncDate = new Date();
        const syncDateInSecond = syncDate.getTime().toString();

        const newAssistant = {
            ...assistant,
            role: "assistant",
            dateCreation: new Date(),
            id: syncDateInSecond,
            loggId: userId,
            tabId: effectiveTabId,
            password: assistant.password || theCabinet.passwordDefaut || "1234",
            passwordDefaut: theCabinet.passwordDefaut ?? "",
        };

        try {
            const created = await PageProfilController(pays ?? "").ajouterAssistant(newAssistant);
            const rid = (created as any)?.id != null ? String((created as any).id) : syncDateInSecond;
            const listA = await PageProfilController(pays ?? "").listerAssistants(effectiveTabId, limitAssistant);
            setAssistants(Array.isArray(listA) ? listA : []);

            // Ajouter la trace de création
            await creerTrace(
                'create',
                'assistant',
                `${newAssistant.nom} ${newAssistant.prenom}`,
                rid,
                userId ?? "",
                `${theDocteur.nom} ${theDocteur.prenom}`,
                "docteur",
                tabId ?? "",
                tabId ?? "",
                pays ?? "",
                `Email: ${newAssistant.login} - Téléphone: ${newAssistant.telephone}`
            );

            const privilege = await PageProfilController(pays ?? "").trouverPrivilege(rid, effectiveTabId);
            setPrivilege(privilege);
            setCasAssistant("ajouter");
            setAssistant(emptyAssistant);
            setShowModalAssistant(false);
            setAlertObj({ type: "success", show: true, text: " assistant ajouté avec succès" });

        } catch (error) {
            console.error("Erreur lors de l'ajout de l'assistant :", error);
            setAlertObj({ type: "error", show: true, text: "Erreur lors de l'ajout de l'assistant." });
        }
    };

    const modifierAssistant = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!checkPrivilege("col02", privs)) {
            setAlertObj({ type: "warning", show: true, text: "Vous n'avez pas les droits nécessaires pour modifier un assistant." });
            return;
        }

        try {
            const assistantId = assistant?.id;
            await PageProfilController(pays ?? "").modifierAssistant({ id: assistantId, ...assistant, loggId: userId, tabId: effectiveTabId });

            // Ajouter la trace de modification
            await creerTrace(
                'update',
                'assistant',
                `${assistant.nom} ${assistant.prenom}`,
                assistantId ?? "",
                userId ?? "",
                `${theDocteur.nom} ${theDocteur.prenom}`,
                "docteur",
                tabId ?? "",
                tabId ?? "",
                pays ?? "",
                `Email: ${assistant.login} - Téléphone: ${assistant.telephone}`
            );

            setAssistants(prevAssistants =>
                prevAssistants.map(a => (a.id === assistantId ? { ...assistant, id: assistantId } : a))
            );

            setAssistant({
                id: "",
                photo: "",
                nom: "",
                prenom: "",
                login: "",
                password: "",
                telephone: "",
                naissance: "",
                role: "",
                adresse: "",
                loggId: "",
            });
            setCasAssistant("ajouter");
            setAssistant(emptyAssistant);
            setShowModalAssistant(false);
            setAlertObj({ type: "success", show: true, text: "Assistant modifié" });
        } catch (error) {
            console.error("Erreur lors de la modification de l'assistant :", error);
            setAlertObj({ type: "error", show: true, text: "Erreur lors de la modification de l'assistant." });
        }
    };
    const supprimerAssistant = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!checkPrivilege("col02", privs)) {
            setAlertObj({ type: "warning", show: true, text: "Vous n'avez pas les droits nécessaires pour supprimer un assistant." });
            return;
        }

        try {
            const assistantId = assistant?.id;
            const nomComplet = `${assistant.nom} ${assistant.prenom}`;
            
            setAssistants(prevAssistants => prevAssistants.filter(a => a.id !== assistantId));
            await PageProfilController(pays ?? "").supprimerAssistant(assistantId ?? "", effectiveTabId);

            // Ajouter la trace de suppression
            await creerTrace(
                'delete',
                'assistant',
                nomComplet,
                assistantId ?? "",
                userId ?? "",
                `${theDocteur.nom} ${theDocteur.prenom}`,
                "docteur",
                tabId ?? "",
                tabId ?? "",
                pays ?? "",
                `Email: ${assistant.login}`
            );

            setAssistant({
                id: "",
                photo: "",
                nom: "",
                prenom: "",
                login: "",
                password: "",
                telephone: "",
                naissance: "",
                role: "",
                adresse: "",
                loggId: "",
            });
            setCasAssistant("ajouter");
            setAssistant(emptyAssistant);
            setShowModalAssistant(false);
            setAlertObj({ type: "success", show: true, text: "Assistant supprimé" });
        } catch (error) {
            console.error("Erreur lors de la suppression de l'assistant :", error);
            setAlertObj({ type: "error", show: true, text: "Erreur lors de la suppression de l'assistant." });
        }
    };


    //-----------------------------------------------------comptable
    const addComptable = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!checkPrivilege("col02", privs)) {
            setAlertObj({ type: "warning", show: true, text: "Vous n'avez pas les droits nécessaires pour ajouter un comptable." });
            return;
        }

        // Validation des champs obligatoires
        const champsManquants: string[] = [];
        if (!comptable.nom || comptable.nom.trim() === "") champsManquants.push("Nom");
        if (!comptable.prenom || comptable.prenom.trim() === "") champsManquants.push("Prénom");
        if (!comptable.login || comptable.login.trim() === "") champsManquants.push("Adresse e-mail");
        if (!comptable.naissance || comptable.naissance.trim() === "") champsManquants.push("Date de naissance");
        
        if (champsManquants.length > 0) {
            setAlertObj({ 
                type: "error", 
                show: true, 
                text: `Veuillez remplir les champs obligatoires suivants : ${champsManquants.join(", ")}` 
            });
            return;
        }

        const syncDate = new Date();
        const syncDateInSecond = syncDate.getTime().toString();

        const newComptable = {
            ...comptable,
            role: "comptable",
            dateCreation: new Date(),
            id: syncDateInSecond,
            loggId: userId,
            tabId: effectiveTabId,
            password: comptable.password || theCabinet.passwordDefaut || "1234",
            passwordDefaut: theCabinet.passwordDefaut ?? "",
        };

        try {
            const createdC = await PageProfilController(pays ?? "").ajouterComptable(newComptable);
            const ridC = (createdC as any)?.id != null ? String((createdC as any).id) : syncDateInSecond;
            const listC = await PageProfilController(pays ?? "").listerComptables(effectiveTabId, limitComptable);
            setComptables(Array.isArray(listC) ? listC : []);

            // Ajouter la trace de création
            await creerTrace(
                'create',
                'comptable',
                `${newComptable.nom} ${newComptable.prenom}`,
                ridC,
                userId ?? "",
                `${theDocteur.nom} ${theDocteur.prenom}`,
                "docteur",
                tabId ?? "",
                tabId ?? "",
                pays ?? "",
                `Email: ${newComptable.login} - Téléphone: ${newComptable.telephone}`
            );

            setComptable({
                ...emptyComptable,
                dateCreation: syncDate,
            });

            const privilege = await PageProfilController(pays ?? "").trouverPrivilege(ridC, effectiveTabId);
            setPrivilege(privilege);

            setCasComptable("ajouter");
            setComptable(emptyComptable);
            setShowModalComptable(false);
            setAlertObj({ type: "success", show: true, text: "Comptable ajouté avec succès" });

        } catch (error) {
            console.error("Erreur lors de l'ajout du comptable :", error);
            setAlertObj({ type: "error", show: true, text: "Erreur lors de l'ajout du comptable." });
        }
    };

    const modifierComptable = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!checkPrivilege("col02", privs)) {
            setAlertObj({ type: "warning", show: true, text: "Vous n'avez pas les droits nécessaires pour modifier un comptable." });
            return;
        }

        try {
            const comptableId = comptable?.id;
            await PageProfilController(pays ?? "").modifierComptable({ id: comptableId, ...comptable, loggId: userId, tabId: effectiveTabId });

            // Ajouter la trace de modification
            await creerTrace(
                'update',
                'comptable',
                `${comptable.nom} ${comptable.prenom}`,
                comptableId ?? "",
                userId ?? "",
                `${theDocteur.nom} ${theDocteur.prenom}`,
                "docteur",
                tabId ?? "",
                tabId ?? "",
                pays ?? "",
                `Email: ${comptable.login} - Téléphone: ${comptable.telephone}`
            );

            setComptables(prevComptables =>
                prevComptables.map(c => (c.id === comptableId ? { ...comptable, id: comptableId } : c))
            );

            setComptable({
                id: "",
                photo: "",
                nom: "",
                prenom: "",
                login: "",
                password: "",
                telephone: "",
                naissance: "",
                role: "",
                adresse: "",
                loggId: "",
            });
            setCasComptable("ajouter");
            setComptable(emptyComptable);
            setShowModalComptable(false);
            setAlertObj({ type: "success", show: true, text: "Comptable modifié" });
        } catch (error) {
            console.error("Erreur lors de la modification du comptable :", error);
            setAlertObj({ type: "error", show: true, text: "Erreur lors de la modification du comptable." });
        }
    };

    const supprimerComptable = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!checkPrivilege("col02", privs)) {
            setAlertObj({ type: "warning", show: true, text: "Vous n'avez pas les droits nécessaires pour supprimer un comptable." });
            return;
        }

        try {
            const comptableId = comptable?.id;
            const nomComplet = `${comptable.nom} ${comptable.prenom}`;
            
            setComptables(prevComptables => prevComptables.filter(c => c.id !== comptableId));
            await PageProfilController(pays ?? "").supprimerComptable(comptableId ?? "", effectiveTabId);

            // Ajouter la trace de suppression
            await creerTrace(
                'delete',
                'comptable',
                nomComplet,
                comptableId ?? "",
                userId ?? "",
                `${theDocteur.nom} ${theDocteur.prenom}`,
                "docteur",
                tabId ?? "",
                tabId ?? "",
                pays ?? "",
                `Email: ${comptable.login}`
            );

            setComptable({
                id: "",
                photo: "",
                nom: "",
                prenom: "",
                login: "",
                password: "",
                telephone: "",
                naissance: "",
                role: "",
                adresse: "",
                loggId: "",
            });
            setCasComptable("ajouter");
            setComptable(emptyComptable);
            setShowModalComptable(false);
            setAlertObj({ type: "success", show: true, text: "Comptable supprimé" });

        } catch (error) {
            console.error("Erreur lors de la suppression du comptable :", error);
            setAlertObj({ type: "error", show: true, text: "Erreur lors de la suppression du comptable." });
        }
    };


    //-----------------------------------------------------secretaire
    const addSecretaire = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!checkPrivilege("col02", privs)) {
            setAlertObj({ type: "warning", show: true, text: "Vous n'avez pas les droits nécessaires pour ajouter un secrétaire." });
            return;
        }

        // Validation des champs obligatoires
        const champsManquants: string[] = [];
        if (!secretaire.nom || secretaire.nom.trim() === "") champsManquants.push("Nom");
        if (!secretaire.prenom || secretaire.prenom.trim() === "") champsManquants.push("Prénom");
        if (!secretaire.login || secretaire.login.trim() === "") champsManquants.push("Adresse e-mail");
        if (!secretaire.naissance || secretaire.naissance.trim() === "") champsManquants.push("Date de naissance");
        
        if (champsManquants.length > 0) {
            setAlertObj({ 
                type: "error", 
                show: true, 
                text: `Veuillez remplir les champs obligatoires suivants : ${champsManquants.join(", ")}` 
            });
            return;
        }

        const syncDate = new Date();
        const syncDateInSecond = syncDate.getTime().toString();

        const newSecretaire = {
            ...secretaire,
            role: "secretaire",
            dateCreation: new Date(),
            id: syncDateInSecond,
            loggId: userId,
            tabId: effectiveTabId,
            password: secretaire.password || theCabinet.passwordDefaut || "1234",
            passwordDefaut: theCabinet.passwordDefaut ?? "",
        };

        try {
            const createdS = await PageProfilController(pays ?? "").ajouterSecretaire(newSecretaire);
            const ridS = (createdS as any)?.id != null ? String((createdS as any).id) : syncDateInSecond;
            const listS = await PageProfilController(pays ?? "").listerSecretaires(effectiveTabId, limitSecretaire);
            setSecretaires(Array.isArray(listS) ? listS : []);

            // Ajouter la trace de création
            await creerTrace(
                'create',
                'secretaire',
                `${newSecretaire.nom} ${newSecretaire.prenom}`,
                ridS,
                userId ?? "",
                `${theDocteur.nom} ${theDocteur.prenom}`,
                "docteur",
                tabId ?? "",
                tabId ?? "",
                pays ?? "",
                `Email: ${newSecretaire.login} - Téléphone: ${newSecretaire.telephone}`
            );

            setSecretaire({
                ...emptySecretaire,
                dateCreation: syncDate,
            });

            const privilege = await PageProfilController(pays ?? "").trouverPrivilege(ridS, effectiveTabId);
            setPrivilege(privilege);

            setCasSecretaire("ajouter");
            setSecretaire(emptySecretaire);
            setShowModalSecretaire(false);
            setAlertObj({ type: "success", show: true, text: "Secrétaire ajouté" });

        } catch (error) {
            console.error("Erreur lors de l'ajout du secrétaire :", error);
            setAlertObj({ type: "error", show: true, text: "Erreur lors de l'ajout du secrétaire." });
        }
    };

    const modifierSecretaire = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!checkPrivilege("col02", privs)) {
            setAlertObj({ type: "warning", show: true, text: "Vous n'avez pas les droits nécessaires pour modifier un secrétaire." });
            return;
        }

        try {
            const secretaireId = secretaire?.id;
            await PageProfilController(pays ?? "").modifierSecretaire({ id: secretaireId, ...secretaire, loggId: userId, tabId: effectiveTabId });

            // Ajouter la trace de modification
            await creerTrace(
                'update',
                'secretaire',
                `${secretaire.nom} ${secretaire.prenom}`,
                secretaireId ?? "",
                userId ?? "",
                `${theDocteur.nom} ${theDocteur.prenom}`,
                "docteur",
                tabId ?? "",
                tabId ?? "",
                pays ?? "",
                `Email: ${secretaire.login} - Téléphone: ${secretaire.telephone}`
            );

            setSecretaires(prevSecretaires =>
                prevSecretaires.map(s => (s.id === secretaireId ? { ...secretaire, id: secretaireId } : s))
            );

            setSecretaire({
                id: "",
                photo: "",
                nom: "",
                prenom: "",
                login: "",
                password: "",
                telephone: "",
                naissance: "",
                role: "",
                adresse: "",
                loggId: "",
            });
            setCasSecretaire("ajouter");
            setSecretaire(emptySecretaire);
            setShowModalSecretaire(false);
            setAlertObj({ type: "success", show: true, text: "Secrétaire modifié" });

        } catch (error) {
            console.error("Erreur lors de la modification du secrétaire :", error);
            setAlertObj({ type: "error", show: true, text: "Erreur lors de la modification du secrétaire." });
        }
    };

    const supprimerSecretaire = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!checkPrivilege("col02", privs)) {
            setAlertObj({ type: "warning", show: true, text: "Vous n'avez pas les droits nécessaires pour supprimer un secrétaire." });
            return;
        }

        try {
            const secretaireId = secretaire?.id;
            const nomComplet = `${secretaire.nom} ${secretaire.prenom}`;
            
            setSecretaires(prevSecretaires => prevSecretaires.filter(s => s.id !== secretaireId));
            await PageProfilController(pays ?? "").supprimerSecretaire(secretaireId ?? "", effectiveTabId);

            // Ajouter la trace de suppression
            await creerTrace(
                'delete',
                'secretaire',
                nomComplet,
                secretaireId ?? "",
                userId ?? "",
                `${theDocteur.nom} ${theDocteur.prenom}`,
                "docteur",
                tabId ?? "",
                tabId ?? "",
                pays ?? "",
                `Email: ${secretaire.login}`
            );

            setSecretaire({
                id: "",
                photo: "",
                nom: "",
                prenom: "",
                login: "",
                password: "",
                telephone: "",
                naissance: "",
                role: "",
                adresse: "",
                loggId: "",
            });
            setCasSecretaire("ajouter");
            setSecretaire(emptySecretaire);
            setShowModalSecretaire(false);
            setAlertObj({ type: "success", show: true, text: "Secrétaire supprimé" });
        } catch (error) {
            console.error("Erreur lors de la suppression du secrétaire :", error);
            setAlertObj({ type: "error", show: true, text: "Erreur lors de la suppression du secrétaire." });
        }
    };

    const addDocteur = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (mode !== "superAdmin") return;
        const champsManquants: string[] = [];
        if (!newDocteur.nom?.trim()) champsManquants.push("Nom");
        if (!newDocteur.prenom?.trim()) champsManquants.push("Prénom");
        if (!newDocteur.login?.trim()) champsManquants.push("Email");
        if (!newDocteur.telephone?.trim()) champsManquants.push("Téléphone");
        if (!newDocteur.password?.trim()) champsManquants.push("Mot de passe");
        if (!newDocteur.naissance?.trim()) champsManquants.push("Date de naissance");
        if (!newCabinet.nom?.trim()) champsManquants.push("Nom du cabinet");
        if (champsManquants.length > 0) {
            setAlertObj({ type: "error", show: true, text: `Champs obligatoires : ${champsManquants.join(", ")}` });
            return;
        }
        try {
            setAlertObj({ type: "warning", show: true, text: "Chargement..." });
            const syncDateInSecond = new Date().getTime().toString();
            const updatedDocteur = { ...newDocteur, id: syncDateInSecond, role: "docteur", loggId: syncDateInSecond };
            const updatedCabinet = { ...newCabinet, id: syncDateInSecond, tabId: "main" };
            const paysToUse = value || newCabinet.pays || "SN";
            await PageOuvertureController(paysToUse).createCabinet({ ...updatedCabinet, pays: paysToUse });
            await PageOuvertureController(paysToUse).createUser({ ...updatedDocteur, pays: paysToUse, tabId: "main" });
            setDocteurs((prev) => [...prev, { ...newDocteur, id: syncDateInSecond, role: "docteur", loggId: syncDateInSecond }]);
            setNewDocteur(emptyDocteur);
            setNewCabinet({ id: "", adresse: "", pays: "", nom: "", limit: 100 });
            setShowModalNouveauDocteur(false);
            setAlertObj({ type: "success", show: true, text: `Dr. ${newDocteur.nom} ${newDocteur.prenom} a été créé avec succès.` });
        } catch (err: any) {
            console.error("Erreur création docteur:", err);
            setAlertObj({ type: "error", show: true, text: err?.message ?? "Erreur lors de la création du docteur." });
        }
    };

    const resetPasswordDocteur = async (docteurId: string) => {
        if (mode !== "superAdmin") return;
        try {
            await PageProfilController(pays ?? "").reinitialiserMotDePasseDocteur(docteurId);
            setAlertObj({ type: "success", show: true, text: "Mot de passe réinitialisé à 1234. Le docteur devra le modifier à sa prochaine connexion." });
        } catch (err: any) {
            setAlertObj({ type: "error", show: true, text: err?.message ?? "Erreur lors de la réinitialisation." });
        }
    };

    const ouvrirEditionDocteurSadmin = async (d: Docteur) => {
        setDocteurSadminEdition({ ...d, role: "docteur" });
        setPrivilegeDocteurSadmin(emptyPrivilege);
        try {
            const priv = await PageProfilController(pays ?? "").trouverPrivilege(d.id ?? "", d.id ?? "");
            setPrivilegeDocteurSadmin(priv ?? emptyPrivilege);
        } catch {
            setPrivilegeDocteurSadmin(emptyPrivilege);
        }
        setShowModalDocteurSadmin(true);
    };

    const addCollaborateur = async (e?: React.FormEvent, typeId?: string) => {
        e?.preventDefault();
        const tid = typeId || selectedTypeId;
        if (!tid || !peutGererCollaborateurs) return;
        const typeNom = typesCollaborateurs.find((t) => t.id === tid)?.nom ?? "";
        const champsManquants: string[] = [];
        if (!collaborateur.nom?.trim()) champsManquants.push("Nom");
        if (!collaborateur.prenom?.trim()) champsManquants.push("Prénom");
        if (!collaborateur.login?.trim()) champsManquants.push("Email");
        if (!collaborateur.telephone?.trim()) champsManquants.push("Téléphone");
        if (!collaborateur.naissance?.trim()) champsManquants.push("Date de naissance");
        if (champsManquants.length > 0) {
            setAlertObj({ type: "error", show: true, text: `Champs obligatoires : ${champsManquants.join(", ")}` });
            return;
        }
        try {
            const newCollab = {
                ...collaborateur,
                typeId: tid,
                loggId: userId,
                tabId: effectiveTabId,
                password: collaborateur.password || theCabinet.passwordDefaut || "1234",
                passwordDefaut: theCabinet.passwordDefaut ?? "",
            };
            await PageProfilController(pays ?? "").ajouterCollaborateur(newCollab);
            setCollaborateursByType((prev) => ({
                ...prev,
                [tid]: [...(prev[tid] || []), { ...collaborateur, id: (prev[tid]?.length ?? 0).toString() }],
            }));
            setCollaborateur(emptyCollaborateur);
            setShowModalCollaborateur(false);
            setAlertObj({ type: "success", show: true, text: `${typeNom} ajouté` });
            const data = await PageProfilController(pays ?? "").listerCollaborateursByType(tid, effectiveTabId, 100);
            setCollaborateursByType((p) => ({ ...p, [tid]: Array.isArray(data) ? data : [] }));
        } catch (err) {
            console.error("Erreur ajout collaborateur:", err);
            setAlertObj({ type: "error", show: true, text: "Erreur lors de l'ajout." });
        }
    };

    const chargerCollaborateur = async (c: Collaborateur, typeId: string) => {
        setCollaborateur({ ...c, typeId });
        setSelectedTypeId(typeId);
        try {
            setPrivilege(await PageProfilController(pays ?? "").trouverPrivilege(c.id ?? "", effectiveTabId) ?? emptyPrivilege);
        } catch {
            setPrivilege(emptyPrivilege);
        }
        setCasCollaborateur("updateDelect");
        setShowModalCollaborateur(true);
    };

    const modifierCollaborateur = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!peutGererCollaborateurs) return;
        try {
            await PageProfilController(pays ?? "").modifierCollaborateur({ ...collaborateur, tabId: effectiveTabId });
            const tid = selectedTypeId;
            const data = await PageProfilController(pays ?? "").listerCollaborateursByType(tid, effectiveTabId, 100);
            setCollaborateursByType((p) => ({ ...p, [tid]: Array.isArray(data) ? data : [] }));
            setCollaborateur(emptyCollaborateur);
            setShowModalCollaborateur(false);
            setAlertObj({ type: "success", show: true, text: "Collaborateur modifié" });
        } catch (err) {
            console.error("Erreur modification:", err);
            setAlertObj({ type: "error", show: true, text: "Erreur lors de la modification." });
        }
    };

    const supprimerCollaborateur = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!peutGererCollaborateurs) return;
        try {
            await PageProfilController(pays ?? "").supprimerCollaborateur(collaborateur.id ?? "", effectiveTabId);
            const tid = selectedTypeId;
            const data = await PageProfilController(pays ?? "").listerCollaborateursByType(tid, effectiveTabId, 100);
            setCollaborateursByType((p) => ({ ...p, [tid]: Array.isArray(data) ? data : [] }));
            setCollaborateur(emptyCollaborateur);
            setShowModalCollaborateur(false);
            setAlertObj({ type: "success", show: true, text: "Collaborateur supprimé" });
        } catch (err) {
            console.error("Erreur suppression:", err);
            setAlertObj({ type: "error", show: true, text: "Erreur lors de la suppression." });
        }
    };

    const creerNouveauType = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!peutGererCollaborateurs) {
            setAlertObj({
                type: "warning",
                show: true,
                text: "La création de types est réservée au droit « gérer les collaborateurs » (col02).",
            });
            return;
        }
        if (!nomNouveauType.trim()) {
            setAlertObj({ type: "error", show: true, text: "Le nom est obligatoire." });
            return;
        }
        if (nomNouveauType.trim().toLowerCase() === "docteur") {
            setAlertObj({ type: "error", show: true, text: "Le nom 'Docteur' est réservé." });
            return;
        }
        try {
            const rolesStr = encodePrivileges(rolesNouveauType);
            await PageProfilController(pays ?? "").creerTypeCollaborateur(
                { nom: nomNouveauType.trim(), rolesParDefaut: rolesStr },
                effectiveTabId
            );
            const data = await PageProfilController(pays ?? "").listerTypesCollaborateur(effectiveTabId);
            setTypesCollaborateurs(Array.isArray(data) ? data : []);
            setNomNouveauType("");
            setRolesNouveauType([]);
            setShowModalNouveauType(false);
            setAlertObj({ type: "success", show: true, text: "Type créé." });
        } catch (err) {
            console.error("Erreur création type:", err);
            setAlertObj({ type: "error", show: true, text: "Erreur lors de la création." });
        }
    };

    const modifierProfil = async (e?: React.FormEvent | React.MouseEvent<HTMLButtonElement>) => {
        e?.preventDefault();
        if (isCollaborateurProfil) {
            if (!checkPrivilege("prf02", privs)) {
                setAlertObj({
                    type: "warning",
                    show: true,
                    text: "Vous n'avez pas les droits nécessaires pour modifier ce profil (prf02).",
                });
                return;
            }
            const passwordToSend = (newPassword && isTheGoodpwd) ? newPassword : undefined;
            const ctrl = PageProfilController(pays ?? "");
            if (collaborateurProfilType === "assistant") {
                await ctrl.modifierAssistant({ ...theCollaborateurProfil, tabId: effectiveTabId, pays: pays ?? "", ...(passwordToSend !== undefined && { password: passwordToSend }) });
            } else if (collaborateurProfilType === "comptable") {
                await ctrl.modifierComptable({ ...theCollaborateurProfil, tabId: effectiveTabId, pays: pays ?? "", ...(passwordToSend !== undefined && { password: passwordToSend }) });
            } else if (collaborateurProfilType === "secretaire") {
                await ctrl.modifierSecretaire({ ...theCollaborateurProfil, tabId: effectiveTabId, pays: pays ?? "", ...(passwordToSend !== undefined && { password: passwordToSend }) });
            } else {
                await ctrl.modifierCollaborateur({ ...theCollaborateurProfil, tabId: effectiveTabId, pays: pays ?? "", ...(passwordToSend !== undefined && { password: passwordToSend }) });
            }
            await creerTrace('update', collaborateurProfilType, `${theCollaborateurProfil.nom} ${theCollaborateurProfil.prenom}`, userId ?? "", userId ?? "", `${theCollaborateurProfil.nom} ${theCollaborateurProfil.prenom}`, collaborateurProfilType, tabId ?? "", tabId ?? "", pays ?? "", `Téléphone: ${theCollaborateurProfil.telephone} - Email: ${theCollaborateurProfil.login}`);
            setAlertObj({ type: "success", show: true, text: "Votre profil a été modifié" });
            return;
        }
        const canSaveIdentity = isAdminMode || checkPrivilege("prf02", privs);
        const canSaveCabinet = tabId === userId && peutModifierCabinet;
        if (!canSaveIdentity && !canSaveCabinet) {
            setAlertObj({
                type: "warning",
                show: true,
                text: "Aucun droit d’enregistrement : « modifier le profil » (prf02) et/ou « gérer le cabinet » (cab01) sur votre fiche.",
            });
            return;
        }

        if (canSaveIdentity && newPassword && !isTheGoodpwd) {
            setAlertObj({ type: "error", show: true, text: "Veuillez d'abord saisir votre mot de passe actuel pour modifier le mot de passe." });
            return;
        }

        const passwordToSend = (canSaveIdentity && newPassword && isTheGoodpwd) ? newPassword : undefined;
        const docteurPayload = { ...theDocteur, tabId: effectiveTabId, ...(passwordToSend !== undefined && { password: passwordToSend }) };
        const cabinetPayload = { ...theCabinet, pays: value, tabId: effectiveTabId };
        await PageProfilController(pays ?? "").modifierDocteur({ docteur: docteurPayload, cabinet: cabinetPayload });
        
        await creerTrace(
            'update',
            'docteur',
            `${theDocteur.nom} ${theDocteur.prenom}`,
            userId ?? "",
            userId ?? "",
            `${theDocteur.nom} ${theDocteur.prenom}`,
            "docteur",
            tabId ?? "",
            tabId ?? "",
            pays ?? "",
            `Cabinet: ${theCabinet.nom} - Téléphone: ${theDocteur.telephone} - Email: ${theDocteur.login}`
        );
        
        setAlertObj({ type: "success", show: true, text: "Votre profil a été modifié" });
    };

    const chargerSecretaire = async (secretaire: Secretaire) => {
        setSecretaire({ ...secretaire });
        setPrivilege((await PageProfilController(pays ?? "").trouverPrivilege(secretaire.id ?? "", effectiveTabId)) ?? emptyPrivilege);
        setCasSecretaire('updateDelect');
        setShowModalSecretaire(true);
    };

    const chargerAssistant = async (assistant: Assistant) => {
        setAssistant({ ...assistant });
        setPrivilege((await PageProfilController(pays ?? "").trouverPrivilege(assistant.id ?? "", effectiveTabId)) ?? emptyPrivilege);
        setCasAssistant('updateDelect');
        setShowModalAssistant(true);
    };

    const chargerComptable = async (comptable: Comptable) => {
        setComptable({ ...comptable });
        setPrivilege((await PageProfilController(pays ?? "").trouverPrivilege(comptable.id ?? "", effectiveTabId)) ?? emptyPrivilege);
        setCasComptable('updateDelect');
        setShowModalComptable(true);
    };

    const gestionCrudButton = (etape = "ajouter") => {
        if (etape === "ajouter") {
            return { add: "block", update: "none", delete: "none" };
        } else {
            return { add: "none", update: "block", delete: "block" };
        }
    };


    return (
        <>
            <NavTop userId={userId ?? "0"} id={"nav-top"} tabId={tabId ?? "main"} patientId={"0"} pays={pays ?? ""} />

            {accesProfilRefuse ? (
                <div
                    id="navTopConf"
                    className="container py-5"
                    style={{
                        backgroundColor: themes[themeNumber].primary,
                        color: themes[themeNumber].secondary,
                        minHeight: "calc(100vh - 80px)",
                    }}
                >
                    <div
                        className="alert alert-warning shadow-sm"
                        style={{ maxWidth: 640, margin: "0 auto", fontSize: 16, lineHeight: 1.5 }}
                    >
                        <strong>Accès à la page Profil refusé.</strong>
                        <p className="mb-0 mt-2">
                            Aucun des droits requis pour ce module n’est activé : voir ou modifier le profil personnel
                            (prf01, prf02), voir ou gérer les collaborateurs (col01, col02), ou gérer le cabinet (cab01).
                            Demandez au gestionnaire du cabinet d’ajuster vos cases dans les privilèges.
                        </p>
                    </div>
                </div>
            ) : (
            <div className="row page-profil" style={{ backgroundColor: themes[themeNumber].primary, color: themes[themeNumber].secondary, height: 'calc(100vh - 80px)', overflow: 'hidden', margin: 0 }}>
                {!estSadminProfil && (
                <div className="col-xl-3 shadow-lg-left px-4 py-3" style={{ height: '100%', overflowY: 'auto' }}>
                    <div className="row">
                        <ModalQRCode id={isCollaborateurProfil ? (theCollaborateurProfil?.id ?? "") : (theDocteur?.id ?? "")} tabId={effectiveTabId} privs={privs} pays={pays ?? ""} role={isCollaborateurProfil ? (collaborateurProfilType === "collaborateur" ? "collaborateur" : collaborateurProfilType) : "docteur"} collaborateurTypeNom={isCollaborateurProfil && collaborateurProfilType === "collaborateur" ? (typesCollaborateurs.find((t) => t.id === theCollaborateurProfil?.typeId)?.nom ?? "collaborateur") : undefined} />
                        <ProfilePhoto privilege={privilege ?? emptyPrivilege} classObj={isCollaborateurProfil ? theCollaborateurProfil : theDocteur} privs={privs} pays={pays ?? ""} userId={userId ?? ""} tabId={effectiveTabId} isOwnProfile isCabinetOwner={tabId === userId} />
                    </div>


                </div>
                )}
                <div className={estSadminProfil ? "col-xl-12 px-4 py-3" : "col-xl-9 px-4 py-3"} style={{ height: '100%', overflowY: 'auto' }}>
                    <Accordion defaultActiveKey={defaultAccordionProfilKey} id="accordionExample">
                        {!estSadminProfil && (
                        <Accordion.Item eventKey="profil" style={{ backgroundColor: themes[themeNumber].primary, color: themes[themeNumber].secondary }}>
                            <Accordion.Header className="big-text" style={{ backgroundColor: themes[themeNumber].secondary, color: themes[themeNumber].primary, fontWeight: "bold" }}>
                                Mon Profil
                            </Accordion.Header>
                            <Accordion.Body style={{ backgroundColor: themes[themeNumber].primary, color: themes[themeNumber].secondary }}>
                                    {isLoadingDocteur ? (
                                        <div style={{ padding: "20px", textAlign: "center" }}>Chargement du profil...</div>
                                    ) : (
                                    <form>
                                        {canAccessProfilModule(privs) && !checkPrivilege("prf02", privs) && !isAdminMode && (
                                            <div className="alert alert-info mb-3" style={{ fontSize: 14, lineHeight: 1.45 }}>
                                                <strong>Lecture seule (identité / coordonnées).</strong> Vous accédez au profil via
                                                vos autres droits (ex. col01, cab01) ; pour modifier et enregistrer la fiche
                                                personnelle, le droit « modifier le profil » (prf02) est requis.
                                            </div>
                                        )}
                                        <fieldset
                                            disabled={!peutModifierMonProfil}
                                            style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}
                                        >
                                        <div className="row">
                                            <div className="col-xl-6">
                                                <div className="mb-3">
                                                    <label htmlFor="nom" className="form-label" style={{ color: themes[themeNumber].secondary }}>Nom:</label>
                                                    <Input type="text" className="form-control" id="nom" value={isCollaborateurProfil ? (theCollaborateurProfil?.nom ?? "") : (theDocteur?.nom ?? "")} onChange={(e) => isCollaborateurProfil ? setTheCollaborateurProfil({ ...theCollaborateurProfil, nom: e.target.value.toUpperCase() }) : setTheDocteur({ ...theDocteur, nom: e.target.value.toUpperCase() })} style={{ color: themes[themeNumber].primary, borderColor: themes[themeNumber].secondary }} />
                                                </div>
                                                <div className="mb-3">
                                                    <label htmlFor="prenom" className="form-label" style={{ color: themes[themeNumber].secondary }}>Prenom:</label>
                                                    <Input type="text" className="form-control" id="prenom" value={isCollaborateurProfil ? (theCollaborateurProfil?.prenom ?? "") : (theDocteur?.prenom ?? "")} onChange={(e) => isCollaborateurProfil ? setTheCollaborateurProfil({ ...theCollaborateurProfil, prenom: upperLow(e.target.value) }) : setTheDocteur({ ...theDocteur, prenom: upperLow(e.target.value) })} style={{ color: themes[themeNumber].primary, borderColor: themes[themeNumber].secondary }} />
                                                </div>
                                                <div className="mb-3">
                                                    <label htmlFor="email" className="form-label" style={{ color: themes[themeNumber].secondary }}>Email:</label>
                                                    <Input type="email" className="form-control" id="email" value={isCollaborateurProfil ? (theCollaborateurProfil?.login ?? "") : (theDocteur?.login ?? "")} onChange={(e) => isCollaborateurProfil ? setTheCollaborateurProfil({ ...theCollaborateurProfil, login: e.target.value }) : setTheDocteur({ ...theDocteur, login: e.target.value })} style={{ color: themes[themeNumber].primary, borderColor: themes[themeNumber].secondary }} />
                                                </div>
                                                {!isCollaborateurProfil && (
                                                <div className="mb-3">
                                                    <label htmlFor="password" className="form-label" style={{ color: themes[themeNumber].secondary }}>Mot de Passe:</label>
                                                    <div className="row">
                                                        <div className="col col-xl-5">
                                                            <Input type="password" placeholder={'actuel mot de passe'} className="form-control" id="email" value={actualPassword} onChange={(e) => setActualPassword(e.target.value)} style={{ color: themes[themeNumber].primary, borderColor: themes[themeNumber].secondary }} />
                                                        </div>
                                                        {isTheGoodpwd && (
                                                            <>
                                                                <div className="col col-xl-2">
                                                                    <center><p>{"=>"}</p></center>
                                                                </div>

                                                                <div className="col col-xl-5">
                                                                    <Input type="password" placeholder={'nouveau mot de passe'} className="form-control" id="email" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={{ color: themes[themeNumber].primary, borderColor: themes[themeNumber].secondary }} />
                                                                </div>
                                                            </>
                                                        )}



                                                    </div>
                                                </div>
                                                )}
                                            </div>
                                            <div className="col-xl-6">
                                                <div className="mb-3">
                                                    <label htmlFor="telephone" className="form-label" style={{ color: themes[themeNumber].secondary }}>Telephone:</label>
                                                    <Input type="text" className="form-control" id="telephone" placeholder="+221 …" value={isCollaborateurProfil ? (theCollaborateurProfil?.telephone ?? "") : (theDocteur?.telephone ?? "")} onChange={(e) => isCollaborateurProfil ? phoneOnChangeHandler(e, (v) => setTheCollaborateurProfil({ ...theCollaborateurProfil, telephone: v })) : phoneOnChangeHandler(e, (v) => setTheDocteur({ ...theDocteur, telephone: v }))} style={{ color: themes[themeNumber].primary, borderColor: themes[themeNumber].secondary }} />
                                                </div>
                                                <div className="mb-3">
                                                    <label htmlFor="naissance" className="form-label" style={{ color: themes[themeNumber].secondary }}>Date de Naissance:</label>
                                                    <Input type="date" className="form-control" id="naissance" value={((isCollaborateurProfil ? theCollaborateurProfil?.naissance : theDocteur?.naissance) ?? "") !== "" ? (() => { try { const d = new Date(isCollaborateurProfil ? (theCollaborateurProfil?.naissance ?? "") : (theDocteur?.naissance ?? "")); return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10); } catch { return ""; } })() : ""} onChange={(e) => isCollaborateurProfil ? setTheCollaborateurProfil({ ...theCollaborateurProfil, naissance: e.target.value }) : setTheDocteur({ ...theDocteur, naissance: e.target.value })} style={{ color: themes[themeNumber].primary, borderColor: themes[themeNumber].secondary }} />
                                                </div>

                                                <div className="mb-3">
                                                    <label htmlFor="adresse" className="form-label" style={{ color: themes[themeNumber].secondary }}>Adresse:</label>
                                                    <Input type="text" className="form-control" id="adresse" value={isCollaborateurProfil ? (theCollaborateurProfil?.adresse ?? "") : (theDocteur?.adresse ?? "")} onChange={(e) => isCollaborateurProfil ? setTheCollaborateurProfil({ ...theCollaborateurProfil, adresse: e.target.value }) : setTheDocteur({ ...theDocteur, adresse: e.target.value })} style={{ color: themes[themeNumber].primary, borderColor: themes[themeNumber].secondary }} />
                                                </div>
                                            </div>
                                        </div>
                                        </fieldset>

                                        {tabId === userId && !isCollaborateurProfil ? (
                                            <>
                                                {!peutModifierCabinet && !isAdminMode && (
                                                    <div className="alert alert-info mb-3" style={{ fontSize: 14, lineHeight: 1.45 }}>
                                                        <strong>Cabinet (lecture seule).</strong> Pour modifier le nom, le pays, l’adresse ou le mot de passe par défaut du cabinet, le droit « gérer le cabinet » (cab01) est requis.
                                                    </div>
                                                )}
                                                <fieldset
                                                    disabled={!peutModifierCabinet}
                                                    style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}
                                                >
                                                    <div className="row my-3 p-5" style={{ justifyContent: "center", alignItems: "center" }}>
                                                        <h2>Gestion du Cabinet:</h2>
                                                        <div className="mb-3">
                                                            <label htmlFor="nomCabinet" className="form-label" style={{ color: themes[themeNumber].secondary }}>Nom du cabinet:</label>
                                                            <Input type="text" className="form-control" id="nomCabinet" value={theCabinet?.nom ?? ""} onChange={(e) => setTheCabinet({ ...theCabinet, nom: upperLow(e.target.value) })} style={{ color: themes[themeNumber].primary, borderColor: themes[themeNumber].secondary }} />
                                                        </div>
                                                        <div className="mb-3">
                                                            <label htmlFor="paysCabinet" className="form-label" style={{ color: themes[themeNumber].secondary }}>Pays du cabinet:</label>
                                                            <select className="form-select" id="paysCabinet" value={value ?? ""} onChange={(e) => setValue(e.target.value)} style={{ color: themes[themeNumber].primary, borderColor: themes[themeNumber].secondary }}>
                                                                <option value="">Entrer le pays du cabinet</option>
                                                                {options?.map((option: any) => (
                                                                    <option key={option.value} value={option.value}>
                                                                        {option.label}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                        <div className="mb-3">
                                                            <label htmlFor="adresseCabinetPhysique" className="form-label" style={{ color: themes[themeNumber].secondary }}>L&apos;adresse du cabinet:</label>
                                                            <Input type="text" className="form-control" id="adresseCabinetPhysique" value={theCabinet?.adresse ?? ""} onChange={(e) => setTheCabinet({ ...theCabinet, adresse: e.target.value })} style={{ color: themes[themeNumber].primary, borderColor: themes[themeNumber].secondary }} />
                                                        </div>
                                                        <div className="mb-3">
                                                            <label htmlFor="passwordDefaut" className="form-label" style={{ color: themes[themeNumber].secondary }}>Mot de passe par défaut (assistants, comptables, secrétaires):</label>
                                                            <Input type="password" className="form-control" id="passwordDefaut" placeholder="Si rempli, attribué aux nouveaux utilisateurs. Ils devront le changer à la 1ère connexion." value={theCabinet?.passwordDefaut ?? ""} onChange={(e) => setTheCabinet({ ...theCabinet, passwordDefaut: e.target.value })} style={{ color: themes[themeNumber].primary, borderColor: themes[themeNumber].secondary }} />
                                                        </div>
                                                    </div>
                                                </fieldset>
                                            </>
                                        ) : null}

                                            <center>
                                                {(peutModifierMonProfil || (tabId === userId && peutModifierCabinet && !isCollaborateurProfil)) ? (
                                                    <ButtonModifier onClick={modifierProfil} />
                                                ) : null}
                                            </center>
                                            {tabId === userId && (
                                                <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: `1px solid ${themes[themeNumber].secondary}30` }}>
                                                    <BoutonPayement
                                                        docteur={{ ...theDocteur, id: userId ?? theDocteur.id, role: "docteur" }}
                                                        privileges={privs}
                                                        pays={pays ?? ""}
                                                    />
                                                </div>
                                            )}
                                    </form>
                                    )}
                            </Accordion.Body>
                        </Accordion.Item>
                        )}

                        {isAdminMode && (
                        <Accordion.Item eventKey="adminConfig" style={{ backgroundColor: themes[themeNumber].primary, color: themes[themeNumber].secondary }}>
                            <Accordion.Header className="big-text" style={{ backgroundColor: themes[themeNumber].secondary, color: themes[themeNumber].primary, fontWeight: "bold" }}>
                                Connexion Admin
                            </Accordion.Header>
                            <Accordion.Body style={{ backgroundColor: themes[themeNumber].primary, color: themes[themeNumber].secondary }}>
                                    <p style={{ fontSize: "14px", marginBottom: "15px", opacity: 0.9 }}>
                                        Identifiants utilisés pour la connexion admin (page de connexion). Par défaut : sadmin / 706JJMMAAAA (ex: 70615032025)
                                    </p>
                                    <div className="row mb-3">
                                        <div className="col-md-6">
                                            <label className="form-label" style={{ color: themes[themeNumber].secondary }}>Login admin</label>
                                            <Input
                                                type="text"
                                                className="form-control"
                                                value={adminLogin ?? ""}
                                                onChange={(e) => setAdminLogin(e.target.value)}
                                                style={{ color: themes[themeNumber].primary, borderColor: themes[themeNumber].secondary, backgroundColor: "#fff" }}
                                            />
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label" style={{ color: themes[themeNumber].secondary }}>Mot de passe admin</label>
                                            <Input
                                                type="password"
                                                className="form-control"
                                                value={adminPassword ?? ""}
                                                onChange={(e) => setAdminPassword(e.target.value)}
                                                style={{ color: themes[themeNumber].primary, borderColor: themes[themeNumber].secondary, backgroundColor: "#fff" }}
                                            />
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn"
                                        style={{ backgroundColor: themes[themeNumber].secondary, color: themes[themeNumber].primary }}
                                        onClick={() => {
                                            setAdminConfig({ login: adminLogin, password: adminPassword });
                                            setAlertObj({ type: "success", show: true, text: "Identifiants admin enregistrés." });
                                        }}
                                    >
                                        Enregistrer
                                    </button>
                            </Accordion.Body>
                        </Accordion.Item>
                        )}

                        {mode === "superAdmin" && (
                        <Accordion.Item eventKey="gestionDocteurs" style={{ backgroundColor: themes[themeNumber].primary, color: themes[themeNumber].secondary }}>
                            <Accordion.Header className="big-text" style={{ backgroundColor: themes[themeNumber].secondary, color: themes[themeNumber].primary, fontWeight: "bold" }}>
                                Gestion des docteurs
                            </Accordion.Header>
                            <Accordion.Body style={{ backgroundColor: themes[themeNumber].primary, color: themes[themeNumber].secondary }}>
                                <p style={{ fontSize: "14px", marginBottom: "15px", opacity: 0.9 }}>
                                    Seul le Sadmin peut créer des docteurs. Chaque docteur a son propre cabinet.{" "}
                                    <strong>Cliquez sur une ligne</strong> pour ouvrir la fiche (privilèges, QR dans la fiche) — comme pour les collaborateurs.
                                </p>
                                <button
                                    type="button"
                                    className="btn mb-3"
                                    style={{ backgroundColor: themes[themeNumber].secondary, color: themes[themeNumber].primary }}
                                    onClick={() => { setNewDocteur(emptyDocteur); setNewCabinet({ id: "", adresse: "", pays: "SN", nom: "", limit: 100 }); setShowModalNouveauDocteur(true); }}
                                >
                                    + Créer un docteur
                                </button>
                                {isLoadingDocteurs ? (
                                    <div>Chargement...</div>
                                ) : (
                                <div className="col-12 px-0">
                                    <Tables
                                        tableContent={{
                                            columns: ["#", "Nom et Prénom", "Email", "Téléphone", "Naissance", "Adresse", "Actions"],
                                            data: docteurs.map((d, index) => ({
                                                "#": "00" + (index + 1),
                                                "Nom et Prénom": `Dr. ${d.nom ?? ""} ${d.prenom ?? ""}`.trim(),
                                                "Email": d.login ?? "",
                                                "Téléphone": d.telephone ?? "",
                                                "Naissance": d.naissance ? format(new Date(d.naissance), "dd MMMM yyyy", { locale: fr }) : "Non renseigné",
                                                "Adresse": d.adresse ?? "",
                                                "Actions": (
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm"
                                                        style={{ backgroundColor: themes[themeNumber].secondary, color: themes[themeNumber].primary }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            void resetPasswordDocteur(d.id ?? "");
                                                        }}
                                                    >
                                                        Réinit. MDP
                                                    </button>
                                                ),
                                            })),
                                        }}
                                        reverseColors={true}
                                        onRowClick={(rowData) => {
                                            const idx = Math.max(0, parseInt(String(rowData["#"]), 10) - 1);
                                            const d = docteurs[idx];
                                            if (d) void ouvrirEditionDocteurSadmin(d);
                                        }}
                                        setLimit={() => {}}
                                        exportFileName="liste_docteurs"
                                        privs={privs}
                                        isDocteur={true}
                                    />
                                    {docteurs.length === 0 && <div style={{ opacity: 0.85, marginTop: 12 }}>Aucun docteur</div>}
                                </div>
                                )}
                            </Accordion.Body>
                        </Accordion.Item>
                        )}

                        {tabId === userId && peutVoirCollaborateurs ?
                            <>
                                {typesCollaborateurs.map((t) => (
                                    <Accordion.Item key={t.id} eventKey={`type-${t.id}`}>
                                        <Accordion.Header className="big-text">
                                            {t.nom ?? "Collaborateurs"}
                                        </Accordion.Header>
                                        <Accordion.Body style={{ backgroundColor: themes[themeNumber].primary, color: themes[themeNumber].secondary }}>
                                            <div className="row">
                                                <div className="col-12 mb-3" style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
                                                    {peutGererCollaborateurs ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setCollaborateur(emptyCollaborateur);
                                                            setSelectedTypeId(t.id ?? "");
                                                            setCasCollaborateur("ajouter");
                                                            setShowModalCollaborateur(true);
                                                        }}
                                                        style={{
                                                            backgroundColor: themes[themeNumber].secondary,
                                                            color: themes[themeNumber].primary,
                                                            border: "none",
                                                            borderRadius: "8px",
                                                            padding: "10px 20px",
                                                            cursor: "pointer",
                                                            fontWeight: "bold"
                                                        }}
                                                    >
                                                        + Ajouter un {t.nom?.toLowerCase() ?? "collaborateur"}
                                                    </button>
                                                    ) : null}
                                                    <button
                                                        type="button"
                                                        onClick={() => setModalRolesDefautType(t)}
                                                        style={{
                                                            backgroundColor: themes[themeNumber].primary,
                                                            color: themes[themeNumber].secondary,
                                                            border: `2px solid ${themes[themeNumber].secondary}`,
                                                            borderRadius: "8px",
                                                            padding: "10px 20px",
                                                            cursor: "pointer" ,
                                                            fontWeight: 600,
                                                        }}
                                                    >
                                                        Voir les privilèges par défaut des {t.nom ? `« ${t.nom} »` : "ce type de collaborateur"}
                                                    </button>
                                                </div>
                                                <div className="col-12">
                                                    <Tables
                                                        tableContent={{
                                                            columns: ["#", "Nom et Prénom", "Email", "Téléphone", "Naissance", "Adresse", "QR Code"],
                                                            data: (collaborateursByType[t.id ?? ""] ?? []).map((c, index) => ({
                                                                "#": "00" + (index + 1),
                                                                "QR Code": (
                                                                    <span onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex" }}>
                                                                        <ModalQRCode
                                                                            id={c.id ?? ""}
                                                                            tabId={effectiveTabId}
                                                                            privs={privs}
                                                                            pays={pays ?? ""}
                                                                            role="collaborateur"
                                                                            collaborateurTypeNom={t.nom ?? "collaborateur"}
                                                                        />
                                                                    </span>
                                                                ),
                                                                "Nom et Prénom": `${c.nom ?? ""} ${c.prenom ?? ""}`,
                                                                "Email": c.login ?? "",
                                                                "Téléphone": c.telephone ?? "",
                                                                "Naissance": c.naissance ? format(new Date(c.naissance), "dd MMMM yyyy", { locale: fr }) : "Non renseigné",
                                                                "Adresse": c.adresse ?? "",
                                                            }))
                                                        }}
                                                        reverseColors={true}
                                                        onRowClick={(rowData) => {
                                                            if (!peutGererCollaborateurs) return;
                                                            const idx = Math.max(0, parseInt(String(rowData["#"]), 10) - 1);
                                                            const list = collaborateursByType[t.id ?? ""] ?? [];
                                                            if (list[idx]) void chargerCollaborateur(list[idx], t.id ?? "");
                                                        }}
                                                        setLimit={() => {}}
                                                        exportFileName={`collaborateurs_${t.nom ?? "liste"}`}
                                                        privs={privs}
                                                        isDocteur={tabId === userId}
                                                    />
                                                </div>
                                            </div>
                                        </Accordion.Body>
                                    </Accordion.Item>
                                ))}
                                {peutGererCollaborateurs ? (
                                <Accordion.Item eventKey="nouveau-type">
                                    <Accordion.Header className="big-text">
                                        Créer un nouveau type de collaborateur
                                    </Accordion.Header>
                                    <Accordion.Body style={{ backgroundColor: themes[themeNumber].primary, color: themes[themeNumber].secondary }}>
                                        <button
                                            onClick={() => setShowModalNouveauType(true)}
                                            style={{
                                                width: "100%",
                                                backgroundColor: themes[themeNumber].secondary,
                                                color: themes[themeNumber].primary,
                                                border: "none",
                                                borderRadius: "8px",
                                                padding: "14px 20px",
                                                cursor: "pointer",
                                                fontWeight: "bold",
                                                fontSize: "16px"
                                            }}
                                        >
                                            + Créer un nouveau type de collaborateur
                                        </button>
                                    </Accordion.Body>
                                </Accordion.Item>
                                ) : null}
                            </> : null}
                    </Accordion>
                </div>
            </div>
            )}

            {/* Modal pour Assistant */}
            {showModalAssistant && (
                <Modal
                    show={showModalAssistant}
                    onClose={() => {
                        setShowModalAssistant(false);
                        setAssistant(emptyAssistant);
                        setCasAssistant("ajouter");
                    }}
                    title={casAssistant === "ajouter" ? "Ajouter un assistant" : "Modifier/Supprimer un assistant"}
                    maxWidth="700px"
                >
                    <ModalSection>
                        {casAssistant === "updateDelect" && (
                            <div style={{ 
                                marginBottom: "30px", 
                                paddingBottom: "25px", 
                                borderBottom: `1px solid ${themes[themeNumber].secondary}20`
                            }}>
                                <div style={{ 
                                    display: "flex", 
                                    flexDirection: "column",
                                    gap: "25px",
                                    width: "100%"
                                }}>
                                    <div style={{ 
                                        width: "100%", 
                                        display: "flex", 
                                        justifyContent: "center",
                                        alignItems: "flex-start"
                                    }}>
                                        <div style={{ 
                                            width: "100%", 
                                            maxWidth: "600px"
                                        }}>
                                            <style>{modalPrivilegesCss}</style>
                                            <div className="modal-privileges-container">
                                                <ProfilePhoto privilege={privilege} classObj={assistant} privs={privs} pays={pays ?? ""} userId={userId ?? ""} tabId={effectiveTabId} isCabinetOwner={tabId === userId} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        <ModalGrid columns={2}>
                            <ModalField
                                id="assistantNom"
                                label="Nom"
                                value={assistant?.nom?.toUpperCase() || ""}
                                onChange={(e) => setAssistant({ ...assistant, nom: e.target.value.toUpperCase() })}
                                style={{ borderColor: themes[themeNumber].primary }}
                            />
                            <ModalField
                                id="assistantPrenom"
                                label="Prénom"
                                value={upperLow(assistant?.prenom) || ""}
                                onChange={(e) => setAssistant({ ...assistant, prenom: upperLow(e.target.value) })}
                                style={{ borderColor: themes[themeNumber].primary }}
                            />
                            <ModalField
                                id="assistantEmail"
                                label="Email"
                                type="email"
                                value={assistant?.login || ""}
                                onChange={(e) => setAssistant({ ...assistant, login: e.target.value })}
                                style={{ borderColor: themes[themeNumber].primary }}
                            />
                            <ModalField
                                id="assistantTelephone"
                                label="Téléphone"
                                value={assistant?.telephone || ""}
                                onChange={(e) => phoneOnChangeHandler(e, (v) => setAssistant({ ...assistant, telephone: v }))}
                                style={{ borderColor: themes[themeNumber].primary }}
                            />
                            <ModalField
                                id="assistantNaissance"
                                label="Date de Naissance"
                                type="date"
                                value={assistant?.naissance && assistant.naissance !== '' ? (() => { try { const d = new Date(assistant.naissance); return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10); } catch { return ""; } })() : ""}
                                onChange={(e) => setAssistant({ ...assistant, naissance: e.target.value })}
                                style={{ borderColor: themes[themeNumber].primary }}
                            />
                            <ModalField
                                id="assistantAdresse"
                                label="Adresse"
                                value={assistant?.adresse || ""}
                                onChange={(e) => setAssistant({ ...assistant, adresse: e.target.value })}
                                style={{ borderColor: themes[themeNumber].primary }}
                            />
                        </ModalGrid>
                        <ModalActions>
                            {casAssistant === "updateDelect" ? (
                                <>
                                    <ButtonModifier onClick={modifierAssistant} />
                                    <ButtonSupprimer onClick={supprimerAssistant} />
                                </>
                            ) : (
                                <ButtonAjouter onClick={addAssistant} />
                            )}
                        </ModalActions>
                    </ModalSection>
                </Modal>
            )}

            {/* QR Code indépendant pour Assistant */}
            {casAssistant === "updateDelect" && assistant?.id && (
                <ModalQRCode id={assistant.id} tabId={tabId} privs={privs} pays={pays} role="assistant" />
            )}

            {/* Modal pour Comptable */}
            {showModalComptable && (
                <Modal
                    show={showModalComptable}
                    onClose={() => {
                        setShowModalComptable(false);
                        setComptable(emptyComptable);
                        setCasComptable("ajouter");
                    }}
                    title={casComptable === "ajouter" ? "Ajouter un comptable" : "Modifier/Supprimer un comptable"}
                    maxWidth="700px"
                >
                    <ModalSection>
                        {casComptable === "updateDelect" && (
                            <div style={{ 
                                marginBottom: "30px", 
                                paddingBottom: "25px", 
                                borderBottom: `1px solid ${themes[themeNumber].secondary}20`
                            }}>
                                <div style={{ 
                                    display: "flex", 
                                    flexDirection: "column",
                                    gap: "25px",
                                    width: "100%"
                                }}>
                                    <div style={{ 
                                        width: "100%", 
                                        display: "flex", 
                                        justifyContent: "center",
                                        alignItems: "flex-start"
                                    }}>
                                        <div style={{ 
                                            width: "100%", 
                                            maxWidth: "600px"
                                        }}>
                                            <style>{modalPrivilegesCss}</style>
                                            <div className="modal-privileges-container">
                                                <ProfilePhoto privilege={privilege} classObj={comptable} privs={privs} pays={pays ?? ""} userId={userId ?? ""} tabId={effectiveTabId} isCabinetOwner={tabId === userId} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        <ModalGrid columns={2}>
                            <ModalField
                                id="comptableNom"
                                label="Nom"
                                value={comptable?.nom?.toUpperCase() || ""}
                                onChange={(e) => setComptable({ ...comptable, nom: e.target.value.toUpperCase() })}
                                style={{ borderColor: themes[themeNumber].primary }}
                            />
                            <ModalField
                                id="comptablePrenom"
                                label="Prénom"
                                value={upperLow(comptable?.prenom) || ""}
                                onChange={(e) => setComptable({ ...comptable, prenom: upperLow(e.target.value) })}
                                style={{ borderColor: themes[themeNumber].primary }}
                            />
                            <ModalField
                                id="comptableEmail"
                                label="Email"
                                type="email"
                                value={comptable?.login || ""}
                                onChange={(e) => setComptable({ ...comptable, login: e.target.value })}
                                style={{ borderColor: themes[themeNumber].primary }}
                            />
                            <ModalField
                                id="comptableTelephone"
                                label="Téléphone"
                                value={comptable?.telephone || ""}
                                onChange={(e) => phoneOnChangeHandler(e, (v) => setComptable({ ...comptable, telephone: v }))}
                                style={{ borderColor: themes[themeNumber].primary }}
                            />
                            <ModalField
                                id="comptableNaissance"
                                label="Date de Naissance"
                                type="date"
                                value={comptable?.naissance && comptable.naissance !== '' ? (() => { try { const d = new Date(comptable.naissance); return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10); } catch { return ""; } })() : ""}
                                onChange={(e) => setComptable({ ...comptable, naissance: e.target.value })}
                                style={{ borderColor: themes[themeNumber].primary }}
                            />
                            <ModalField
                                id="comptableAdresse"
                                label="Adresse"
                                value={comptable?.adresse || ""}
                                onChange={(e) => setComptable({ ...comptable, adresse: e.target.value })}
                                style={{ borderColor: themes[themeNumber].primary }}
                            />
                        </ModalGrid>
                        <ModalActions>
                            {casComptable === "updateDelect" ? (
                                <>
                                    <ButtonModifier onClick={modifierComptable} />
                                    <ButtonSupprimer onClick={supprimerComptable} />
                                </>
                            ) : (
                                <ButtonAjouter onClick={addComptable} />
                            )}
                        </ModalActions>
                    </ModalSection>
                </Modal>
            )}

            {/* QR Code indépendant pour Comptable */}
            {casComptable === "updateDelect" && comptable?.id && (
                <ModalQRCode id={comptable.id} tabId={tabId} privs={privs} pays={pays} role="comptable" />
            )}

            {/* Modal pour Secrétaire */}
            {showModalSecretaire && (
                <Modal
                    show={showModalSecretaire}
                    onClose={() => {
                        setShowModalSecretaire(false);
                        setSecretaire(emptySecretaire);
                        setCasSecretaire("ajouter");
                    }}
                    title={casSecretaire === "ajouter" ? "Ajouter un secrétaire" : "Modifier/Supprimer un secrétaire"}
                    maxWidth="700px"
                >
                    <ModalSection>
                        {casSecretaire === "updateDelect" && (
                            <div style={{ 
                                marginBottom: "30px", 
                                paddingBottom: "25px", 
                                borderBottom: `1px solid ${themes[themeNumber].secondary}20`
                            }}>
                                <div style={{ 
                                    display: "flex", 
                                    flexDirection: "column",
                                    gap: "25px",
                                    width: "100%"
                                }}>
                                    <div style={{ 
                                        width: "100%", 
                                        display: "flex", 
                                        justifyContent: "center",
                                        alignItems: "flex-start"
                                    }}>
                                        <div style={{ 
                                            width: "100%", 
                                            maxWidth: "600px"
                                        }}>
                                            <style>{modalPrivilegesCss}</style>
                                            <div className="modal-privileges-container">
                                                <ProfilePhoto privilege={privilege} classObj={secretaire} privs={privs} pays={pays ?? ""} userId={userId ?? ""} tabId={effectiveTabId} isCabinetOwner={tabId === userId} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        <ModalGrid columns={2}>
                            <ModalField
                                id="secretaireNom"
                                label="Nom"
                                value={secretaire?.nom?.toUpperCase() || ""}
                                onChange={(e) => setSecretaire({ ...secretaire, nom: e.target.value.toUpperCase() })}
                                style={{ borderColor: themes[themeNumber].primary }}
                            />
                            <ModalField
                                id="secretairePrenom"
                                label="Prénom"
                                value={upperLow(secretaire?.prenom) || ""}
                                onChange={(e) => setSecretaire({ ...secretaire, prenom: upperLow(e.target.value) })}
                                style={{ borderColor: themes[themeNumber].primary }}
                            />
                            <ModalField
                                id="secretaireEmail"
                                label="Email"
                                type="email"
                                value={secretaire?.login || ""}
                                onChange={(e) => setSecretaire({ ...secretaire, login: e.target.value })}
                                style={{ borderColor: themes[themeNumber].primary }}
                            />
                            <ModalField
                                id="secretaireTelephone"
                                label="Téléphone"
                                value={secretaire?.telephone || ""}
                                onChange={(e) => phoneOnChangeHandler(e, (v) => setSecretaire({ ...secretaire, telephone: v }))}
                                style={{ borderColor: themes[themeNumber].primary }}
                            />
                            <ModalField
                                id="secretaireNaissance"
                                label="Date de Naissance"
                                type="date"
                                value={secretaire?.naissance && secretaire.naissance !== '' ? (() => { try { const d = new Date(secretaire.naissance); return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10); } catch { return ""; } })() : ""}
                                onChange={(e) => setSecretaire({ ...secretaire, naissance: e.target.value })}
                                style={{ borderColor: themes[themeNumber].primary }}
                            />
                            <ModalField
                                id="secretaireAdresse"
                                label="Adresse"
                                value={secretaire?.adresse || ""}
                                onChange={(e) => setSecretaire({ ...secretaire, adresse: e.target.value })}
                                style={{ borderColor: themes[themeNumber].primary }}
                            />
                        </ModalGrid>
                        <ModalActions>
                            {casSecretaire === "updateDelect" ? (
                                <>
                                    <ButtonModifier onClick={modifierSecretaire} />
                                    <ButtonSupprimer onClick={supprimerSecretaire} />
                                </>
                            ) : (
                                <ButtonAjouter onClick={addSecretaire} />
                            )}
                        </ModalActions>
                    </ModalSection>
                </Modal>
            )}

            {/* QR Code indépendant pour Secrétaire */}
            {casSecretaire === "updateDelect" && secretaire?.id && (
                <ModalQRCode id={secretaire.id} tabId={tabId} privs={privs} pays={pays} role="secretaire" />
            )}

            {/* Modal privilèges par défaut du type de collaborateur (accordéon) */}
            <Modal
                show={modalRolesDefautType !== null}
                onClose={() => setModalRolesDefautType(null)}
                title={
                    modalRolesDefautType
                        ? `Privilèges par défaut — ${modalRolesDefautType.nom ?? "type collaborateur"}`
                        : ""
                }
                maxWidth="720px"
            >
                {modalRolesDefautType ? (
                    <TypeCollaborateurPrivilegesDefautModalContent
                        typeCollab={modalRolesDefautType}
                        pays={pays ?? ""}
                        effectiveTabId={effectiveTabId}
                        themeNumber={themeNumber}
                        canEdit={peutGererCollaborateurs}
                        setAlertObj={setAlertObj}
                        onRequestClose={() => setModalRolesDefautType(null)}
                        onRolesSaved={async (typeId) => {
                            const data = await PageProfilController(pays ?? "").listerTypesCollaborateur(effectiveTabId);
                            const list = Array.isArray(data) ? data : [];
                            setTypesCollaborateurs(list);
                            const updated = list.find((x) => x.id === typeId);
                            if (updated) setModalRolesDefautType(updated);
                        }}
                    />
                ) : null}
            </Modal>

            {/* Sadmin : fiche docteur (même principe que collaborateur — privilèges + QR) */}
            {showModalDocteurSadmin && docteurSadminEdition?.id && (
                <Modal
                    show={showModalDocteurSadmin}
                    onClose={() => {
                        setShowModalDocteurSadmin(false);
                        setDocteurSadminEdition(emptyDocteur);
                        setPrivilegeDocteurSadmin(emptyPrivilege);
                    }}
                    title={`Docteur — ${(docteurSadminEdition.nom ?? "").trim()} ${(docteurSadminEdition.prenom ?? "").trim()}`.trim() || "Fiche docteur"}
                    maxWidth="700px"
                >
                    <ModalSection>
                        <div
                            style={{
                                marginBottom: "24px",
                                paddingBottom: "20px",
                                borderBottom: `1px solid ${themes[themeNumber].secondary}20`,
                            }}
                        >
                            <ModalQRCode
                                id={docteurSadminEdition.id}
                                tabId={docteurSadminEdition.id ?? ""}
                                privs={privs}
                                pays={pays ?? ""}
                                role="docteur"
                            />
                        </div>
                        <style>{modalPrivilegesCss}</style>
                        <div className="modal-privileges-container">
                            <ProfilePhoto
                                key={docteurSadminEdition.id ?? "sadmin-doc"}
                                privilege={privilegeDocteurSadmin}
                                classObj={docteurSadminEdition}
                                privs={privs}
                                pays={pays ?? ""}
                                userId={userId ?? ""}
                                tabId={docteurSadminEdition.id ?? ""}
                                isCabinetOwner={false}
                            />
                        </div>
                        <ModalActions>
                            <button
                                type="button"
                                className="btn btn-sm"
                                style={{
                                    backgroundColor: themes[themeNumber].secondary,
                                    color: themes[themeNumber].primary,
                                    marginRight: 8,
                                }}
                                onClick={() => void resetPasswordDocteur(docteurSadminEdition.id ?? "")}
                            >
                                Réinitialiser le mot de passe (1234)
                            </button>
                            <button
                                type="button"
                                className="btn btn-sm"
                                style={{
                                    backgroundColor: themes[themeNumber].primary,
                                    color: themes[themeNumber].secondary,
                                    border: `1px solid ${themes[themeNumber].secondary}`,
                                }}
                                onClick={() => {
                                    setShowModalDocteurSadmin(false);
                                    setDocteurSadminEdition(emptyDocteur);
                                    setPrivilegeDocteurSadmin(emptyPrivilege);
                                }}
                            >
                                Fermer
                            </button>
                        </ModalActions>
                    </ModalSection>
                </Modal>
            )}

            {/* Modal pour Collaborateur */}
            {showModalCollaborateur && (
                <Modal
                    show={showModalCollaborateur}
                    onClose={() => {
                        setShowModalCollaborateur(false);
                        setCollaborateur(emptyCollaborateur);
                        setCasCollaborateur("ajouter");
                    }}
                    title={casCollaborateur === "ajouter"
                        ? `Ajouter un ${typesCollaborateurs.find((t) => t.id === selectedTypeId)?.nom?.toLowerCase() ?? "collaborateur"}`
                        : `Modifier/Supprimer un collaborateur`}
                    maxWidth="700px"
                >
                    <form onSubmit={(e) => casCollaborateur === "ajouter" ? addCollaborateur(e) : modifierCollaborateur(e)}>
                        <ModalSection>
                            {casCollaborateur === "updateDelect" && (
                                <div style={{ marginBottom: "30px", paddingBottom: "25px", borderBottom: `1px solid ${themes[themeNumber].secondary}20` }}>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "25px", width: "100%" }}>
                                        <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
                                            <div style={{ width: "100%", maxWidth: "600px" }}>
                                                <style>{modalPrivilegesCss}</style>
                                                <div className="modal-privileges-container">
                                                    <ProfilePhoto privilege={privilege} classObj={collaborateur} privs={privs} pays={pays ?? ""} userId={userId ?? ""} tabId={effectiveTabId} isCabinetOwner={tabId === userId} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <ModalGrid columns={2}>
                                <ModalField
                                    id="collabNom"
                                    label="Nom"
                                    value={collaborateur?.nom?.toUpperCase() ?? ""}
                                    onChange={(e) => setCollaborateur({ ...collaborateur, nom: e.target.value.toUpperCase() })}
                                    style={{ borderColor: themes[themeNumber].primary }}
                                />
                                <ModalField
                                    id="collabPrenom"
                                    label="Prénom"
                                    value={upperLow(collaborateur?.prenom ?? "") ?? ""}
                                    onChange={(e) => setCollaborateur({ ...collaborateur, prenom: upperLow(e.target.value) })}
                                    style={{ borderColor: themes[themeNumber].primary }}
                                />
                                <ModalField
                                    id="collabEmail"
                                    label="Email"
                                    type="email"
                                    value={collaborateur?.login ?? ""}
                                    onChange={(e) => setCollaborateur({ ...collaborateur, login: e.target.value })}
                                    style={{ borderColor: themes[themeNumber].primary }}
                                />
                                <ModalField
                                    id="collabTelephone"
                                    label="Téléphone"
                                    value={collaborateur?.telephone ?? ""}
                                    onChange={(e) => phoneOnChangeHandler(e, (v) => setCollaborateur({ ...collaborateur, telephone: v }))}
                                    style={{ borderColor: themes[themeNumber].primary }}
                                />
                                <ModalField
                                    id="collabNaissance"
                                    label="Date de Naissance"
                                    type="date"
                                    value={collaborateur?.naissance && collaborateur.naissance !== "" ? (() => { try { const d = new Date(collaborateur.naissance); return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10); } catch { return ""; } })() : ""}
                                    onChange={(e) => setCollaborateur({ ...collaborateur, naissance: e.target.value })}
                                    style={{ borderColor: themes[themeNumber].primary }}
                                />
                                <ModalField
                                    id="collabAdresse"
                                    label="Adresse"
                                    value={collaborateur?.adresse ?? ""}
                                    onChange={(e) => setCollaborateur({ ...collaborateur, adresse: e.target.value })}
                                    style={{ borderColor: themes[themeNumber].primary }}
                                />
                                {casCollaborateur === "ajouter" && (
                                    <ModalField
                                        id="collabPassword"
                                        label="Mot de passe (optionnel)"
                                        type="password"
                                        value={collaborateur?.password ?? ""}
                                        onChange={(e) => setCollaborateur({ ...collaborateur, password: e.target.value })}
                                        placeholder="Par défaut: mot de passe du cabinet"
                                        style={{ borderColor: themes[themeNumber].primary }}
                                    />
                                )}
                            </ModalGrid>
                            <ModalActions>
                                {casCollaborateur === "updateDelect" ? (
                                    <>
                                        <ButtonModifier onClick={modifierCollaborateur} />
                                        <ButtonSupprimer onClick={supprimerCollaborateur} />
                                    </>
                                ) : (
                                    <ButtonAjouter onClick={(e) => addCollaborateur(e)} />
                                )}
                            </ModalActions>
                        </ModalSection>
                    </form>
                </Modal>
            )}

            {casCollaborateur === "updateDelect" && collaborateur?.id && (
                <ModalQRCode id={collaborateur.id} tabId={tabId ?? ""} privs={privs} pays={pays ?? ""} role="collaborateur" collaborateurTypeNom={typesCollaborateurs.find((t) => t.id === selectedTypeId)?.nom ?? ""} />
            )}

            {/* Modal pour créer un nouveau type */}
            {showModalNouveauType && (
                <Modal
                    show={showModalNouveauType}
                    onClose={() => {
                        setShowModalNouveauType(false);
                        setNomNouveauType("");
                        setRolesNouveauType([]);
                    }}
                    title="Créer un nouveau type de collaborateur"
                    maxWidth="600px"
                >
                    <form onSubmit={creerNouveauType}>
                        <ModalSection>
                            <ModalGrid columns={1}>
                                <ModalField
                                    id="nomNouveauType"
                                    label="Nom du type"
                                    value={nomNouveauType}
                                    onChange={(e) => setNomNouveauType(e.target.value)}
                                    placeholder="Ex: Assistant, Comptable..."
                                    style={{ borderColor: themes[themeNumber].primary }}
                                />
                            </ModalGrid>
                            <div style={{ marginTop: 20 }}>
                                <label style={{ marginBottom: 10, display: "block", fontWeight: 600 }}>Rôles par défaut</label>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                                    {PRIVILEGE_SELECTION_ROWS.map((row, rowIdx) =>
                                        row.type === "heading" ? (
                                            <div
                                                key={row.id}
                                                style={{
                                                    gridColumn: "1 / -1",
                                                    marginTop: rowIdx > 0 ? 12 : 0,
                                                    paddingBottom: 4,
                                                    borderBottom: `1px solid ${themes[themeNumber].primary}25`,
                                                }}
                                            >
                                                <div style={{ fontSize: 13, fontWeight: 700 }}>{row.title}</div>
                                                {row.hint ? (
                                                    <div style={{ fontSize: 11, opacity: 0.85, marginTop: 3 }}>{row.hint}</div>
                                                ) : null}
                                            </div>
                                        ) : (
                                            <label
                                                key={row.code}
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 8,
                                                    cursor: "pointer",
                                                    padding: "8px 12px",
                                                    borderRadius: 8,
                                                    background: rolesNouveauType.includes(row.code)
                                                        ? `${themes[themeNumber].primary}20`
                                                        : "#f5f5f5",
                                                }}
                                            >
                                                <Input
                                                    type="checkbox"
                                                    checked={rolesNouveauType.includes(row.code)}
                                                    onChange={() =>
                                                        setRolesNouveauType((prev) =>
                                                            prev.includes(row.code)
                                                                ? prev.filter((x) => x !== row.code)
                                                                : [...prev, row.code]
                                                        )
                                                    }
                                                />
                                                <span style={{ fontSize: 13 }}>{row.label}</span>
                                            </label>
                                        )
                                    )}
                                </div>
                            </div>
                        </ModalSection>
                        <ModalActions>
                            <button type="button" className="btn btn-outline-secondary" onClick={() => setShowModalNouveauType(false)} style={{ marginRight: 8 }}>Annuler</button>
                            <button type="submit" className="btn" style={{ backgroundColor: themes[themeNumber].primary, color: themes[themeNumber].secondary, border: "none" }}>Créer</button>
                        </ModalActions>
                    </form>
                </Modal>
            )}

            {/* Modal créer docteur (Sadmin uniquement) */}
            {showModalNouveauDocteur && (
                <Modal
                    show={showModalNouveauDocteur}
                    onClose={() => setShowModalNouveauDocteur(false)}
                    title="Créer un docteur"
                    maxWidth="600px"
                >
                    <form onSubmit={addDocteur}>
                        <ModalSection>
                            <h6 style={{ marginBottom: 12 }}>Docteur</h6>
                            <ModalGrid columns={2}>
                                <ModalField label="Nom" id="nomDocteur" value={newDocteur.nom ?? ""} onChange={(e) => setNewDocteur({ ...newDocteur, nom: e.target.value.toUpperCase() })} />
                                <ModalField label="Prénom" id="prenomDocteur" value={newDocteur.prenom ?? ""} onChange={(e) => setNewDocteur({ ...newDocteur, prenom: upperLow(e.target.value) })} />
                                <ModalField label="Email" id="emailDocteur" type="email" value={newDocteur.login ?? ""} onChange={(e) => setNewDocteur({ ...newDocteur, login: e.target.value })} />
                                <ModalField label="Téléphone" id="telDocteur" value={newDocteur.telephone ?? ""} onChange={(e) => phoneOnChangeHandler(e, (v) => setNewDocteur({ ...newDocteur, telephone: v }))} />
                                <ModalField label="Date de naissance" id="naissanceDocteur" type="date" value={newDocteur.naissance ?? ""} onChange={(e) => setNewDocteur({ ...newDocteur, naissance: e.target.value })} />
                                <ModalField label="Mot de passe" id="pwdDocteur" type="password" value={newDocteur.password ?? ""} onChange={(e) => setNewDocteur({ ...newDocteur, password: e.target.value })} placeholder="1234 par défaut" />
                                <ModalField label="Adresse" id="adresseDocteur" value={newDocteur.adresse ?? ""} onChange={(e) => setNewDocteur({ ...newDocteur, adresse: e.target.value })} />
                            </ModalGrid>
                            <h6 style={{ marginTop: 20, marginBottom: 12 }}>Cabinet</h6>
                            <ModalGrid columns={2}>
                                <ModalField label="Nom du cabinet" id="nomCabinet" value={newCabinet.nom ?? ""} onChange={(e) => setNewCabinet({ ...newCabinet, nom: upperLow(e.target.value) })} />
                                <ModalField label="Adresse du cabinet" id="adresseCabinet" value={newCabinet.adresse ?? ""} onChange={(e) => setNewCabinet({ ...newCabinet, adresse: e.target.value })} />
                                <ModalField label="Pays" id="paysCabinet" value={(value || newCabinet.pays) ?? ""} onChange={(e) => { const v = e.target.value; setValue(v); setNewCabinet({ ...newCabinet, pays: v }); }} options={options?.map((o: any) => ({ value: o.value, label: o.label })) ?? []} />
                            </ModalGrid>
                        </ModalSection>
                        <ModalActions>
                            <button type="button" className="btn btn-outline-secondary" onClick={() => setShowModalNouveauDocteur(false)}>Annuler</button>
                            <button type="submit" className="btn" style={{ backgroundColor: themes[themeNumber].primary, color: themes[themeNumber].secondary, border: "none", padding: "8px 16px" }}>Créer le docteur</button>
                        </ModalActions>
                    </form>
                </Modal>
            )}

        </>
    );
}
