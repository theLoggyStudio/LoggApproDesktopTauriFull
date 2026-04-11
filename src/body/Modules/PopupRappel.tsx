import React, { useState, useEffect, useRef } from 'react';
import { useSession } from '../context/SessionContext';
import TaskController, { type Task } from '../controllers/TaskController';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Bell } from 'lucide-react';
import { themes } from '../../constants/index.ts';
import { useTheme } from '../context/ThemeContext';

const INTERVAL_MS = 60 * 1000; // Vérifier toutes les minutes

export default function PopupRappel() {
    const { session, isAuthenticated } = useSession();
    const { themeNumber } = useTheme();
    const [tasksARappeler, setTasksARappeler] = useState<Task[]>([]);
    const [show, setShow] = useState(false);
    const dejaVerifieRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!isAuthenticated || !session.tabId || !session.pays) return;

        const verifierRappels = async () => {
            try {
                const tasks = await TaskController(session.pays).listerRappelsPending(session.tabId);
                const nouvelles = tasks.filter(t => t.id && !dejaVerifieRef.current.has(t.id));
                if (nouvelles.length > 0) {
                    nouvelles.forEach(t => t.id && dejaVerifieRef.current.add(t.id));
                    setTasksARappeler(nouvelles);
                    setShow(true);
                }
            } catch (error) {
                console.error('Erreur vérification rappels:', error);
            }
        };

        verifierRappels();
        const timer = setInterval(verifierRappels, INTERVAL_MS);
        return () => clearInterval(timer);
    }, [isAuthenticated, session.tabId, session.pays]);

    const handleFermer = async () => {
        for (const task of tasksARappeler) {
            if (task.id) {
                await TaskController(session.pays).marquerRappelAffiche(task.id, session.tabId);
            }
        }
        setTasksARappeler([]);
        setShow(false);
    };

    if (!show || tasksARappeler.length === 0) return null;

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10000
            }}
            onClick={handleFermer}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    backgroundColor: '#fff',
                    borderRadius: '12px',
                    padding: '24px',
                    maxWidth: '450px',
                    width: '90%',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                    border: `3px solid ${themes[themeNumber].primary}`
                }}
            >
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '20px',
                    color: themes[themeNumber].primary
                }}>
                    <Bell size={32} />
                    <h4 style={{ margin: 0, fontWeight: 700 }}>🔔 Rappel de tâche</h4>
                </div>

                <p style={{ fontSize: '14px', color: '#666', marginBottom: '16px' }}>
                    Vous avez {tasksARappeler.length} tâche{tasksARappeler.length > 1 ? 's' : ''} à effectuer :
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                    {tasksARappeler.map((task) => (
                        <div
                            key={task.id}
                            style={{
                                padding: '12px 16px',
                                backgroundColor: themes[themeNumber].primary + '15',
                                borderRadius: '8px',
                                borderLeft: `4px solid ${themes[themeNumber].primary}`
                            }}
                        >
                            <div style={{ fontWeight: 600, fontSize: '15px', color: themes[themeNumber].primary }}>
                                {task.titre}
                            </div>
                            {task.description && (
                                <div style={{ fontSize: '13px', color: '#555', marginTop: '4px' }}>
                                    {task.description}
                                </div>
                            )}
                            {task.dateRappel && (
                                <div style={{ fontSize: '12px', color: themes[themeNumber].primary + '90', marginTop: '6px' }}>
                                    Rappel prévu : {format(new Date(task.dateRappel), "dd MMM yyyy 'à' HH:mm", { locale: fr })}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <button
                    onClick={handleFermer}
                    style={{
                        width: '100%',
                        padding: '12px 24px',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: themes[themeNumber].primary,
                        color: themes[themeNumber].secondary,
                        fontWeight: 600,
                        fontSize: '16px',
                        cursor: 'pointer'
                    }}
                >
                    J'ai compris
                </button>
            </div>
        </div>
    );
}
