import React, { useEffect, useState } from 'react';
import { Modal as ModalGlobal } from '../../items/Modal.tsx';
import { themes } from '../../constants/index.ts';
import { useTheme } from '../context/ThemeContext';
import { PageProfilController } from '../controllers/PageProfilController';
import { canUsePayDunya } from '../services/PayDunyaTimeGuardService';
import { openExternalUrl } from '../../tauri-bridge';
import { AlertTriangle, CreditCard } from 'lucide-react';

interface ModalPaiementExpireProps {
    show: boolean;
    onClose: () => void;
    docteur: any;
    privileges: string[];
    pays: string;
}

const ModalPaiementExpire: React.FC<ModalPaiementExpireProps> = ({ show, onClose, docteur, privileges, pays }) => {
    const { themeNumber } = useTheme();
    const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [payDunyaBlocked, setPayDunyaBlocked] = useState<string | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);

    useEffect(() => {
        const chargerUrlPaiement = async () => {
            if (show && docteur && privileges) {
                setLoading(true);
                setPayDunyaBlocked(null);
                try {
                    // Vérification garde-temps PayDunya avant de charger l'URL
                    const guardResult = await canUsePayDunya();
                    if (!guardResult.canUse) {
                        setPaymentUrl(null);
                        setPayDunyaBlocked(guardResult.message || "PayDunya temporairement indisponible.");
                        setLoading(false);
                        return;
                    }
                    setPayDunyaBlocked(null);
                    const url = await PageProfilController(pays).payerAvecPaydounia(docteur, privileges);
                    setPaymentUrl(url);
                } catch (error) {
                    console.error("Erreur lors du chargement de l'URL de paiement:", error);
                } finally {
                    setLoading(false);
                }
            }
        };
        chargerUrlPaiement();
    }, [show, docteur, privileges, pays]);

    const handlePayer = async () => {
        if (paymentUrl) {
            const opened = await openExternalUrl(paymentUrl);
            if (!opened) {
                alert("Impossible d'ouvrir la page de paiement. Veuillez autoriser les popups ou vérifier votre configuration.");
            }
        }
    };

    const handleJaiPaye = async () => {
        setIsVerifying(true);
        try {
            const tabId = docteur?.role === "docteur" ? docteur?.id : docteur?.loggId ?? "main";
            const status = await PageProfilController(pays).verifierStatutPaiement(docteur?.id ?? "", tabId);
            if (status?.statut === "actif" && status?.derniereDatePaiement?.date_creation) {
                await PageProfilController(pays).enregistrerDerniereDatePaiement(
                    docteur?.id ?? "",
                    tabId,
                    status.derniereDatePaiement.date_creation
                );
                onClose();
            } else {
                alert("Paiement non encore enregistré. Si vous venez de payer, attendez quelques instants puis réessayez.");
            }
        } catch (err) {
            console.error("Erreur lors de la vérification du paiement:", err);
            alert("Impossible de vérifier le paiement. Actualisez la page ou réessayez.");
        } finally {
            setIsVerifying(false);
        }
    };

    return (
        <ModalGlobal
            show={show}
            onClose={onClose}
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <AlertTriangle size={24} color={themes[themeNumber].primary} />
                    <span>Paiement requis</span>
                </div>
            }
            maxWidth="500px"
        >
            <div style={{ padding: '20px', textAlign: 'center' }}>
                <p style={{ marginBottom: '20px', fontSize: '16px', color: themes[themeNumber].primary }}>
                    Votre abonnement a expiré. Pour continuer à utiliser l'application en mode complet, veuillez effectuer un paiement.
                </p>
                <p style={{ marginBottom: '30px', fontSize: '14px', color: themes[themeNumber].primary + '80' }}>
                    Vous êtes actuellement en mode lecture seule. Vous pouvez consulter les données mais ne pouvez pas les modifier.
                </p>
                {loading ? (
                    <div style={{ padding: '20px' }}>
                        <p>Chargement de la page de paiement...</p>
                    </div>
                ) : payDunyaBlocked ? (
                    <div style={{
                        padding: '20px',
                        backgroundColor: '#fff3cd',
                        border: '1px solid #ffc107',
                        borderRadius: '8px',
                        color: '#856404',
                        marginTop: '10px'
                    }}>
                        <p style={{ marginBottom: '10px', fontWeight: 600 }}>⚠️ Paiement indisponible</p>
                        <p>{payDunyaBlocked}</p>
                        <p style={{ marginTop: '10px', fontSize: '13px' }}>
                            Vérifiez que l'horloge de votre ordinateur est correcte et réessayez plus tard.
                        </p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
                        <button
                            onClick={handlePayer}
                            disabled={!paymentUrl}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                margin: '0 auto',
                                padding: '15px 30px',
                                borderRadius: '8px',
                                border: 'none',
                                backgroundColor: paymentUrl ? themes[themeNumber].primary : themes[themeNumber].primary + '50',
                                color: themes[themeNumber].secondary,
                                cursor: paymentUrl ? 'pointer' : 'not-allowed',
                                fontSize: '16px',
                                fontWeight: '600',
                                transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                                if (paymentUrl) {
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = `0 4px 12px ${themes[themeNumber].primary}40`;
                                }
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = 'none';
                            }}
                        >
                            <CreditCard size={20} />
                            Effectuer le paiement
                        </button>
                        <button
                            onClick={handleJaiPaye}
                            disabled={isVerifying}
                            style={{
                                padding: '10px 20px',
                                borderRadius: '8px',
                                border: `2px solid ${themes[themeNumber].primary}`,
                                backgroundColor: 'transparent',
                                color: themes[themeNumber].primary,
                                cursor: isVerifying ? 'not-allowed' : 'pointer',
                                fontSize: '14px',
                            }}
                        >
                            {isVerifying ? 'Vérification...' : "J'ai payé / Actualiser"}
                        </button>
                    </div>
                )}
            </div>
        </ModalGlobal>
    );
};

export default ModalPaiementExpire;

