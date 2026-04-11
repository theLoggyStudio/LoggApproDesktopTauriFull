import React, { useEffect, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { Img } from 'react-image';
import type { Privilege } from '../Entities/entities.js';
import { PageProfilController } from '../controllers/PageProfilController.js';
import { ImgController } from '../controllers/ImgController.js';
import { checkPrivilege } from '../helpers/helpers.js';
import { useMode } from '../context/SearchContext.js';
import {
  themes,
  PRIVILEGES,
  PRIVILEGE_LIST_FOR_SELECTION,
  normalizeToNewCodes,
} from '../../constants/index.ts';
import { useTheme } from '../context/ThemeContext.js';
import { useSession } from '../context/SessionContext.js';
import { creerTrace } from "../controllers/TraceController.js";
import defaultProfil from '../../assets/defaultProfil.png';

// ==================== CONSTANTES ====================

// ==================== TYPES ====================
interface ProfilPhotoProps {
    privilege: any;
    classObj: any;
    privs: any;
    pays: string;
    /** userId et tabId optionnels : priorité sur session pour éviter les problèmes de sync */
    userId?: string;
    tabId?: string;
    /** true = profil principal du docteur (page Profil) : afficher la photo même avant chargement des privilèges */
    isOwnProfile?: boolean;
    /** true = utilisateur connecté est le docteur/propriétaire du cabinet : peut toujours voir et modifier les privilèges des collaborateurs */
    isCabinetOwner?: boolean;
}

interface PrivilegeItem {
    label: string;
    text: string;
    isChecked: boolean;
}

// ==================== FONCTIONS UTILITAIRES ====================

/**
 * Compresser et convertir une image en base64
 */
const compresserImage = async (file: File): Promise<string> => {
    const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 500,
        useWebWorker: true
    };

    try {
        const compressedFile = await imageCompression(file, options);
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                if (typeof e.target?.result === 'string') {
                    resolve(e.target.result);
                } else {
                    reject("Échec du chargement de l'image");
                }
            };
            reader.onerror = () => reject("Erreur lors du chargement de l'image");
            reader.readAsDataURL(compressedFile);
        });
    } catch (error) {
        console.error("Erreur lors de la compression de l'image:", error);
        throw error;
    }
};

/**
 * Partitionner une photo en 10 parties égales pour l'envoi au backend
 */
const partitionnerPhoto = (photoBase64: string): { [key: string]: string } => {
    const nombrePartitions = 10;
    const partitions: { [key: string]: string } = {};
    const taillePartition = Math.floor(photoBase64.length / nombrePartitions);
    const reste = photoBase64.length % nombrePartitions;

    for (let i = 0; i < nombrePartitions; i++) {
        const debut = i * taillePartition + Math.min(i, reste);
        const fin = debut + taillePartition + (i < reste ? 1 : 0);
        partitions[`part${i + 1}`] = photoBase64.substring(debut, fin);
    }

    return partitions;
};

/**
 * Valider qu'une chaîne base64 est une image valide
 */
const estImageValide = (base64Data: string): boolean => {
    return !!(base64Data && 
              base64Data.length > 50 && 
              base64Data.startsWith('data:image'));
};

const obtenirTextePivilege = (code: string): string => {
    const p = PRIVILEGES[code as keyof typeof PRIVILEGES];
    return p?.label ?? code;
};

