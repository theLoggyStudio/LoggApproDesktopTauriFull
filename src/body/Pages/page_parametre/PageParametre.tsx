import React, { useEffect, useMemo, useState } from "react";
import NavTop from "../../Modules/NavTop.tsx";
import { GerrerNomActes } from "../../Modules/GerrerNomActes.tsx";
import type { TypeActe, TypeAssurance, NomMateriel, TypeCollaborateur } from "../../Entities/entities.tsx";
import { useNavigate } from "react-router-dom";
import GerrerNomAssurance from "../../Modules/GerrerNomAssurance.tsx";
import { GerrerNomMateriel } from "../../Modules/GerrerNomMateriel.tsx";
import { PagePatientDetailController } from "../../controllers/PagePatientDetailController.tsx";

import AutorisationController from "../../controllers/AutorisationController.tsx";
import { PageParametreController } from "../../controllers/PageParametreController.tsx";
import { PageProfilController } from "../../controllers/PageProfilController.tsx";
import { GerrerTypesCollaborateurs } from "../../Modules/GerrerTypesCollaborateurs.tsx";
import { GerrerMedicaments } from "../../Modules/GerrerMedicaments.tsx";
import { checkPrivilege } from "../../helpers/helpers.tsx";
import {
    canAccessParametrePage,
    canVoirAccordeonParametreActes,
    canVoirAccordeonParametreAssurances,
    canVoirAccordeonParametreMateriels,
    canVoirAccordeonParametreMedicaments,
    canVoirAccordeonParametreTypesCollaborateurs,
} from "../../policies/navModulePolicies.js";
import { ActualthemeNumber, themes } from "../../../constants/index.ts";
import { useTheme } from '../../context/ThemeContext.js';
import { useAlert, useMode } from '../../context/SearchContext.js';
import { useSession } from "../../context/SessionContext.tsx";
import { useNavigationParams } from "../../hooks/useNavigationParams.ts";


