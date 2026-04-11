import React from 'react';

/**
 * Coque commune des modals « données d’aperçu » Page État (même modèle que 🦷 Sélectionner l’acte…).
 * Fond assombri, carte blanche, titre h2 couleur thème.
 */
export interface EtatPreviewSelectionModalProps {
  show: boolean;
  /** Clic sur le fond (hors carte) */
  onBackdropClick: () => void;
  /** Couleur primaire du thème (titres, accents) */
  themePrimary: string;
  /** Texte ou nœud affiché dans le &lt;h2&gt; (style identique au modal actes) */
  title: React.ReactNode;
  children: React.ReactNode;
  /** Bandeau optionnel sous le titre (ex. étape 1/2) */
  banner?: React.ReactNode;
  /** Rangée de boutons (Annuler / Valider, Fermer, etc.) */
  footer?: React.ReactNode;
  maxWidth?: string;
  zIndex?: number;
}

const panelStyle: React.CSSProperties = {
  backgroundColor: 'white',
  borderRadius: '10px',
  padding: '25px',
  width: '90%',
  maxHeight: '80vh',
  overflow: 'auto',
  boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
};

const EtatPreviewSelectionModal: React.FC<EtatPreviewSelectionModalProps> = ({
  show,
  onBackdropClick,
  themePrimary,
  title,
  children,
  banner,
  footer,
  maxWidth = '800px',
  zIndex = 10000,
}) => {
  if (!show) return null;

  const titleStyle: React.CSSProperties = {
    margin: '0 0 20px 0',
    color: themePrimary,
    fontSize: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  };

  const footerRowStyle: React.CSSProperties = {
    display: 'flex',
    gap: '10px',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    marginTop: '20px',
  };

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onBackdropClick();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{ ...panelStyle, maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={titleStyle}>{title}</h2>
        {banner}
        {children}
        {footer ? <div style={footerRowStyle}>{footer}</div> : null}
      </div>
    </div>
  );
};

export default EtatPreviewSelectionModal;