// ==================== COMPOSANT PRINCIPAL ====================
function ProfilePhoto({ privilege, classObj, privs, pays, userId: userIdProp, tabId: tabIdProp, isOwnProfile = false, isCabinetOwner = false }: ProfilPhotoProps) {
    // ========== HOOKS & CONTEXTE ==========
    const { session } = useSession();
    const { mode } = useMode();
    const userId = userIdProp ?? session.userId ?? "";
    const tabId = tabIdProp ?? session.tabId ?? "";
    const { themeNumber } = useTheme();

    // ========== ÉTATS ==========
    const [imageUrl, setImageUrl] = useState<string>(defaultProfil);
    const [thePrivilege, setThePrivilege] = useState<Privilege>(privilege);
    const [nomUtilisateur, setNomUtilisateur] = useState<string>("");
    const [listePrivileges, setListePrivileges] = useState<PrivilegeItem[]>(
        PRIVILEGE_LIST_FOR_SELECTION.map((p) => ({ label: p.code, text: p.label, isChecked: false }))
    );
    const [checkedPrivileges, setCheckedPrivileges] = useState<string[]>([]);
    const [pageActuelle, setPageActuelle] = useState<number>(1);
    const privilegesParPage = 4; // Nombre de privilèges par page

    // ========== EFFETS - Chargement de la photo ==========
    useEffect(() => {
        const chargerPhoto = async () => {
            if (!classObj?.id) {
                return;
            }
            
            try {
                const photoData = await ImgController(pays).voirPhoto(classObj.id, tabId);
                
                if (photoData) {
                    // Reconstituer la photo complète à partir des 10 parties
                    const photoComplete = 
                        (photoData.part1 || "") + 
                        (photoData.part2 || "") + 
                        (photoData.part3 || "") + 
                        (photoData.part4 || "") + 
                        (photoData.part5 || "") + 
                        (photoData.part6 || "") + 
                        (photoData.part7 || "") + 
                        (photoData.part8 || "") + 
                        (photoData.part9 || "") + 
                        (photoData.part10 || "");

                    if (estImageValide(photoComplete)) {
                        setImageUrl(photoComplete);
                    } else {
                        setImageUrl(defaultProfil);
                    }
                } else {
                    setImageUrl(defaultProfil);
                }
            } catch (error) {
                console.error("Erreur lors de la récupération de la photo:", error);
                setImageUrl(defaultProfil);
            }
        };

        chargerPhoto();
    }, [classObj?.id, tabId, pays]);

    // Récupération du nom (docteur ou collaborateur via classObj)
    useEffect(() => {
        if (classObj?.nom != null || classObj?.prenom != null) {
            setNomUtilisateur(`${classObj.nom ?? ""} ${classObj.prenom ?? ""}`.trim() || "Utilisateur");
            return;
        }
        const fetchDocteurNom = async () => {
            try {
                const docteur = await PageProfilController(pays).voirInfoDocteur(userId, tabId);
                if (docteur && docteur.docteur) {
                    setNomUtilisateur(`${docteur.docteur.nom} ${docteur.docteur.prenom}`);
                }
            } catch (error) {
                console.error("Erreur lors de la récupération du nom:", error);
            }
        };
        if (userId && tabId && pays) {
            fetchDocteurNom();
        }
    }, [userId, tabId, pays, classObj?.nom, classObj?.prenom]);

    // ========== EFFETS - Gestion des privilèges ==========
    // Sync explicite sur id + nom : reflète exactement les codes en base (coché / décoché).
    useEffect(() => {
        setThePrivilege(privilege);
        const raw = privilege?.nom
            ? privilege.nom.split(/[,;]/).map((c) => c.trim()).filter(Boolean)
            : [];
        const normalized = [...normalizeToNewCodes(raw)];
        if (normalized.length > 0 && !normalized.includes("acc01")) {
            normalized.push("acc01");
        }
        setCheckedPrivileges(normalized);
    }, [privilege?.id, privilege?.nom]);

    /** Reprendre l’affichage page 1 quand on change de fiche (autre collaborateur / autre ligne privilege). */
    useEffect(() => {
        setPageActuelle(1);
    }, [privilege?.id]);

    useEffect(() => {
        setListePrivileges((prev) =>
            prev.map((unPrivilege) => ({
                ...unPrivilege,
                isChecked: checkedPrivileges.includes(unPrivilege.label),
            }))
        );
    }, [checkedPrivileges]);

    // ========== HANDLERS ==========
    const handleChangerPrivilege = async (label: string) => {
        let privilegesMisAJour = checkedPrivileges.includes(label)
            ? checkedPrivileges.filter((priv) => priv !== label)
            : [...checkedPrivileges, label];

        if (privilegesMisAJour.length > 0 && !privilegesMisAJour.includes("acc01")) {
            privilegesMisAJour = ["acc01", ...privilegesMisAJour];
        }

        setCheckedPrivileges(privilegesMisAJour);

        try {
            await PageProfilController(pays).modifierUnPrivilege({
                id: thePrivilege.id,
                nom: privilegesMisAJour.join(","),
                loggId: userId,
                tabId
            });
            
            // Ajouter la trace de modification du privilège
            const action = checkedPrivileges.includes(label) ? 'retrait' : 'ajout';
            await creerTrace(
                'update',
                'privilege',
                `Privilège ${label}`,
                thePrivilege.id ?? "",
                userId ?? "",
                nomUtilisateur || "Utilisateur",
                "docteur",
                tabId ?? "",
                tabId ?? "",
                pays,
                `${action === 'ajout' ? 'Ajout' : 'Retrait'} du privilège: ${obtenirTextePivilege(label)}`
            );
        } catch (error) {
            console.error("Erreur lors de la modification du privilège:", error);
        }
    };

    const handleChangerImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
        // Vérifier que c'est bien le bon input
        if (event.target.id !== `${classObj?.role ?? "docteur"}FileInput`) {
            return;
        }

        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        try {
            // 1. Affichage immédiat pour une meilleure UX
            const urlTemporaire = URL.createObjectURL(file);
            setImageUrl(urlTemporaire);

            // 2. Compresser et convertir en base64
            const photoBase64 = await compresserImage(file);

            // 3. Partitionner en 10 parties
            const partitions = partitionnerPhoto(photoBase64);

            // 4. Envoyer TOUTES les parties en UNE SEULE requête au backend
            const dataToSend = {
                id: classObj?.id ?? "",
                part1: partitions.part1 || "",
                part2: partitions.part2 || "",
                part3: partitions.part3 || "",
                part4: partitions.part4 || "",
                part5: partitions.part5 || "",
                part6: partitions.part6 || "",
                part7: partitions.part7 || "",
                part8: partitions.part8 || "",
                part9: partitions.part9 || "",
                part10: partitions.part10 || "",
                loggId: userId,
                tabId,
                pays
            };

            await ImgController(pays).ajouterPhoto(dataToSend);

        } catch (error) {
            console.error("Erreur lors de la mise à jour de l'image:", error);
            setImageUrl(defaultProfil);
        }
    };

    // ========== RENDU ==========
    const estProprietaire = String(classObj?.id) === String(userId);
    const roleCible = String((classObj as any)?.role ?? "").toLowerCase();
    const estProfilDocteur = roleCible === "docteur";
    const peutVoirProfil = checkPrivilege("prf01", privs) || checkPrivilege("prf02", privs);
    const peutModifierProfil = checkPrivilege("prf02", privs);
    const estSadminUi = mode === "superAdmin" || userId === "sadmin" || session.userId === "sadmin";
    // Collaborateurs : le docteur propriétaire du cabinet voit/modifie sans prv01/prv02 sur la fiche collaborateur.
    // Compte docteur (cible) : seul le Sadmin voit et modifie les privilèges (pas le docteur ni prv01).
    const peutVoirPrivileges = estProfilDocteur
        ? estSadminUi
        : isCabinetOwner && !estProprietaire
          ? true
          : checkPrivilege("prv01", privs);
    let peutModifierPrivileges = false;
    if (estProfilDocteur) {
        peutModifierPrivileges = estSadminUi;
    } else if (isCabinetOwner && !estProprietaire) {
        peutModifierPrivileges = true;
    } else {
        peutModifierPrivileges = checkPrivilege("prv02", privs);
    }

    if (!classObj) {
        if (isOwnProfile) {
            return (
                <div className='row' style={{ textAlign: 'center', justifyContent: "center" }}>
                    <div style={{ width: "200px", minHeight: "250px", backgroundColor: themes[themeNumber].secondary, marginTop: "10px", borderRadius: "15px", padding: "10px" }}>
                        <Img src={defaultProfil} style={{ borderRadius: "15px", height: "230px", width: "180px", objectFit: "cover" }} alt="Photo de profil" />
                    </div>
                </div>
            );
        }
        return <div style={{ padding: "20px", textAlign: "center" }}>Chargement du profil...</div>;
    }

    // Le propriétaire ou le profil principal peut toujours voir la photo ; les autres ont besoin de vpf01/mpr01
    if (!peutVoirProfil && !estProprietaire && !isOwnProfile) {
        return (
            <div className="alert alert-danger text-center">
                Vous n'avez pas les droits nécessaires pour voir ou modifier ce profil. 
                Veuillez demander les autorisations à votre Docteur.
            </div>
        );
    }

    const containerPhotoStyle = {
        width: "200px",
        minHeight: "250px",
        backgroundColor: themes[themeNumber].secondary,
        marginTop: "10px",
        borderRadius: "15px",
        padding: "10px",
        position: "relative" as const
    };

    const imageStyle = {
        borderRadius: "15px",
        height: "230px",
        width: "180px",
        objectFit: "cover" as const
    };

    const labelStyle = {
        marginTop: "10px",
        display: "inline-block",
        backgroundColor: themes[themeNumber].primary,
        color: themes[themeNumber].secondary,
        padding: "8px 14px",
        borderRadius: "6px",
        cursor: "pointer",
        fontSize: "15px",
        fontWeight: "600" as const,
        textShadow: "0 1px 2px rgba(0,0,0,0.3)",
        letterSpacing: "0.3px"
    };

    const privilegeLabelStyle = {
        color: themes[themeNumber].secondary,
        fontSize: "15px",
        fontWeight: "500" as const,
        textShadow: "0 1px 2px rgba(0,0,0,0.2)",
        lineHeight: 1.4
    };

    return (
        <>
            {/* Vue pour le propriétaire (sans privilèges) */}
            {estProprietaire && (
                <div onChange={handleChangerImage} className='row' style={{ textAlign: 'center', justifyContent: "center" }}>
                    <div style={containerPhotoStyle}>
                        <Img src={imageUrl} style={imageStyle} alt="Photo de profil" />
                        
                        {(peutModifierProfil || estProprietaire || isOwnProfile) && (
                            <>
                                <input
                                    type="file"
                                    accept=".png, .jpg, .jpeg"
                                    onChange={handleChangerImage}
                                    style={{ display: "none" }}
                                    id={`${classObj?.role ?? "docteur"}FileInput`}
                                />
                                <label htmlFor={`${classObj?.role ?? "docteur"}FileInput`} style={labelStyle}>
                                    Changer la photo
                                </label>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Vue pour les autres utilisateurs (avec privilèges) */}
            {!estProprietaire && (
                <div className='row' style={{ textAlign: 'center', justifyContent: "center" }}>
                    {/* Photo */}
                    <div className="col col-xl-5">
                        <div style={containerPhotoStyle}>
                            <Img src={imageUrl} style={imageStyle} alt="Photo de profil" />
                            
                            {(peutModifierProfil || estProprietaire || isOwnProfile) && (
                                <>
                                    <input
                                        type="file"
                                        accept=".png, .jpg, .jpeg"
                                        onChange={handleChangerImage}
                                        style={{ display: "none" }}
                                        id={`${classObj?.role ?? "docteur"}FileInput`}
                                    />
                                    <label htmlFor={`${classObj?.role ?? "docteur"}FileInput`} style={labelStyle}>
                                        Changer la photo
                                    </label>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Privilèges */}
                    <div className="col col-xl-7" style={{ fontSize: "14px" }}>
                        <center>
                            <h2 className="big-text" style={{ textDecoration: "underline" }}>
                                {/* Privilèges */}
                            </h2>
                        </center>

                        {estProfilDocteur && !estSadminUi && (
                            <p className="text-center medium-text" style={{ marginTop: 16, padding: "0 8px", opacity: 0.92 }}>
                                {/* Seul le super-administrateur peut consulter et attribuer les privilèges d’un compte <strong>docteur</strong>. */}
                            </p>
                        )}
                        
                        {peutVoirPrivileges && (
                            <>
                                <div className='checkBox-overflow' style={{ textAlign: 'left', minHeight: '300px' }}>
                                    {listePrivileges
                                        .slice((pageActuelle - 1) * privilegesParPage, pageActuelle * privilegesParPage)
                                        .map((unPrivilege, index) => {
                                            const globalIndex = (pageActuelle - 1) * privilegesParPage + index;
                                            return (
                                                <div className="form-check" key={unPrivilege.label}>
                                                    <input
                                                        className="form-check-input"
                                                        type="checkbox"
                                                        value={unPrivilege.label}
                                                        id={`flexCheck${globalIndex}`}
                                                        checked={checkedPrivileges.includes(unPrivilege.label)}
                                                        onChange={() => handleChangerPrivilege(unPrivilege.label)}
                                                        disabled={!peutModifierPrivileges}
                                                    />
                                                    <label 
                                                        className="form-check-label medium-text" 
                                                        htmlFor={`flexCheck${globalIndex}`}
                                                        style={privilegeLabelStyle}
                                                    >
                                                        {obtenirTextePivilege(unPrivilege.label)}
                                                    </label>
                                                </div>
                                            );
                                        })}
                                </div>
                                
                                {/* Pagination */}
                                {listePrivileges.length > privilegesParPage && (
                                    <div style={{ 
                                        display: 'flex', 
                                        justifyContent: 'center', 
                                        alignItems: 'center', 
                                        gap: '15px',
                                        marginTop: '20px',
                                        flexWrap: 'wrap'
                                    }}>
                                        <button
                                            type="button"
                                            onClick={() => setPageActuelle(prev => Math.max(1, prev - 1))}
                                            disabled={pageActuelle === 1}
                                            style={{
                                                padding: '10px 16px',
                                                backgroundColor: pageActuelle === 1 ? themes[themeNumber].primary + '40' : themes[themeNumber].secondary,
                                                color: pageActuelle === 1 ? themes[themeNumber].secondary + '60' : themes[themeNumber].primary,
                                                border: `2px solid ${themes[themeNumber].secondary}`,
                                                borderRadius: '8px',
                                                cursor: pageActuelle === 1 ? 'not-allowed' : 'pointer',
                                                fontWeight: 'bold',
                                                fontSize: '18px',
                                                transition: 'all 0.2s ease',
                                                opacity: pageActuelle === 1 ? 0.5 : 1,
                                                minWidth: '45px',
                                                height: '45px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}
                                            onMouseEnter={(e) => {
                                                if (pageActuelle !== 1) {
                                                    e.currentTarget.style.backgroundColor = themes[themeNumber].secondary + 'DD';
                                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                                }
                                            }}
                                            onMouseLeave={(e) => {
                                                if (pageActuelle !== 1) {
                                                    e.currentTarget.style.backgroundColor = themes[themeNumber].secondary;
                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                }
                                            }}
                                        >
                                            &lt;
                                        </button>
                                        
                                        <div style={{
                                            padding: '10px 20px',
                                            backgroundColor: themes[themeNumber].secondary,
                                            color: themes[themeNumber].primary,
                                            border: `2px solid ${themes[themeNumber].secondary}`,
                                            borderRadius: '8px',
                                            fontWeight: 'bold',
                                            fontSize: '16px',
                                            minWidth: '50px',
                                            textAlign: 'center'
                                        }}>
                                            {pageActuelle}
                                        </div>
                                        
                                        <button
                                            type="button"
                                            onClick={() => setPageActuelle(prev => Math.min(Math.ceil(listePrivileges.length / privilegesParPage), prev + 1))}
                                            disabled={pageActuelle === Math.ceil(listePrivileges.length / privilegesParPage)}
                                            style={{
                                                padding: '10px 16px',
                                                backgroundColor: pageActuelle === Math.ceil(listePrivileges.length / privilegesParPage) ? themes[themeNumber].primary + '40' : themes[themeNumber].secondary,
                                                color: pageActuelle === Math.ceil(listePrivileges.length / privilegesParPage) ? themes[themeNumber].secondary + '60' : themes[themeNumber].primary,
                                                border: `2px solid ${themes[themeNumber].secondary}`,
                                                borderRadius: '8px',
                                                cursor: pageActuelle === Math.ceil(listePrivileges.length / privilegesParPage) ? 'not-allowed' : 'pointer',
                                                fontWeight: 'bold',
                                                fontSize: '18px',
                                                transition: 'all 0.2s ease',
                                                opacity: pageActuelle === Math.ceil(listePrivileges.length / privilegesParPage) ? 0.5 : 1,
                                                minWidth: '45px',
                                                height: '45px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}
                                            onMouseEnter={(e) => {
                                                if (pageActuelle !== Math.ceil(listePrivileges.length / privilegesParPage)) {
                                                    e.currentTarget.style.backgroundColor = themes[themeNumber].secondary + 'DD';
                                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                                }
                                            }}
                                            onMouseLeave={(e) => {
                                                if (pageActuelle !== Math.ceil(listePrivileges.length / privilegesParPage)) {
                                                    e.currentTarget.style.backgroundColor = themes[themeNumber].secondary;
                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                }
                                            }}
                                        >
                                            &gt;
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}

export default ProfilePhoto;
