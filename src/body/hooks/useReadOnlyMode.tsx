import { useEffect, useState } from 'react';

export const useReadOnlyMode = () => {
    const [isReadOnly, setIsReadOnly] = useState(false);

    useEffect(() => {
        const checkReadOnlyMode = () => {
            const statutPaiement = sessionStorage.getItem('statutPaiement');
            setIsReadOnly(statutPaiement === 'lecture_seule');
        };

        checkReadOnlyMode();

        // Écouter le message de succès PayDunya (retour après paiement) pour désactiver le mode lecture seule
        const handlePaydunyaSuccess = () => {
            sessionStorage.setItem('statutPaiement', 'actif');
            setIsReadOnly(false);
        };

        const handleMessage = (e: MessageEvent) => {
            if (e.data?.type === 'PAYDUNYA_PAYMENT_SUCCESS') {
                handlePaydunyaSuccess();
            }
        };

        window.addEventListener('message', handleMessage);

        // Écouter les changements dans sessionStorage
        const handleStorageChange = () => {
            checkReadOnlyMode();
        };

        window.addEventListener('storage', handleStorageChange);

        // Vérifier périodiquement (toutes les 30 secondes)
        const interval = setInterval(checkReadOnlyMode, 30000);

        return () => {
            window.removeEventListener('message', handleMessage);
            window.removeEventListener('storage', handleStorageChange);
            clearInterval(interval);
        };
    }, []);

    return isReadOnly;
};

