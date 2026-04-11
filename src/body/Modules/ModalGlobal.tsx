import React, { useEffect, useState } from "react";
import { useTheme } from '../context/ThemeContext.js';
import { themes } from '../../constants/index.ts';

interface ModalGlobalProps {
  show: boolean;
  onClose: () => void;
  title?: string | React.ReactNode;
  children: React.ReactNode;
  width?: string | number;
  maxWidth?: string | number;
  minHeight?: string | number;
  maxHeight?: string | number;
  style?: React.CSSProperties;
  showCloseButton?: boolean;
  /** Si false, clic sur le fond : ne ferme pas (modal bloquante). Défaut : true. */
  closeOnBackdropClick?: boolean;
  /** Couleur du titre dans l’en-tête (sinon `theme.secondary`). */
  titleColor?: string;
  zIndex?: number;
}

const ModalGlobal: React.FC<ModalGlobalProps> = ({
  show,
  onClose,
  title,
  children,
  width = '75vw',
  maxWidth = '75vw',
  minHeight = 'auto',
  maxHeight = '75vh',
  style = {},
  showCloseButton = true,
  closeOnBackdropClick = true,
  titleColor,
  zIndex = 10000,
}) => {
  const { themeNumber } = useTheme();
  const theme = themes[themeNumber];
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (show) {
      setIsAnimating(true);
      // Petite temporisation pour activer l'animation
      setTimeout(() => setIsVisible(true), 10);
      
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      document.body.classList.add('modal-open');
      document.documentElement.classList.add('modal-open');
      
      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.classList.remove('modal-open');
        document.documentElement.classList.remove('modal-open');
      };
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => setIsAnimating(false), 300);
      return () => clearTimeout(timer);
    }
  }, [show]);

  if (!show && !isAnimating) return null;

  return (
    <div
      className="modal-global-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backdropFilter: isVisible ? 'blur(12px)' : 'blur(0px)',
        WebkitBackdropFilter: isVisible ? 'blur(12px)' : 'blur(0px)',
        backgroundColor: isVisible ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0)',
        zIndex: zIndex,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'backdrop-filter 0.3s ease, background-color 0.3s ease',
        padding: '20px'
      }}
      onClick={closeOnBackdropClick ? onClose : undefined}
      role="presentation"
    >
      <div
        className="modal-global-content"
        style={{
          background: '#ffffff',
          color: theme.primary,
          borderRadius: '20px',
          boxShadow: `0 25px 70px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.05)`,
          minHeight,
          maxHeight,
          width,
          maxWidth,
          position: 'relative',
          padding: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(30px)',
          opacity: isVisible ? 1 : 0,
          transition: 'all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
          ...style
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header avec design moderne */}
        <div style={{
          background: `linear-gradient(135deg, ${theme.quaternary}f5 0%, ${theme.quaternary} 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '24px 28px',
          borderBottom: `1px solid ${theme.primary}15`,
          position: 'relative'
        }}>
          {/* Déco subtile */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: `radial-gradient(circle at top right, ${theme.primary}20 0%, transparent 70%)`,
            pointerEvents: 'none'
          }} />
          
          {title && (
            <h4 style={{
              flex: 1,
              margin: 0,
              color: titleColor ?? theme.secondary,
              fontWeight: 700,
              fontSize: '1.65rem',
              letterSpacing: '-0.02em',
              position: 'relative',
              zIndex: 1
            }}>
              {title}
            </h4>
          )}
          {showCloseButton && (
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.15)',
                backdropFilter: 'blur(10px)',
                border: 'none',
                color: theme.secondary,
                fontSize: '20px',
                cursor: 'pointer',
                marginLeft: '16px',
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                fontWeight: 'bold',
                position: 'relative',
                zIndex: 1,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)';
                e.currentTarget.style.transform = 'rotate(90deg) scale(1.05)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                e.currentTarget.style.transform = 'rotate(0deg) scale(1)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
              }}
              aria-label="Fermer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Contenu avec scroll si nécessaire */}
        <div style={{
          background: `linear-gradient(135deg, ${theme.quaternary} 0%, ${theme.quaternary} 100%)`,
          padding: '32px 40px 40px 40px',
          overflowY: 'auto',
          overflowX: 'hidden',
          flex: 1,
        }}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default ModalGlobal; 