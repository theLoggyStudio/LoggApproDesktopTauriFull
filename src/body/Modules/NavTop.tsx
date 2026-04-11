import React from "react";
import { useEffect, useState, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch } from '@fortawesome/free-solid-svg-icons';
import { useAlert, useItemsTab, useMode, useSearch } from "../context/SearchContext.tsx";
import { useSession } from "../context/SessionContext.tsx";
import PlayVideo from "./PlayVideo.tsx";
import NavTopController from "../controllers/NavTopController.tsx";
import { useNavigationParams } from "../hooks/useNavigationParams.ts";
import { useClearParams } from "../hooks/useClearParams.ts";
import BoutonEmail from "./BoutonEmail.tsx";
import Mode from "./Mode.tsx";
import AutorisationController from "../controllers/AutorisationController.tsx";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { themes, ActualthemeNumber } from "../../constants/index.ts";
import { Navbar, Container, Nav, Button, NavDropdown, Form } from "react-bootstrap";
import logo from '../../assets/logo.png';
import { useTheme } from '../context/ThemeContext.js';
import ModalTask from './ModalTask.tsx';
import ModalSQL from './ModalSQL.tsx';
import ModalImportExport from './ModalImportExport.tsx';
import ModalConfigAPI from './ModalConfigAPI.tsx';
import ModalTutoriels from './ModalTutoriels.tsx';
import { creerTrace } from '../controllers/TraceController.tsx';
import { PageProfilController } from '../controllers/PageProfilController.tsx';
import { getPagePatientAccess } from "../policies/pagePatientPolicy.js";
import {
    canAccessProfilModule,
    canShowElementsBaseNav,
    canAccessStatistiqueModule,
    canAccessEtatsModule,
} from "../policies/navModulePolicies.js";

const LOGGY_STUDIO_EMAIL = "theLoggyStudio@gmail.com";

