import React, { useEffect, useState } from "react";
import CrudButtons from "./CrudButtons.js";
import type { NomMateriel } from "../Entities/entities.js";
import { PagePatientDetailController } from "../controllers/PagePatientDetailController.js";
import { checkPrivilege } from "../helpers/helpers.js";
import { useAlert } from "../context/SearchContext.js";
import { Table as Tables } from "../../items/Table.tsx";
import { creerTrace } from "../controllers/TraceController.js";
import { PageProfilController } from "../controllers/PageProfilController.js";
import { useSession } from "../context/SessionContext.js";
import { useMode } from "../context/SearchContext.js";
import { Modal } from "../../items/Modal.tsx";
import { ModalField, ModalSection, ModalGrid, ModalActions } from './ModalFormComponents.js';
import { themes } from "../../constants/index.ts";
import { useTheme } from '../context/ThemeContext.js';

export function GerrerNomMateriel({
    allMateriels,
    tabId: tabIdProp,
    privs,
    limitNomMateriel,
    setLimitNomMateriel,
    pays,
    isDocteurPourTables,
}: {
    allMateriels: any;
    tabId?: string;
    privs: string[];
    limitNomMateriel: number;
    setLimitNomMateriel: (n: number) => void;
    pays?: string;
    isDocteurPourTables?: boolean;
}) {
    const { session } = useSession();
    const userId = session.userId;
    const tabIdDecrypted = tabIdProp ?? session.tabId;
    const tabIdActif = tabIdDecrypted ?? "";
    const paysActif = pays ?? "";
    const estDocteurTables = isDocteurPourTables ?? (userId === tabIdDecrypted);
    const { mode } = useMode();
    
    const [nomMateriels, setNomMateriels] = useState<NomMateriel[]>([]);
    const [nomMateriel, setNomMateriel] = useState("");
    const [prixMateriel, setPrixMateriel] = useState(0);
    const [quantiteMateriel, setQuantiteMateriel] = useState(0);
    const [idMateriel, setIdMateriel] = useState(0);
    const [createVisibility, setCreateVisibility] = useState('block');
    const [updateVisibility, setUpdateVisibility] = useState('block');
    const [removeVisibility, setRemoveVisibility] = useState('block');
    const [nomUtilisateur, setNomUtilisateur] = useState<string>("");
    const [showModal, setShowModal] = useState<boolean>(false);
    const { alertObj, setAlertObj } = useAlert();
    const { themeNumber } = useTheme();

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(5);

    useEffect(() => {
        setNomMateriels([...allMateriels]);
    }, [allMateriels]);
    
    useEffect(() => {
        setItemsPerPage(limitNomMateriel);
    }, [limitNomMateriel]);

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

    const changeNomMateriel = (event) => {
        setNomMateriel(event.target.value);
    };

    const changePrixMateriel = (event) => {
        setPrixMateriel(event.target.value);
    };

    const changeQuantiteMateriel = (event) => {
        setQuantiteMateriel(event.target.value);
    };

    const handleSumition = async (event?: React.FormEvent) => {
        event?.preventDefault();
        setAlertObj({ type: "warning", show: true, text: "chargement..." });
        const privilegeAlert = checkPrivilege("mat02", privs);
        if (!privilegeAlert) return setAlertObj({ type: "error", show: true, text: "vous n'avez pas les privileges necessaire " });

        if (nomMateriel !== "") {
            try {
                await PagePatientDetailController(paysActif).ajouterUnNomMateriel(mode, {
                    id: new Date().getTime(),
                    nom: nomMateriel,
                    prixDefaut: prixMateriel,
                    quantiteDefaut: quantiteMateriel,
                    loggId: tabIdActif,
                    dateCreation: new Date()
                }, tabIdActif);
                
                // Ajouter la trace de création du matériel
                await creerTrace(
                    'create',
                    'nomMateriel',
                    nomMateriel,
                    new Date().getTime().toString(),
                    userId ?? "",
                    nomUtilisateur || "Utilisateur",
                    "docteur",
                    tabIdDecrypted ?? "",
                    tabIdDecrypted ?? "",
                    paysActif,
                    `Prix: ${prixMateriel} FCFA - Stock: ${quantiteMateriel}`
                );
                
                setNomMateriels([...nomMateriels, { nom: nomMateriel, prixDefaut: prixMateriel, quantiteDefaut: quantiteMateriel, dateCreation: new Date() }]);
                setNomMateriel("");
                setPrixMateriel(0);
                setQuantiteMateriel(0);
                setShowModal(false);
                return setAlertObj({ type: "success", show: true, text: "Le matériel a été ajouté" });
            } catch (error) {
                console.error("Erreur lors de l'ajout du matériel", error);
                setAlertObj({ type: "error", show: true, text: "Erreur lors de l'ajout du matériel" });
            }
        } else {
            return setAlertObj({ type: "error", show: true, text: "Le matériel est invalide" });
        }
    };

    const handleUpdate = async (event?: React.FormEvent) => {
        event?.preventDefault();
        setAlertObj({ type: "warning", show: true, text: "chargement..." });
        const privilegeAlert = checkPrivilege("mat02", privs);
        if (!privilegeAlert) return setAlertObj({ type: "error", show: true, text: "vous n'avez pas les privileges necessaire " });

        if (nomMateriel !== "") {
            try {
                await PagePatientDetailController(paysActif).modifierUnNomMateriel(mode, {
                    id: idMateriel.toString(),
                    nom: nomMateriel,
                    prixDefaut: prixMateriel,
                    quantiteDefaut: quantiteMateriel,
                    loggId: tabIdActif,
                    dateCreation: new Date()
                }, tabIdActif);
                
                // Ajouter la trace de modification du matériel
                await creerTrace(
                    'update',
                    'nomMateriel',
                    nomMateriel,
                    idMateriel.toString(),
                    userId ?? "",
                    nomUtilisateur || "Utilisateur",
                    "docteur",
                    tabIdDecrypted ?? "",
                    tabIdDecrypted ?? "",
                    paysActif,
                    `Prix: ${prixMateriel} FCFA - Stock: ${quantiteMateriel}`
                );
                
                setNomMateriels(nomMateriels.map(materiel =>
                    materiel.id === idMateriel ? { ...materiel, nom: nomMateriel, prixDefaut: prixMateriel, quantiteDefaut: quantiteMateriel } : materiel
                ));
                setNomMateriel("");
                setPrixMateriel(0);
                setQuantiteMateriel(0);
                setIdMateriel(0);
                setShowModal(false);
                return setAlertObj({ type: "success", show: true, text: "Le matériel a été modifié" });
            } catch (error) {
                console.error("Erreur lors de la modification du matériel", error);
                setAlertObj({ type: "error", show: true, text: "Erreur lors de la modification du matériel" });
            }
        } else {
            return setAlertObj({ type: "error", show: true, text: "Le matériel est invalide" });
        }
    };

    const handleDelete = async (event?: React.FormEvent) => {
        event?.preventDefault();
        setAlertObj({ type: "warning", show: true, text: "chargement..." });
        const privilegeAlert = checkPrivilege("mat02", privs);
        if (!privilegeAlert) return setAlertObj({ type: "error", show: true, text: "vous n'avez pas les privileges necessaire " });

        try {
            const materielASupprimer = nomMateriels.find(materiel => materiel.id === idMateriel);
            const nomMaterielASupprimer = materielASupprimer?.nom || "Matériel";
            
            await PagePatientDetailController(paysActif).supprimerUnNomMateriel(mode, idMateriel.toString(), tabIdActif);
            
            // Ajouter la trace de suppression du matériel
            await creerTrace(
                'delete',
                'nomMateriel',
                nomMaterielASupprimer,
                idMateriel.toString(),
                userId ?? "",
                nomUtilisateur || "Utilisateur",
                "docteur",
                tabIdDecrypted ?? "",
                tabIdDecrypted ?? "",
                paysActif,
                `Prix: ${materielASupprimer?.prixDefaut || 0} FCFA - Stock: ${materielASupprimer?.quantiteDefaut || 0}`
            );
            
            setNomMateriels(nomMateriels.filter(materiel => materiel.id !== idMateriel));
            setNomMateriel("");
            setPrixMateriel(0);
            setQuantiteMateriel(0);
            setIdMateriel(0);
            setShowModal(false);
            return setAlertObj({ type: "success", show: true, text: "Le matériel a été supprimé" });
        } catch (error) {
            console.error("Erreur lors de la suppression du matériel", error);
            setAlertObj({ type: "error", show: true, text: "Erreur lors de la suppression du matériel" });
        }
    };

    const handleOpenModal = () => {
        setNomMateriel("");
        setPrixMateriel(0);
        setQuantiteMateriel(0);
        setIdMateriel(0);
        setShowModal(true);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setNomMateriel("");
        setPrixMateriel(0);
        setQuantiteMateriel(0);
        setIdMateriel(0);
    };

    const gerrerVisibilite = (createVisibility, updateVisibility, removeVisibility) => {
        setCreateVisibility(createVisibility);
        setUpdateVisibility(updateVisibility);
        setRemoveVisibility(removeVisibility);
    };

    useEffect(() => {
        idMateriel === 0 ? gerrerVisibilite("block", "none", "none") : gerrerVisibilite("none", "block", "block");
    }, [idMateriel]);

    const handleSelectMateriel = (id, nom, prix, quantite) => {
        setNomMateriel(nom);
        setPrixMateriel(prix);
        setQuantiteMateriel(quantite);
        setIdMateriel(id);
        setShowModal(true);
    };

    // Pagination logic
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentItems = nomMateriels.slice(indexOfFirstItem, indexOfLastItem);

    const tableContent = {
        columns: ["Matériel", "Prix (par défaut)", "Stock"],
        data: currentItems.map((nm) => ({
            "Matériel": nm.nom,
            "Prix (par défaut)": nm.prixDefaut || nm.prix_defaut || 0,
            "Stock": nm.quantiteDefaut || nm.quantite_defaut || 0,
            "id": nm.id
        }))
    };

    const peutModifierMateriels = checkPrivilege("mat02", privs);

    return (
        <>
            <div className="row">
                {/* Bouton Ajouter au-dessus du tableau */}
                {checkPrivilege("mat02", privs) && (
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
                            Ajouter un matériel
                        </button>
                    </div>
                )}

                <div className="col-xl-12">
                    {checkPrivilege("mat01", privs) || checkPrivilege("mat02", privs) ?
                        <Tables tableContent={tableContent} reverseColors={true} onRowClick={(row) => handleSelectMateriel(row.id, row.Matériel, row["Prix (par défaut)"], row.Stock)} setLimit={setLimitNomMateriel} exportFileName="nom_materiels" privs={privs} isDocteur={estDocteurTables} onImportExcel={async (rows) => {
                            if (!checkPrivilege("mat02", privs)) return;
                            const added: NomMateriel[] = [];
                            for (let i = 0; i < rows.length; i++) {
                                const row = rows[i];
                                const nom = String(row["Matériel"] ?? "").trim();
                                const prix = parseFloat(String(row["Prix (par défaut)"] ?? 0)) || 0;
                                const stock = parseInt(String(row["Stock"] ?? 0), 10) || 0;
                                if (!nom) continue;
                                try {
                                    await PagePatientDetailController(paysActif).ajouterUnNomMateriel(mode, { id: Date.now() + i, nom, prixDefaut: prix, quantiteDefaut: stock, loggId: tabIdActif, dateCreation: new Date() }, tabIdActif);
                                    added.push({ nom, prixDefaut: prix, quantiteDefaut: stock, dateCreation: new Date() } as NomMateriel);
                                } catch (e) { console.error(e); }
                            }
                            if (added.length > 0) setNomMateriels(prev => [...prev, ...added]);
                            setAlertObj({ type: "success", show: true, text: `${added.length} matériel(s) importé(s).` });
                        }} />
                        :
                        <div className="alert alert-danger text-center" >
                            Vous n'avez pas les droits pour voir le contenue de ce tableau. Veuillez demander les autorisations à votre Docteur.
                        </div>
                    }
                </div>
            </div>

            {/* Modal pour créer/modifier un matériel */}
            {showModal && (
                <Modal
                    show={showModal}
                    onClose={handleCloseModal}
                    title={idMateriel === 0 ? "Ajouter un matériel médical" : "Modifier un matériel médical"}
                    maxWidth="600px"
                >
                    <ModalSection>
                        <ModalField
                            id="modalNomMateriel"
                            label="Nom du matériel"
                            value={nomMateriel}
                            onChange={(e) => setNomMateriel(e.target.value)}
                            placeholder="Ex: Gants stériles"
                            style={{borderColor: themes[themeNumber].primary}}
                            fullWidth
                        />
                        <ModalGrid columns={2}>
                            <ModalField
                                id="modalPrixMateriel"
                                label="Prix par défaut (FCFA)"
                                type="number"
                                value={prixMateriel}
                                onChange={(e) => setPrixMateriel(parseFloat(e.target.value) || 0)}
                                placeholder="0"
                                min="0"
                                step="100"
                                style={{borderColor: themes[themeNumber].primary}}
                            />
                            <ModalField
                                id="modalQuantiteMateriel"
                                label="Stock initial"
                                type="number"
                                value={quantiteMateriel}
                                onChange={(e) => setQuantiteMateriel(parseInt(e.target.value) || 0)}
                                placeholder="0"
                                min="0"
                                step="1"
                                style={{borderColor: themes[themeNumber].primary}}
                            />
                        </ModalGrid>
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
                        {idMateriel === 0 ? (
                            peutModifierMateriels ? (
                                <button
                                    type="button"
                                    onClick={handleSumition}
                                    disabled={!nomMateriel || nomMateriel.trim() === ""}
                                    style={{
                                        padding: '12px 28px',
                                        fontSize: '14px',
                                        fontWeight: '600',
                                        color: themes[themeNumber].secondary,
                                        backgroundColor: themes[themeNumber].primary,
                                        border: `2px solid ${themes[themeNumber].primary}`,
                                        borderRadius: '8px',
                                        cursor: nomMateriel && nomMateriel.trim() !== "" ? 'pointer' : 'not-allowed',
                                        opacity: nomMateriel && nomMateriel.trim() !== "" ? 1 : 0.6,
                                        minWidth: '120px'
                                    }}
                                >
                                    Ajouter
                                </button>
                            ) : null
                        ) : (
                            peutModifierMateriels ? (
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
                                        disabled={!nomMateriel || nomMateriel.trim() === ""}
                                        style={{
                                            padding: '12px 28px',
                                            fontSize: '14px',
                                            fontWeight: '600',
                                            color: themes[themeNumber].secondary,
                                            backgroundColor: themes[themeNumber].primary,
                                            border: `2px solid ${themes[themeNumber].primary}`,
                                            borderRadius: '8px',
                                            cursor: nomMateriel && nomMateriel.trim() !== "" ? 'pointer' : 'not-allowed',
                                            opacity: nomMateriel && nomMateriel.trim() !== "" ? 1 : 0.6,
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

