import React, { useState, useEffect } from 'react';
import { Modal as ModalGlobal } from '../../items/Modal.tsx';
import TraceController, { type Trace } from '../controllers/TraceController';
import { themes } from '../../constants/index.ts';
import { useTheme } from '../context/ThemeContext';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { RefreshCw, Filter, Calendar, User, FileText, AlertCircle } from 'lucide-react';

interface ModalTraceProps {
    show: boolean;
    onClose: () => void;
    tabId: string;
    loggId: string;
    pays: string;
}

const ModalTrace: React.FC<ModalTraceProps> = ({ show, onClose, tabId, loggId, pays }) => {
    const [traces, setTraces] = useState<Trace[]>([]);
    const [loading, setLoading] = useState(false);
    const [filtreType, setFiltreType] = useState<string>('tous');
    const [filtreAction, setFiltreAction] = useState<string>('tous');
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [totalTraces, setTotalTraces] = useState(0);
    const { themeNumber } = useTheme();

    useEffect(() => {
        if (show) {
            chargerTraces();
        }
    }, [show, tabId, loggId, page, limit]);

    const chargerTraces = async () => {
        try {
            setLoading(true);
            const offset = (page - 1) * limit;
            const tracesData = await TraceController(pays).listerTracesAvecPagination(tabId, limit, offset);
            setTraces(tracesData);
            // On estime le total basé sur le nombre de résultats
            if (tracesData.length === limit) {
                setTotalTraces(page * limit + 1); // Il y a au moins une page de plus
            } else {
                setTotalTraces((page - 1) * limit + tracesData.length);
            }
        } catch (error) {
            console.error("Erreur lors du chargement des traces:", error);
            setTraces([]);
        } finally {
            setLoading(false);
        }
    };

    const getActionIcon = (action: string) => {
        switch (action) {
            case 'create': return '➕';
            case 'update': return '✏️';
            case 'delete': return '🗑️';
            default: return '📝';
        }
    };

    const getActionText = (action: string) => {
        switch (action) {
            case 'create': return 'Création';
            case 'update': return 'Modification';
            case 'delete': return 'Suppression';
            default: return action;
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'acte': return '🩺';
            case 'patient': return '👤';
            case 'assurance': return '🏥';
            case 'nomActe': return '📋';
            case 'nomAssurance': return '📄';
            case 'typeActe': return '📋';
            case 'typeAssurance': return '📄';
            default: return '📁';
        }
    };

    const getTypeText = (type: string) => {
        switch (type) {
            case 'acte': return 'Acte';
            case 'patient': return 'Patient';
            case 'assurance': return 'Assurance';
            case 'nomActe': return 'Type d\'acte';
            case 'nomAssurance': return 'Type d\'assurance';
            case 'typeActe': return 'Type d\'acte';
            case 'typeAssurance': return 'Type d\'assurance';
            default: return type;
        }
    };

    const tracesFiltered = traces.filter(trace => {
        const matchType = filtreType === 'tous' || trace.type_entite === filtreType;
        const matchAction = filtreAction === 'tous' || trace.action === filtreAction;
        return matchType && matchAction;
    });

    const typesUniques = ['tous', ...Array.from(new Set(traces.map(t => t.type_entite)))];
    const actionsUniques = ['tous', 'create', 'update', 'delete'];

    return (
        <ModalGlobal
            show={show}
            onClose={onClose}
            title="📜 Historique des actions"
            maxWidth="1200px"
            maxHeight="90vh"
        >
            {/* En-tête avec filtres et rafraîchir */}
            <div style={{
                display: 'flex',
                gap: '15px',
                marginBottom: '20px',
                padding: '15px',
                backgroundColor: themes[themeNumber].secondary + '20',
                borderRadius: '8px',
                flexWrap: 'wrap',
                alignItems: 'center'
            }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1 }}>
                    <Filter size={18} color={themes[themeNumber].primary} />
                    <select
                        value={filtreType}
                        onChange={(e) => setFiltreType(e.target.value)}
                        style={{
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: `2px solid ${themes[themeNumber].primary}`,
                            backgroundColor: '#fff',
                            color: themes[themeNumber].primary,
                            cursor: 'pointer',
                            fontSize: '14px'
                        }}
                    >
                        {typesUniques.map(type => (
                            <option key={type} value={type}>
                                {type === 'tous' ? 'Tous les types' : getTypeText(type)}
                            </option>
                        ))}
                    </select>

                    <select
                        value={filtreAction}
                        onChange={(e) => setFiltreAction(e.target.value)}
                        style={{
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: `2px solid ${themes[themeNumber].primary}`,
                            backgroundColor: '#fff',
                            color: themes[themeNumber].primary,
                            cursor: 'pointer',
                            fontSize: '14px'
                        }}
                    >
                        {actionsUniques.map(action => (
                            <option key={action} value={action}>
                                {action === 'tous' ? 'Toutes les actions' : getActionText(action)}
                            </option>
                        ))}
                    </select>
                </div>

                <button
                    onClick={chargerTraces}
                    disabled={loading}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: themes[themeNumber].primary,
                        color: themes[themeNumber].secondary,
                        cursor: loading ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        fontWeight: '500',
                        opacity: loading ? 0.6 : 1
                    }}
                >
                    <RefreshCw size={16} />
                    Actualiser
                </button>

                <div style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    backgroundColor: themes[themeNumber].primary + '15',
                    color: themes[themeNumber].primary,
                    fontSize: '14px',
                    fontWeight: '600'
                }}>
                    {tracesFiltered.length} trace{tracesFiltered.length > 1 ? 's' : ''}
                </div>
            </div>

            {/* Liste des traces */}
            <div style={{
                maxHeight: '500px',
                overflowY: 'auto',
                padding: '10px'
            }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: themes[themeNumber].primary }}>
                        <RefreshCw size={32} style={{ animation: 'spin 1s linear infinite' }} />
                        <p style={{ marginTop: '10px' }}>Chargement des traces...</p>
                    </div>
                ) : tracesFiltered.length === 0 ? (
                    <div style={{
                        textAlign: 'center',
                        padding: '40px',
                        color: themes[themeNumber].primary + '80'
                    }}>
                        <AlertCircle size={48} />
                        <p style={{ marginTop: '15px', fontSize: '16px' }}>Aucune trace trouvée</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {tracesFiltered.map((trace, index) => (
                            <div
                                key={trace.id}
                                style={{
                                    padding: '15px',
                                    borderRadius: '8px',
                                    backgroundColor: index % 2 === 0 ? '#fff' : themes[themeNumber].secondary + '15',
                                    border: `1px solid ${themes[themeNumber].primary}15`,
                                    transition: 'all 0.2s ease',
                                    cursor: 'pointer'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = themes[themeNumber].primary + '10';
                                    e.currentTarget.style.transform = 'translateX(5px)';
                                    e.currentTarget.style.boxShadow = `0 2px 8px ${themes[themeNumber].primary}30`;
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#fff' : themes[themeNumber].secondary + '15';
                                    e.currentTarget.style.transform = 'translateX(0)';
                                    e.currentTarget.style.boxShadow = 'none';
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '15px' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                            <span style={{ fontSize: '20px' }}>{getActionIcon(trace.action)}</span>
                                            <span style={{ fontSize: '20px' }}>{getTypeIcon(trace.type_entite)}</span>
                                            <span style={{
                                                fontSize: '16px',
                                                fontWeight: '600',
                                                color: themes[themeNumber].primary
                                            }}>
                                                {getActionText(trace.action)} - {getTypeText(trace.type_entite)}
                                            </span>
                                        </div>

                                        <div style={{ marginLeft: '56px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <FileText size={14} color={themes[themeNumber].primary} />
                                                <span style={{ fontSize: '14px', color: themes[themeNumber].primary }}>
                                                    <strong>{trace.nom_entite}</strong>
                                                </span>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <User size={14} color={themes[themeNumber].primary} />
                                                <span style={{ fontSize: '13px', color: themes[themeNumber].primary + '90' }}>
                                                    Par <strong>{trace.user_nom}</strong> ({trace.user_role})
                                                </span>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Calendar size={14} color={themes[themeNumber].primary} />
                                                <span style={{ fontSize: '13px', color: themes[themeNumber].primary + '80' }}>
                                                    {format(new Date(trace.date_action), "dd MMMM yyyy 'à' HH:mm", { locale: fr })}
                                                </span>
                                            </div>

                                            {trace.details && (
                                                <div style={{
                                                    marginTop: '6px',
                                                    padding: '8px',
                                                    backgroundColor: themes[themeNumber].secondary + '30',
                                                    borderRadius: '4px',
                                                    fontSize: '12px',
                                                    color: themes[themeNumber].primary + '80'
                                                }}>
                                                    {trace.details}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Contrôles de pagination */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '20px',
                padding: '15px',
                backgroundColor: themes[themeNumber].secondary + '20',
                borderRadius: '8px',
                flexWrap: 'wrap',
                gap: '10px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '14px', color: themes[themeNumber].primary }}>
                        Éléments par page:
                    </span>
                    <select
                        value={limit}
                        onChange={(e) => {
                            setLimit(Number(e.target.value));
                            setPage(1); // Retour à la page 1 quand on change la limite
                        }}
                        style={{
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: `2px solid ${themes[themeNumber].primary}`,
                            backgroundColor: '#fff',
                            color: themes[themeNumber].primary,
                            cursor: 'pointer',
                            fontSize: '14px'
                        }}
                    >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                    </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                        onClick={() => setPage(Math.max(1, page - 1))}
                        disabled={page === 1 || loading}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            border: 'none',
                            backgroundColor: page === 1 || loading ? themes[themeNumber].primary + '30' : themes[themeNumber].primary,
                            color: themes[themeNumber].secondary,
                            cursor: page === 1 || loading ? 'not-allowed' : 'pointer',
                            fontSize: '14px',
                            fontWeight: '500'
                        }}
                    >
                        ← Précédent
                    </button>

                    <div style={{
                        padding: '8px 16px',
                        backgroundColor: themes[themeNumber].primary + '15',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: themes[themeNumber].primary
                    }}>
                        Page {page}
                    </div>

                    <button
                        onClick={() => setPage(page + 1)}
                        disabled={traces.length < limit || loading}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            border: 'none',
                            backgroundColor: traces.length < limit || loading ? themes[themeNumber].primary + '30' : themes[themeNumber].primary,
                            color: themes[themeNumber].secondary,
                            cursor: traces.length < limit || loading ? 'not-allowed' : 'pointer',
                            fontSize: '14px',
                            fontWeight: '500'
                        }}
                    >
                        Suivant →
                    </button>
                </div>

                <div style={{
                    fontSize: '13px',
                    color: themes[themeNumber].primary + '80'
                }}>
                    Affichage de {(page - 1) * limit + 1} à {Math.min(page * limit, (page - 1) * limit + traces.length)} traces
                </div>
            </div>

            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </ModalGlobal>
    );
};

export default ModalTrace;

