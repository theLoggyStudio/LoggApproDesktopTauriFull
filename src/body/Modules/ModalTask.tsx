import React, { useState, useEffect, useMemo } from 'react';
import { Modal as ModalGlobal } from '../../items/Modal.tsx';
import TraceController, { type Trace } from '../controllers/TraceController';
import TaskController, { type Task } from '../controllers/TaskController';
import AutorisationController from '../controllers/AutorisationController';
import { PageProfilController } from '../controllers/PageProfilController';
import { themes } from '../../constants/index.ts';
import { useTheme } from '../context/ThemeContext';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { RefreshCw, Calendar, User, FileText, AlertCircle, Plus, Bell, CheckCircle, Trash2, CreditCard, QrCode } from 'lucide-react';
import QRCode from 'react-qr-code';
import { encryptData } from '../controllers/security/security';
import { criptKey } from '../../constants/index.ts';

interface ModalTaskProps {
    show: boolean;
    onClose: () => void;
    tabId: string;
    loggId: string;
    pays: string;
    userId?: string;
    userNom?: string;
}

const ModalTask: React.FC<ModalTaskProps> = ({ show, onClose, tabId, loggId, pays, userId = '', userNom = '' }) => {
    const [activeTab, setActiveTab] = useState<'tasks' | 'historique'>('tasks');
    const [tasks, setTasks] = useState<Task[]>([]);
    const [traces, setTraces] = useState<Trace[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);

    // Formulaire nouvelle tâche
    const [nouveauTitre, setNouveauTitre] = useState('');
    const [nouvelleDescription, setNouvelleDescription] = useState('');
    const [nouvelleDateRappel, setNouvelleDateRappel] = useState('');
    const [nouvelleHeureRappel, setNouvelleHeureRappel] = useState('');
    const [saving, setSaving] = useState(false);
    const [showTasksQrModal, setShowTasksQrModal] = useState(false);
    const [tasksQrPayload, setTasksQrPayload] = useState<string>('');

    const { themeNumber } = useTheme();

    /** Docteur propriétaire du cabinet : afficher essai gratuit + prochain paiement */
    const estDocteurCabinet = useMemo(
        () =>
            !!userId &&
            !!tabId &&
            userId === tabId &&
            userId !== 'admin' &&
            userId !== 'sadmin' &&
            !String(userId).startsWith('admin'),
        [userId, tabId]
    );

    const [payInfoLoading, setPayInfoLoading] = useState(false);
    const [graceDaysLeft, setGraceDaysLeft] = useState<number | null>(null);
    const [graceUnknownDays, setGraceUnknownDays] = useState(false);
    const [nextPaymentDate, setNextPaymentDate] = useState<Date | null>(null);

    useEffect(() => {
        if (!show || !estDocteurCabinet || !pays || !userId || !tabId) {
            setGraceDaysLeft(null);
            setGraceUnknownDays(false);
            setNextPaymentDate(null);
            return;
        }
        let cancelled = false;
        (async () => {
            setPayInfoLoading(true);
            try {
                const [datePay, profil, statutPay] = await Promise.all([
                    AutorisationController(pays).recupererLaDateDePayement(userId, tabId),
                    PageProfilController(pays).voirInfoDocteur(userId, tabId),
                    AutorisationController(pays).verifierStatutPaiement(userId, tabId),
                ]);
                if (cancelled) return;
                if (datePay?.date_creation) {
                    setNextPaymentDate(new Date(datePay.date_creation));
                } else if (typeof statutPay?.dateReference === "string" && statutPay.dateReference) {
                    setNextPaymentDate(new Date(statutPay.dateReference));
                } else {
                    setNextPaymentDate(null);
                }
                const d = profil?.docteur as Record<string, unknown> | undefined;
                const creationRaw = (d?.dateCreation ?? d?.date_creation) as string | undefined;
                if (creationRaw) {
                    const creation = new Date(creationRaw);
                    const end = new Date(creation);
                    end.setDate(end.getDate() + 7);
                    const now = new Date();
                    if (now < end) {
                        const ms = end.getTime() - now.getTime();
                        setGraceDaysLeft(Math.max(1, Math.ceil(ms / 86400000)));
                        setGraceUnknownDays(false);
                    } else {
                        setGraceDaysLeft(null);
                        setGraceUnknownDays(false);
                    }
                } else {
                    setGraceDaysLeft(null);
                    setGraceUnknownDays(true);
                }
            } catch {
                if (!cancelled) {
                    setNextPaymentDate(null);
                    setGraceDaysLeft(null);
                    setGraceUnknownDays(false);
                }
            } finally {
                if (!cancelled) setPayInfoLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [show, estDocteurCabinet, pays, userId, tabId]);

    useEffect(() => {
        if (show) {
            if (activeTab === 'tasks') {
                chargerTasks();
            } else {
                chargerTraces();
            }
        }
    }, [show, tabId, loggId, page, limit, activeTab]);

    const chargerTasks = async () => {
        try {
            setLoading(true);
            const data = await TaskController(pays).listerTasks(tabId, 200);
            setTasks(data);
        } catch (error) {
            console.error('Erreur chargement tâches:', error);
            setTasks([]);
        } finally {
            setLoading(false);
        }
    };

    const chargerTraces = async () => {
        try {
            setLoading(true);
            const offset = (page - 1) * limit;
            const data = await TraceController(pays).listerTracesAvecPagination(tabId, limit, offset);
            setTraces(data);
        } catch (error) {
            console.error('Erreur chargement traces:', error);
            setTraces([]);
        } finally {
            setLoading(false);
        }
    };

    const handleAjouterTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!nouveauTitre.trim()) return;

        setSaving(true);
        try {
            let dateRappel = '';
            if (nouvelleDateRappel && nouvelleHeureRappel) {
                dateRappel = `${nouvelleDateRappel} ${nouvelleHeureRappel}:00`;
            } else if (nouvelleDateRappel) {
                dateRappel = `${nouvelleDateRappel} 09:00:00`;
            }

            await TaskController(pays).ajouterTask(
                {
                    titre: nouveauTitre.trim(),
                    description: nouvelleDescription.trim() || undefined,
                    dateRappel: dateRappel || undefined,
                    userId,
                    userNom,
                    loggId,
                },
                tabId
            );

            setNouveauTitre('');
            setNouvelleDescription('');
            setNouvelleDateRappel('');
            setNouvelleHeureRappel('');
            chargerTasks();
        } catch (error) {
            console.error('Erreur ajout tâche:', error);
        } finally {
            setSaving(false);
        }
    };

    const handleMarquerFait = async (taskId: string) => {
        await TaskController(pays).updateStatut(taskId, 'done', tabId);
        chargerTasks();
    };

    const handleSupprimer = async (taskId: string) => {
        if (window.confirm('Supprimer cette tâche ?')) {
            await TaskController(pays).supprimerTask(taskId, tabId);
            chargerTasks();
        }
    };

    const handleOpenTasksQr = () => {
        const pending = tasks.filter((t) => (t.statut ?? '') !== 'done');
        if (pending.length === 0) {
            window.alert('Aucune tâche non terminée à exporter.');
            return;
        }
        if (!criptKey) {
            window.alert('Clé REACT_APP_CRIPT_KEY absente : impossible de générer le QR (alignez la clé avec le mobile).');
            return;
        }
        let slice = Math.min(45, pending.length);
        let enc: string | null = null;
        while (slice >= 1) {
            const body = {
                kind: 'loggappro_tasks_v1',
                ts: Date.now(),
                tabId,
                pays,
                tasks: pending.slice(0, slice).map((t) => ({
                    id: t.id,
                    titre: t.titre,
                    description: (t.description ?? '').slice(0, 350),
                    dateRappel: t.dateRappel ?? null,
                    dateCreation: t.dateCreation ?? null,
                    statut: t.statut ?? 'pending',
                })),
            };
            enc = encryptData(JSON.stringify(body), criptKey);
            if (enc && typeof enc === 'string' && enc.length <= 2600) {
                break;
            }
            // Réduire progressivement pour rester sous la limite QR,
            // tout en gardant au moins 1 tâche exportable.
            slice = Math.max(0, slice - 4);
        }
        if (!enc || typeof enc !== 'string') {
            window.alert('Impossible de chiffrer les tâches pour le QR.');
            return;
        }
        if (enc.length > 2800) {
            window.alert('Trop de tâches : supprimez ou terminez des tâches, puis réessayez (limite du QR).');
            return;
        }
        setTasksQrPayload(enc);
        setShowTasksQrModal(true);
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

    const getTypeText = (type: string) => {
        switch (type) {
            case 'acte': return 'Acte';
            case 'patient': return 'Patient';
            case 'assurance': return 'Assurance';
            case 'typeActe': return 'Type d\'acte';
            case 'typeAssurance': return 'Type d\'assurance';
            default: return type;
        }
    };

    const getStatutBadge = (statut?: string) => {
        switch (statut) {
            case 'done': return { bg: '#28a74520', color: '#28a745', text: 'Terminée' };
            case 'rappel_affiche': return { bg: '#6c757d20', color: '#6c757d', text: 'Rappel affiché' };
            default: return { bg: themes[themeNumber].primary + '20', color: themes[themeNumber].primary, text: 'En attente' };
        }
    };

    const today = new Date().toISOString().split('T')[0];

    return (
        <>
        <ModalGlobal
            show={show}
            onClose={onClose}
            title="📋 Tâches"
            maxWidth="1200px"
            maxHeight="90vh"
        >
            {estDocteurCabinet && (
                <div
                    style={{
                        marginBottom: '18px',
                        padding: '14px 16px',
                        borderRadius: '10px',
                        border: '1px double ' + themes[themeNumber].secondary,
                        backgroundColor: themes[themeNumber].secondary ,
                        color: '#6b5200',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            marginBottom: '10px',
                            fontWeight: 700,
                            fontSize: '15px',
                            color: themes[themeNumber].primary,
                        }}
                    >
                        <CreditCard size={22} />
                        Abonnement & période d’essai
                    </div>
                    {payInfoLoading ? (
                        <div style={{ fontSize: '13px', color: themes[themeNumber].primary }}>Chargement des informations…</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '14px', lineHeight: 1.5 }}>
                            {(graceDaysLeft !== null || graceUnknownDays) && (
                                <div
                                    style={{
                                        padding: '10px 12px',
                                        borderRadius: '8px',
                                        border: '2px solid #2e7d32',
                                        background: '#e8f5e9',
                                        color: '#1b5e20',
                                        fontWeight: 600,
                                    }}
                                >
                                    {graceDaysLeft !== null ? (
                                        <>
                                            ⏳ Essai gratuit : il vous reste{' '}
                                            <strong>{graceDaysLeft}</strong> jour{graceDaysLeft > 1 ? 's' : ''} (sur 7 jours
                                            à compter de la création du compte).
                                        </>
                                    ) : (
                                        <>
                                            ⏳ Période d’essai gratuit : semaine en cours (7 jours à compter de
                                            l’inscription — date de création non renseignée en base).
                                        </>
                                    )}
                                </div>
                            )}
                            {nextPaymentDate && !Number.isNaN(nextPaymentDate.getTime()) && (
                                <div
                                    style={{
                                        padding: '10px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid #a08923',
                                        backgroundColor: 'rgba(253, 218, 55, 0.55)',
                                        color: '#5c4700',
                                        fontWeight: 600,
                                        textAlign: 'center',
                                    }}
                                >
                                    Prochain paiement prévu le{' '}
                                    {format(nextPaymentDate, 'dd MMMM yyyy', { locale: fr })}
                                </div>
                            )}
                            {!nextPaymentDate && !graceUnknownDays && graceDaysLeft === null && (
                                <div style={{ fontSize: '13px', color: themes[themeNumber].primary + 'cc' }}>
                                    Aucune échéance de paiement enregistrée pour le moment. Renseignez votre abonnement
                                    depuis la page Profil si besoin.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Onglets */}
            <div style={{
                display: 'flex',
                gap: '5px',
                marginBottom: '20px',
                borderBottom: `2px solid ${themes[themeNumber].primary}30`
            }}>
                <button
                    onClick={() => setActiveTab('tasks')}
                    style={{
                        padding: '12px 24px',
                        border: 'none',
                        borderBottom: activeTab === 'tasks' ? `3px solid ${themes[themeNumber].primary}` : '3px solid transparent',
                        backgroundColor: activeTab === 'tasks' ? themes[themeNumber].primary + '15' : 'transparent',
                        color: themes[themeNumber].primary,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontSize: '15px'
                    }}
                >
                    📋 Tâches
                </button>
                <button
                    onClick={() => setActiveTab('historique')}
                    style={{
                        padding: '12px 24px',
                        border: 'none',
                        borderBottom: activeTab === 'historique' ? `3px solid ${themes[themeNumber].primary}` : '3px solid transparent',
                        backgroundColor: activeTab === 'historique' ? themes[themeNumber].primary + '15' : 'transparent',
                        color: themes[themeNumber].primary,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontSize: '15px'
                    }}
                >
                    📜 Historique des actions
                </button>
            </div>

            {activeTab === 'tasks' ? (
                <>
                    {/* Formulaire ajout tâche - repliable, fermé par défaut */}
                    <details style={{
                        marginBottom: '20px',
                        borderRadius: '8px',
                        border: `1px solid ${themes[themeNumber].primary}30`,
                        overflow: 'hidden'
                    }}>
                        <summary style={{
                            padding: '14px 20px',
                            backgroundColor: themes[themeNumber].secondary + '20',
                            cursor: 'pointer',
                            fontWeight: 600,
                            color: themes[themeNumber].primary,
                            listStyle: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <Plus size={20} />
                            Nouvelle tâche
                        </summary>
                    <form onSubmit={handleAjouterTask} style={{
                        padding: '20px',
                        backgroundColor: themes[themeNumber].secondary + '15',
                        borderRadius: '0 0 8px 8px'
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <input
                                type="text"
                                placeholder="Titre de la tâche *"
                                value={nouveauTitre}
                                onChange={(e) => setNouveauTitre(e.target.value)}
                                required
                                style={{
                                    padding: '10px 14px',
                                    borderRadius: '6px',
                                    border: `2px solid ${themes[themeNumber].primary}`,
                                    fontSize: '14px'
                                }}
                            />
                            <textarea
                                placeholder="Description (optionnel)"
                                value={nouvelleDescription}
                                onChange={(e) => setNouvelleDescription(e.target.value)}
                                rows={2}
                                style={{
                                    padding: '10px 14px',
                                    borderRadius: '6px',
                                    border: `2px solid ${themes[themeNumber].primary}`,
                                    fontSize: '14px',
                                    resize: 'vertical'
                                }}
                            />
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Bell size={18} color={themes[themeNumber].primary} />
                                    <span style={{ fontSize: '14px', fontWeight: 500 }}>Rappel le :</span>
                                </div>
                                <input
                                    type="date"
                                    value={nouvelleDateRappel}
                                    onChange={(e) => setNouvelleDateRappel(e.target.value)}
                                    min={today}
                                    style={{
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        border: `2px solid ${themes[themeNumber].primary}`,
                                        fontSize: '14px'
                                    }}
                                />
                                <input
                                    type="time"
                                    value={nouvelleHeureRappel}
                                    onChange={(e) => setNouvelleHeureRappel(e.target.value)}
                                    style={{
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        border: `2px solid ${themes[themeNumber].primary}`,
                                        fontSize: '14px'
                                    }}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={saving || !nouveauTitre.trim()}
                                style={{
                                    padding: '10px 20px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    backgroundColor: themes[themeNumber].primary,
                                    color: themes[themeNumber].secondary,
                                    fontWeight: 600,
                                    cursor: saving ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    opacity: saving ? 0.6 : 1
                                }}
                            >
                                <Plus size={18} />
                                {saving ? 'Ajout...' : 'Ajouter la tâche'}
                            </button>
                        </div>
                    </form>
                    </details>

                    {/* Liste des tâches */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
                        <span style={{ fontSize: '14px', color: themes[themeNumber].primary, fontWeight: 600 }}>
                            {tasks.length} tâche{tasks.length > 1 ? 's' : ''}
                        </span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        <button
                            type="button"
                            onClick={handleOpenTasksQr}
                            disabled={loading}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 16px',
                                borderRadius: '6px',
                                border: `1px solid ${themes[themeNumber].primary}`,
                                backgroundColor: themes[themeNumber].secondary + '40',
                                color: themes[themeNumber].primary,
                                cursor: loading ? 'not-allowed' : 'pointer',
                                fontSize: '14px',
                                fontWeight: 600
                            }}
                        >
                            <QrCode size={18} />
                            QR mobile (tâches)
                        </button>
                        <button
                            onClick={chargerTasks}
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
                                fontSize: '14px'
                            }}
                        >
                            <RefreshCw size={16} />
                            Actualiser
                        </button>
                        </div>
                    </div>

                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: themes[themeNumber].primary }}>
                                <RefreshCw size={32} style={{ animation: 'spin 1s linear infinite' }} />
                                <p style={{ marginTop: '10px' }}>Chargement...</p>
                            </div>
                        ) : tasks.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: themes[themeNumber].primary + '80' }}>
                                <AlertCircle size={48} />
                                <p style={{ marginTop: '15px', fontSize: '16px' }}>Aucune tâche. Ajoutez-en une ci-dessus.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {tasks.map((task) => {
                                    const badge = getStatutBadge(task.statut);
                                    return (
                                        <div
                                            key={task.id}
                                            style={{
                                                padding: '15px',
                                                borderRadius: '8px',
                                                backgroundColor: task.statut === 'done' ? themes[themeNumber].secondary + '10' : '#fff',
                                                border: `1px solid ${themes[themeNumber].primary}20`,
                                                opacity: task.statut === 'done' ? 0.85 : 1
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '15px' }}>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
                                                        <span style={{ fontSize: '16px', fontWeight: 600, color: themes[themeNumber].primary }}>
                                                            {task.titre}
                                                        </span>
                                                        <span style={{
                                                            padding: '4px 10px',
                                                            borderRadius: '20px',
                                                            fontSize: '12px',
                                                            fontWeight: 500,
                                                            backgroundColor: badge.bg,
                                                            color: badge.color
                                                        }}>
                                                            {badge.text}
                                                        </span>
                                                    </div>
                                                    {task.description && (
                                                        <p style={{ fontSize: '13px', color: themes[themeNumber].primary + '90', marginBottom: '8px' }}>
                                                            {task.description}
                                                        </p>
                                                    )}
                                                    {task.dateRappel && (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: themes[themeNumber].primary + '80' }}>
                                                            <Bell size={14} />
                                                            Rappel : {format(new Date(task.dateRappel), "dd MMM yyyy 'à' HH:mm", { locale: fr })}
                                                        </div>
                                                    )}
                                                    {task.dateCreation && (
                                                        <div style={{ fontSize: '12px', color: themes[themeNumber].primary + '60', marginTop: '4px' }}>
                                                            Créée le {format(new Date(task.dateCreation), "dd/MM/yyyy HH:mm", { locale: fr })}
                                                        </div>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    {task.statut !== 'done' && (
                                                        <button
                                                            onClick={() => handleMarquerFait(task.id)}
                                                            title="Marquer comme terminée"
                                                            style={{
                                                                padding: '8px',
                                                                borderRadius: '6px',
                                                                border: 'none',
                                                                backgroundColor: '#28a745',
                                                                color: '#fff',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            <CheckCircle size={18} />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleSupprimer(task.id)}
                                                        title="Supprimer"
                                                        style={{
                                                            padding: '8px',
                                                            borderRadius: '6px',
                                                            border: 'none',
                                                            backgroundColor: '#dc3545',
                                                            color: '#fff',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <>
                    {/* Historique des actions (traces) */}
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
                                fontSize: '14px'
                            }}
                        >
                            <RefreshCw size={16} />
                            Actualiser
                        </button>
                        <span style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            backgroundColor: themes[themeNumber].primary + '15',
                            color: themes[themeNumber].primary,
                            fontSize: '14px',
                            fontWeight: 600
                        }}>
                            {traces.length} trace{traces.length > 1 ? 's' : ''}
                        </span>
                    </div>

                    <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: themes[themeNumber].primary }}>
                                <RefreshCw size={32} style={{ animation: 'spin 1s linear infinite' }} />
                                <p style={{ marginTop: '10px' }}>Chargement des traces...</p>
                            </div>
                        ) : traces.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: themes[themeNumber].primary + '80' }}>
                                <AlertCircle size={48} />
                                <p style={{ marginTop: '15px', fontSize: '16px' }}>Aucune trace trouvée</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {traces.map((trace, index) => (
                                    <div
                                        key={trace.id}
                                        style={{
                                            padding: '15px',
                                            borderRadius: '8px',
                                            backgroundColor: index % 2 === 0 ? '#fff' : themes[themeNumber].secondary + '15',
                                            border: `1px solid ${themes[themeNumber].primary}15`
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                            <span style={{ fontSize: '20px' }}>{getActionIcon(trace.action)}</span>
                                            <span style={{ fontSize: '16px', fontWeight: 600, color: themes[themeNumber].primary }}>
                                                {getActionText(trace.action)} - {getTypeText(trace.type_entite)}
                                            </span>
                                        </div>
                                        <div style={{ marginLeft: '28px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <FileText size={14} color={themes[themeNumber].primary} />
                                                <strong>{trace.nom_entite}</strong>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: themes[themeNumber].primary + '90' }}>
                                                <User size={14} />
                                                Par <strong>{trace.user_nom}</strong> ({trace.user_role})
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: themes[themeNumber].primary + '80' }}>
                                                <Calendar size={14} />
                                                {format(new Date(trace.date_action), "dd MMMM yyyy 'à' HH:mm", { locale: fr })}
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
                                ))}
                            </div>
                        )}
                    </div>

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
                        <span style={{ fontSize: '14px' }}>Éléments par page:</span>
                        <select
                            value={limit}
                            onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                            style={{
                                padding: '6px 10px',
                                borderRadius: '6px',
                                border: `2px solid ${themes[themeNumber].primary}`,
                                backgroundColor: '#fff',
                                color: themes[themeNumber].primary,
                                cursor: 'pointer'
                            }}
                        >
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                        </select>
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
                                    fontSize: '14px'
                                }}
                            >
                                ← Précédent
                            </button>
                            <span style={{ padding: '8px 16px', backgroundColor: themes[themeNumber].primary + '15', borderRadius: '6px', fontWeight: 600 }}>
                                Page {page}
                            </span>
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
                                    fontSize: '14px'
                                }}
                            >
                                Suivant →
                            </button>
                        </div>
                    </div>
                </>
            )}

            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                details summary::-webkit-details-marker { display: none; }
                details summary::marker { display: none; }
            `}</style>
        </ModalGlobal>
        <ModalGlobal
            show={showTasksQrModal}
            onClose={() => setShowTasksQrModal(false)}
            title="QR — tâches (mobile)"
            maxWidth="480px"
            maxHeight="90vh"
        >
            {tasksQrPayload ? (
                <div style={{ padding: '16px', textAlign: 'center' }}>
                    <p style={{ fontSize: '13px', color: themes[themeNumber].primary, marginBottom: '14px', lineHeight: 1.45 }}>
                        Scannez depuis l’app mobile : Mon compte → onglet « Tâches » → Importer (QR). Le contenu est chiffré avec la même clé que les autres QR LoggAppro.
                    </p>
                    <div style={{ display: 'inline-block', padding: '12px', background: '#fff', borderRadius: '8px' }}>
                        <QRCode value={tasksQrPayload} size={240} level="M" style={{ height: 'auto', maxWidth: '100%', width: '100%' }} />
                    </div>
                </div>
            ) : null}
        </ModalGlobal>
        </>
    );
};

export default ModalTask;
