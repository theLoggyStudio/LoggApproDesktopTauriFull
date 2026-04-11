import React, { useEffect, useState } from "react";
import CrudButtons from "./CrudButtons.js";
import type { TypeActe } from "../Entities/entities.js";
import { PageParametreController } from "../controllers/PageParametreController.js";
import { checkPrivilege } from "../helpers/helpers.js";
import { useAlert } from "../context/SearchContext.js";
import { Table as Tables } from "../../items/Table.tsx";
import { creerTrace } from "../controllers/TraceController.js";
import { PageProfilController } from "../controllers/PageProfilController.js";
import { useSession } from "../context/SessionContext.js";
import { Modal } from "../../items/Modal.tsx";
import { ModalField, ModalSection, ModalGrid, ModalActions } from './ModalFormComponents.js';
import { themes } from "../../constants/index.ts";
import { useTheme } from '../context/ThemeContext.js';

export function GerrerNomActes({
    allActes,
    tabId: tabIdProp,
    privs,
    limitTypeActe,
    setLimitTypeActe,
    pays,
    /** Page Paramètres : tabId passé = clé référentiel « main » — fournir explicitement si le compte est le docteur / propriétaire (export CSV). */
    isDocteurPourTables,
}: {
    allActes: any;
    tabId?: string;
    privs: string[];
    limitTypeActe: number;
    setLimitTypeActe: (n: number) => void;
    pays?: string;
    isDocteurPourTables?: boolean;
}) {
    const { session } = useSession();
    const userId = session.userId;
    const tabIdDecrypted = tabIdProp ?? session.tabId;
    const tabIdActif = tabIdDecrypted ?? "";
    const paysActif = pays ?? "";
    const estDocteurTables = isDocteurPourTables ?? (userId === tabIdDecrypted);
    
    const [typeActes, setTypeActes] = useState<TypeActe[]>([]);
    const [typeActe, setTypeActe] = useState("");
    const [prixActe, setPrixActe] = useState(0);
    const [idActe, setIdActe] = useState(0);
    const [createVisibility, setCreateVisibility] = useState('block');
    const [updateVisibility, setUpdateVisibility] = useState('block');
    const [removeVisibility, setRemoveVisibility] = useState('block');
    const [nomUtilisateur, setNomUtilisateur] = useState<string>("");
    const [showModal, setShowModal] = useState<boolean>(false);
    const { alertObj, setAlertObj } = useAlert();
    const { themeNumber } = useTheme();

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage,setItemsPerPage] = useState(5);

    useEffect(() => {
        setTypeActes([...allActes]);
    }, [allActes]);
    useEffect(()=>{
setItemsPerPage(limitTypeActe)
    },[limitTypeActe])

    // Récupération du nom du docteur
    useEffect(() => {
        const fetchDocteurNom = async () => {
            try {
                const docteur = await PageProfilController(paysActif).voirInfoDocteur(userId, tabIdActif);
                if (docteur && docteur.docteur) {
                    setNomUtilisateur(`${docteur.docteur.nom} ${docteur.docteur.prenom}`);
                }
            } catch (error) {
                console.error("Erreur lors de la récupération du nom du docteur:", error);
            }
        };
        if (userId && tabIdDecrypted && pays) {
            fetchDocteurNom();
        }
    }, [userId, tabIdDecrypted, pays]);

    const changeTypeActe = (event) => {
        setTypeActe(event.target.value);
    };

    const changePrixActe = (event) => {
        setPrixActe(event.target.value);
    };

    const handleSumition = async (event?: React.FormEvent) => {
        event?.preventDefault();
        setAlertObj({ type: "warning", show: true, text: "chargement..." });
        const privilegeAlert = checkPrivilege("nma02", privs);
        if (!privilegeAlert) return setAlertObj({ type: "error", show: true, text: "vous n'avez pas les privileges necessaire " })

        if (typeActe !== "") {
            try {
                await PageParametreController(paysActif).ajouterUnTypeActe({ nom: typeActe, prix: prixActe, dateCreation: new Date(), loggId: tabIdActif, tabId: tabIdActif });
                
                // Ajouter la trace de création
                await creerTrace(
                    'create',
                    'typeActe',
                    typeActe,
                    new Date().getTime().toString(),
                    userId ?? "",
                    nomUtilisateur || "Utilisateur",
                    "docteur",
                    tabIdDecrypted ?? "",
                    tabIdDecrypted ?? "",
                    paysActif,
                    `Prix par défaut: ${prixActe} FCFA`
                );
                
                setTypeActes([...typeActes, { nom: typeActe, prix: prixActe, dateCreation: new Date() }]);
                setTypeActe("");
                setPrixActe(0);
                setShowModal(false);
                return setAlertObj({ type: "success", show: true, text: "L'acte a été ajouté" });
            } catch (error) {
                console.error("Erreur lors de l'ajout de l'acte", error);
                setAlertObj({ type: "error", show: true, text: "Erreur lors de l'ajout de l'acte" });
            }
        } else {
            return setAlertObj({ type: "error", show: true, text: "L'acte est invalide" });
        }
    };

    const handleUpdate = async (event?: React.FormEvent) => {
        event?.preventDefault();
        setAlertObj({ type: "warning", show: true, text: "chargement..." });
        const privilegeAlert = checkPrivilege("nma02", privs);
        if (!privilegeAlert) return setAlertObj({ type: "error", show: true, text: "vous n'avez pas les privileges necessaire " })

        if (typeActe !== "") {
            try {
                await PageParametreController(paysActif).modifierUnTypeActe(idActe.toString(), { nom: typeActe, prix: prixActe, dateCreation: new Date(), loggId: tabIdActif, tabId: tabIdActif });
                
                // Ajouter la trace de modification du type d'acte
                await creerTrace(
                    'update',
                    'typeActe',
                    typeActe,
                    idActe.toString(),
                    userId ?? "",
                    nomUtilisateur || "Utilisateur",
                    "docteur",
                    tabIdDecrypted ?? "",
                    tabIdDecrypted ?? "",
                    paysActif,
                    `Prix par défaut: ${prixActe} FCFA`
                );
                
                setTypeActes(typeActes.map(acte =>
                    acte.id === idActe ? { ...acte, nom: typeActe, prix: prixActe } : acte
                ));
                setTypeActe("");
                setPrixActe(0);
                setIdActe(0);
                setShowModal(false);
                return setAlertObj({ type: "success", show: true, text: "L'acte a été modifié" });
            } catch (error) {
                console.error("Erreur lors de la modification de l'acte", error);
                setAlertObj({ type: "error", show: true, text: "Erreur lors de la modification de l'acte" });
            }
        } else {
            return setAlertObj({ type: "error", show: true, text: "L'acte est invalide" });
        }
    };

    const handleDelete = async (event?: React.FormEvent) => {
        event?.preventDefault();
        setAlertObj({ type: "warning", show: true, text: "chargement..." });
        const privilegeAlert = checkPrivilege("nma02", privs);
        if (!privilegeAlert) return setAlertObj({ type: "error", show: true, text: "vous n'avez pas les privileges necessaire " });

        try {
            const acteASupprimer = typeActes.find(acte => acte.id === idActe);
            const typeActeASupprimer = acteASupprimer?.nom || "Acte";
            
            await PageParametreController(paysActif).supprimerUnTypeActe(idActe.toString(), tabIdActif);
            
            // Ajouter la trace de suppression du type d'acte
            await creerTrace(
                'delete',
                'typeActe',
                typeActeASupprimer,
                idActe.toString(),
                userId ?? "",
                nomUtilisateur || "Utilisateur",
                "docteur",
                tabIdDecrypted ?? "",
                tabIdDecrypted ?? "",
                paysActif,
                `Prix par défaut: ${acteASupprimer?.prix || 0} FCFA`
            );
            
            setTypeActes(typeActes.filter(acte => acte.id !== idActe));
            setTypeActe("");
            setPrixActe(0);
            setIdActe(0);
            setShowModal(false);
            return setAlertObj({ type: "success", show: true, text: "L'acte a été supprimé" });
        } catch (error) {
            console.error("Erreur lors de la suppression de l'acte", error);
            setAlertObj({ type: "error", show: true, text: "Erreur lors de la suppression de l'acte" });
        }
    };

    const handleOpenModal = () => {
        setTypeActe("");
        setPrixActe(0);
        setIdActe(0);
        setShowModal(true);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setTypeActe("");
        setPrixActe(0);
        setIdActe(0);
    };

    const gerrerVisibilite = (createVisibility, updateVisibility, removeVisibility) => {
        setCreateVisibility(createVisibility);
        setUpdateVisibility(updateVisibility);
        setRemoveVisibility(removeVisibility);
    };

    useEffect(() => {
        idActe === 0 ? gerrerVisibilite("block", "none", "none") : gerrerVisibilite("none", "block", "block");
    }, [idActe]);

    const handleSelectActe = (id, nom, prix) => {
        setTypeActe(nom);
        setPrixActe(prix);
        setIdActe(id);
        setShowModal(true);
    };

    // Pagination logic
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentItems = typeActes.slice(indexOfFirstItem, indexOfLastItem);

    const tableContent = {
        columns: ["Acte", "Prix (par défaut)"],
        data: currentItems.map((na) => ({
            "Acte": na.nom,
            "Prix (par défaut)": na.prix,
            "id": na.id
        }))
    };

    const peutModifierActes = checkPrivilege("nma02", privs);

    return (
        <>
            <div className="row">
                {/* Bouton Ajouter au-dessus du tableau */}
                {checkPrivilege("nma02", privs) && (
                    <div style={{ padding: '0 0 15px 0', display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                        <button
                            onClick={handleOpenModal}
                            style={{
                                backgroundColor: themes[themeNumber].primary,
                                color: themes[themeNumber].secondary,
                                border: 'none',
                                borderRadius: '8px',
                                padding: '12px 24px',
                                fontSize: '14px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                boxShadow: `0 2px 8px ${themes[themeNumber].primary}30`,
                                transition: 'all 0.2s ease',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = `0 4px 12px ${themes[themeNumber].primary}50`;
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = `0 2px 8px ${themes[themeNumber].primary}30`;
                            }}
                        >
                            <span style={{ fontSize: '18px' }}>+</span>
                            Ajouter un acte
                        </button>
                    </div>
                )}

                <div className="col-xl-12">
                    {checkPrivilege("nma01", privs) || checkPrivilege("nma02", privs) ?
                        <Tables tableContent={tableContent} reverseColors={true} onRowClick={(row) => handleSelectActe(row.id, row.Acte, row["Prix (par défaut)"])} setLimit={setLimitTypeActe} exportFileName="nom_actes" privs={privs} isDocteur={estDocteurTables} onImportExcel={async (rows) => {
                            if (!checkPrivilege("nma02", privs)) return;
                            const added: TypeActe[] = [];
                            for (const row of rows) {
                                const nom = String(row["Acte"] ?? "").trim();
                                const prix = parseFloat(String(row["Prix (par défaut)"] ?? 0)) || 0;
                                if (!nom) continue;
                                try {
                                    await PageParametreController(paysActif).ajouterUnTypeActe({ nom, prix, dateCreation: new Date(), loggId: tabIdActif, tabId: tabIdActif });
                                    added.push({ nom, prix, dateCreation: new Date() } as TypeActe);
                                } catch (e) { console.error(e); }
                            }
                            if (added.length > 0) setTypeActes(prev => [...prev, ...added]);
                            setAlertObj({ type: "success", show: true, text: `${added.length} acte(s) importé(s).` });
                        }} />
                        :
                        <div className="alert alert-danger text-center" >
                            Vous n'avez pas les droits pour voir le contenue de ce tableau. Veuillez demander les autorisations à votre Docteur.
                        </div>
                    }
                </div>
            </div>

            {/* Modal pour créer/modifier un acte */}
            {showModal && (
                <Modal
                    show={showModal}
                    onClose={handleCloseModal}
                    title={idActe === 0 ? "Ajouter un acte médical" : "Modifier un acte médical"}
                    maxWidth="600px"
                >
                    <ModalSection>
                        <ModalField
                            id="modalTypeActe"
                            label="Type d'acte"
                            value={typeActe}
                            onChange={(e) => setTypeActe(e.target.value)}
                            placeholder="Ex: Consultation"
                            style={{borderColor: themes[themeNumber].primary}}
                            fullWidth
                        />
                        <ModalField
                            id="modalPrixActe"
                            label="Prix par défaut (FCFA)"
                            type="number"
                            value={prixActe}
                            onChange={(e) => setPrixActe(parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            min="0"
                            step="1000"
                            style={{borderColor: themes[themeNumber].primary}}
                            fullWidth
                        />
                    </ModalSection>
                    <ModalActions>
                        <button
                            type="button"
                            onClick={handleCloseModal}
                            style={{
                                padding: '12px 28px',
                                fontSize: '14px',
                                fontWeight: '600',
                                color: themes[themeNumber].primary,
                                backgroundColor: '#fff',
                                border: `2px solid ${themes[themeNumber].primary}`,
                                borderRadius: '8px',
                                cursor: 'pointer',
                                minWidth: '120px'
                            }}
                        >
                            Annuler
                        </button>
                        {idActe === 0 ? (
                            peutModifierActes ? (
                                <button
                                    type="button"
                                    onClick={handleSumition}
                                    disabled={!typeActe || typeActe.trim() === ""}
                                    style={{
                                        padding: '12px 28px',
                                        fontSize: '14px',
                                        fontWeight: '600',
                                        color: themes[themeNumber].secondary,
                                        backgroundColor: themes[themeNumber].primary,
                                        border: `2px solid ${themes[themeNumber].primary}`,
                                        borderRadius: '8px',
                                        cursor: typeActe && typeActe.trim() !== "" ? 'pointer' : 'not-allowed',
                                        opacity: typeActe && typeActe.trim() !== "" ? 1 : 0.6,
                                        minWidth: '120px'
                                    }}
                                >
                                    Ajouter
                                </button>
                            ) : null
                        ) : (
                            peutModifierActes ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={handleDelete}
                                        style={{
                                            padding: '12px 28px',
                                            fontSize: '14px',
                                            fontWeight: '600',
                                            color: '#fff',
                                            backgroundColor: '#dc3545',
                                            border: '2px solid #dc3545',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            minWidth: '120px'
                                        }}
                                    >
                                        Supprimer
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleUpdate}
                                        disabled={!typeActe || typeActe.trim() === ""}
                                        style={{
                                            padding: '12px 28px',
                                            fontSize: '14px',
                                            fontWeight: '600',
                                            color: themes[themeNumber].secondary,
                                            backgroundColor: themes[themeNumber].primary,
                                            border: `2px solid ${themes[themeNumber].primary}`,
                                            borderRadius: '8px',
                                            cursor: typeActe && typeActe.trim() !== "" ? 'pointer' : 'not-allowed',
                                            opacity: typeActe && typeActe.trim() !== "" ? 1 : 0.6,
                                            minWidth: '120px'
                                        }}
                                    >
                                        Modifier
                                    </button>
                                </>
                            ) : null
                        )}
                    </ModalActions>
                </Modal>
            )}
        </>
    );
}
