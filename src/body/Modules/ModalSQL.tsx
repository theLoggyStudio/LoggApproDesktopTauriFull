import React, { useState, useEffect } from 'react';
import { Modal as ModalGlobal } from '../../items/Modal.tsx';
import ConfigController, { type ConfigCredentials } from '../controllers/ConfigController';
import { getAdminConfig } from '../../constants/index.ts';
import { themes } from '../../constants/index.ts';
import { useTheme } from '../context/ThemeContext';
import { useAlert } from '../context/SearchContext';
import { Database, Play, AlertTriangle, Loader, LogIn } from 'lucide-react';
import Form from 'react-bootstrap/Form';

const DB_COLORS = ['admin', 'yellow', 'green', 'blue', 'orange', 'pink'] as const;

interface ModalSQLProps {
    show: boolean;
    onClose: () => void;
    pays: string;
    tabId?: string;
}

const ModalSQL: React.FC<ModalSQLProps> = ({ show, onClose, pays, tabId = 'main' }) => {
    const [sqlQuery, setSqlQuery] = useState('');
    const [results, setResults] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [queryHistory, setQueryHistory] = useState<string[]>([]);
    const [terminalOutput, setTerminalOutput] = useState<string>('');
    const [dbColor, setDbColor] = useState<string>('admin');
    const [sadminLogin, setSadminLogin] = useState('');
    const [sadminPassword, setSadminPassword] = useState('');
    const { themeNumber } = useTheme();
    const { setAlertObj } = useAlert();

    useEffect(() => {
        if (show) {
            const admin = getAdminConfig();
            setSadminLogin(admin.login);
            setSadminPassword(admin.password);
        }
    }, [show]);

    const getCreds = (): ConfigCredentials => ({ userId: sadminLogin, dbPassword: sadminPassword });

    const executeQuery = async () => {
        if (!sqlQuery.trim()) {
            setAlertObj({ type: 'warning', show: true, text: 'Veuillez entrer une requête SQL.' });
            return;
        }
        if (!sadminLogin || !sadminPassword) {
            setAlertObj({ type: 'warning', show: true, text: 'Identifiants Sadmin requis.' });
            return;
        }

        const dangerousKeywords = ['DROP', 'DELETE', 'TRUNCATE', 'ALTER', 'CREATE', 'GRANT', 'REVOKE', 'ATTACH', 'DETACH'];
        const upperQuery = sqlQuery.toUpperCase();
        const hasDangerousKeyword = dangerousKeywords.some(keyword => upperQuery.includes(keyword));
        if (hasDangerousKeyword) {
            const confirmMessage = `⚠️ ATTENTION : Cette requête contient des commandes potentiellement destructives (${dangerousKeywords.filter(k => upperQuery.includes(k)).join(', ')}).\n\nÊtes-vous sûr de vouloir continuer ?`;
            if (!window.confirm(confirmMessage)) return;
        }

        setLoading(true);
        setError(null);
        setResults(null);

        try {
            const data = await ConfigController(pays).executeSql(sqlQuery, dbColor, tabId, pays, getCreds());
            setResults(data);
            formatResultsForTerminal(data, sqlQuery);
            if (sqlQuery.trim() && !queryHistory.includes(sqlQuery.trim())) {
                setQueryHistory(prev => [sqlQuery.trim(), ...prev].slice(0, 20));
            }
            setAlertObj({ type: 'success', show: true, text: 'Requête exécutée avec succès.' });
        } catch (err: any) {
            const errorMessage = err.message || 'Erreur inconnue lors de l\'exécution de la requête';
            setError(errorMessage);
            setTerminalOutput(prev => prev + `\n<span style="color: #FF6B6B;">❌ ERREUR: ${errorMessage}</span>\n`);
            setAlertObj({ type: 'error', show: true, text: errorMessage });
        } finally {
            setLoading(false);
        }
    };


    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            executeQuery();
        }
    };

    const loadQueryFromHistory = (query: string) => {
        // Si le textarea est vide, mettre la requête directement
        if (!sqlQuery.trim()) {
            setSqlQuery(query);
        } else {
            // Sinon, ajouter à la ligne suivante
            setSqlQuery(prev => prev + '\n' + query);
        }
    };

    const formatResultsForTerminal = (data: any, query: string) => {
        // Requête en jaune avec balises HTML pour le style
        let output = `\n<span style="color: #FFD700;">> ${query}</span>\n`;
        
        if (data.rows && Array.isArray(data.rows) && data.rows.length > 0) {
            const columns = Object.keys(data.rows[0]);
            
            // Calculer la largeur maximale pour chaque colonne
            const columnWidths = columns.map(col => {
                const headerWidth = col.length;
                const maxDataWidth = Math.max(...data.rows.map((row: any) => {
                    const value = row[col];
                    return value === null || value === undefined ? 4 : String(value).length;
                }));
                return Math.max(headerWidth, maxDataWidth, 10); // Minimum 10 caractères
            });
            
            // En-tête avec les colonnes (en vert clair)
            const header = columns.map((col, idx) => col.padEnd(columnWidths[idx])).join(' | ');
            const separator = columns.map((_, idx) => '-'.repeat(columnWidths[idx])).join('-|-');
            output += `<span style="color: #90EE90;">${header}\n${separator}\n</span>`;
            
            // Lignes de données (en vert clair)
            data.rows.forEach((row: any) => {
                const values = columns.map((col, idx) => {
                    const value = row[col];
                    let displayValue = 'NULL';
                    if (value !== null && value !== undefined) {
                        displayValue = String(value);
                    }
                    return displayValue.padEnd(columnWidths[idx]);
                });
                output += `<span style="color: #90EE90;">${values.join(' | ')}\n</span>`;
            });
            
            // Message de succès en vert clair
            output += `\n<span style="color: #90EE90;">✓ ${data.rows.length} ligne(s) retournée(s)`;
            if (data.executionTime) {
                output += ` (${data.executionTime}ms)`;
            }
            output += `</span>`;
        } else if (data.affectedRows !== undefined) {
            output += `<span style="color: #90EE90;">✓ Requête exécutée avec succès. ${data.affectedRows} ligne(s) affectée(s)`;
            if (data.executionTime) {
                output += ` (${data.executionTime}ms)`;
            }
            output += `</span>`;
        } else {
            output += `<span style="color: #90EE90;">✓ Requête exécutée (aucun résultat retourné)`;
            if (data.executionTime) {
                output += ` (${data.executionTime}ms)`;
            }
            output += `</span>`;
        }
        
        output += '\n';
        setTerminalOutput(prev => prev + output);
    };

    return (
        <ModalGlobal
            show={show}
            onClose={onClose}
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Database size={24} />
                    <span>Console SQL (Sadmin)</span>
                </div>
            }
            maxWidth="1200px"
            maxHeight="90vh"
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Connexion Sadmin + sélection base */}
                <div style={{ border: `1px solid ${themes[themeNumber].primary}40`, borderRadius: 8, padding: 16 }}>
                    <Form.Label className="fw-bold d-flex align-items-center gap-2">
                        <LogIn size={18} color={themes[themeNumber].primary} />
                        Connexion Sadmin
                    </Form.Label>
                    <Form.Text className="d-block text-muted small mb-2">Identifiants requis. Mot de passe du jour : 706JJMMAAAA</Form.Text>
                    <div className="row g-2 mb-2">
                        <Form.Group className="col-md-4">
                            <Form.Label className="small">Identifiant</Form.Label>
                            <Form.Control type="text" value={sadminLogin} onChange={(e) => setSadminLogin(e.target.value)} placeholder="sadmin" />
                        </Form.Group>
                        <Form.Group className="col-md-4">
                            <Form.Label className="small">Mot de passe</Form.Label>
                            <Form.Control type="password" value={sadminPassword} onChange={(e) => setSadminPassword(e.target.value)} placeholder="706JJMMAAAA" />
                        </Form.Group>
                        <Form.Group className="col-md-4">
                            <Form.Label className="small">Base cible</Form.Label>
                            <Form.Select value={dbColor} onChange={(e) => setDbColor(e.target.value)}>
                                {DB_COLORS.map((c) => (
                                    <option key={c} value={c}>dbla{c} (SQLite)</option>
                                ))}
                            </Form.Select>
                        </Form.Group>
                    </div>
                </div>

                {/* Zone de saisie SQL */}
                <div>
                    <label style={{
                        display: 'block',
                        marginBottom: '10px',
                        fontWeight: '600',
                        color: themes[themeNumber].primary,
                        fontSize: '14px'
                    }}>
                        Requête SQL
                    </label>
                    <textarea
                        value={sqlQuery}
                        onChange={(e) => setSqlQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Entrez votre requête SQL ici...&#10;Appuyez sur Ctrl+Entrée pour exécuter"
                        style={{
                            width: '100%',
                            minHeight: '200px',
                            padding: '15px',
                            borderRadius: '8px',
                            border: `2px solid ${themes[themeNumber].primary}`,
                            fontFamily: 'monospace',
                            fontSize: '14px',
                            color: themes[themeNumber].primary,
                            backgroundColor: '#fff',
                            resize: 'vertical',
                            lineHeight: '1.6'
                        }}
                    />
                    <div style={{
                        marginTop: '8px',
                        fontSize: '12px',
                        color: themes[themeNumber].primary + '70',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '5px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <AlertTriangle size={14} />
                            <span>Les commandes destructives (DROP, DELETE, TRUNCATE, etc.) nécessitent une confirmation.</span>
                        </div>
                        <div style={{ fontSize: '11px', marginLeft: '19px', opacity: 0.8 }}>
                            💡 SQLite: Utilisez PRAGMA table_info('table') au lieu de DESCRIBE, et SELECT name FROM sqlite_master WHERE type='table' au lieu de SHOW TABLES
                        </div>
                    </div>
                </div>

                {/* Bouton d'exécution */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <button
                        onClick={executeQuery}
                        disabled={loading || !sqlQuery.trim()}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '12px 24px',
                            borderRadius: '8px',
                            border: 'none',
                            backgroundColor: loading || !sqlQuery.trim() ? themes[themeNumber].primary + '50' : themes[themeNumber].primary,
                            color: themes[themeNumber].secondary,
                            cursor: loading || !sqlQuery.trim() ? 'not-allowed' : 'pointer',
                            fontSize: '14px',
                            fontWeight: '600',
                            transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                            if (!loading && sqlQuery.trim()) {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = `0 4px 12px ${themes[themeNumber].primary}40`;
                            }
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = 'none';
                        }}
                    >
                        {loading ? (
                            <>
                                <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} />
                                Exécution...
                            </>
                        ) : (
                            <>
                                <Play size={18} />
                                Exécuter (Ctrl+Entrée)
                            </>
                        )}
                    </button>

                    <button
                        onClick={() => {
                            setSqlQuery('');
                            setResults(null);
                            setError(null);
                        }}
                        style={{
                            padding: '12px 24px',
                            borderRadius: '8px',
                            border: `2px solid ${themes[themeNumber].primary}`,
                            backgroundColor: 'transparent',
                            color: themes[themeNumber].primary,
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: '600',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        Effacer requête
                    </button>

                    <button
                        onClick={() => {
                            setTerminalOutput('');
                            setResults(null);
                            setError(null);
                        }}
                        style={{
                            padding: '12px 24px',
                            borderRadius: '8px',
                            border: `2px solid ${themes[themeNumber].primary}`,
                            backgroundColor: 'transparent',
                            color: themes[themeNumber].primary,
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: '600',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        Effacer terminal
                    </button>
                </div>

                {/* Historique des requêtes */}
                {queryHistory.length > 0 && (
                    <div>
                        <label style={{
                            display: 'block',
                            marginBottom: '10px',
                            fontWeight: '600',
                            color: themes[themeNumber].primary,
                            fontSize: '14px'
                        }}>
                            Historique des requêtes
                        </label>
                        <div style={{
                            maxHeight: '150px',
                            overflowY: 'auto',
                            border: `1px solid ${themes[themeNumber].primary}30`,
                            borderRadius: '8px',
                            padding: '10px',
                            backgroundColor: themes[themeNumber].secondary + '10'
                        }}>
                            {queryHistory.map((query, idx) => (
                                <div
                                    key={idx}
                                    onClick={() => loadQueryFromHistory(query)}
                                    style={{
                                        padding: '8px',
                                        marginBottom: '5px',
                                        borderRadius: '6px',
                                        backgroundColor: '#fff',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        fontFamily: 'monospace',
                                        color: themes[themeNumber].primary,
                                        border: `1px solid ${themes[themeNumber].primary}20`,
                                        transition: 'all 0.2s ease',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = themes[themeNumber].primary + '10';
                                        e.currentTarget.style.borderColor = themes[themeNumber].primary;
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = '#fff';
                                        e.currentTarget.style.borderColor = themes[themeNumber].primary + '20';
                                    }}
                                    title={query}
                                >
                                    {query.length > 80 ? query.substring(0, 80) + '...' : query}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Zone de sortie terminal */}
                <div>
                    <label style={{
                        display: 'block',
                        marginBottom: '10px',
                        fontWeight: '600',
                        color: themes[themeNumber].primary,
                        fontSize: '14px'
                    }}>
                        Sortie Terminal
                    </label>
                    <div
                        style={{
                            width: '100%',
                            minHeight: '300px',
                            maxHeight: '500px',
                            padding: '15px',
                            borderRadius: '8px',
                            border: `2px solid ${themes[themeNumber].primary}`,
                            fontFamily: 'monospace',
                            fontSize: '13px',
                            backgroundColor: '#1e1e1e',
                            color: '#d4d4d4',
                            lineHeight: '1.6',
                            whiteSpace: 'pre',
                            overflowX: 'auto',
                            overflowY: 'auto',
                            wordWrap: 'normal',
                            overflowWrap: 'normal'
                        }}
                    >
                        {terminalOutput ? (
                            <div dangerouslySetInnerHTML={{ __html: terminalOutput }} style={{ whiteSpace: 'pre', overflow: 'visible' }} />
                        ) : (
                            <span style={{ color: '#666' }}>Terminal prêt...</span>
                        )}
                    </div>
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

export default ModalSQL;

