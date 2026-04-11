import React, { useEffect, useState } from 'react';
import { Modal as ModalGlobal } from '../../items/Modal.tsx';
import { useTheme } from '../context/ThemeContext';
import { themes } from '../../constants/index.ts';
import { openExternalUrl } from '../../tauri-bridge';

interface ModalPaymentProps {
  show: boolean;
  onClose: () => void;
  paymentUrl: string | null;
  onPaymentSuccess?: () => void;
}

const ModalPayment: React.FC<ModalPaymentProps> = ({
  show,
  onClose,
  paymentUrl,
  onPaymentSuccess,
}) => {
  const { themeNumber } = useTheme();
  const theme = themes[themeNumber];
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (show && paymentUrl) {
      setIsLoading(true);
      setError(null);
    }
  }, [show, paymentUrl]);

  // Écouter les messages depuis l'iframe PayDunya
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Vérifier l'origine pour la sécurité (ajuster selon votre domaine PayDunya)
      if (event.data && typeof event.data === 'object') {
        // PayDunya peut envoyer des messages de statut
        if (event.data.status === 'completed' || event.data.status === 'success') {
          setIsLoading(false);
          if (onPaymentSuccess) {
            setTimeout(() => {
              onPaymentSuccess();
              onClose();
            }, 2000);
          } else {
            setTimeout(() => {
              onClose();
            }, 2000);
          }
        } else if (event.data.status === 'failed' || event.data.status === 'error') {
          setIsLoading(false);
          setError('Le paiement a échoué. Veuillez réessayer.');
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [onPaymentSuccess, onClose]);

  const handleIframeLoad = () => {
    setIsLoading(false);
  };

  const handleIframeError = () => {
    setIsLoading(false);
    setError('Erreur lors du chargement de la page de paiement. Veuillez réessayer.');
  };

  if (!show) return null;

  return (
    <ModalGlobal
      show={show}
      onClose={onClose}
      title="Paiement PayDunya"
      width="90vw"
      maxWidth="1200px"
      minHeight="600px"
      maxHeight="90vh"
      showCloseButton={true}
    >
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}>
        {isLoading && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255, 255, 255, 0.9)',
            zIndex: 1000,
          }}>
            <div style={{
              textAlign: 'center',
              color: theme.secondary,
            }}>
              <div style={{
                fontSize: '24px',
                marginBottom: '20px',
              }}>⏳</div>
              <div style={{
                fontSize: '18px',
                fontWeight: 'bold',
              }}>Chargement de la page de paiement...</div>
            </div>
          </div>
        )}

        {error && (
          <div style={{
            padding: '20px',
            marginBottom: '20px',
            background: '#fee',
            border: `2px solid ${theme.secondary}`,
            borderRadius: '8px',
            color: '#c00',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '18px', marginBottom: '10px' }}>❌</div>
            <div>{error}</div>
            <button
              onClick={() => {
                setError(null);
                setIsLoading(true);
                if (paymentUrl) {
                  // Recharger l'iframe
                  const iframe = document.getElementById('payment-iframe') as HTMLIFrameElement;
                  if (iframe) {
                    iframe.src = paymentUrl;
                  }
                }
              }}
              style={{
                marginTop: '15px',
                padding: '10px 20px',
                background: theme.secondary,
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '16px',
              }}
            >
              Réessayer
            </button>
          </div>
        )}

        {paymentUrl ? (
          <>
            {/* PayDunya peut bloquer l'affichage en iframe, donc on ouvre dans une nouvelle fenêtre si l'iframe échoue */}
          <iframe
            id="payment-iframe"
            src={paymentUrl}
            style={{
              width: '100%',
              height: '100%',
              minHeight: '600px',
              border: 'none',
              borderRadius: '8px',
              flex: 1,
            }}
            onLoad={(e) => {
              handleIframeLoad();
              // Vérifier si l'iframe a bien chargé du contenu
              try {
                const iframe = e.target as HTMLIFrameElement;
                // Si l'iframe est bloquée, le contenu sera vide ou une erreur
                setTimeout(() => {
                  try {
                    // Essayer d'accéder au contenu (peut échouer si X-Frame-Options bloque)
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (!iframeDoc || iframeDoc.body.innerHTML.trim() === '') {
                      console.warn('[ModalPayment] L\'iframe semble vide ou bloquée');
                      setError('La page de paiement ne peut pas s\'afficher dans cette fenêtre. Utilisez le bouton ci-dessous pour ouvrir PayDunya dans un nouvel onglet.');
                      setIsLoading(false);
                    }
                  } catch (crossOriginError) {
                    // Erreur CORS normale si l'iframe charge du contenu externe
                    // C'est normal, cela signifie que l'iframe fonctionne
                    console.log('[ModalPayment] Iframe chargée (erreur CORS normale pour contenu externe)');
                  }
                }, 2000);
              } catch (error) {
                console.warn('[ModalPayment] Erreur lors de la vérification de l\'iframe:', error);
              }
            }}
            onError={handleIframeError}
            title="Page de paiement PayDunya"
            allow="payment *; fullscreen"
            sandbox="allow-forms allow-scripts allow-same-origin allow-top-navigation allow-popups allow-popups-to-escape-sandbox allow-modals"
            referrerPolicy="no-referrer-when-downgrade"
          />
            {/* Bouton de secours si l'iframe ne charge pas */}
            <div style={{
              marginTop: '15px',
              padding: '15px',
              background: '#fff3cd',
              border: '1px solid #ffc107',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ marginBottom: '10px', fontSize: '14px', color: '#856404' }}>
                Si la page de paiement ne s'affiche pas, cliquez sur le bouton ci-dessous pour ouvrir PayDunya dans un nouvel onglet.
              </div>
              <button
                onClick={() => {
                  openExternalUrl(paymentUrl);
                }}
                style={{
                  padding: '10px 20px',
                  background: '#ffc107',
                  color: '#000',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: 'bold'
                }}
              >
                Ouvrir PayDunya dans un nouvel onglet
              </button>
            </div>
          </>
        ) : (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            color: theme.secondary,
          }}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>⚠️</div>
            <div style={{ fontSize: '18px' }}>URL de paiement non disponible</div>
          </div>
        )}

        <div style={{
          marginTop: '20px',
          padding: '15px',
          background: theme.quaternary + '20',
          borderRadius: '8px',
          fontSize: '14px',
          color: theme.secondary,
          textAlign: 'center',
        }}>
          <div style={{ marginBottom: '5px' }}>💳 Paiement sécurisé via PayDunya</div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>
            Après le paiement, vous serez automatiquement redirigé vers l'application
          </div>
        </div>
      </div>
    </ModalGlobal>
  );
};

export default ModalPayment;

