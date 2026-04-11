import React, { useState, useEffect } from 'react';
import { Modal as ModalGlobal } from '../../items/Modal.tsx';
import ConfigController, { type AppConfig, type ConfigCredentials } from '../controllers/ConfigController';
import { getAdminConfig } from '../../constants/index.ts';
import { themes } from '../../constants/index.ts';
import { useTheme } from '../context/ThemeContext';
import { Key, Save, Eye, EyeOff, Database, Trash2, LogIn } from 'lucide-react';
import Accordion from 'react-bootstrap/Accordion';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';

const BASES = ['yellow', 'green', 'blue', 'orange', 'pink'] as const;

interface ModalConfigAPIProps {
    show: boolean;
    onClose: () => void;
    tabId: string;
    pays: string;
    isAdmin: boolean;
    mode?: string;
}

const toStr = (v: unknown): string => (v != null && v !== undefined ? String(v) : '');

export default function ModalConfigAPI({ show, onClose, tabId, pays, isAdmin, mode = 'admin' }: ModalConfigAPIProps) {
    const [config, setConfig] = useState<AppConfig>({});
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [showSecrets, setShowSecrets] = useState(false);
    const [showDbSecrets, setShowDbSecrets] = useState(false);
    const [defaultAdminPath, setDefaultAdminPath] = useState('');
    const [viderEnCours, setViderEnCours] = useState(false);
    const [sadminLogin, setSadminLogin] = useState('');
    const [sadminPassword, setSadminPassword] = useState('');

    const { themeNumber } = useTheme();
    const theme = themes[themeNumber];

    useEffect(() => {
        if (show && tabId && pays) {
            const admin = getAdminConfig();
            setSadminLogin(admin.login);
            setSadminPassword(admin.password);
            chargerConfig({ userId: admin.login, dbPassword: admin.password });
        }
    }, [show, tabId, pays]);

    useEffect(() => {
        if (show) ConfigController(pays).getDefaultDatabasesDir().then(setDefaultAdminPath);
    }, [show, pays]);

    const getCreds = (): ConfigCredentials => ({ userId: sadminLogin, dbPassword: sadminPassword });

    const chargerConfig = async (creds?: ConfigCredentials) => {
        const auth = creds ?? getCreds();
        if (!auth.userId || !auth.dbPassword) {
            setError('Identifiants Sadmin requis pour charger la configuration.');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const data = await ConfigController(pays).getConfig(tabId, auth);
            const conf: AppConfig = {
                paydunya_mode: data.paydunya_mode ?? 'live',
                paydunya_cle_principale: data.paydunya_cle_principale ?? '8jDTnfR6-25sS-94kF-fBuh-a5s6C5UJbdtm',
                paydunya_test_cle_publique: data.paydunya_test_cle_publique ?? 'test_public_UzE0PqlVqhjf7bzmStRpmChXgKI',
                paydunya_test_cle_privee: data.paydunya_test_cle_privee ?? 'test_private_74LEmZgM65BJLVzuZ5s2ODCoa7M',
                paydunya_test_token: data.paydunya_test_token ?? '7aILsd4vEPOrKU7qu064',
                paydunya_live_cle_publique: data.paydunya_live_cle_publique ?? 'live_public_h4ug6k8gw19vlgBLyIkxpcgf71t',
                paydunya_live_cle_privee: data.paydunya_live_cle_privee ?? 'live_private_lSDpGBMTTSd9VXD4z2NDjfpquNl',
                paydunya_live_token: data.paydunya_live_token ?? 'xFThh2NhJIWIzfI66ltt',
                db_type: data.db_type ?? 'sqlite',
                db_path: data.db_path ?? '',
            };
            for (const c of BASES) {
                (conf as any)[`db_type_${c}`] = (data as any)[`db_type_${c}`] ?? 'sqlite';
                (conf as any)[`db_path_${c}`] = (data as any)[`db_path_${c}`] ?? '';
                (conf as any)[`db_host_${c}`] = (data as any)[`db_host_${c}`] ?? '';
                (conf as any)[`db_port_${c}`] = (data as any)[`db_port_${c}`] ?? '';
                (conf as any)[`db_name_${c}`] = (data as any)[`db_name_${c}`] ?? '';
                (conf as any)[`db_user_${c}`] = (data as any)[`db_user_${c}`] ?? '';
                (conf as any)[`db_password_${c}`] = (data as any)[`db_password_${c}`] ?? '';
                (conf as any)[`db_ssl_${c}`] = (data as any)[`db_ssl_${c}`] ?? '';
                (conf as any)[`db_schema_${c}`] = (data as any)[`db_schema_${c}`] ?? '';
            }
            setConfig(conf);
                } catch (e) {
            console.error('Erreur chargement config:', e);
            setError('Impossible de charger la configuration. Vérifiez les identifiants Sadmin.');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isAdmin) return;
        setSaving(true);
        setError(null);
        setSuccess(false);
        try {
            await ConfigController(pays).setConfig(tabId, config, mode === 'superAdmin' ? 'superAdmin' : 'admin', getCreds());
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        } catch (e: any) {
            setError(e?.message || 'Erreur lors de la sauvegarde.');
        } finally {
            setSaving(false);
        }
    };

    const updateConfig = (key: string, value: string) => setConfig((c) => ({ ...c, [key]: value }));

    const handleViderBases = async () => {
        if (!window.confirm('Êtes-vous sûr de vouloir supprimer toutes les bases de données ? Cette action est irréversible. Fermez l\'application avant de continuer pour éviter les erreurs.')) return;
        setViderEnCours(true);
        setError(null);
        try {
            const r = await ConfigController(pays).viderBasesDonnees(getCreds());
            setSuccess(true);
            setError(null);
            alert(r.message + '\nRedémarrez l\'application.');
            setTimeout(() => setSuccess(false), 5000);
        } catch (e: any) {
            setError(e?.message || 'Erreur lors de la suppression.');
        } finally {
            setViderEnCours(false);
        }
    };

    const themeVars = {
        '--bs-body-bg': '#fff',
        '--bs-body-color': theme.primary,
        '--bs-border-color': theme.primary + '40',
        '--bs-primary': theme.primary,
    } as React.CSSProperties;

    return (
        <ModalGlobal show={show} onClose={onClose} title={<span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Key size={22} color={theme.primary} />Configuration</span>} maxWidth="560px" maxHeight="90vh">
            {loading ? (
                <div style={{ padding: 40, textAlign: 'center', color: theme.primary }}>Chargement...</div>
            ) : (
                <form onSubmit={handleSave} style={themeVars}>
                    <div className="d-flex flex-column gap-3">
                        {/* Connexion Sadmin - champs pour accéder à la config */}
                        <div style={{ border: `1px solid ${theme.primary}40`, borderRadius: 8, padding: 16, marginBottom: 8 }}>
                            <Form.Label className="fw-bold d-flex align-items-center gap-2">
                                <LogIn size={18} color={theme.primary} />
                                Connexion base de données (Sadmin)
                            </Form.Label>
                            <Form.Text className="d-block text-muted small mb-2">
                                Identifiants requis pour charger et modifier la configuration. Mot de passe du jour : 706JJMMAAAA.
                            </Form.Text>
                            <div className="row g-2">
                                <Form.Group className="col-md-6">
                                    <Form.Label className="small">Identifiant</Form.Label>
                                    <Form.Control type="text" value={sadminLogin} onChange={(e) => setSadminLogin(e.target.value)} placeholder="sadmin ou admin" />
                                </Form.Group>
                                <Form.Group className="col-md-6">
                                    <Form.Label className="small">Mot de passe</Form.Label>
                                    <Form.Control type="password" value={sadminPassword} onChange={(e) => setSadminPassword(e.target.value)} placeholder="706JJMMAAAA" />
                                </Form.Group>
                            </div>
                            <Button type="button" variant="outline-primary" size="sm" className="mt-2" onClick={() => chargerConfig(getCreds())}>
                                Charger la configuration
                            </Button>
                        </div>

                        {/* PayDunya - Accordion fermé par défaut */}
                        <Accordion>
                            <Accordion.Item eventKey="paydunya">
                                <Accordion.Header>PayDunya</Accordion.Header>
                                <Accordion.Body>
                                    <Form.Group className="mb-3">
                                        <Form.Label>Mode utilisé pour les paiements</Form.Label>
                                        <Form.Select value={toStr(config.paydunya_mode) || 'live'} onChange={(e) => updateConfig('paydunya_mode', e.target.value)} disabled={!isAdmin}>
                                            <option value="test">Test (sandbox)</option>
                                            <option value="live">Live (production)</option>
                                        </Form.Select>
                                        <Form.Text className="text-muted">URLs fixes : Test = sandbox-api, Production = api</Form.Text>
                                    </Form.Group>
                                    <Button type="button" variant="outline-secondary" size="sm" className="mb-3" onClick={() => setShowSecrets(!showSecrets)}>
                                        {showSecrets ? <EyeOff size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} /> : <Eye size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />}
                                        {showSecrets ? 'Masquer' : 'Afficher'} les clés
                                    </Button>

                                    <Form.Group className="mb-3">
                                        <Form.Label className="fw-bold">Clé Principale</Form.Label>
                                        <Form.Control type={showSecrets ? 'text' : 'password'} value={toStr(config.paydunya_cle_principale)} onChange={(e) => updateConfig('paydunya_cle_principale', e.target.value)} placeholder="Clé principale (unique test/prod)" disabled={!isAdmin} />
                                        <Form.Text className="text-muted small">Unique pour test et production</Form.Text>
                                    </Form.Group>

                                    <div style={{ borderLeft: `4px solid #28a745`, paddingLeft: 12, marginBottom: 20 }}>
                                        <Form.Label className="fw-bold text-success">Clés TEST (sandbox)</Form.Label>
                                        <Form.Group className="mb-2">
                                            <Form.Label className="small">Clé Publique</Form.Label>
                                            <Form.Control type={showSecrets ? 'text' : 'password'} value={toStr(config.paydunya_test_cle_publique)} onChange={(e) => updateConfig('paydunya_test_cle_publique', e.target.value)} placeholder="Clé publique test" disabled={!isAdmin} />
                                        </Form.Group>
                                        
                                        <Form.Group className="mb-2">
                                            <Form.Label className="small">Clé Privée</Form.Label>
                                            <Form.Control type={showSecrets ? 'text' : 'password'} value={toStr(config.paydunya_test_cle_privee)} onChange={(e) => updateConfig('paydunya_test_cle_privee', e.target.value)} placeholder="Clé privée test" disabled={!isAdmin} />
                                        </Form.Group>
                                        <Form.Group className="mb-2">
                                            <Form.Label className="small">Token</Form.Label>
                                            <Form.Control type={showSecrets ? 'text' : 'password'} value={toStr(config.paydunya_test_token)} onChange={(e) => updateConfig('paydunya_test_token', e.target.value)} placeholder="Token test" disabled={!isAdmin} />
                                        </Form.Group>
                                        <Form.Text className="text-muted small">Endpoint : https://app.paydunya.com/sandbox-api/v1/checkout-invoice/create</Form.Text>
                                    </div>

                                    <div style={{ borderLeft: `4px solid #dc3545`, paddingLeft: 12 }}>
                                        <Form.Label className="fw-bold text-danger">Clés PRODUCTION (live)</Form.Label>
                                        <Form.Group className="mb-2">
                                            <Form.Label className="small">Clé Publique</Form.Label>
                                            <Form.Control type={showSecrets ? 'text' : 'password'} value={toStr(config.paydunya_live_cle_publique)} onChange={(e) => updateConfig('paydunya_live_cle_publique', e.target.value)} placeholder="Clé publique production" disabled={!isAdmin} />
                                        </Form.Group>
                                        <Form.Group className="mb-2">
                                            <Form.Label className="small">Clé Privée</Form.Label>
                                            <Form.Control type={showSecrets ? 'text' : 'password'} value={toStr(config.paydunya_live_cle_privee)} onChange={(e) => updateConfig('paydunya_live_cle_privee', e.target.value)} placeholder="Clé privée production" disabled={!isAdmin} />
                                        </Form.Group>
                                        <Form.Group className="mb-2">
                                            <Form.Label className="small">Token</Form.Label>
                                            <Form.Control type={showSecrets ? 'text' : 'password'} value={toStr(config.paydunya_live_token)} onChange={(e) => updateConfig('paydunya_live_token', e.target.value)} placeholder="Token production" disabled={!isAdmin} />
                                        </Form.Group>
                                        <Form.Text className="text-muted small">Endpoint : https://app.paydunya.com/api/v1/checkout-invoice/create</Form.Text>
                                    </div>
                                </Accordion.Body>
                            </Accordion.Item>

                            {/* Base de données - Accordion fermé par défaut */}
                            <Accordion.Item eventKey="db">
                                <Accordion.Header>
                                    <Database size={20} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                                    Base de données
                                </Accordion.Header>
                                <Accordion.Body>
                                    <Button type="button" variant="outline-secondary" size="sm" className="mb-3" onClick={() => setShowDbSecrets(!showDbSecrets)}>
                                        {showDbSecrets ? <EyeOff size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} /> : <Eye size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />}
                                        {showDbSecrets ? 'Masquer' : 'Afficher'} mots de passe
                                    </Button>
                                    <Form.Group className="mb-3">
                                        <Form.Label>dblaadmin (chemin stocké)</Form.Label>
                                        <Form.Control type="text" value={toStr(config.db_path) || defaultAdminPath} readOnly plaintext />
                                    </Form.Group>

                                    {/* Groupe des selects des bases - Accordion imbriqué */}
                                    <Form.Group className="mb-2">
                                        <Form.Label>Bases de données (dblayellow, dblagreen, dblablue, dblaorange, dblapink)</Form.Label>
                                        <Accordion alwaysOpen>
                                            {BASES.map((color) => {
                                                const dbType = toStr((config as any)[`db_type_${color}`]) || 'sqlite';
                                                const isSqlite = dbType === 'sqlite';
                                                return (
                                                    <Accordion.Item key={color} eventKey={color}>
                                                        <Accordion.Header>
                                                            <Database size={18} style={{ marginRight: 8, opacity: 0.9 }} />
                                                            dbla{color} ({dbType === 'sqlite' ? 'SQLite' : dbType === 'mysql' ? 'MySQL' : dbType === 'postgres' ? 'PostgreSQL' : 'SQL Server'})
                                                        </Accordion.Header>
                                                        <Accordion.Body>
                                                            <Form.Group className="mb-3">
                                                                <Form.Label>Type de base</Form.Label>
                                                                <Form.Select value={dbType} onChange={(e) => updateConfig(`db_type_${color}`, e.target.value)} disabled={!isAdmin}>
                                                                    <option value="sqlite">SQLite</option>
                                                                    <option value="mysql">MySQL</option>
                                                                    <option value="postgres">PostgreSQL</option>
                                                                    <option value="sqlserver">SQL Server</option>
                                                                </Form.Select>
                                                                <Form.Text className="text-muted small">SQLite = local. MySQL/Postgres/SQL Server = bases distantes (logique de sécurité propre).</Form.Text>
                                                            </Form.Group>
                                                            {isSqlite ? (
                                                                <Form.Group className="mb-0">
                                                                    <Form.Label>Chemin</Form.Label>
                                                                    <Form.Control
                                                                        type="text"
                                                                        value={toStr((config as any)[`db_path_${color}`]) || toStr(config.db_path) || defaultAdminPath}
                                                                        onChange={(e) => updateConfig(`db_path_${color}`, e.target.value)}
                                                                        placeholder="Chemin du dossier de la base"
                                                                        disabled={!isAdmin}
                                                                    />
                                                                </Form.Group>
                                                            ) : (
                                                                <>
                                                                    <Form.Group className="mb-2">
                                                                        <Form.Label>Hôte</Form.Label>
                                                                        <Form.Control type="text" value={toStr((config as any)[`db_host_${color}`])} onChange={(e) => updateConfig(`db_host_${color}`, e.target.value)} placeholder="localhost ou IP distante" disabled={!isAdmin} />
                                                                    </Form.Group>
                                                                    <Form.Group className="mb-2">
                                                                        <Form.Label>Port</Form.Label>
                                                                        <Form.Control type="text" value={toStr((config as any)[`db_port_${color}`])} onChange={(e) => updateConfig(`db_port_${color}`, e.target.value)} placeholder={dbType === 'mysql' ? '3306' : dbType === 'postgres' ? '5432' : '1433'} disabled={!isAdmin} />
                                                                    </Form.Group>
                                                                    <Form.Group className="mb-2">
                                                                        <Form.Label>Nom de la base</Form.Label>
                                                                        <Form.Control type="text" value={toStr((config as any)[`db_name_${color}`])} onChange={(e) => updateConfig(`db_name_${color}`, e.target.value)} placeholder="loggappro_yellow..." disabled={!isAdmin} />
                                                                    </Form.Group>
                                                                    {dbType === 'postgres' && (
                                                                        <Form.Group className="mb-2">
                                                                            <Form.Label>Schéma (optionnel)</Form.Label>
                                                                            <Form.Control type="text" value={toStr((config as any)[`db_schema_${color}`])} onChange={(e) => updateConfig(`db_schema_${color}`, e.target.value)} placeholder="public" disabled={!isAdmin} />
                                                                        </Form.Group>
                                                                    )}
                                                                    <Form.Group className="mb-2">
                                                                        <Form.Label>Utilisateur</Form.Label>
                                                                        <Form.Control type="text" value={toStr((config as any)[`db_user_${color}`])} onChange={(e) => updateConfig(`db_user_${color}`, e.target.value)} placeholder="Utilisateur" disabled={!isAdmin} />
                                                                    </Form.Group>
                                                                    <Form.Group className="mb-2">
                                                                        <Form.Label>Mot de passe</Form.Label>
                                                                        <Form.Control type={showDbSecrets ? 'text' : 'password'} value={toStr((config as any)[`db_password_${color}`])} onChange={(e) => updateConfig(`db_password_${color}`, e.target.value)} placeholder="Mot de passe" disabled={!isAdmin} />
                                                                    </Form.Group>
                                                                    <Form.Group className="mb-2">
                                                                        <Form.Label>SSL (connexion sécurisée)</Form.Label>
                                                                        <Form.Select value={toStr((config as any)[`db_ssl_${color}`]) || 'false'} onChange={(e) => updateConfig(`db_ssl_${color}`, e.target.value)} disabled={!isAdmin}>
                                                                            <option value="false">Désactivé</option>
                                                                            <option value="true">Activé (recommandé pour online)</option>
                                                                            <option value="require">Requis</option>
                                                                        </Form.Select>
                                                                    </Form.Group>
                                                                    <Form.Text className="text-muted">Bases online : utilisez votre logique de sécurité. SQLite par défaut : règles Sadmin.</Form.Text>
                                                                </>
                                                            )}
                                                        </Accordion.Body>
                                                    </Accordion.Item>
                                                );
                                            })}
                                        </Accordion>
                                    </Form.Group>
                                    {isAdmin && (
                                        <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${theme.primary}30` }}>
                                            <Button type="button" variant="outline-danger" size="sm" disabled={viderEnCours} onClick={handleViderBases}>
                                                <Trash2 size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                                                {viderEnCours ? 'Suppression...' : 'Vider toutes les bases de données'}
                                            </Button>
                                            <Form.Text className="d-block text-muted mt-1">Supprime tous les fichiers .db. Fermez l'application avant.</Form.Text>
                                        </div>
                                    )}
                                </Accordion.Body>
                            </Accordion.Item>
                        </Accordion>

                        {error && <div className="alert alert-danger py-2">{error}</div>}
                        {success && <div className="alert alert-success py-2">Configuration enregistrée.</div>}
                        {isAdmin && (
                            <Button type="submit" variant="primary" disabled={saving} className="d-flex align-items-center justify-content-center gap-2">
                                <Save size={18} />
                                {saving ? 'Enregistrement...' : 'Enregistrer'}
                            </Button>
                        )}
                        {!isAdmin && <div className="alert alert-info py-2 mb-0">Seul l'administrateur peut modifier cette configuration.</div>}
                    </div>
                </form>
            )}
        </ModalGlobal>
    );
}