export default function PageParametre() {
    const navigate = useNavigate();
    const { isAuthenticated, session } = useSession();
    const { userId, tabId, pays } = useNavigationParams();

    /** Même principe que fiche patient / NavTop : URL d’abord, puis session si les params manquent encore. */
    const userIdEffectif = String(userId || session.userId || "").trim();
    const tabIdNavigation = String(tabId || session.tabId || "").trim();
    const paysEffectif = String(pays || session.pays || "").trim();

    /**
     * Clé cabinet pour les listes référentiel (noms d’actes, assurances, matériels) : aligné Profil / types collaborateurs.
     * Docteur (userId === tabId) → « main » ; collaborateur → tabId du cabinet.
     */
    const tabIdCabinetReferentiel = useMemo(() => {
        if (!tabIdNavigation || tabIdNavigation === "0" || tabIdNavigation === userIdEffectif) {
            return "main";
        }
        return tabIdNavigation;
    }, [tabIdNavigation, userIdEffectif]);

    /** Compte docteur / propriétaire (userId === tabId navigation) — export CSV Tables alors que tabId référentiel peut être « main ». */
    const isDocteurPourTablesReferentiel = useMemo(
        () => Boolean(userIdEffectif) && userIdEffectif === tabIdNavigation,
        [userIdEffectif, tabIdNavigation]
    );
    const [typeActes, setTypeActes] = useState<TypeActe[]>([]);
    const [typeAssurances, setTypeAssurances] = useState<TypeAssurance[]>([]);
    const [nomMateriels, setNomMateriels] = useState<NomMateriel[]>([]);
    const [typesCollaborateurs, setTypesCollaborateurs] = useState<TypeCollaborateur[]>([]);

    useEffect(() => {
        if (!isAuthenticated && !(userIdEffectif && tabIdNavigation)) {
            navigate("/");
        }
    }, [isAuthenticated, userIdEffectif, tabIdNavigation, navigate]);
    const navTop = document.getElementById('nav-top');
    const [privs, setPrivs] = useState<string[]>([]);
    const [limitTypeAssurance, setLimitTypeAssurance] = useState<number>(10)
    const [limitTypeActe, setLimitTypeActe] = useState<number>(10)
    const [limitNomMateriel, setLimitNomMateriel] = useState<number>(10)
    const [expandedSections, setExpandedSections] = useState<{ actes: boolean, assurances: boolean, materiels: boolean, medicaments: boolean, typesCollaborateurs: boolean }>({
        actes: true,
        assurances: false,
        materiels: false,
        medicaments: false,
        typesCollaborateurs: false
    });
    const { themeNumber } = useTheme();
    const { setAlertObj } = useAlert();
    const { mode } = useMode();
    const isAdminMode = useMemo(
        () => mode === "admin" || mode === "superAdmin" || userIdEffectif === "admin" || userIdEffectif === "sadmin",
        [mode, userIdEffectif]
    );

    const voirActes = useMemo(() => canVoirAccordeonParametreActes(privs), [privs]);
    const voirAssurances = useMemo(() => canVoirAccordeonParametreAssurances(privs), [privs]);
    const voirMateriels = useMemo(() => canVoirAccordeonParametreMateriels(privs), [privs]);
    const voirMedicaments = useMemo(() => canVoirAccordeonParametreMedicaments(privs), [privs]);
    const voirTypesCollab = useMemo(() => canVoirAccordeonParametreTypesCollaborateurs(privs), [privs]);
    const nbSectionsVisibles = useMemo(
        () =>
            [voirActes, voirAssurances, voirMateriels, voirMedicaments, voirTypesCollab].filter(Boolean).length,
        [voirActes, voirAssurances, voirMateriels, voirMedicaments, voirTypesCollab]
    );
    const hintEdbSansSection = useMemo(
        () =>
            privs.length > 0 &&
            !isAdminMode &&
            checkPrivilege("edb01", privs) &&
            nbSectionsVisibles === 0,
        [privs, isAdminMode, nbSectionsVisibles]
    );

    useEffect(() => {
        if (privs.length === 0) return;
        if (isAdminMode) return;
        if (!canAccessParametrePage(privs)) {
            navigate("/");
            setAlertObj({
                type: "warning",
                show: true,
                text: "Vous n'avez pas accès à la gestion des éléments de base.",
            });
        }
    }, [privs, isAdminMode, navigate, setAlertObj]);

    const toggleSection = (section: 'actes' | 'assurances' | 'materiels' | 'medicaments' | 'typesCollaborateurs') => {
        setExpandedSections(prev => ({
            ...prev,
            [section]: !prev[section]
        }));
    };

    useEffect(() => {
        if (!userIdEffectif || !tabIdNavigation || !paysEffectif) {
            return;
        }
        const remplirPrivs = async () => {
            try {
                const privileges = await AutorisationController(paysEffectif).recupererPriviliegesDuUser(
                    userIdEffectif,
                    tabIdNavigation
                );

                if (!privileges || privileges.length === 0) {
                    navigate("/");
                    setAlertObj({ type: "error", show: true, text: "Session invalide. Veuillez vous reconnecter." });
                    return;
                }

                setPrivs(privileges);
            } catch (erreur) {
                navigate("/");
                setAlertObj({ type: "error", show: true, text: "Session expirée. Veuillez vous reconnecter." });
                console.error("Erreur d'authentification:", erreur);
            }
        };
        void remplirPrivs();
    }, [userIdEffectif, tabIdNavigation, paysEffectif, navigate, setAlertObj]);

    // useEffect(() => {
    //     const navTopConf = () => {
    //         let height = navTop?.clientHeight;
    //         document.getElementById('navTopConf')?.setAttribute('style', `margin-top: ${Number(height)}px;`);
    //     };
    //     navTopConf();
    // }, [window.innerWidth, window.innerHeight]);
    useEffect(() => {
        const navTopConf = () => {
            let height = navTop?.clientHeight;
            document.getElementById('navTopConf')?.setAttribute('style', `margin-top: ${Number(height)}px;`);
        };

        // Ajout d'un écouteur d'événement pour gérer les redimensionnements de fenêtre
        window.addEventListener('resize', navTopConf);
        navTopConf(); // Initialiser à la première exécution

        return () => {
            // Nettoyage de l'écouteur d'événement
            window.removeEventListener('resize', navTopConf);
        };
    }, []); // Utiliser un tableau de dépendances vide pour s'exécuter une seule fois lors du montage



    useEffect(() => {
        const chargerTypeActes = async () => {
            try {
                const result = await PageParametreController(paysEffectif).listerUnTypeActe(
                    tabIdCabinetReferentiel,
                    limitTypeActe
                );
                setTypeActes(Array.isArray(result) ? result : []);
            } catch (error) {
                console.error("Erreur lors du chargement des types d'actes:", error);
                setTypeActes([]);
            }
        };
        if (canVoirAccordeonParametreActes(privs) && privs.length !== 0) {
            chargerTypeActes();
        }
    }, [userIdEffectif, tabIdCabinetReferentiel, paysEffectif, limitTypeActe, privs]);

    useEffect(() => {
        const chargerTypeAssurances = async () => {
            try {
                const result = await PageParametreController(paysEffectif).listerUnTypeAssurance(
                    tabIdCabinetReferentiel,
                    limitTypeAssurance
                );
                setTypeAssurances(Array.isArray(result) ? result : []);
            } catch (error) {
                console.error("Erreur lors du chargement des types d'assurances:", error);
                setTypeAssurances([]);
            }
        };
        if (canVoirAccordeonParametreAssurances(privs) && privs.length !== 0) {
            chargerTypeAssurances();
        }
    }, [userIdEffectif, tabIdCabinetReferentiel, paysEffectif, limitTypeAssurance, privs]);

    useEffect(() => {
        const chargerNomMateriels = async () => {
            try {
                const result = await PagePatientDetailController(paysEffectif).listerLesNomMateriels(
                    "normal",
                    tabIdCabinetReferentiel,
                    100
                );
                setNomMateriels(Array.isArray(result) ? result : []);
            } catch (error) {
                console.error("Erreur lors du chargement des matériels:", error);
                setNomMateriels([]);
            }
        };
        if (canVoirAccordeonParametreMateriels(privs) && privs.length !== 0) {
            chargerNomMateriels();
        }
    }, [userIdEffectif, tabIdCabinetReferentiel, paysEffectif, limitNomMateriel, privs]);

    useEffect(() => {
        const chargerTypesCollaborateurs = async () => {
            try {
                const result = await PageProfilController(paysEffectif).listerTypesCollaborateur(tabIdCabinetReferentiel);
                setTypesCollaborateurs(Array.isArray(result) ? result : []);
            } catch (error) {
                console.error("Erreur chargement types collaborateurs:", error);
                setTypesCollaborateurs([]);
            }
        };
        if (canVoirAccordeonParametreTypesCollaborateurs(privs) && privs.length !== 0) {
            chargerTypesCollaborateurs();
        }
    }, [userIdEffectif, tabIdCabinetReferentiel, paysEffectif, privs]);

    const implementScroll = async (type) => {
        if (type === "actes") {
            const result = await PageParametreController(paysEffectif).listerUnTypeActe(tabIdCabinetReferentiel, limitTypeActe);
            setTypeActes(result);
        } else if (type === "assurances") {
            const result = await PageParametreController(paysEffectif).listerUnTypeAssurance(
                tabIdCabinetReferentiel,
                limitTypeAssurance
            );
            setTypeAssurances(result);
        }
    };

    const fadeInStyle = `
        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translateY(10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
    `;

    return (
        <>
            <style>{fadeInStyle}</style>
            <div style={{ backgroundColor: themes[themeNumber].primary, color: themes[themeNumber].secondary, minHeight: '100vh', paddingBottom: '40px', display: 'flex', flexDirection: 'column' }}>
                <NavTop userId={userIdEffectif || "0"} id={"nav-top"} tabId={tabIdNavigation || "0"} pays={paysEffectif} />
            <div className="container mt-2 flex-grow-1" id="navTopConf" style={{ flex: 1 }}>
                {/* En-tête de la page */}
                <div style={{
                    marginBottom: '30px',
                    padding: '30px',
                    background: `linear-gradient(135deg, ${themes[themeNumber].secondary}15 0%, ${themes[themeNumber].secondary}05 100%)`,
                    borderRadius: '16px',
                    border: `2px solid ${themes[themeNumber].secondary}30`,
                    boxShadow: `0 4px 20px ${themes[themeNumber].secondary}20`
                }}>
                    <h1 style={{
                        color: themes[themeNumber].secondary,
                        fontSize: '32px',
                        fontWeight: 'bold',
                        marginBottom: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '15px'
                    }}>
                        <span style={{ fontSize: '36px' }}>🩺</span>
                        Gestion des éléments de base
                    </h1>
                    <p style={{
                        color: themes[themeNumber].secondary,
                        opacity: 0.8,
                        fontSize: '16px',
                        margin: 0
                    }}>
                        Cliquez sur chaque section pour l'ouvrir ou la fermer
                    </p>
                    <details
                        style={{
                            marginTop: 14,
                            color: themes[themeNumber].secondary,
                            fontSize: 14,
                            lineHeight: 1.5,
                            opacity: 0.92,
                        }}
                    >
                        <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                            Rappel : droits (codes) et accordéons
                        </summary>
                        <ul style={{ margin: "10px 0 0", paddingLeft: 22, maxWidth: 720 }}>
                            <li>
                                <strong>edb01</strong> — affiche uniquement le lien « Gestion des éléments de base » dans
                                « Autres pages » ; l’accès à l’URL reste possible avec gam/gas/gmt/gme/gtc, les codes
                                historiques (nma, asr, mat, pos, col) ou <strong>act02</strong>.
                            </li>
                            <li>
                                <strong>gam01 / gam02</strong> — accordéon « Actes médicaux » (équivalent{' '}
                                <strong>nma01 / nma02</strong>).
                            </li>
                            <li>
                                <strong>gas01 / gas02</strong> — accordéon « Assurances » (équivalent <strong>asr01 / asr02</strong>
                                ).
                            </li>
                            <li>
                                <strong>gmt01 / gmt02</strong> — accordéon « Matériels » (équivalent <strong>mat01 / mat02</strong>
                                ).
                            </li>
                            <li>
                                <strong>gme01 / gme02</strong> — accordéon « Médicaments » ; <strong>pos01</strong> reste valide pour
                                le catalogue et la posologie fiche patient.
                            </li>
                            <li>
                                <strong>gtc01 / gtc02</strong> — accordéon « Types de collaborateurs » (équivalent{' '}
                                <strong>col01 / col02</strong> sur le Profil).
                            </li>
                            <li>
                                <strong>act02</strong> — accès à cette page (menu Paramètres) en plus de la gestion des actes
                                patient.
                            </li>
                        </ul>
                    </details>
                    {hintEdbSansSection ? (
                        <div className="alert alert-info mt-3 mb-0" style={{ fontSize: 15, lineHeight: 1.5 }}>
                            Vous avez le menu ou l’URL (<strong>edb01</strong> ou autre jeton page) mais aucune section
                            référentiel ne vous est encore attribuée (gam, gas, gmt, gme, gtc ou équivalents nma, asr, mat,
                            pos, col). Demandez au gestionnaire du cabinet les cases correspondantes.
                        </div>
                    ) : null}
                </div>

                {/* Section Actes - Accordéon */}
                {voirActes ? (<div style={{
                    marginBottom: '12px',
                    backgroundColor: '#fff',
                    borderRadius: '16px',
                    boxShadow: `0 4px 20px ${themes[themeNumber].primary}15`,
                    border: `1px solid ${themes[themeNumber].primary}20`,
                    overflow: 'hidden',
                    transition: 'all 0.3s ease'
                }}>
                    <div
                        onClick={() => toggleSection('actes')}
                        style={{
                            padding: '12px 20px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: expandedSections.actes ? `${themes[themeNumber].primary}10` : '#fff',
                            transition: 'background-color 0.3s ease',
                            borderBottom: expandedSections.actes ? `2px solid ${themes[themeNumber].primary}30` : 'none'
                        }}
                        onMouseEnter={(e) => {
                            if (!expandedSections.actes) {
                                e.currentTarget.style.backgroundColor = `${themes[themeNumber].primary}05`;
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!expandedSections.actes) {
                                e.currentTarget.style.backgroundColor = '#fff';
                            }
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '20px' }}>🏥</span>
                            <h3 style={{
                                color: themes[themeNumber].primary,
                                fontSize: '16px',
                                fontWeight: 'bold',
                                margin: 0
                            }}>
                                Gestion des Actes Médicaux
                            </h3>
                        </div>
                        <span style={{
                            fontSize: '16px',
                            color: themes[themeNumber].primary,
                            transition: 'transform 0.3s ease',
                            transform: expandedSections.actes ? 'rotate(180deg)' : 'rotate(0deg)'
                        }}>
                            ▼
                        </span>
                    </div>
                    {expandedSections.actes && (
                        <div style={{
                            padding: '30px',
                            animation: 'fadeIn 0.3s ease-in'
                        }}>
                            <GerrerNomActes
                                tabId={tabIdCabinetReferentiel}
                                pays={paysEffectif}
                                allActes={typeActes}
                                privs={privs}
                                limitTypeActe={limitTypeActe}
                                setLimitTypeActe={setLimitTypeActe}
                                isDocteurPourTables={isDocteurPourTablesReferentiel}
                            />
                        </div>
                    )}
                </div>) : null}

                {/* Section Assurances - Accordéon */}
                {voirAssurances ? (<div style={{
                    marginBottom: '12px',
                    backgroundColor: '#fff',
                    borderRadius: '16px',
                    boxShadow: `0 4px 20px ${themes[themeNumber].primary}15`,
                    border: `1px solid ${themes[themeNumber].primary}20`,
                    overflow: 'hidden',
                    transition: 'all 0.3s ease'
                }}>
                    <div
                        onClick={() => toggleSection('assurances')}
                        style={{
                            padding: '12px 20px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: expandedSections.assurances ? `${themes[themeNumber].primary}10` : '#fff',
                            transition: 'background-color 0.3s ease',
                            borderBottom: expandedSections.assurances ? `2px solid ${themes[themeNumber].primary}30` : 'none'
                        }}
                        onMouseEnter={(e) => {
                            if (!expandedSections.assurances) {
                                e.currentTarget.style.backgroundColor = `${themes[themeNumber].primary}05`;
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!expandedSections.assurances) {
                                e.currentTarget.style.backgroundColor = '#fff';
                            }
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '20px' }}>🛡️</span>
                            <h3 style={{
                                color: themes[themeNumber].primary,
                                fontSize: '16px',
                                fontWeight: 'bold',
                                margin: 0
                            }}>
                                Gestion des Assurances
                            </h3>
                        </div>
                        <span style={{
                            fontSize: '16px',
                            color: themes[themeNumber].primary,
                            transition: 'transform 0.3s ease',
                            transform: expandedSections.assurances ? 'rotate(180deg)' : 'rotate(0deg)'
                        }}>
                            ▼
                        </span>
                    </div>
                    {expandedSections.assurances && (
                        <div style={{
                            padding: '30px',
                            animation: 'fadeIn 0.3s ease-in'
                        }}>
                            <GerrerNomAssurance
                                tabId={tabIdCabinetReferentiel}
                                pays={paysEffectif}
                                allTypeAssurances={typeAssurances}
                                privs={privs}
                                setLimitTypeAssurance={setLimitTypeAssurance}
                                limitTypeActe={limitTypeActe}
                                isDocteurPourTables={isDocteurPourTablesReferentiel}
                            />
                        </div>
                    )}
                </div>) : null}

                {/* Section Matériels - Accordéon */}
                {voirMateriels ? (<div style={{
                    marginBottom: '12px',
                    backgroundColor: '#fff',
                    borderRadius: '16px',
                    boxShadow: `0 4px 20px ${themes[themeNumber].primary}15`,
                    border: `1px solid ${themes[themeNumber].primary}20`,
                    overflow: 'hidden',
                    transition: 'all 0.3s ease'
                }}>
                    <div
                        onClick={() => toggleSection('materiels')}
                        style={{
                            padding: '12px 20px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: expandedSections.materiels ? `${themes[themeNumber].primary}10` : '#fff',
                            transition: 'background-color 0.3s ease',
                            borderBottom: expandedSections.materiels ? `2px solid ${themes[themeNumber].primary}30` : 'none'
                        }}
                        onMouseEnter={(e) => {
                            if (!expandedSections.materiels) {
                                e.currentTarget.style.backgroundColor = `${themes[themeNumber].primary}05`;
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!expandedSections.materiels) {
                                e.currentTarget.style.backgroundColor = '#fff';
                            }
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '20px' }}>🧪</span>
                            <h3 style={{
                                color: themes[themeNumber].primary,
                                fontSize: '16px',
                                fontWeight: 'bold',
                                margin: 0
                            }}>
                                Gestion des Matériels Médicaux
                            </h3>
                        </div>
                        <span style={{
                            fontSize: '16px',
                            color: themes[themeNumber].primary,
                            transition: 'transform 0.3s ease',
                            transform: expandedSections.materiels ? 'rotate(180deg)' : 'rotate(0deg)'
                        }}>
                            ▼
                        </span>
                    </div>
                    {expandedSections.materiels && (
                        <div style={{
                            padding: '30px',
                            animation: 'fadeIn 0.3s ease-in'
                        }}>
                            <GerrerNomMateriel
                                tabId={tabIdCabinetReferentiel}
                                pays={paysEffectif}
                                allMateriels={nomMateriels}
                                privs={privs}
                                limitNomMateriel={limitNomMateriel}
                                setLimitNomMateriel={setLimitNomMateriel}
                                isDocteurPourTables={isDocteurPourTablesReferentiel}
                            />
                        </div>
                    )}
                </div>) : null}

                {/* Section Médicaments (posologie) */}
                {voirMedicaments ? (<div style={{
                    marginBottom: '12px',
                    backgroundColor: '#fff',
                    borderRadius: '16px',
                    boxShadow: `0 4px 20px ${themes[themeNumber].primary}15`,
                    border: `1px solid ${themes[themeNumber].primary}20`,
                    overflow: 'hidden',
                    transition: 'all 0.3s ease'
                }}>
                    <div
                        onClick={() => toggleSection('medicaments')}
                        style={{
                            padding: '12px 20px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: expandedSections.medicaments ? `${themes[themeNumber].primary}10` : '#fff',
                            transition: 'background-color 0.3s ease',
                            borderBottom: expandedSections.medicaments ? `2px solid ${themes[themeNumber].primary}30` : 'none'
                        }}
                        onMouseEnter={(e) => {
                            if (!expandedSections.medicaments) {
                                e.currentTarget.style.backgroundColor = `${themes[themeNumber].primary}05`;
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!expandedSections.medicaments) {
                                e.currentTarget.style.backgroundColor = '#fff';
                            }
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '20px' }}>💊</span>
                            <h3 style={{
                                color: themes[themeNumber].primary,
                                fontSize: '16px',
                                fontWeight: 'bold',
                                margin: 0
                            }}>
                                Médicaments (catalogue posologie)
                            </h3>
                        </div>
                        <span style={{
                            fontSize: '16px',
                            color: themes[themeNumber].primary,
                            transition: 'transform 0.3s ease',
                            transform: expandedSections.medicaments ? 'rotate(180deg)' : 'rotate(0deg)'
                        }}>
                            ▼
                        </span>
                    </div>
                    {expandedSections.medicaments && (
                        <div style={{
                            padding: '30px',
                            animation: 'fadeIn 0.3s ease-in'
                        }}>
                            <GerrerMedicaments tabId={tabIdCabinetReferentiel} pays={paysEffectif} privs={privs} />
                        </div>
                    )}
                </div>) : null}

                {/* Section Types de collaborateurs - Accordéon */}
                {voirTypesCollab ? (<div style={{
                    marginBottom: '12px',
                    backgroundColor: '#fff',
                    borderRadius: '16px',
                    boxShadow: `0 4px 20px ${themes[themeNumber].primary}15`,
                    border: `1px solid ${themes[themeNumber].primary}20`,
                    overflow: 'hidden',
                    transition: 'all 0.3s ease'
                }}>
                    <div
                        onClick={() => toggleSection('typesCollaborateurs')}
                        style={{
                            padding: '12px 20px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: expandedSections.typesCollaborateurs ? `${themes[themeNumber].primary}10` : '#fff',
                            transition: 'background-color 0.3s ease',
                            borderBottom: expandedSections.typesCollaborateurs ? `2px solid ${themes[themeNumber].primary}30` : 'none'
                        }}
                        onMouseEnter={(e) => {
                            if (!expandedSections.typesCollaborateurs) {
                                e.currentTarget.style.backgroundColor = `${themes[themeNumber].primary}05`;
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!expandedSections.typesCollaborateurs) {
                                e.currentTarget.style.backgroundColor = '#fff';
                            }
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '20px' }}>👥</span>
                            <h3 style={{
                                color: themes[themeNumber].primary,
                                fontSize: '16px',
                                fontWeight: 'bold',
                                margin: 0
                            }}>
                                Types de collaborateurs
                            </h3>
                        </div>
                        <span style={{
                            fontSize: '16px',
                            color: themes[themeNumber].primary,
                            transition: 'transform 0.3s ease',
                            transform: expandedSections.typesCollaborateurs ? 'rotate(180deg)' : 'rotate(0deg)'
                        }}>
                            ▼
                        </span>
                    </div>
                    {expandedSections.typesCollaborateurs && (
                        <div style={{
                            padding: '30px',
                            animation: 'fadeIn 0.3s ease-in'
                        }}>
                            <GerrerTypesCollaborateurs
                                allTypes={typesCollaborateurs}
                                tabId={tabIdCabinetReferentiel}
                                pays={paysEffectif}
                                privs={privs}
                                onTypesChange={() => {
                                    PageProfilController(paysEffectif)
                                        .listerTypesCollaborateur(tabIdCabinetReferentiel)
                                        .then((r) => setTypesCollaborateurs(Array.isArray(r) ? r : []))
                                        .catch(() => setTypesCollaborateurs([]));
                                }}
                            />
                        </div>
                    )}
                </div>) : null}
            </div>
        </div>
        </>
    );
}