export default function NavTop({ userId: userIdProp, id, tabId: tabIdProp, patientId: patientIdProp = "0", mailPatient = null, pays: paysProp }: { userId?: string, id?: string, tabId?: string, patientId?: string, mailPatient?: any | null, pays?: string } = {}) {
    const navigate = useNavigate();
    const { setPatientId } = useSession();
    const { clearAllParams } = useClearParams();
    const params = useNavigationParams();
    const userId = userIdProp ?? params.userId;
    const tabId = tabIdProp ?? params.tabId;
    const role = params.role;
    const patientId = patientIdProp ?? params.patientId ?? "0";
    const pays = paysProp ?? params.pays;
    const location = useLocation();
    const [history, setHistory] = useState<string[]>([]);
    const [isVisible, setIsVisible] = useState<boolean>(false);
    const [search, setSearch] = useState<string>("");
    const searchContext = useSearch();
    const { theValueSearch, setTheValueSearch } = searchContext || { theValueSearch: "", setTheValueSearch: () => {} };
    const itemsTabContext = useItemsTab();
    const { setItemsTab } = itemsTabContext || { setItemsTab: () => {} };
    const alertContext = useAlert();
    const { setAlertObj } = alertContext || { setAlertObj: () => {} };
    const modeContext = useMode();
    const { mode, setMode, setModeFileName } = modeContext || { mode: "", setMode: () => {}, setModeFileName: () => {} };
    const [thePatient, setThePatient] = useState<any>();
    const [isAdmin, setIsAdmin] = useState<boolean>(false);
    const [payementDate, setPayementDate] = useState<Date>(new Date());
    const [isMenuExpanded, setIsMenuExpanded] = useState(false);
    const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 991);
    const [showModalTrace, setShowModalTrace] = useState(false);
    const [showModalSQL, setShowModalSQL] = useState(false);
    const [showModalImportExport, setShowModalImportExport] = useState(false);
    const [showModalConfigAPI, setShowModalConfigAPI] = useState(false);
    const [showModalTutoriels, setShowModalTutoriels] = useState(false);
    const [refreshTutosKey, setRefreshTutosKey] = useState(0);
    const [lastPatientUrl, setLastPatientUrl] = useState<string>("");
    const { themeNumber, setThemeNumber } = useTheme();
    /** Infos cabinet pour le mailto assistance Loggy Studio */
    const [cabinetBrief, setCabinetBrief] = useState<{ nom: string; adresse: string }>({ nom: "", adresse: "" });
    /** Login / e-mail du compte connecté (rappel dans les mailto — le client mail choisit toujours le « De »). */
    const [connectedLoginForMail, setConnectedLoginForMail] = useState<string>("");
    /** null = chargement en cours ; sinon droits API pour masquer/afficher le module patient dans la barre */
    const [navPrivs, setNavPrivs] = useState<string[] | null>(null);

    const STORAGE_KEY_MODAL_TASK = "loggappro_modal_task_ouvert_apres_connexion";

    // Ouvrir le modal Tâches automatiquement après une connexion (docteur uniquement), 1 seule fois par session
    const estDocteur = userId === tabId && userId !== "admin" && userId !== "sadmin";
    useEffect(() => {
        if (!userId || !tabId || !estDocteur) {
            if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(STORAGE_KEY_MODAL_TASK);
            return;
        }
        const dejaOuvert = typeof sessionStorage !== "undefined" && sessionStorage.getItem(STORAGE_KEY_MODAL_TASK) === "1";
        if (!dejaOuvert) {
            sessionStorage.setItem(STORAGE_KEY_MODAL_TASK, "1");
            setShowModalTrace(true);
        }
    }, [userId, tabId, estDocteur]);

    useEffect(() => {
        const remplirPayementDate = async () => {
            try {
                const datePayement = await AutorisationController(pays).recupererLaDateDePayement(userId ?? "", tabId ?? "");
                if (datePayement?.date_creation) {
                    setPayementDate(new Date(datePayement.date_creation));
                }
            } catch (error) {
                console.debug("Date de paiement non disponible:", error);
            }
        };
        remplirPayementDate();
    }, [userId, tabId, pays, new Date().getDay()]);

    // Met à jour l'état "isAdmin" en fonction du mode actuel
    useEffect(() => {
        setIsAdmin(mode === "admin" || mode === "superAdmin");
    }, [mode]);

    useEffect(() => {
        if (mode === "admin" || mode === "superAdmin") {
            setNavPrivs([]);
            return;
        }
        if (!userId || !tabId) {
            setNavPrivs(null);
            return;
        }
        let cancel = false;
        AutorisationController(pays ?? "")
            .recupererPriviliegesDuUser(userId, tabId)
            .then((p) => {
                if (!cancel) setNavPrivs(Array.isArray(p) ? p : []);
            })
            .catch(() => {
                if (!cancel) setNavPrivs([]);
            });
        return () => {
            cancel = true;
        };
    }, [userId, tabId, pays, mode]);

    /** pat01 ou pat02 : liens + recherche liste patients. Admin : toujours true. null privs : true le temps du chargement. */
    const canAccessPatientModuleNav = useMemo(() => {
        if (mode === "admin" || mode === "superAdmin") return true;
        if (navPrivs === null) return true;
        return getPagePatientAccess(navPrivs).canAccessPatientModule;
    }, [mode, navPrivs]);

    const canAccessProfilNav = useMemo(() => {
        if (mode === "admin" || mode === "superAdmin") return true;
        if (navPrivs === null) return true;
        return canAccessProfilModule(navPrivs);
    }, [mode, navPrivs]);

    const canShowElementsBaseMenuLink = useMemo(() => {
        if (mode === "admin" || mode === "superAdmin") return true;
        if (navPrivs === null) return true;
        return canShowElementsBaseNav(navPrivs);
    }, [mode, navPrivs]);

    const canAccessStatistiqueNav = useMemo(() => {
        if (mode === "admin" || mode === "superAdmin") return true;
        if (navPrivs === null) return true;
        return canAccessStatistiqueModule(navPrivs);
    }, [mode, navPrivs]);

    const canAccessEtatsNav = useMemo(() => {
        if (mode === "admin" || mode === "superAdmin") return true;
        if (navPrivs === null) return true;
        return canAccessEtatsModule(navPrivs);
    }, [mode, navPrivs]);

    // Suivi du chemin de navigation pour historique
    // Barre de recherche uniquement sur page patient (même méthode que bouton QR code dans Alert)
    /** Barre de recherche : uniquement sur la liste (`/patient-detail` sans id). */
    const isPatientListPage = location.pathname === "/patient-detail";
    useEffect(() => {
        setHistory(prev => [...prev, location.pathname]);
        const wide = typeof window !== "undefined" && window.innerWidth > 1000;
        setIsVisible(wide && isPatientListPage && canAccessPatientModuleNav);
        
        // Stocker la dernière URL de patient-detail visitée
        if (location.pathname.startsWith("/patient-detail")) {
            const patientUrl = location.pathname;
            sessionStorage.setItem('lastPatientUrl', patientUrl);
            setLastPatientUrl(patientUrl);
        } else {
            // Récupérer la dernière URL stockée si on n'est pas sur une page patient-detail
            const storedUrl = sessionStorage.getItem('lastPatientUrl');
            if (storedUrl) {
                setLastPatientUrl(storedUrl);
            }
        }
    }, [location.pathname, isPatientListPage, canAccessPatientModuleNav]);

    // Réinitialise les résultats de recherche quand la valeur change
    useEffect(() => {
        if (theValueSearch.length > 0) {
            setItemsTab([]);
        }
    }, [theValueSearch]);

    // Cherche le patient quand un "patientId" est présent
    useEffect(() => {
        const findPatient = async () => {
            if (patientId !== "0") {
                setThePatient(await NavTopController(pays).chercherPatients(tabId, patientId));
            }
        };
        findPatient();
    }, [patientId, tabId]);

    // Cabinet (nom + adresse) + login connecté pour rappel dans les mailto
    useEffect(() => {
        let cancel = false;
        (async () => {
            if (!userId || !tabId) return;
            const docteurIdToLoad =
                userId === "admin" || userId === "sadmin"
                    ? userId
                    : userId === tabId
                      ? userId
                      : tabId;
            const ctrl = PageProfilController(pays ?? "");
            try {
                const data: any = await ctrl.voirInfoDocteur(docteurIdToLoad ?? "", tabId);
                if (cancel || !data) return;
                const cab = data.cabinet ?? data.Cabinet ?? {};
                const nomCab = String(cab.nom ?? cab.nomCabinet ?? "").trim();
                const adresse = String(
                    cab.adresse ?? cab.adresseComplete ?? [cab.rue, cab.ville].filter(Boolean).join(", ") ?? ""
                ).trim();
                setCabinetBrief({ nom: nomCab || "—", adresse });

                let mailHint = "";
                if (userId === tabId || userId === "admin" || userId === "sadmin") {
                    const d = data?.docteur ?? data?.Docteur ?? {};
                    mailHint = String(d?.login ?? d?.email ?? "").trim();
                } else {
                    const pickLogin = (obj: any) =>
                        String(obj?.login ?? obj?.email ?? "").trim();
                    try {
                        const ra = await ctrl.voirInfoAssistant(userId, tabId);
                        if (!cancel && ra) mailHint = pickLogin(ra?.assistant ?? ra?.collaborateur ?? ra);
                    } catch {
                        /* ignore */
                    }
                    if (!mailHint && !cancel) {
                        try {
                            const rc = await ctrl.voirInfoComptable(userId, tabId);
                            if (!cancel && rc) mailHint = pickLogin(rc?.comptable ?? rc);
                        } catch {
                            /* ignore */
                        }
                    }
                    if (!mailHint && !cancel) {
                        try {
                            const rs = await ctrl.voirInfoSecretaire(userId, tabId);
                            if (!cancel && rs) mailHint = pickLogin(rs?.secretaire ?? rs);
                        } catch {
                            /* ignore */
                        }
                    }
                }
                if (!cancel) setConnectedLoginForMail(mailHint);
            } catch {
                if (!cancel) {
                    setCabinetBrief({ nom: "—", adresse: "" });
                    setConnectedLoginForMail("");
                }
            }
        })();
        return () => {
            cancel = true;
        };
    }, [userId, tabId, pays]);

    // Gère la visibilité de la barre de recherche et le mode mobile
    useEffect(() => {
        const handleResize = () => {
            const onPatientList = location.pathname === "/patient-detail";
            setIsVisible(window.innerWidth > 1000 && onPatientList && canAccessPatientModuleNav);
            if (window.innerWidth >= 992) setIsMenuExpanded(false);
            setIsMobile(window.innerWidth <= 991);
        };
        window.addEventListener("resize", handleResize);
        handleResize();
        return () => {
            window.removeEventListener("resize", handleResize);
        };
    }, [location.pathname, canAccessPatientModuleNav]);

    // Désactivé : les alertes de changement de mode sont maintenant silencieuses
    // Le mode est visible dans l'interface sans besoin d'alerte
    // useEffect(() => {
    //     if (mode === "admin") {
    //         setAlertObj({ type: "success", text: "Passage en mode Admin", show: true });
    //     } else if (mode === "superAdmin") {
    //         setAlertObj({ type: "success", text: "Passage en mode SUPER ADMIN", show: true });
    //     } else if (mode === "client" || mode === "") {
    //         setAlertObj({ type: "success", text: "Mode Client", show: true });
    //     }
    // }, [mode]);

    // Navigation vers la page précédente
    const gotoPreviousPage = () => {
        const currentIndex = history.length - 1;
        const lastDifferentIndex = [...history].reverse().findIndex(path => path !== history[currentIndex]);
        const backSteps = lastDifferentIndex >= 0 ? lastDifferentIndex + 1 : 1;
        navigate(-backSteps);
    };

    // Navigation vers la liste des patients
    const gotoPatientList = () => {
        if (!canAccessPatientModuleNav) {
            setAlertObj({
                type: "warning",
                show: true,
                text: "Vous n'avez pas accès au dossier des patients.",
            });
            return;
        }
        setPatientId("");
        navigate("/patient-detail");
    };

    // Gère la déconnexion
    const handleDeconnection = async () => {
        // Enregistrer la trace de déconnexion avant de naviguer
        try {
            // Déterminer le rôle de l'utilisateur
            let userRole = "user";
            if (mode === "admin" || mode === "superAdmin") {
                userRole = mode === "superAdmin" ? "superAdmin" : "admin";
            } else {
                // Essayer de déterminer le rôle depuis l'URL ou les props
                // Par défaut, on utilise "user"
                userRole = "user";
            }
            
            await creerTrace(
                'logout',
                'user',
                userId, // Utiliser userId comme nom par défaut
                userId,
                userId,
                userId,
                userRole,
                tabId,
                tabId,
                pays,
                `Déconnexion - Mode: ${mode || "client"}`
            );
        } catch (error) {
            // Échec silencieux pour ne pas bloquer la déconnexion
            console.error("Erreur lors de l'enregistrement de la trace de déconnexion:", error);
        }
        
        switch (mode) {
            case "admin":
            case "superAdmin":
                clearAllParams(false);
                setAlertObj({ type: "warning", text: "Chargement...", show: true });
                setMode("client");
                navigate(0);
                setAlertObj({ type: "success", text: "Retour au mode Client", show: true });
                break;
            case "":
            case "client":
                clearAllParams(true);
                navigate("/");
                break;
            default:
                clearAllParams(true);
                navigate("/");
                break;
        }
    };

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();

        // Nettoyer la recherche
        const searchTerm = search.trim();

        // Vérifier si la recherche est vide
        if (searchTerm === "") {
            setAlertObj({ type: "error", show: true, text: "Veuillez entrer une recherche valide." });
            return;
        }

        // Si en mode admin, bloquer la recherche
        if (mode === "admin") {
            setAlertObj({ type: "warning", text: "Veuillez vous déconnecter du mode admin avant de continuer.", show: true });
            return;
        }

        if (!canAccessPatientModuleNav) {
            setAlertObj({
                type: "warning",
                show: true,
                text: "Vous n'avez pas accès à la recherche de patients.",
            });
            return;
        }

        // Réinitialiser les résultats
        setItemsTab([]);
        setTheValueSearch(searchTerm);
        setIsMenuExpanded(false);

        try {
            // Recherche de patients (ID, nom, prénom, téléphone, nom de jeune fille)
            console.log("Recherche de patients avec:", searchTerm);
            
            const patients = await NavTopController(pays).chercherPatients(tabId, searchTerm);
            
            if (Array.isArray(patients) && patients.length > 0) {
                console.log(`${patients.length} patient(s) trouvé(s)`);
                setItemsTab(patients);
                setAlertObj({ type: "success", show: true, text: `${patients.length} patient(s) trouvé(s)` });
            } else {
                console.log("Aucun patient trouvé");
                setItemsTab([]);
                setAlertObj({ type: "warning", show: true, text: "Aucun patient ne correspond à votre recherche." });
            }

        } catch (error) {
            console.error("Erreur lors de la recherche:", error);
            setItemsTab([]);
            setAlertObj({ type: "error", show: true, text: "Erreur lors de la recherche. Veuillez réessayer." });
        }
    };




    // Actualise la page
    const handleRefreshPage = () => {
        navigate(0);
    };

    const getLoggyStudioMailtoHref = (): string => {
        const patientNom = thePatient
            ? `${String(thePatient.nom ?? "").trim()} ${String(thePatient.prenom ?? "").trim()}`.trim()
            : "";
        const patientPart = patientNom || "— (patient non sélectionné sur cette page)";
        const cn = cabinetBrief.nom.trim() || "—";
        const ca = cabinetBrief.adresse.trim();
        const cabinetPart = ca ? `${cn}, ${ca}` : cn;
        const body =
            `Bonjour Loggy Studio, je suis ${patientPart} du cabinet ${cabinetPart}, voici le point sur lequel nous voudrions discuter : `;
        const subjectCab = cn !== "—" ? cn : "LoggAppro";
        const subject = `Assistance ${subjectCab}`;
        return `mailto:${LOGGY_STUDIO_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    };

    const payementSoon = () => {
        const today = new Date();
        const timeDifference = payementDate.getTime() - today.getTime();
        const daysDifference = timeDifference / (1000 * 3600 * 24);

        // Vérifie si la date de paiement est dans le futur et dans les 7 prochains jours
        return daysDifference > 0 && daysDifference <= 7;
    };



    return (
        <>
            {/* Styles CSS pour le menu mobile - appliqués UNIQUEMENT quand le menu est ouvert (.show) */}
            <style>{`
                /* Cacher le toggle Bootstrap, afficher le toggle personnalisé sur mobile */
                @media (max-width: 991px) {
                    .navbar-toggler.bootstrap-toggle {
                        display: none !important;
                    }
                    .custom-mobile-toggle {
                        display: flex !important;
                    }
                }
                @media (min-width: 992px) {
                    .custom-mobile-toggle {
                        display: none !important;
                    }
                    .navbar-toggler.bootstrap-toggle {
                        display: none !important;
                    }
                }
                /* Menu mobile : styles UNIQUEMENT quand .show (menu ouvert) - évite display:flex qui bloquait la fermeture */
                @media (max-width: 991px) {
                    #navbar-nav.navbar-collapse.show {
                        background-color: ${themes[themeNumber].secondary}F0 !important;
                        border-radius: 12px !important;
                        padding: 20px !important;
                        margin-top: 15px !important;
                        box-shadow: 0 4px 20px ${themes[themeNumber].primary}30 !important;
                        flex-direction: column !important;
                        align-items: center !important;
                    }
                    #navbar-nav.navbar-collapse.show .navbar-nav {
                        flex-direction: column !important;
                        align-items: center !important;
                        width: 100% !important;
                        gap: 12px !important;
                    }
                    #navbar-nav.navbar-collapse.show .nav-link,
                    #navbar-nav.navbar-collapse.show .dropdown-toggle {
                        padding: 12px 15px !important;
                        border-radius: 8px !important;
                        margin-bottom: 8px !important;
                        transition: all 0.2s ease !important;
                        font-weight: 600 !important;
                        font-size: 15px !important;
                        text-align: center !important;
                        width: 100% !important;
                        display: flex !important;
                        justify-content: center !important;
                        align-items: center !important;
                    }
                    #navbar-nav.navbar-collapse.show .nav-link:hover,
                    #navbar-nav.navbar-collapse.show .dropdown-toggle:hover {
                        background-color: ${themes[themeNumber].primary}20 !important;
                        transform: translateX(5px) !important;
                    }
                    #navbar-nav.navbar-collapse.show .dropdown-menu {
                        background-color: ${themes[themeNumber].secondary} !important;
                        border: 2px solid ${themes[themeNumber].primary} !important;
                        border-radius: 8px !important;
                        padding: 8px 0 !important;
                        margin-top: 8px !important;
                        box-shadow: 0 4px 12px ${themes[themeNumber].primary}30 !important;
                        left: 50% !important;
                        transform: translateX(-50%) !important;
                        width: calc(100% - 40px) !important;
                    }
                    #navbar-nav.navbar-collapse.show .dropdown-item {
                        padding: 12px 20px !important;
                        color: ${themes[themeNumber].primary} !important;
                        font-size: 14px !important;
                        transition: all 0.2s ease !important;
                        border-radius: 4px !important;
                        margin: 2px 8px !important;
                        display: flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        gap: 10px !important;
                    }
                    #navbar-nav.navbar-collapse.show .dropdown-item:hover {
                        background-color: ${themes[themeNumber].primary}20 !important;
                        color: ${themes[themeNumber].primary} !important;
                        transform: translateX(5px) !important;
                    }
                    #navbar-nav.navbar-collapse.show .navbar-nav button {
                        width: 100% !important;
                        height: 45px !important;
                        justify-content: center !important;
                        font-weight: 600 !important;
                        font-size: 14px !important;
                        border-radius: 8px !important;
                        margin: 0 auto !important;
                    }
                    #navbar-nav.navbar-collapse.show .navbar-nav > div {
                        width: 100% !important;
                        justify-content: center !important;
                        align-items: center !important;
                        padding: 10px !important;
                        background-color: ${themes[themeNumber].primary}10 !important;
                        border-radius: 8px !important;
                        margin-top: 5px !important;
                        display: flex !important;
                        margin-left: auto !important;
                        margin-right: auto !important;
                    }
                    #navbar-nav.navbar-collapse.show .navbar-nav > div > * {
                        display: flex !important;
                        justify-content: center !important;
                        align-items: center !important;
                        margin: 0 auto !important;
                    }
                    #navbar-nav.navbar-collapse.show form {
                        width: 100% !important;
                        margin-top: 12px !important;
                        display: flex !important;
                        justify-content: center !important;
                    }
                    #navbar-nav.navbar-collapse.show form input {
                        flex: 1 !important;
                        width: auto !important;
                        max-width: 100% !important;
                    }
                    #navbar-nav.navbar-collapse.show form input::placeholder {
                        font-size: 13px !important;
                    }
                    #navbar-nav.navbar-collapse.show .btn-deconnexion-wrapper {
                        width: 100% !important;
                        display: flex !important;
                        justify-content: center !important;
                        margin-top: 12px !important;
                    }
                    #navbar-nav.navbar-collapse.show .btn-deconnexion-wrapper button {
                        width: auto !important;
                        height: 45px !important;
                        font-weight: 600 !important;
                        font-size: 14px !important;
                        border-radius: 8px !important;
                    }
                    #navbar-nav.navbar-collapse.show > nav {
                        display: flex !important;
                        flex-direction: column !important;
                        align-items: center !important;
                        width: 100% !important;
                    }
                    #navbar-nav.navbar-collapse.show .navtop-right-group {
                        width: 100% !important;
                        flex-direction: column !important;
                        align-items: center !important;
                        margin-left: 0 !important;
                        margin-top: 12px !important;
                    }
                    .mobile-pages-list {
                        width: 100% !important;
                        display: flex !important;
                        flex-direction: column !important;
                        align-items: stretch !important;
                        padding: 12px !important;
                        background-color: #fff !important;
                        border-radius: 8px !important;
                        margin-top: 5px !important;
                        border: 2px solid ${themes[themeNumber].primary} !important;
                        box-shadow: 0 2px 8px ${themes[themeNumber].primary}40 !important;
                    }
                    .mobile-pages-list > div:first-child {
                        color: ${themes[themeNumber].primary} !important;
                        font-weight: 700 !important;
                        text-transform: uppercase !important;
                        letter-spacing: 0.05em !important;
                    }
                    .mobile-pages-list button,
                    .mobile-pages-list a {
                        color: ${themes[themeNumber].primary} !important;
                        font-weight: 500 !important;
                    }
                    .mobile-pages-list button:hover,
                    .mobile-pages-list a:hover {
                        background-color: ${themes[themeNumber].primary}15 !important;
                        color: ${themes[themeNumber].primary} !important;
                    }
                }
            `}</style>
            <Navbar
                bg="light"
                expand="lg"
                fixed="top"
                expanded={isMenuExpanded}
                onToggle={(expanded) => setIsMenuExpanded(!!expanded)}
                style={{
                    backgroundColor: themes[themeNumber].secondary,
                    color: themes[themeNumber].primary,
                    maxHeight: "60px",
                    zIndex: 800,
                    boxShadow: `0 4px 16px 0 ${themes[themeNumber].primary}55` // ombre primaire
                }}
            >
                <Container fluid>
                    <Navbar.Brand
                        as="span"
                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', height: 48 }}
                        onClick={() => setThemeNumber(themeNumber + 1 >= themes.length ? 0 : themeNumber + 1)}
                        title="Changer le thème de couleur"
                    >
                        <img src={logo} alt="Logo LoggAppro" style={{ height: 50, width: 50, marginRight: 8 }} />
                    </Navbar.Brand>
                    {/* Toggle Bootstrap original - visible uniquement sur desktop */}
                    <Navbar.Toggle 
                        aria-controls="navbar-nav" 
                        onClick={() => setIsMenuExpanded(!isMenuExpanded)}
                        className="navbar-toggler bootstrap-toggle"
                    />
                    {/* Toggle personnalisé - visible uniquement sur mobile */}
                    <button
                        type="button"
                        className="custom-mobile-toggle"
                        aria-controls="navbar-nav"
                        aria-label={isMenuExpanded ? "Fermer le menu" : "Ouvrir le menu"}
                        aria-expanded={isMenuExpanded}
                        onClick={() => setIsMenuExpanded(!isMenuExpanded)}
                        style={{
                            border: `2px solid ${themes[themeNumber].primary}`,
                            borderRadius: "8px",
                            padding: "10px 12px",
                            backgroundColor: themes[themeNumber].secondary,
                            color: themes[themeNumber].primary,
                            display: "none",
                            flexDirection: "column",
                            justifyContent: "center",
                            alignItems: "center",
                            gap: "5px",
                            width: "45px",
                            height: "45px",
                            cursor: "pointer",
                            outline: "none",
                            boxShadow: "none"
                        }}
                    >
                        
                        <span style={{ 
                            display: "block", 
                            width: "25px", 
                            height: "3px", 
                            backgroundColor: themes[themeNumber].primary,
                            borderRadius: "2px",
                            transition: "all 0.3s ease",
                            transform: isMenuExpanded ? "rotate(45deg) translate(7px, 6px)" : "none"
                        }}></span>
                        <span style={{ 
                            display: "block", 
                            width: "25px", 
                            height: "3px", 
                            backgroundColor: themes[themeNumber].primary,
                            borderRadius: "2px",
                            transition: "all 0.3s ease",
                            opacity: isMenuExpanded ? 0 : 1
                        }}></span>
                        <span style={{ 
                            display: "block", 
                            width: "25px", 
                            height: "3px", 
                            backgroundColor: themes[themeNumber].primary,
                            borderRadius: "2px",
                            transition: "all 0.3s ease",
                            transform: isMenuExpanded ? "rotate(-45deg) translate(7px, -6px)" : "none"
                        }}></span>
                    </button>

                    <Navbar.Collapse 
                        id="navbar-nav" 
                        in={isMenuExpanded}
                    >
                        <Nav className="me-auto" style={{ 
                            display: "flex", 
                            alignItems: "center", 
                            gap: "12px"
                        }}>
                            <Button
                                variant="outline-primary"
                                onClick={() => { gotoPreviousPage(); setIsMenuExpanded(false); }}
                                style={{ 
                                    backgroundColor: themes[themeNumber].secondary, 
                                    color: themes[themeNumber].primary, 
                                    borderColor: themes[themeNumber].primary, 
                                    borderWidth: 2,
                                    height: "40px",
                                    display: "flex",
                                    alignItems: "center",
                                    paddingLeft: "16px",
                                    paddingRight: "16px",
                                    borderRadius: "6px",
                                    fontWeight: "500",
                                    transition: "all 0.2s ease"
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = themes[themeNumber].primary;
                                    e.currentTarget.style.color = themes[themeNumber].secondary;
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = themes[themeNumber].secondary;
                                    e.currentTarget.style.color = themes[themeNumber].primary;
                                }}
                            >
                                ← Précédent
                            </Button>
                            {isMobile ? (
                                <div className="mobile-pages-list" style={{ width: "100%", display: "flex", flexDirection: "column", gap: "8px" }}>
                                    <div style={{ padding: "8px 0", fontSize: "14px" }}>AUTRES PAGES</div>
                                    <div style={{ padding: "12px 15px", display: "flex", alignItems: "center", gap: "8px" }}><BoutonEmail email={'theLoggyStudio@gmail.com'} theText="✉️ Contacter LoggyStudio" body="bonjour LoggyStudio, voici mon point: " subject="Demande d'assistance" connectedUserEmail={connectedLoginForMail} /></div>

                                    <button type="button" onClick={() => { handleRefreshPage(); setIsMenuExpanded(false); }} style={{ width: "100%", padding: "12px 15px", textAlign: "left", borderRadius: 8, border: "none", backgroundColor: "transparent", fontSize: 14, cursor: "pointer" }}>🔄️ Actualiser la page</button>
                                    {location.pathname !== "/patient-detail" && canAccessPatientModuleNav && (
                                        <button type="button" onClick={() => { gotoPatientList(); setIsMenuExpanded(false); }} style={{ width: "100%", padding: "12px 15px", textAlign: "left", borderRadius: 8, border: "none", backgroundColor: "transparent", fontSize: 14, cursor: "pointer" }}>📁 Retour au dossier des patients</button>
                                    )}
                                    {canAccessProfilNav && (
                                        <Link to={userId && tabId && pays ? `/profil/${userId}/${tabId}/${pays}` : "/profil"} state={{ userId, tabId, pays, role }} onClick={() => setIsMenuExpanded(false)} style={{ width: "100%", padding: "12px 15px", textAlign: "left", borderRadius: 8, display: "block", fontSize: 14, textDecoration: "none" }}>👨‍⚕️👩‍⚕️ Profil</Link>
                                    )}
                                    {canShowElementsBaseMenuLink && (
                                        <Link to={userId && tabId && pays ? `/parametres/${userId}/${tabId}/${pays}` : "/parametres"} state={{ userId, tabId, pays, role }} onClick={() => setIsMenuExpanded(false)} style={{ width: "100%", padding: "12px 15px", textAlign: "left", borderRadius: 8, display: "block", fontSize: 14, textDecoration: "none" }}>🩺 Gestion des éléments de base</Link>
                                    )}
                                    {canAccessStatistiqueNav && (
                                        <Link to={userId && tabId && pays ? `/statistique/${userId}/${tabId}/${pays}` : "/statistique"} state={{ userId, tabId, pays }} onClick={() => setIsMenuExpanded(false)} style={{ width: "100%", padding: "12px 15px", textAlign: "left", borderRadius: 8, display: "block", fontSize: 14, textDecoration: "none" }}>📊 Statistiques</Link>
                                    )}
                                    <button type="button" onClick={() => { setShowModalTrace(true); setIsMenuExpanded(false); }} style={{ width: "100%", padding: "12px 15px", textAlign: "left", borderRadius: 8, border: "none", backgroundColor: "transparent", fontSize: 14, cursor: "pointer" }}>📆 Tâches et Historique des actions</button>
                                    {mode === "superAdmin" && (
                                        <button type="button" onClick={() => { setShowModalConfigAPI(true); setIsMenuExpanded(false); }} style={{ width: "100%", padding: "12px 15px", textAlign: "left", borderRadius: 8, border: "none", backgroundColor: "transparent", fontSize: 14, cursor: "pointer" }}>🔑 Configuration API (PayDunya)</button>
                                    )}
                                    {mode === "superAdmin" && (
                                        <button type="button" onClick={() => { setShowModalSQL(true); setIsMenuExpanded(false); }} style={{ width: "100%", padding: "12px 15px", textAlign: "left", borderRadius: 8, border: "none", backgroundColor: "transparent", fontSize: 14, cursor: "pointer" }}>🗄️ Console SQL</button>
                                    )}
                                    {mode === "superAdmin" && (
                                        <button type="button" onClick={() => { setShowModalTutoriels(true); setIsMenuExpanded(false); }} style={{ width: "100%", padding: "12px 15px", textAlign: "left", borderRadius: 8, border: "none", backgroundColor: "transparent", fontSize: 14, cursor: "pointer" }}>📚 Gestion des tutoriels</button>
                                    )}
                                    {(mode === "superAdmin" || estDocteur) && (
                                        <button type="button" onClick={() => { setShowModalImportExport(true); setIsMenuExpanded(false); }} style={{ width: "100%", padding: "12px 15px", textAlign: "left", borderRadius: 8, border: "none", backgroundColor: "transparent", fontSize: 14, cursor: "pointer" }}>🖨️ Import / Export CSV</button>
                                    )}
                                    {thePatient && patientId !== "0" && window.location.href.includes("/patient-detail") && (
                                        <div style={{ padding: "12px 15px", display: "flex", alignItems: "center", gap: "8px" }}>📤<BoutonEmail email={mailPatient?.login} connectedUserEmail={connectedLoginForMail} /></div>
                                    )}
                                    {canAccessEtatsNav && (
                                        <Link to={userId && tabId && pays ? `/etats/${userId}/${tabId}/${pays}` : "/etats"} state={{ userId, tabId, pays }} onClick={() => setIsMenuExpanded(false)} style={{ width: "100%", padding: "12px 15px", textAlign: "left", borderRadius: 8, display: "block", fontSize: 14, textDecoration: "none" }}>📋 Modèles d'état</Link>
                                    )}
                                </div>
                            ) : (
                                <NavDropdown 
                                    title={<span style={{ color: themes[themeNumber].primary }}>Autres Pages</span>}
                                    id="nav-dropdown-pages" 
                                    menuVariant="light"
                                >
                                    <NavDropdown.Item onClick={() => { handleRefreshPage(); setIsMenuExpanded(false); }}>🔄️ Actualiser la page</NavDropdown.Item>

                                    {location.pathname !== "/patient-detail" && canAccessPatientModuleNav && (
                                        <NavDropdown.Item onClick={() => { gotoPatientList(); setIsMenuExpanded(false); }}>
                                            📁 Retour au dossier des patients
                                        </NavDropdown.Item>
                                    )}
                                    {canAccessProfilNav && (
                                        <NavDropdown.Item as={Link} to={userId && tabId && pays ? `/profil/${userId}/${tabId}/${pays}` : "/profil"} state={{ userId, tabId, pays, role }} onClick={() => setIsMenuExpanded(false)}>👨‍⚕️👩‍⚕️ Profil</NavDropdown.Item>
                                    )}
                                    {canShowElementsBaseMenuLink && (
                                        <NavDropdown.Item as={Link} to={userId && tabId && pays ? `/parametres/${userId}/${tabId}/${pays}` : "/parametres"} state={{ userId, tabId, pays, role }} onClick={() => setIsMenuExpanded(false)}>🩺 Gestion des éléments de base</NavDropdown.Item>
                                    )}
                                    {canAccessStatistiqueNav && (
                                        <NavDropdown.Item as={Link} to={userId && tabId && pays ? `/statistique/${userId}/${tabId}/${pays}` : "/statistique"} state={{ userId, tabId, pays }} onClick={() => setIsMenuExpanded(false)}>📊 Statistiques</NavDropdown.Item>
                                    )}
                                    <NavDropdown.Item onClick={() => { setShowModalTrace(true); setIsMenuExpanded(false); }}>📆 Tâches et Historique des actions</NavDropdown.Item>
                                    {mode === "superAdmin" && (
                                        <NavDropdown.Item onClick={() => { setShowModalConfigAPI(true); setIsMenuExpanded(false); }}>🔑 Configuration API (PayDunya)</NavDropdown.Item>
                                    )}
                                    {mode === "superAdmin" && (
                                        <NavDropdown.Item onClick={() => { setShowModalSQL(true); setIsMenuExpanded(false); }}>🗄️ Console SQL</NavDropdown.Item>
                                    )}
                                    {mode === "superAdmin" && (
                                        <NavDropdown.Item onClick={() => { setShowModalTutoriels(true); setIsMenuExpanded(false); }}>📚 Gestion des tutoriels</NavDropdown.Item>
                                    )}
                                    {(mode === "superAdmin" || estDocteur) && (
                                        <NavDropdown.Item onClick={() => { setShowModalImportExport(true); setIsMenuExpanded(false); }}>🖨️ Import / Export CSV</NavDropdown.Item>
                                    )}
                                    {thePatient && patientId !== "0" && window.location.href.includes("/patient-detail") && (
                                        <NavDropdown.Item as="div" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "8px" }}>
                                            📤<BoutonEmail email={mailPatient?.login} connectedUserEmail={connectedLoginForMail} />
                                        </NavDropdown.Item>
                                    )}
                                    {canAccessEtatsNav && (
                                        <NavDropdown.Item as={Link} to={userId && tabId && pays ? `/etats/${userId}/${tabId}/${pays}` : "/etats"} state={{ userId, tabId, pays }} onClick={() => setIsMenuExpanded(false)}>📋 Modèles d'état</NavDropdown.Item>
                                    )}
                                    <NavDropdown.Item as="div" onClick={() => setIsMenuExpanded(false)}>
                                        <div style={{ padding: "12px 15px", display: "flex", alignItems: "center", gap: "8px" }}>✉️<BoutonEmail email={'theLoggyStudio@gmail.com'} theText="Contacter LoggyStudio" body={"Bonjour LoggyStudio,"+"voici mon point:"} subject="Demande d'assistance" connectedUserEmail={connectedLoginForMail} /></div>
                                    </NavDropdown.Item>

                                </NavDropdown>
                            )}
                            <div style={{ display: "flex", alignItems: "center", height: "40px" }}>
                                <PlayVideo refreshKey={refreshTutosKey} />
                            </div>
                        </Nav>
                        <div className="navtop-right-group" style={{ display: "flex", alignItems: "center", gap: "12px", marginLeft: "auto" }}>
                        {isAdmin && (
                            <Nav style={{ display: "flex", alignItems: "center", margin: 0 }}>
                                <Mode chiffre={theValueSearch} pays={pays} />
                            </Nav>
                        )}
                        {isVisible && !isAdmin && (
                            <div>
                                <Form 
                                    onSubmit={handleSearch} 
                                    style={{ 
                                        display: "flex",
                                        alignItems: "stretch",
                                        backgroundColor: "#fff",
                                        borderRadius: "6px",
                                        border: `2px solid ${themes[themeNumber].primary}`,
                                        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                                        overflow: "hidden",
                                        height: "40px",
                                        minWidth: "525px",
                                        transition: "all 0.3s ease",
                                        margin: 0,
                                        padding: 0
                                    }}
                                >
                                    <Form.Control
                                        type="text"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="Rechercher un patient..."
                                        style={{ 
                                            flex: 1,
                                            paddingLeft: "15px",
                                            paddingRight: "10px",
                                            height: "100%",
                                            border: "none",
                                            backgroundColor: "transparent",
                                            color: themes[themeNumber].primary,
                                            fontSize: "14px",
                                            fontWeight: "500",
                                            outline: "none",
                                            boxShadow: "none",
                                            margin: 0
                                        }}
                                        onFocus={(e) => {
                                            const form = e.currentTarget.parentElement as HTMLElement;
                                            if (form) {
                                                form.style.boxShadow = `0 4px 12px ${themes[themeNumber].primary}40`;
                                                form.style.transform = "translateY(-1px)";
                                            }
                                        }}
                                        onBlur={(e) => {
                                            const form = e.currentTarget.parentElement as HTMLElement;
                                            if (form) {
                                                form.style.boxShadow = "0 2px 8px rgba(0,0,0,0.12)";
                                                form.style.transform = "translateY(0)";
                                            }
                                        }}
                                    />
                                    <Button
                                        variant="outline-secondary"
                                        type="submit"
                                        style={{ 
                                            backgroundColor: themes[themeNumber].primary, 
                                            color: themes[themeNumber].secondary, 
                                            border: "none",
                                            borderRadius: "0",
                                            width: "50px",
                                            height: "100%",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            padding: 0,
                                            margin: 0,
                                            transition: "all 0.2s ease"
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = themes[themeNumber].secondary;
                                            e.currentTarget.style.color = themes[themeNumber].primary;
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = themes[themeNumber].primary;
                                            e.currentTarget.style.color = themes[themeNumber].secondary;
                                        }}
                                    >
                                        <FontAwesomeIcon icon={faSearch} />
                                    </Button>
                                </Form>
                            </div>
                        )}
                        <div className="btn-deconnexion-wrapper" style={{ flexShrink: 0 }}>
                            <Button
                                variant="outline-secondary"
                                onClick={() => { handleDeconnection(); setIsMenuExpanded(false); }}
                                style={{ 
                                    backgroundColor: themes[themeNumber].secondary, 
                                    color: themes[themeNumber].primary, 
                                    borderColor: themes[themeNumber].primary, 
                                    borderWidth: 2,
                                    height: "40px",
                                    display: "flex",
                                    alignItems: "center",
                                    paddingLeft: "20px",
                                    paddingRight: "20px",
                                    borderRadius: "6px",
                                    fontWeight: "500",
                                    transition: "all 0.2s ease"
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = themes[themeNumber].primary;
                                    e.currentTarget.style.color = themes[themeNumber].secondary;
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = themes[themeNumber].secondary;
                                    e.currentTarget.style.color = themes[themeNumber].primary;
                                }}
                            >
                                Déconnexion
                            </Button>
                        </div>
                        </div>
                    </Navbar.Collapse>
                </Container>
            </Navbar>
            <div style={{ minHeight: "62px" }}></div>
            {payementDate !== new Date() && payementSoon() && (
                <div className="row" style={{ backgroundColor: "rgba(253, 218, 55, 0.5)", border: "1px solid #a08923", color: "#a08923" }}>
                    <center>Prochain Payement prévu pour le {format(payementDate, 'dd MMMM yyyy', { locale: fr }) ?? new Date()} !!!</center>
                </div>
            )}

            {/* Modal Tâches (avec historique des actions) */}
            <ModalTask
                show={showModalTrace}
                onClose={() => setShowModalTrace(false)}
                tabId={tabId}
                loggId={tabId}
                pays={pays}
                userId={userId}
                userNom=""
            />

            {/* Modal SQL Console (Sadmin) */}
            <ModalSQL
                show={showModalSQL}
                onClose={() => setShowModalSQL(false)}
                pays={pays ?? 'sn'}
                tabId={tabId ?? 'main'}
            />

            {/* Modal Import/Export CSV (superAdmin uniquement) */}
            <ModalImportExport
                show={showModalImportExport}
                onClose={() => setShowModalImportExport(false)}
            />

            {/* Modal Gestion des tutoriels (sadmin uniquement) */}
            <ModalTutoriels
                show={showModalTutoriels}
                onClose={() => setShowModalTutoriels(false)}
                onTutosChanged={() => setRefreshTutosKey((k) => k + 1)}
            />

            {/* Modal Configuration API PayDunya (docteur, admin, sadmin) - modifiable par admin uniquement */}
            <ModalConfigAPI
                show={showModalConfigAPI}
                onClose={() => setShowModalConfigAPI(false)}
                tabId={tabId ?? ''}
                pays={pays ?? 'sn'}
                isAdmin={isAdmin}
                mode={mode}
            />
        </>
    );


}
