import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PageProfilController } from '../controllers/PageProfilController';
import { ActualthemeNumber, themes } from '../../constants/index.ts';
import { canUsePayDunya } from '../services/PayDunyaTimeGuardService';
import { openExternalUrl } from '../../tauri-bridge';
import { Modal } from '../../items/Modal.tsx';
import { ModalField, ModalSection, ModalGrid, ModalActions } from './ModalFormComponents';

function BoutonPayement({ docteur, privileges, pays }: { docteur: any, privileges: string[], pays: string }) {
    const [showModal, setShowModal] = useState<boolean>(false);
    const [nombreMois, setNombreMois] = useState<number>(1);
    const [errorMessage, setErrorMessage] = useState<string>("");
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
    /** Prochaine échéance (RFC3339) renvoyée par `verifier_statut_paiement` */
    const [dateReferenceProchaine, setDateReferenceProchaine] = useState<string | null>(null);
    const [isCheckingPayment, setIsCheckingPayment] = useState<boolean>(true);
    const [hasExistingPayment, setHasExistingPayment] = useState<boolean | null>(null);
    const [isVerifyingPayment, setIsVerifyingPayment] = useState<boolean>(false);
    /** Après ouverture PayDunya : rappel jaune clignotant jusqu’à validation / refresh. */
    const [showRefreshPaymentHint, setShowRefreshPaymentHint] = useState<boolean>(false);
    /** Arrêt du polling auto après 15 min (évite une boucle infinie). */
    const [autoVerifyIdle, setAutoVerifyIdle] = useState<boolean>(false);

    const payRefreshHintKey = docteur?.id ? `loggappro_pay_refresh_hint_${docteur.id}` : "";
    const verifyPaymentLockRef = useRef(false);

    // Vérifier le statut réel du paiement via l'API backend
    useEffect(() => {
        const checkPaymentStatus = async () => {
            if (!docteur?.id || !docteur?.role || docteur.role !== "docteur") {
                setIsCheckingPayment(false);
                return;
            }

            try {
                const tabId = docteur.id;
                const status = await PageProfilController(pays).verifierStatutPaiement(docteur.id, tabId);
                console.log("[BoutonPayement] Statut reçu du backend:", status);
                setPaymentStatus(status?.statut || null);
                // Vérifier s'il y a déjà un paiement enregistré dans tab_admin
                // Si derniereDatePaiement est null, c'est le premier paiement
                setHasExistingPayment(status?.derniereDatePaiement !== null && status?.derniereDatePaiement !== undefined);
            } catch (error) {
                console.error("Erreur lors de la vérification du statut:", error);
                setPaymentStatus(null);
                setDateReferenceProchaine(null);
                setHasExistingPayment(null);
            } finally {
                setIsCheckingPayment(false);
            }
        };

        checkPaymentStatus();
    }, [docteur?.id, docteur?.role, pays]);

    // Reprise du rappel « actualiser » après retour PayDunya (persistant par session navigateur)
    useEffect(() => {
        if (!payRefreshHintKey || typeof sessionStorage === "undefined") return;
        try {
            if (sessionStorage.getItem(payRefreshHintKey) === "1") {
                setShowRefreshPaymentHint(true);
            }
        } catch {
            /* ignore */
        }
    }, [payRefreshHintKey]);

    // Paiement validé côté serveur → masquer le rappel
    useEffect(() => {
        if (paymentStatus !== "actif" || !payRefreshHintKey) return;
        try {
            sessionStorage.removeItem(payRefreshHintKey);
        } catch {
            /* ignore */
        }
        setShowRefreshPaymentHint(false);
    }, [paymentStatus, payRefreshHintKey]);

    /** Même logique qu’avant « J’ai payé / Actualiser », sans bouton : sync statut + tab_admin. */
    const verifierEtSynchroniserPaiement = useCallback(async (): Promise<boolean> => {
        if (!docteur?.id || verifyPaymentLockRef.current) return false;
        verifyPaymentLockRef.current = true;
        setIsVerifyingPayment(true);
        try {
            const tabId = docteur.id;
            const status = await PageProfilController(pays).verifierStatutPaiement(docteur.id, tabId);
            if (typeof status?.dateReference === "string" && status.dateReference) {
                setDateReferenceProchaine(status.dateReference);
            }
            if (status?.statut === "actif" && status?.derniereDatePaiement?.date_creation) {
                await PageProfilController(pays).enregistrerDerniereDatePaiement(
                    docteur.id,
                    tabId,
                    status.derniereDatePaiement.date_creation
                );
                setPaymentStatus("actif");
                setHasExistingPayment(true);
                setErrorMessage("");
                if (payRefreshHintKey) {
                    try {
                        sessionStorage.removeItem(payRefreshHintKey);
                    } catch {
                        /* ignore */
                    }
                }
                setShowRefreshPaymentHint(false);
                setAutoVerifyIdle(false);
                return true;
            }
            return false;
        } catch (err) {
            console.error("Erreur lors de la vérification du paiement:", err);
            return false;
        } finally {
            verifyPaymentLockRef.current = false;
            setIsVerifyingPayment(false);
        }
    }, [docteur?.id, pays, payRefreshHintKey]);

    // Après PayDunya : vérification automatique périodique + au retour sur la fenêtre
    useEffect(() => {
        if (!showRefreshPaymentHint || !docteur?.id) return;
        setAutoVerifyIdle(false);
        const started = Date.now();
        const MAX_MS = 15 * 60 * 1000;
        const INTERVAL_MS = 10_000;

        void verifierEtSynchroniserPaiement();

        const intervalId = window.setInterval(() => {
            if (Date.now() - started > MAX_MS) {
                window.clearInterval(intervalId);
                setAutoVerifyIdle(true);
                return;
            }
            void verifierEtSynchroniserPaiement();
        }, INTERVAL_MS);

        return () => window.clearInterval(intervalId);
    }, [showRefreshPaymentHint, docteur?.id, verifierEtSynchroniserPaiement]);

    useEffect(() => {
        if (!showRefreshPaymentHint || !docteur?.id) return;
        const onWinFocus = () => {
            void verifierEtSynchroniserPaiement();
        };
        const onVisibility = () => {
            if (document.visibilityState === "visible") {
                void verifierEtSynchroniserPaiement();
            }
        };
        window.addEventListener("focus", onWinFocus);
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            window.removeEventListener("focus", onWinFocus);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, [showRefreshPaymentHint, docteur?.id, verifierEtSynchroniserPaiement]);

    // Vérifier si on est dans la période de grâce (une semaine après la création du compte docteur)
    const isInGracePeriod = () => {
        const creationDateValue = docteur?.dateCreation || docteur?.date_creation;
        if (!creationDateValue) {
            return true; // Si pas de date, considérer qu'on est dans la période de grâce
        }
        const today = new Date();
        const creationDate = new Date(creationDateValue);
        const gracePeriodEnd = new Date(creationDate);
        gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 7);
        return today < gracePeriodEnd;
    };

    const isUpToDate = () => {
        // Le paiement est à jour seulement si le statut est "actif" (vérifié via l'API backend)
        // Si le statut est "lecture_seule" ou "bloque", le paiement n'est pas à jour
        const result = paymentStatus === "actif";
        console.log("[BoutonPayement] isUpToDate:", { paymentStatus, result });
        return result;
    };

    // Vérifier si c'est le premier paiement
    const isFirstPayment = () => {
        // Vérifier directement dans la base de données via l'API backend
        // Si hasExistingPayment est false ou null, c'est le premier paiement
        if (hasExistingPayment === null) {
            // Si on n'a pas encore vérifié, utiliser les privilèges comme fallback
            return !privileges.includes("apy01");
        }
        // Si hasExistingPayment est false, c'est le premier paiement
        return !hasExistingPayment;
    };

    // Calculer le montant total
    const calculerMontant = () => {
        const prixInscription = new Date() <= new Date('2026-05-30') ?  500: 150_000; // 150.000 FCFA (inclut le premier mois)
        const prixMensuel = 100_000; // 100.000 FCFA / mois

        if (isFirstPayment()) {
            // Premier paiement : inscription (qui inclut déjà le premier mois) + (nombreMois - 1) mois supplémentaires
            // Si nombreMois = 1, on paie seulement l'inscription
            // Si nombreMois = 2, on paie inscription + 1 mois supplémentaire
            const moisSupplementaires = Math.max(0, nombreMois - 1);
            return prixInscription + (prixMensuel * moisSupplementaires);
        } else {
            // Paiements suivants : seulement les mois
            return prixMensuel * nombreMois;
        }
    };

    const handleOpenModal = () => {
        setShowModal(true);
        setErrorMessage("");
        setNombreMois(1);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setErrorMessage("");
        setNombreMois(1);
    };

    const handlePayer = async () => {
        if (nombreMois < 1 || nombreMois > 12) {
            setErrorMessage("Le nombre de mois doit être entre 1 et 12");
            return;
        }

        // Vérification garde-temps PayDunya avant paiement
        const guardResult = await canUsePayDunya();
        if (!guardResult.canUse) {
            setErrorMessage(guardResult.message || "PayDunya temporairement indisponible. Vérifiez l'horloge de votre ordinateur.");
            return;
        }

        setIsLoading(true);
        setErrorMessage("");

        try {
            const montantTotal = calculerMontant();
            const typePaiement = isFirstPayment() ? "inscription" : "mensuel";
            
            // Appeler le backend avec nombre_mois
            const url = await PageProfilController(pays).payerAvecPaydouniaMensuel(
                docteur,
                privileges,
                nombreMois,
                montantTotal,
                typePaiement
            );

            if (url) {
                const opened = await openExternalUrl(url);
                if (opened) {
                    if (payRefreshHintKey) {
                        try {
                            sessionStorage.setItem(payRefreshHintKey, "1");
                        } catch {
                            /* ignore */
                        }
                    }
                    setAutoVerifyIdle(false);
                    setShowRefreshPaymentHint(true);
                    handleCloseModal();
                } else {
                    setErrorMessage("Impossible d'ouvrir la page de paiement. Veuillez autoriser les popups ou vérifier votre configuration.");
                }
            } else {
                setErrorMessage("Échec de la récupération de l'URL de paiement");
            }
        } catch (error: any) {
            console.error("Erreur lors de la redirection vers le paiement:", error);
            setErrorMessage(error?.message || "Une erreur s'est produite lors de la redirection vers la page de paiement.");
        } finally {
            setIsLoading(false);
        }
    };

    const gracePeriodActive = isInGracePeriod();
    const paymentUpToDate = isUpToDate();
    const premierPaiement = isFirstPayment();
    const montantTotal = calculerMontant();
    const prixInscription = 150_000;
    const prixMensuel = 100_000;

    const libelleProchaineEcheance = (() => {
        if (!dateReferenceProchaine) return null;
        try {
            const d = new Date(dateReferenceProchaine);
            if (Number.isNaN(d.getTime())) return null;
            return d.toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
            });
        } catch {
            return null;
        }
    })();

    return (
        <>
            <div style={{ margin: "15px" }}>
                {paymentUpToDate ? (
                    <div style={{ border: "5px double " + themes[ActualthemeNumber].secondary, color: themes[ActualthemeNumber].secondary }}>
                        <center style={{ margin: "10px" }}>
                            <div>Vous êtes à jour</div>
                            {libelleProchaineEcheance && (
                                <div style={{ marginTop: 8, fontSize: 13, fontWeight: 500 }}>
                                    Prochaine date prévue pour le {libelleProchaineEcheance}
                                </div>
                            )}
                        </center>
                    </div>
                ) : (
                    <>
                        {gracePeriodActive && (
                            <div style={{ 
                                border: "2px solid #4CAF50", 
                                color: "#4CAF50",
                                padding: "10px",
                                marginBottom: "10px",
                                borderRadius: "8px",
                                background: "#f1f8f4",
                                fontSize: "13px"
                            }}>
                                <center style={{ fontWeight: "bold" }}>
                                    ⏳ Période de grâce active (1 semaine gratuite)
                                </center>
                            </div>
                        )}
                        {isCheckingPayment ? (
                            <div style={{ padding: "10px", textAlign: "center", color: themes[ActualthemeNumber].primary }}>
                                Vérification du statut de paiement...
                            </div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                {showRefreshPaymentHint && (
                                    <div
                                        className="loggappro-pay-refresh-hint"
                                        style={{
                                            border: `5px double #c9a227`,
                                            color: "#7a5f00",
                                            borderRadius: "8px",
                                            padding: "12px 14px",
                                            textAlign: "center",
                                            fontWeight: 600,
                                            fontSize: "14px",
                                            lineHeight: 1.45,
                                            background: "rgba(253, 218, 55, 0.45)",
                                        }}
                                    >
                                        <div>
                                            Après le paiement sur PayDunya, le statut est vérifié <strong>automatiquement</strong>{" "}
                                            (toutes les ~10&nbsp;s) et dès que vous revenez sur cette fenêtre.
                                        </div>
                                        {isVerifyingPayment && (
                                            <div style={{ marginTop: "8px", fontSize: "13px", fontWeight: 500 }}>
                                                Vérification en cours…
                                            </div>
                                        )}
                                        {autoVerifyIdle && (
                                            <div style={{ marginTop: "10px", fontSize: "12px", fontWeight: 500 }}>
                                                La vérification automatique s’est arrêtée après 15&nbsp;minutes. Si vous avez payé,
                                                rechargez la page (F5) ou rouvrez l’application.
                                            </div>
                                        )}
                                    </div>
                                )}
                                <style>{`
                                    @keyframes loggapproPayRefreshPulse {
                                        0%, 100% {
                                            box-shadow: 0 0 0 0 rgba(201, 162, 39, 0.55);
                                            background: rgba(253, 218, 55, 0.38);
                                        }
                                        50% {
                                            box-shadow: 0 0 14px 4px rgba(253, 200, 50, 0.85);
                                            background: rgba(253, 218, 55, 0.62);
                                        }
                                    }
                                    .loggappro-pay-refresh-hint {
                                        animation: loggapproPayRefreshPulse 1.25s ease-in-out infinite;
                                    }
                                `}</style>
                                <input
                                    type="button"
                                    className="form-control"
                                    value="Payer la mensualité"
                                    onClick={handleOpenModal}
                                    disabled={false}
                                    style={{
                                        border: "5px double " + themes[ActualthemeNumber].secondary,
                                        color: themes[ActualthemeNumber].quaternary,
                                        cursor: "pointer",
                                        opacity: 1,
                                        fontWeight: "bold"
                                    }} />
                                {errorMessage && (
                                    <div style={{
                                        padding: "8px",
                                        background: "#fee",
                                        border: "1px solid #c00",
                                        borderRadius: "4px",
                                        color: "#c00",
                                        fontSize: "12px",
                                    }}>
                                        {errorMessage}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Modal de paiement */}
            <Modal
                show={showModal}
                onClose={handleCloseModal}
                title="Paiement LoggAppro"
                width="600px"
                maxWidth="90vw"
            >
                <ModalSection>
                    <div style={{ marginBottom: "12px" }}>
                        <h5 style={{ color: themes[ActualthemeNumber].secondary, marginBottom: "10px", fontSize: "15px" }}>
                            Sélectionnez le nombre de mois à payer
                        </h5>
                        
                        <ModalField
                            id="nombreMois"
                            label="Nombre de mois (max 12)"
                            type="number"
                            value={nombreMois}
                            onChange={(e) => {
                                const value = parseInt(e.target.value) || 1;
                                setNombreMois(Math.min(Math.max(value, 1), 12));
                            }}
                            min={1}
                            max={12}
                        />

                        {/* Détails du paiement */}
                        <div style={{
                            marginTop: "12px",
                            padding: "12px",
                            backgroundColor: "#f8f9fa",
                            borderRadius: "6px",
                            border: "1px solid #dee2e6"
                        }}>
                            <h6 style={{ color: themes[ActualthemeNumber].secondary, marginBottom: "8px", fontSize: "13px" }}>
                                Détails du paiement
                            </h6>
                            
                            {premierPaiement && (
                                <>
                                    <div style={{ 
                                        marginBottom: "10px", 
                                        padding: "8px",
                                        backgroundColor: "#e8f5e9",
                                        borderRadius: "4px",
                                        border: "1px solid #4CAF50",
                                        fontSize: "12px"
                                    }}>
                                        <div style={{ 
                                            display: "flex", 
                                            justifyContent: "space-between", 
                                            marginBottom: "4px",
                                            fontWeight: "600",
                                            color: "#2e7d32"
                                        }}>
                                            <span>💰 Paiement d'inscription (inclut le 1er mois):</span>
                                            <strong>{prixInscription.toLocaleString('fr-FR')} FCFA</strong>
                                        </div>
                                        <div style={{ fontSize: "11px", color: "#555", fontStyle: "italic" }}>
                                            Ce montant inclut déjà le paiement du premier mois d'utilisation
                                        </div>
                                    </div>
                                    {nombreMois > 1 && (
                                        <div style={{ marginBottom: "6px", fontSize: "12px" }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                                                <span>📅 Mois supplémentaires ({nombreMois - 1} mois × {prixMensuel.toLocaleString('fr-FR')} FCFA):</span>
                                                <strong>{(prixMensuel * (nombreMois - 1)).toLocaleString('fr-FR')} FCFA</strong>
                                            </div>
                                        </div>
                                    )}
                                    {nombreMois === 1 && (
                                        <div style={{ 
                                            marginBottom: "6px", 
                                            fontSize: "11px", 
                                            color: "#666",
                                            fontStyle: "italic",
                                            paddingLeft: "4px"
                                        }}>
                                            ✓ Vous payez uniquement l'inscription pour le premier mois
                                        </div>
                                    )}
                                </>
                            )}
                            
                            {!premierPaiement && (
                                <div style={{ marginBottom: "6px", fontSize: "12px" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                                        <span>Paiement mensuel ({nombreMois} mois × {prixMensuel.toLocaleString('fr-FR')} FCFA):</span>
                                        <strong>{(prixMensuel * nombreMois).toLocaleString('fr-FR')} FCFA</strong>
                                    </div>
                                </div>
                            )}

                            <div style={{
                                marginTop: "10px",
                                paddingTop: "10px",
                                borderTop: "2px solid " + themes[ActualthemeNumber].secondary,
                                fontSize: "14px",
                                fontWeight: "bold"
                            }}>
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span>Total à payer:</span>
                                    <span style={{ color: themes[ActualthemeNumber].secondary }}>
                                        {montantTotal.toLocaleString('fr-FR')} FCFA
                                    </span>
                                </div>
                            </div>
                        </div>

                        {errorMessage && (
                            <div style={{
                                marginTop: "10px",
                                padding: "8px",
                                background: "#fee",
                                border: "1px solid #c00",
                                borderRadius: "4px",
                                color: "#c00",
                                fontSize: "12px"
                            }}>
                                {errorMessage}
                            </div>
                        )}
                    </div>
                </ModalSection>

                <ModalActions>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={handleCloseModal}
                        disabled={isLoading}
                    >
                        Annuler
                    </button>
                    <button
                        type="button"
                        className="btn"
                        onClick={handlePayer}
                        disabled={isLoading || nombreMois < 1 || nombreMois > 12}
                        style={{
                            backgroundColor: themes[ActualthemeNumber].secondary,
                            color: themes[ActualthemeNumber].primary,
                            border: "none"
                        }}
                    >
                        {isLoading ? "Traitement..." : `Payer ${montantTotal.toLocaleString('fr-FR')} FCFA`}
                    </button>
                </ModalActions>
            </Modal>
        </>
    );
}

export default BoutonPayement;
