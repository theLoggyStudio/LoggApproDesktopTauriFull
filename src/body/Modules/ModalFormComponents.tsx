import React from 'react';
import { useTheme } from '../context/ThemeContext.tsx';
import { themes } from '../../constants/index.ts';

// ==================== TYPES ====================
export interface ModalFieldProps {
    id: string;
    label: string;
    type?: string;
    value: string | number;
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
    placeholder?: string;
    rows?: number;
    min?: string | number;
    max?: string | number;
    step?: string | number;
    style?: React.CSSProperties;
    options?: { value: string | number; label: string }[];
    fullWidth?: boolean;
}

export interface ModalSectionProps {
    title?: string;
    children: React.ReactNode;
}

export interface ModalGridProps {
    children: React.ReactNode;
    columns?: number;
}

// ==================== COMPOSANTS ====================

/**
 * Champ de formulaire modal optimisé avec meilleur alignement
 */
export const ModalField: React.FC<ModalFieldProps> = ({
    id,
    label,
    type = 'text',
    value,
    onChange,
    placeholder,
    rows,
    min,
    max,
    step,
    style,
    options,
    fullWidth = false
}) => {
    const { themeNumber } = useTheme();
    const theme = themes[themeNumber || 0];
    
    const borderColor = (style?.borderColor as string) || theme.primary || '#5A28A5';
    
    const baseInputStyle: React.CSSProperties = {
        width: '100%',
        padding: '8px 12px',
        fontSize: '13px',
        fontFamily: theme.fontFamily,
        border: `2px solid ${borderColor}`,
        borderRadius: '6px',
        backgroundColor: '#fff',
        color: '#333',
        transition: 'all 0.2s ease',
        boxSizing: 'border-box',
        outline: 'none',
        ...style
    };

    const labelStyle: React.CSSProperties = {
        display: 'block',
        marginBottom: '6px',
        fontSize: '12px',
        fontWeight: '600',
        color: theme.primary || '#5A28A5',
        fontFamily: theme.fontFamily
    };

    const containerStyle: React.CSSProperties = {
        width: fullWidth ? '100%' : 'auto',
        marginBottom: '12px'
    };

    const inputHoverStyle = {
        borderColor: theme.secondary || '#fdda37',
        boxShadow: `0 0 0 3px ${(theme.secondary || '#fdda37')}20`
    };

    const inputFocusStyle = {
        borderColor: theme.primary || '#5A28A5',
        boxShadow: `0 0 0 3px ${(theme.primary || '#5A28A5')}30`
    };

    return (
        <div style={containerStyle}>
            <label htmlFor={id} style={labelStyle}>
                {label}
            </label>
            {rows ? (
                <textarea
                    id={id}
                    value={value}
                    onChange={onChange}
                    rows={rows}
                    placeholder={placeholder}
                    style={{
                        ...baseInputStyle,
                        resize: 'vertical',
                        minHeight: `${rows * 24}px`,
                        fontFamily: 'inherit'
                    }}
                    onMouseEnter={(e) => {
                        Object.assign(e.currentTarget.style, inputHoverStyle);
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = borderColor;
                        e.currentTarget.style.boxShadow = 'none';
                    }}
                    onFocus={(e) => {
                        Object.assign(e.currentTarget.style, inputFocusStyle);
                    }}
                    onBlur={(e) => {
                        e.currentTarget.style.borderColor = borderColor;
                        e.currentTarget.style.boxShadow = 'none';
                    }}
                />
            ) : options ? (
                <select
                    id={id}
                    value={value}
                    onChange={onChange}
                    style={{
                        ...baseInputStyle,
                        cursor: 'pointer',
                        appearance: 'none',
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='${encodeURIComponent(theme.primary || '#5A28A5')}' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 12px center',
                        paddingRight: '40px'
                    }}
                    onMouseEnter={(e) => {
                        Object.assign(e.currentTarget.style, inputHoverStyle);
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = borderColor;
                        e.currentTarget.style.boxShadow = 'none';
                    }}
                    onFocus={(e) => {
                        Object.assign(e.currentTarget.style, inputFocusStyle);
                    }}
                    onBlur={(e) => {
                        e.currentTarget.style.borderColor = borderColor;
                        e.currentTarget.style.boxShadow = 'none';
                    }}
                >
                    {options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            ) : (
                <input
                    type={type}
                    id={id}
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    min={min}
                    max={max}
                    step={step}
                    style={baseInputStyle}
                    onMouseEnter={(e) => {
                        Object.assign(e.currentTarget.style, inputHoverStyle);
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = borderColor;
                        e.currentTarget.style.boxShadow = 'none';
                    }}
                    onFocus={(e) => {
                        Object.assign(e.currentTarget.style, inputFocusStyle);
                    }}
                    onBlur={(e) => {
                        e.currentTarget.style.borderColor = borderColor;
                        e.currentTarget.style.boxShadow = 'none';
                    }}
                />
            )}
        </div>
    );
};

/**
 * Section de modal avec titre optionnel
 */
export const ModalSection: React.FC<ModalSectionProps> = ({ title, children }) => {
    const { themeNumber } = useTheme();
    const theme = themes[themeNumber || 0];

    return (
        <div style={{
            marginBottom: '15px',
            paddingBottom: '12px',
            borderBottom: title ? `2px solid ${theme.secondary || '#fdda37'}40` : 'none'
        }}>
            {title && (
                <h5 style={{
                    fontSize: '14px',
                    fontWeight: '700',
                    color: theme.primary || '#5A28A5',
                    marginBottom: '12px',
                    paddingBottom: '8px',
                    borderBottom: `2px solid ${theme.primary || '#5A28A5'}30`,
                    fontFamily: theme.fontTitle || theme.fontFamily
                }}>
                    {title}
                </h5>
            )}
            {children}
        </div>
    );
};

/**
 * Grille responsive pour les champs de formulaire avec meilleur alignement
 */
export const ModalGrid: React.FC<ModalGridProps> = ({ children, columns = 2 }) => {
    return (
        <div 
            style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${columns}, 1fr)`,
                gap: '20px',
                alignItems: 'start',
                width: '100%'
            }}
        >
            {children}
        </div>
    );
};

/**
 * Conteneur d'actions pour les boutons du modal avec meilleur alignement
 */
export const ModalActions: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { themeNumber } = useTheme();
    const theme = themes[themeNumber || 0];

    return (
        <div
            className="modal-actions d-flex flex-wrap gap-2 justify-content-end align-items-center"
            style={{
                marginTop: "15px",
                paddingTop: "12px",
                borderTop: `2px solid ${theme.secondary || "#fdda37"}30`,
                width: "100%",
            }}
        >
            {children}
        </div>
    );
};

