import React, { useEffect, useState } from "react";
import CrudButtons from "./CrudButtons.js";
import type { TypeAssurance } from "../Entities/entities.js";
import { emptyTypeAssurance } from "../Entities/entities.js";
import { PageParametreController } from "../controllers/PageParametreController.js";
import { checkPrivilege } from "../helpers/helpers.js";
import { useAlert } from "../context/SearchContext.js";
import { Table as Tables, EmptyTables } from "../../items/Table.tsx";
import { creerTrace } from "../controllers/TraceController.js";
import { PageProfilController } from "../controllers/PageProfilController.js";
import { useSession } from "../context/SessionContext.js";
import { Modal } from "../../items/Modal.tsx";
import { ModalField, ModalSection, ModalGrid, ModalActions } from './ModalFormComponents.js';
import { themes } from "../../constants/index.ts";
import { useTheme } from '../context/ThemeContext.js';

export default function GerrerNomAssurance({
    allTypeAssurances,
    tabId: tabIdProp,
    privs,
    setLimitTypeAssurance,
    pays,
    limitTypeActe,
    isDocteurPourTables,
}: {
    allTypeAssurances: any;
    tabId?: string;
    privs: string[];
    setLimitTypeAssurance: (n: number) => void;
    pays?: string;
    limitTypeActe?: number;
    isDocteurPourTables?: boolean;
}) {
    const { session } = useSession();
    const userId = session.userId;
    const tabIdDecrypted = tabIdProp ?? session.tabId;
    const tabIdActif = tabIdDecrypted ?? "";
    const paysActif = pays ?? "";
    const estDocteurTables = isDocteurPourTables ?? (userId === tabIdDecrypted);
    
    const [typeAssurances, setTypeAssurances] = useState<TypeAssurance[]>([]);
    const [nom, setNom] = useState('');
    const [id, setId] = useState(0);
    const [pourcentage, setPourcentage] = useState(0);
    const [selectedAssurance, setSelectedAssurance] = useState({ idAS: 0, nomAS: '', pourcentageAS: 0.0 });
    const [createVisibility, setCreateVisibility] = useState('block');
    const [updateVisibility, setUpdateVisibility] = useState('block');
    const [removeVisibility, setRemoveVisibility] = useState('block');
    const [nomUtilisateur, setNomUtilisateur] = useState<string>("");
    const [showModal, setShowModal] = useState<boolean>(false);
    const { alertObj, setAlertObj } = useAlert();
    const { themeNumber } = useTheme();

    useEffect(() => {
        if ((checkPrivilege("asr01", privs) || checkPrivilege("asr02", privs))) {
            setTypeAssurances(allTypeAssurances);
        } else {
            setTypeAssurances([emptyTypeAssurance]);
            setAlertObj({ type: "success", show: true, text: "Vous n'avez pas les droits pour voir les assurances." });
        }
    }, [allTypeAssurances, privs]);

    useEffect(() => {
        setNom(selectedAssurance.nomAS);
        setPourcentage(selectedAssurance.pourcentageAS);
        setId(selectedAssurance.idAS);
    }, [selectedAssurance]);

    useEffect(() => {
        id === 0 ? gerrerVisibilite("block", "none", "none") : gerrerVisibilite("none", "block", "block");
    }, [id]);

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

    const gerrerVisibilite = (createVisibility, updateVisibility, removeVisibility) => {
        setCreateVisibility(createVisibility);
        setUpdateVisibility(updateVisibility);
        setRemoveVisibility(removeVisibility);
    };

    const changeTypeAssurance = (event) => {
        setNom(event.target.value);
    };

    const changePourcentageAssurance = (event) => {
        setPourcentage(event.target.value);
    };

    const handleSelectAssurance = (idAS, nomAS, pourcentageAS) => {
        setCreateVisibility("none");
        setSelectedAssurance({ idAS, nomAS, pourcentageAS });
        setShowModal(true);
    };

    const handleOpenModal = () => {
        setNom('');
        setPourcentage(0);
        setId(0);
        setSelectedAssurance({ idAS: 0, nomAS: '', pourcentageAS: 0.0 });
        setShowModal(true);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setNom('');
        setPourcentage(0);
        setId(0);
        setSelectedAssurance({ idAS: 0, nomAS: '', pourcentageAS: 0.0 });
    };

    const handleSumition = async (event?: React.FormEvent) => {
        event?.preventDefault();
        setAlertObj({ type: "warning", show: true, text: "chargement..." });
        const privilegeAlert = checkPrivilege("asr02", privs);
        if (!privilegeAlert) return setAlertObj({ type: "error", show: true, text: "vous n'avez pas les privileges necessaire " })

        try {
            if (nom !== "") {
                await PageParametreController(paysActif).ajouterUnTypeAssurance({ id:new Date().getTime(), nom: nom, pourcentage: pourcentage, dateCreation: new Date(), loggId: tabIdActif, tabId: tabIdActif });
                
                // Ajouter la trace de création
                await creerTrace(
                    'create',
                    'typeAssurance',
                    nom,
                    new Date().getTime().toString(),
                    userId ?? "",
                    nomUtilisateur || "Utilisateur",
                    "docteur",
                    tabIdDecrypted ?? "",
                    tabIdDecrypted ?? "",
                    paysActif,
                    `Pourcentage: ${pourcentage}%`
                );
                
                setTypeAssurances([...typeAssurances, { nom: nom, pourcentage: pourcentage, dateCreation: new Date() }]);
                setNom('');
                setPourcentage(0);
                setShowModal(false);
                return setAlertObj({ type: "success", show: true, text: "L'assurance a été ajoutée" });
            } else {
                return setAlertObj({ type: "error", show: true, text: "L'assurance est invalide" });
            }
        } catch (error) {
            console.error("Erreur lors de l'ajout de l'assurance", error);
            setAlertObj({ type: "error", show: true, text: "Erreur lors de l'ajout de l'assurance" });
        }
    };

    const handleUpdate = async (event?: React.FormEvent) => {
        event?.preventDefault();
        setAlertObj({ type: "warning", show: true, text: "chargement..." });
        const privilegeAlert = checkPrivilege("asr02", privs);
        if (!privilegeAlert) return setAlertObj({ type: "error", show: true, text: "vous n'avez pas les privileges necessaire " })

        try {
            if (nom !== "") {
                await PageParametreController(paysActif).modifierUnTypeAssurance({ id, nom: nom, pourcentage: pourcentage, dateCreation: new Date(), loggId: tabIdActif, tabId: tabIdActif });
                
                // Ajouter la trace de modification du nom d'assurance
                await creerTrace(
                    'update',
                    'typeAssurance',
                    nom,
                    id.toString(),
                    userId ?? "",
                    nomUtilisateur || "Utilisateur",
                    "docteur",
                    tabIdDecrypted ?? "",
                    tabIdDecrypted ?? "",
                    paysActif,
                    `Pourcentage: ${pourcentage}%`
                );
                
                setTypeAssurances(typeAssurances.map(assurance =>
                    assurance.id === id ? { ...assurance, nom, pourcentage } : assurance
                ));
                setNom('');
                setPourcentage(0);
                setId(0);
                setShowModal(false);
                return setAlertObj({ type: "success", show: true, text: "L'assurance a été modifiée" });
            } else {
                return setAlertObj({ type: "error", show: true, text: "L'assurance est invalide" });
            }
        } catch (error) {
            console.error("Erreur lors de la modification de l'assurance", error);
            setAlertObj({ type: "error", show: true, text: "Erreur lors de la modification de l'assurance" });
        }
    };

    const handleDelete = async (event?: React.FormEvent) => {
        event?.preventDefault();
        setAlertObj({ type: "warning", show: true, text: "chargement..." });
        const privilegeAlert = checkPrivilege("asr02", privs);
        if (!privilegeAlert) return setAlertObj({ type: "error", show: true, text: "vous n'avez pas les privileges necessaire " })

        try {
            const assuranceASupprimer = typeAssurances.find(assurance => assurance.id === id);
            const typeAssuranceASupprimer = assuranceASupprimer?.nom || "Assurance";
            
            await PageParametreController(paysActif).supprimerUnTypeAssurance(id.toString(), tabIdActif);
            
            // Ajouter la trace de suppression du nom d'assurance
            await creerTrace(
                'delete',
                'typeAssurance',
                typeAssuranceASupprimer,
                id.toString(),
                userId ?? "",
                nomUtilisateur || "Utilisateur",
                "docteur",
                tabIdDecrypted ?? "",
                tabIdDecrypted ?? "",
                paysActif,
                `Pourcentage: ${assuranceASupprimer?.pourcentage || 0}%`
            );
            
            setTypeAssurances(typeAssurances.filter(assurance => assurance.id !== id));
            setNom('');
            setPourcentage(0);
            setId(0);
            setShowModal(false);
            return setAlertObj({ type: "success", show: true, text: "L'assurance a été supprimée" });
        } catch (error) {
            console.error("Erreur lors de la suppression de l'assurance", error);
            setAlertObj({ type: "error", show: true, text: "Erreur lors de la suppression de l'assurance" });
        }
    };

    // Contenu du tableau
    const tableContent = {
        columns: ["Assurance", "Pourcentage de paiement (par défaut)"],
        data: typeAssurances.map(nas => ({
            Assurance: nas.nom,
            "Pourcentage de paiement (par défaut)": nas.pourcentage + " %",
            id: nas.id
        }))
    };

    const peutModifierAssurances = checkPrivilege("asr02", privs);

    return (
        <>
            <div className="row">
                {/* Bouton Ajouter au-dessus du tableau */}
                {checkPrivilege("asr02", privs) && (
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
                            Ajouter une assurance
                        </button>
                    </div>
                )}

                <div className="col-xl-12">
                    {checkPrivilege("asr02", privs) || checkPrivilege("asr01", privs) ?
                        <Tables tableContent={tableContent} reverseColors={true} onRowClick={(row) => handleSelectAssurance(row.id, row.Assurance, parseFloat(row["Pourcentage de paiement (par défaut)"].replace(' %', '')))} setLimit={setLimitTypeAssurance} exportFileName="nom_assurances" privs={privs} isDocteur={estDocteurTables} onImportExcel={async (rows) => {
                            if (!checkPrivilege("asr02", privs)) return;
                            const added: TypeAssurance[] = [];
                            for (let i = 0; i < rows.length; i++) {
                                const row = rows[i];
                                const nom = String(row["Assurance"] ?? "").trim();
                                const pctStr = String(row["Pourcentage de paiement (par défaut)"] ?? "0").replace(" %", "");
                                const pourcentage = parseFloat(pctStr) || 0;
                                if (!nom) continue;
                                try {
                                    await PageParametreController(paysActif).ajouterUnTypeAssurance({ id: Date.now() + i, nom, pourcentage, dateCreation: new Date(), loggId: tabIdActif, tabId: tabIdActif });
                                    added.push({ nom, pourcentage, dateCreation: new Date() } as TypeAssurance);
                                } catch (e) { console.error(e); }
                            }
                            if (added.length > 0) setTypeAssurances(prev => [...prev, ...added]);
                            setAlertObj({ type: "success", show: true, text: `${added.length} assurance(s) importée(s).` });
                        }} />
                        :
                        <div className="alert alert-danger text-center" >
                            Vous n'avez pas les droit pour voir le contenu de ce tableau, veuillez demandez l'autorisation a votre Docteur
                        </div>
                    }
                </div>
            </div>

            {/* Modal pour créer/modifier une assurance */}
            {showModal && (
                <Modal
                    show={showModal}
                    onClose={handleCloseModal}
                    title={id === 0 ? "Ajouter une assurance" : "Modifier une assurance"}
                    maxWidth="600px"
                >
                    <ModalSection>
                        <ModalField
                            id="modalTypeAssurance"
                            label="Type d'assurance"
                            value={nom}
                            onChange={(e) => setNom(e.target.value)}
                            placeholder="Ex: IPM"
                            style={{borderColor: themes[themeNumber].primary}}
                            fullWidth
                        />
                        <ModalField
                            id="modalPourcentageAssurance"
                            label="Pourcentage de paiement par défaut (%)"
                            type="number"
                            value={pourcentage}
                            onChange={(e) => setPourcentage(parseFloat(e.target.value) || 0)}
                            placeholder="0-100"
                            min="0"
                            max="100"
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
                        {id === 0 ? (
                            peutModifierAssurances ? (
                                <button
                                    type="button"
                                    onClick={handleSumition}
                                    disabled={!nom || nom.trim() === ""}
                                    style={{
                                        padding: '12px 28px',
                                        fontSize: '14px',
                                        fontWeight: '600',
                                        color: themes[themeNumber].secondary,
                                        backgroundColor: themes[themeNumber].primary,
                                        border: `2px solid ${themes[themeNumber].primary}`,
                                        borderRadius: '8px',
                                        cursor: nom && nom.trim() !== "" ? 'pointer' : 'not-allowed',
                                        opacity: nom && nom.trim() !== "" ? 1 : 0.6,
                                        minWidth: '120px'
                                    }}
                                >
                                    Ajouter
                                </button>
                            ) : null
                        ) : (
                            peutModifierAssurances ? (
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
                                        disabled={!nom || nom.trim() === ""}
                                        style={{
                                            padding: '12px 28px',
                                            fontSize: '14px',
                                            fontWeight: '600',
                                            color: themes[themeNumber].secondary,
                                            backgroundColor: themes[themeNumber].primary,
                                            border: `2px solid ${themes[themeNumber].primary}`,
                                            borderRadius: '8px',
                                            cursor: nom && nom.trim() !== "" ? 'pointer' : 'not-allowed',
                                            opacity: nom && nom.trim() !== "" ? 1 : 0.6,
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
