import React, { useState, useEffect } from 'react';
import { ImgController } from '../controllers/ImgController';
import { themes } from '../../constants/index.ts';
import { useTheme } from '../context/ThemeContext';
import { Trash2, ImageIcon, Upload, X } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { Modal as ModalGlobal } from '../../items/Modal.tsx';

interface ModalRadiosProps {
    acteId: string;
    acteName: string;
    tabId: string;
    pays: string;
    onClose: () => void;
}

interface RadioItem {
    id: string;
    imageData: string;
    dateCreation: string;
}

const ModalRadios: React.FC<ModalRadiosProps> = ({ acteId, acteName, tabId, pays, onClose }) => {
    const [radios, setRadios] = useState<RadioItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [isFromCache, setIsFromCache] = useState(false);
    const { themeNumber } = useTheme();

    // Clé pour le cache local
    const getCacheKey = () => `radios_${acteId}_${tabId}`;

    useEffect(() => {
        chargerRadios();
        
        // Nettoyer les vieux caches au montage
        cleanOldCaches();
        
        return () => {
            // Optionnel: nettoyer le cache au démontage si trop gros
            try {
                const cacheSize = new Blob([localStorage.getItem(getCacheKey()) || '']).size;
                if (cacheSize > 5 * 1024 * 1024) { // Plus de 5MB
                    localStorage.removeItem(getCacheKey());
                }
            } catch (e) {
                // Ignorer les erreurs de nettoyage
            }
        };
    }, [acteId]);

    const chargerRadios = async (forceRefresh: boolean = false) => {
        try {
            setLoading(true);
            setIsFromCache(false);
            
            // Vérifier d'abord le cache local si pas de rafraîchissement forcé
            if (!forceRefresh) {
                const cached = localStorage.getItem(getCacheKey());
                if (cached) {
                    try {
                        const cachedData = JSON.parse(cached);
                        // Vérifier que le cache n'est pas trop vieux (< 5 minutes)
                        if (cachedData.timestamp && (Date.now() - cachedData.timestamp) < 5 * 60 * 1000) {
                            setRadios(cachedData.radios || []);
                            setIsFromCache(true);
                            setLoading(false);
                            
                            // Charger en arrière-plan pour mettre à jour le cache silencieusement
                            setTimeout(() => chargerRadiosFromServer(true), 100);
                            return;
                        }
                    } catch (parseError) {
                        // Cache invalide, on ignore
                    }
                }
            }
            
            // Charger depuis le serveur
            await chargerRadiosFromServer(false);
        } catch (error) {
            console.error("Erreur lors du chargement des radios:", error);
            setRadios([]);
            setLoading(false);
        }
    };

    const chargerRadiosFromServer = async (silent: boolean = false) => {
        try {
            if (!silent) {
                setLoading(true);
            }
            
            // Utiliser la nouvelle fonction qui récupère par logg_id (acteId)
            const radiosData = await ImgController(pays).voirRadiosParActe(acteId, tabId);
            setRadios(radiosData || []);
            setIsFromCache(false);
            
            // Mettre en cache
            try {
                localStorage.setItem(getCacheKey(), JSON.stringify({
                    radios: radiosData || [],
                    timestamp: Date.now()
                }));
            } catch (storageError) {
                // Si le localStorage est plein, nettoyer les vieux caches
                try {
                    cleanOldCaches();
                    localStorage.setItem(getCacheKey(), JSON.stringify({
                        radios: radiosData || [],
                        timestamp: Date.now()
                    }));
                } catch (retryError) {
                    // Cache localStorage plein, on ignore
                }
            }
        } catch (error) {
            if (!silent) {
                console.error("Erreur serveur:", error);
                throw error;
            }
        } finally {
            if (!silent) {
                setLoading(false);
            }
        }
    };

    // Nettoyer les anciens caches (plus de 24h)
    const cleanOldCaches = () => {
        const keys = Object.keys(localStorage);
        const now = Date.now();
        keys.forEach(key => {
            if (key.startsWith('radios_')) {
                try {
                    const data = JSON.parse(localStorage.getItem(key) || '{}');
                    if (data.timestamp && (now - data.timestamp) > 24 * 60 * 60 * 1000) {
                        localStorage.removeItem(key);
                    }
                } catch (e) {
                    localStorage.removeItem(key);
                }
            }
        });
    };

    const supprimerRadio = async (radioId: string) => {
        if (window.confirm("Êtes-vous sûr de vouloir supprimer cette radio ?")) {
            try {
                await ImgController(pays).supprimerRadio(radioId, tabId);
                
                // Invalider le cache
                localStorage.removeItem(getCacheKey());
                
                // Recharger avec forceRefresh
                await chargerRadios(true);
            } catch (error) {
                console.error("Erreur lors de la suppression:", error);
                // Erreur silencieuse, gérée par le système d'alertes du contexte si nécessaire
            }
        }
    };

    const handleRadioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        try {
            setUploading(true);
            
            // Traiter chaque fichier (max 3 à la fois pour éviter surcharge)
            const filesToProcess = Array.from(files).slice(0, 3);
            
            // Déterminer l'index de départ (nombre de radios existantes)
            let startIndex = radios.length;
            let successCount = 0;
            
            for (let i = 0; i < filesToProcess.length; i++) {
                const file = filesToProcess[i];
                
                // Vérifier la taille du fichier original
                if (file.size > 10 * 1024 * 1024) {
                    // Fichier trop volumineux, on skip
                    continue;
                }

                try {
                    const options = {
                        maxSizeMB: 0.4,
                        maxWidthOrHeight: 1200,
                        useWebWorker: true,
                        initialQuality: 0.7
                    };

                    const compressedFile = await imageCompression(file, options);
                    const reader = new FileReader();
                    
                    const base64 = await new Promise<string>((resolve) => {
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.readAsDataURL(compressedFile);
                    });

                    // Utiliser ajouterRadio avec l'ID de l'acte
                    const currentIndex = startIndex + i;
                    await ImgController(pays).ajouterRadio({
                        acteId: acteId,
                        radioIndex: currentIndex,
                        imageBase64: base64,
                        tabId
                    });
                    
                    successCount++;
                    
                    // Petit délai entre chaque upload pour ne pas surcharger
                    if (i < filesToProcess.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                } catch (uploadError) {
                    console.error(`Erreur upload ${file.name}:`, uploadError);
                }
            }
            
            // Recharger toutes les radios
            if (successCount > 0) {
                // Invalider le cache
                localStorage.removeItem(getCacheKey());
                
                // Recharger avec forceRefresh
                await chargerRadios(true);
                // Radio(s) ajoutée(s) avec succès - pas besoin d'alerte, l'action est visible dans l'interface
            } else {
                // Aucune radio ajoutée - pas besoin d'alerte, l'interface montre déjà l'état
            }
        } catch (error) {
            console.error("Erreur lors de l'upload des radios:", error);
            // Erreur silencieuse, gérée par le système d'alertes du contexte si nécessaire
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    return (
        <>
            <ModalGlobal
                show={true}
                onClose={onClose}
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <ImageIcon size={24} />
                        <span>Radios - {acteName}</span>
                    </div>
                }
            >
                    {/* Zone d'upload */}
                    <div style={{ marginBottom: '25px' }}>
                        <label 
                            htmlFor="uploadRadios"
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: `3px dashed ${themes[themeNumber].primary}`,
                                borderRadius: '12px',
                                padding: '25px',
                                backgroundColor: '#f8f9fa',
                                cursor: uploading ? 'not-allowed' : 'pointer',
                                transition: 'all 0.3s ease',
                                textAlign: 'center',
                                opacity: uploading ? 0.6 : 1
                            }}
                            onMouseEnter={(e) => {
                                if (!uploading) {
                                    e.currentTarget.style.backgroundColor = themes[themeNumber].secondary + "20";
                                    e.currentTarget.style.borderColor = themes[themeNumber].secondary;
                                    e.currentTarget.style.transform = "scale(1.01)";
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!uploading) {
                                    e.currentTarget.style.backgroundColor = "#f8f9fa";
                                    e.currentTarget.style.borderColor = themes[themeNumber].primary;
                                    e.currentTarget.style.transform = "scale(1)";
                                }
                            }}
                        >
                            <Upload size={40} color={themes[themeNumber].primary} style={{ marginBottom: '10px' }} />
                            <div style={{ 
                                fontSize: '16px', 
                                fontWeight: '600',
                                color: themes[themeNumber].primary,
                                marginBottom: '5px'
                            }}>
                                {uploading ? 'Upload en cours...' : '+ Ajouter des radios'}
                            </div>
                            <div style={{ 
                                fontSize: '13px', 
                                color: '#7f8c8d'
                            }}>
                                Cliquez pour sélectionner une ou plusieurs images
                            </div>
                            <div style={{ 
                                fontSize: '11px', 
                                color: '#95a5a6',
                                marginTop: '8px'
                            }}>
                                Sélection multiple possible • Max 3 radios à la fois • 10MB par radio
                            </div>
                        </label>
                        <input 
                            type="file" 
                            id="uploadRadios"
                            accept="image/*"
                            multiple
                            disabled={uploading}
                            onChange={handleRadioUpload}
                            style={{ display: "none" }}
                        />
                    </div>

                    {/* Indicateur de cache et bouton rafraîchir */}
                    {isFromCache && !loading && (
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '10px 15px',
                            backgroundColor: '#f0f9ff',
                            borderRadius: '8px',
                            marginBottom: '20px',
                            border: '1px solid #bfdbfe'
                        }}>
                            <span style={{ fontSize: '13px', color: '#1e40af', fontWeight: '500' }}>
                                ⚡ Chargement rapide (cache local)
                            </span>
                            <button
                                onClick={() => chargerRadios(true)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#2563eb',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    fontWeight: '600',
                                    textDecoration: 'underline',
                                    padding: '4px 8px'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.color = '#1d4ed8'}
                                onMouseLeave={(e) => e.currentTarget.style.color = '#2563eb'}
                            >
                                🔄 Actualiser
                            </button>
                        </div>
                    )}

                    {loading ? (
                        <div style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            height: '200px',
                            color: '#95a5a6',
                            fontSize: '16px'
                        }}>
                            Chargement des radios...
                        </div>
                    ) : radios.length > 0 ? (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                            gap: '20px'
                        }}>
                            {radios.map((radioItem, index) => (
                                <div 
                                    key={radioItem.id}
                                    style={{
                                        position: 'relative',
                                        borderRadius: '12px',
                                        overflow: 'hidden',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                        backgroundColor: '#fff',
                                        transition: 'transform 0.2s, box-shadow 0.2s'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = 'translateY(-4px)';
                                        e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.2)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = 'translateY(0)';
                                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                                    }}
                                >
                                    {/* Badge numéro */}
                                    <div style={{
                                        position: 'absolute',
                                        top: '10px',
                                        left: '10px',
                                        background: themes[themeNumber].primary,
                                        color: themes[themeNumber].secondary,
                                        borderRadius: '50%',
                                        width: '32px',
                                        height: '32px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: 'bold',
                                        fontSize: '14px',
                                        zIndex: 1,
                                        boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
                                    }}>
                                        {index + 1}
                                    </div>

                                    {/* Bouton supprimer */}
                                    <button
                                        onClick={() => supprimerRadio(radioItem.id)}
                                        style={{
                                            position: 'absolute',
                                            top: '10px',
                                            right: '10px',
                                            background: '#e74c3c',
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '50%',
                                            width: '36px',
                                            height: '36px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            zIndex: 1,
                                            transition: 'all 0.2s',
                                            boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = '#c0392b';
                                            e.currentTarget.style.transform = 'scale(1.1)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = '#e74c3c';
                                            e.currentTarget.style.transform = 'scale(1)';
                                        }}
                                    >
                                        <Trash2 size={18} />
                                    </button>

                                    {/* Image */}
                                    <img 
                                        src={radioItem.imageData} 
                                        alt={`Radio ${index + 1}`}
                                        onClick={() => setSelectedImage(radioItem.imageData)}
                                        style={{
                                            width: '100%',
                                            height: '250px',
                                            objectFit: 'cover',
                                            display: 'block',
                                            cursor: 'zoom-in'
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            alignItems: 'center',
                            height: '300px',
                            color: '#95a5a6',
                            textAlign: 'center'
                        }}>
                            <ImageIcon size={60} style={{ opacity: 0.3, marginBottom: '15px' }} />
                            <h4 style={{ fontSize: '18px', marginBottom: '8px' }}>Aucune radio disponible</h4>
                            <p>Aucune image radiographique n'a été ajoutée pour cet acte.</p>
                        </div>
                    )}
            </ModalGlobal>

            {/* Modal image plein écran */}
            {selectedImage && (
                <div 
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.95)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 10001,
                        padding: '40px'
                    }}
                    onClick={() => setSelectedImage(null)}
                >
                    <button
                        onClick={() => setSelectedImage(null)}
                        style={{
                            position: 'absolute',
                            top: '20px',
                            right: '20px',
                            background: '#fff',
                            border: 'none',
                            borderRadius: '50%',
                            width: '50px',
                            height: '50px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                            transition: 'transform 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                    >
                        <X size={28} color="#000" />
                    </button>
                    <img 
                        src={selectedImage} 
                        alt="Radio agrandie"
                        style={{
                            maxWidth: '95%',
                            maxHeight: '95%',
                            objectFit: 'contain',
                            borderRadius: '8px'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </>
    );
};

export default ModalRadios;

