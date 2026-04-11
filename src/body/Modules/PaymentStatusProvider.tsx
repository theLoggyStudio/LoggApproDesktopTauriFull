import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import AutorisationController from '../controllers/AutorisationController';
import ModalPaiementExpire from './ModalPaiementExpire';

interface PaymentStatusContextType {
    statutPaiement: 'actif' | 'lecture_seule' | 'bloque' | 'inconnu';
    setStatutPaiement: (statut: 'actif' | 'lecture_seule' | 'bloque' | 'inconnu') => void;
    docteur: any;
    privileges: string[];
}

const PaymentStatusContext = createContext<PaymentStatusContextType | undefined>(undefined);

export const usePaymentStatus = () => {
    const context = useContext(PaymentStatusContext);
    if (!context) {
        throw new Error('usePaymentStatus must be used within a PaymentStatusProvider');
    }
    return context;
};

interface PaymentStatusProviderProps {
    children: ReactNode;
    docteur: any;
    privileges: string[];
    pays: string;
}

export const PaymentStatusProvider: React.FC<PaymentStatusProviderProps> = ({ children, docteur, privileges, pays }) => {
    const [statutPaiement, setStatutPaiement] = useState<'actif' | 'lecture_seule' | 'bloque' | 'inconnu'>('inconnu');
    const [showModal, setShowModal] = useState(false);
    const [lastModalTime, setLastModalTime] = useState<number>(0);

    useEffect(() => {
        const verifierStatut = async () => {
            if (docteur && docteur.id) {
                try {
                    const tabId = docteur.role === "docteur" ? docteur.id : docteur.loggId;
                    const statut = await AutorisationController(pays).verifierStatutPaiement(docteur.id, tabId);
                    const nouveauStatut = statut.statut || 'inconnu';
                    setStatutPaiement(nouveauStatut as 'actif' | 'lecture_seule' | 'bloque' | 'inconnu');
                    
                    // Stocker dans sessionStorage
                    sessionStorage.setItem('statutPaiement', nouveauStatut);
                } catch (error) {
                    console.error("Erreur lors de la vérification du statut de paiement:", error);
                    // Récupérer depuis sessionStorage en cas d'erreur
                    const stored = sessionStorage.getItem('statutPaiement');
                    if (stored) {
                        setStatutPaiement(stored as 'actif' | 'lecture_seule' | 'bloque' | 'inconnu');
                    }
                }
            }
        };
        verifierStatut();
    }, [docteur, pays]);

    // Vérifier le statut depuis sessionStorage au chargement
    useEffect(() => {
        const stored = sessionStorage.getItem('statutPaiement');
        if (stored) {
            setStatutPaiement(stored as 'actif' | 'lecture_seule' | 'bloque' | 'inconnu');
        }
    }, []);

    // Afficher le modal toutes les 10 minutes si en mode lecture seule
    useEffect(() => {
        if (statutPaiement === 'lecture_seule') {
            const interval = setInterval(() => {
                const maintenant = Date.now();
                // Afficher le modal si 10 minutes (600000 ms) se sont écoulées depuis la dernière fois
                if (maintenant - lastModalTime >= 600000) {
                    setShowModal(true);
                    setLastModalTime(maintenant);
                }
            }, 60000); // Vérifier toutes les minutes

            // Afficher immédiatement au chargement si c'est la première fois
            if (lastModalTime === 0) {
                setShowModal(true);
                setLastModalTime(Date.now());
            }

            return () => clearInterval(interval);
        }
    }, [statutPaiement, lastModalTime]);

    return (
        <PaymentStatusContext.Provider value={{ statutPaiement, setStatutPaiement, docteur, privileges }}>
            {children}
            {statutPaiement === 'lecture_seule' && docteur && privileges && (
                <ModalPaiementExpire
                    show={showModal}
                    onClose={() => setShowModal(false)}
                    docteur={docteur}
                    privileges={privileges}
                    pays={pays}
                />
            )}
        </PaymentStatusContext.Provider>
    );
};

