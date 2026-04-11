import React, { useEffect, useState } from 'react';
import { useAlert, useMode } from "../context/SearchContext.js";
import { emptyPatient } from '../Entities/entities.js';
import filePlus from '../../assets/svg/file-plus.svg';
import { adminController } from '../controllers/AdminController.js';
import BoutonFermer from './BoutonFermer.js';
import { themes, ActualthemeNumber } from '../../constants/index.ts';
import { useTheme } from '../context/ThemeContext.js';

// Variables exportées pour récupérer les valeurs de fileUrl et fileExists
export let theFileUrl: string | null = null;
export let isFileExists: boolean = false;

export let jsonData: any = { data: [] };

const facture = {
    id: "0",
    prix_acte: 0,
    argent_recu_acte: 0,
    argent_restant_acte: 0,
    argent_assurance: 0,
    logg_id: "0",
    acte_id: 0,
    date_creation: new Date().toISOString(),
};

// Assurance par défaut
const assurance = {
    id: "0",
    nom: "",
    pourcentage: 0,
    date_creation: new Date().toISOString(),
};

// Acte par défaut avec facture et assurance
const acte = {
    acte: {
        id: "0",
        nom: "",
        description: "",
        prix: 0,
        argentRecu: 0,
        argentRestant: 0,
        date: new Date().toISOString(),
        isDone: false,
        dateCreation: new Date().toISOString(),
        loggId: "0"
    },

    facture: facture, // Facture par défaut
    assurance: assurance, // Assurance par défaut

};

// Patient par défaut avec l'acte par défaut
const defaultPatient = {
    id: "0",
    patient: {
        id: "0",
        nom: "",
        prenom: "",
        login: "",
        password: "",
        telephone: "",
        naissance: new Date().toISOString(),
        adresse: "",
        nomDeJeuneFille: "",
        profession: "",
        adresserPar: "",
        observation: "",
        role: "",
        dateCreation: new Date().toISOString(),
        loggId: "0",
        tabId: "0"
    },
    actes: [acte] // Ajout de l'acte par défaut avec facture et assurance
};

// Fonction pour vider le localStorage d'une clé spécifique
const clearLocalStorage = (filename: string) => {
    localStorage.removeItem(`jsonData_${filename}`);
    console.log(`LocalStorage nettoyé pour le fichier : ${filename}`);
};

// Fonction mise à jour pour ajouter les données par défaut si nécessaire
export let updateJsonFile = (newData: any = { data: [defaultPatient] }, filename: string) => {
    // Avant de sauvegarder les nouvelles données, efface les anciennes
    clearLocalStorage(filename);

    // Si data est vide, on y insère un patient par défaut
    if (!newData.data || newData.data.length === 0) {
        newData.data = [defaultPatient]; // Ajoute le patient par défaut dans data
    }

    jsonData = newData; // Met à jour jsonData avec les nouvelles données ou les valeurs par défaut
    const blob = new Blob([JSON.stringify(newData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    theFileUrl = url; // Met à jour l'URL exportée
    isFileExists = true; // Marquer le fichier comme existant
    saveToLocalStorage(filename); // Sauvegarder dans le localStorage
    console.log("Fichier JSON mis à jour avec : ", newData);
};

// Sauvegarde des données du fichier JSON dans le localStorage en utilisant le nom du fichier comme clé
const saveToLocalStorage = (filename: string) => {
    localStorage.setItem(`jsonData_${filename}`, JSON.stringify(jsonData));
};

// Récupération des données depuis le localStorage en fonction du nom du fichier
const loadFromLocalStorage = (filename: string) => {
    const savedData = localStorage.getItem(`jsonData_${filename}`);
    if (savedData) {
        jsonData = JSON.parse(savedData);
        isFileExists = true;
        console.log(`Données chargées à partir du localStorage pour le fichier ${filename}`, jsonData);
    }
};

function BoutonAdmin({ chiffre, pays }: { chiffre: string, pays: string }) {
    const { mode, setMode } = useMode();
    const { setAlertObj } = useAlert();
    const [fileUrl, setFileUrl] = useState<string | null>(null);
    const [fileExists, setFileExists] = useState(isFileExists);
    const [showModal, setShowModal] = useState<boolean>(false);
    const { themeNumber } = useTheme();

    // Charger les données depuis le localStorage au chargement du composant
    useEffect(() => {
        loadFromLocalStorage(chiffre);
        setFileExists(isFileExists);
        if (isFileExists) {
            const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            setFileUrl(url);
        }
    }, [chiffre]);

    useEffect(() => {
        theFileUrl = fileUrl;
        isFileExists = fileExists;
    }, [fileUrl, fileExists]);

    // Fonction pour mettre à jour et recréer le fichier JSON
    updateJsonFile = (newData: any) => {
        jsonData = newData;
        const blob = new Blob([JSON.stringify(newData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        setFileUrl(url);
        setFileExists(true);
        saveToLocalStorage(chiffre); // Sauvegarder dans le localStorage
    };

    const downloadTxt = () => {
        if (fileUrl) {
            const link = document.createElement('a');
            link.href = fileUrl;
            link.download = `${chiffre}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setMode("client");
            setAlertObj({ type: "warning", text: "Retour au mode Client", show: true });
        }else{
            setAlertObj({ type: "warning", text: "le fichier JSON de votre ajout est vide. il ne peut donc pas etre telecharger", show: true });
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const jsonData = JSON.parse(event.target?.result as string);
                adminController(setAlertObj, pays).exportJsonContent(jsonData.data)
                setAlertObj({ type: "success", text: "Fichier chargé avec succès", show: true });
                setShowModal(false);
            };
            reader.readAsText(file);
        }
    };

    return (
        <ul style={{ listStyleType: "none", padding: 0 }}>
            <li style={{ display: "flex", justifyContent: "space-between" }}>
                <h5 className='mt-3' style={{ color: themes[themeNumber].primary }}>Mode admin</h5>
                <input
                    type="button"
                    className="btn w-5 border-2 px-5 m-2 text-break"
                    style={{
                        width: "200px",
                        fontSize: "10px",
                        height: "50px",
                        backgroundColor: themes[themeNumber].secondary,
                        color: themes[themeNumber].primary,
                        borderColor: themes[themeNumber].primary,
                        wordWrap: "break-word",
                        whiteSpace: "normal",
                        textAlign: "center",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center"
                    }}
                    value={`Récupérer\nle\n${chiffre}.json`}
                    onClick={downloadTxt}
                />
            </li>

            {String(mode) === "superAdmin" && (
                <li style={{ position: "relative", zIndex: 2000 }}>
                    <button type="button"
                        className="btn w-5 border-2 px-5 m-2"
                        style={{
                            backgroundColor: themes[themeNumber].secondary,
                            width: "50px",
                            color: themes[themeNumber].primary,
                            borderColor: themes[themeNumber].primary,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            position: "fixed",
                            bottom: "20px",
                            right: "20px",
                            zIndex: 1000
                        }}
                        onClick={() => setShowModal(true)}
                    >
                        <img src={filePlus} alt="Ajouter une liste de patients" />
                    </button>
                </li>
            )}

            {showModal && (
                <div className="modal" style={{ display: 'block' }}>
                    <div className="modal-dialog">
                        <div className="modal-content">
                            <div className="modal-body">
                                <div className="d-flex flex-row-reverse my-3">
                                    <button
                                        type="button"
                                        className="close"
                                        onClick={() => setShowModal(false)}
                                        style={{ marginLeft: 'auto' }}
                                    >
                                        <BoutonFermer couleur="noir" />
                                    </button>
                                    <div style={{ flexGrow: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                        <h4 className="modal-title">Ajouter des Patients</h4>
                                    </div>
                                </div>


                                <input type="file" accept='.json' onChange={handleFileChange} />
                                <br />
                                <small className="text-muted">(Sélectionnez un fichier JSON contenant la liste des patients à importer.)</small>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </ul>
    );
}

export default BoutonAdmin;


// Gestion CRUD pour les patients et actes
export const modeCrud = () => {
    // Ajouter ou mettre à jour un patient
    const addOrUpdatePatient = (newPatient: any, filename: string) => {
        // Ne pas enregistrer de patient avec un id "0"
        if (newPatient.id === "0") {
            console.error("Le patient avec id '0' ne peut pas être enregistré.");
            return;
        }

        const updatedData = (prevData: any) => {
            const existingPatientIndex = prevData.data.findIndex((entry: any) => entry.patient.id === newPatient.id);

            if (existingPatientIndex !== -1) {
                const updatedData = [...prevData.data];
                updatedData[existingPatientIndex].patient = { ...updatedData[existingPatientIndex].patient, ...newPatient };

                // Si le patient n'a pas d'actes, ajoute un acte par défaut
                if (!updatedData[existingPatientIndex].actes || updatedData[existingPatientIndex].actes.length === 0) {
                    updatedData[existingPatientIndex].actes = [acte];
                }

                return { data: updatedData };
            } else {
                // Ajoute un nouveau patient avec un acte par défaut s'il n'existe pas
                return { data: [...prevData.data, { id: newPatient.id, patient: newPatient, actes: [acte] }] };
            }
        };

        const updatedJsonData = updatedData(jsonData);
        updateJsonFile(updatedJsonData, filename);
    };

    // Ajouter ou mettre à jour un acte
    const addOrUpdateActe = (patientId: string, newActe: any, filename: string) => {
        // Ne pas enregistrer d'acte avec un id "0"
        if (newActe.id === "0") {
            console.error("L'acte avec id '0' ne peut pas être enregistré.");
            return;
        }

        const updatedData = (prevData: any) => {
            const patientIndex = prevData.data.findIndex((entry: any) => String(entry.id) === String(patientId));

            if (patientIndex === -1) {
                console.error("Patient non trouvé");
                return prevData;
            }

            if (!prevData.data[patientIndex].actes) {
                prevData.data[patientIndex].actes = [acte]; // Ajoute un acte par défaut si aucun n'existe
            }

            const existingActeIndex = prevData.data[patientIndex].actes.findIndex(
                (acte: any) => acte.id === newActe.id && acte.loggId === newActe.loggId
            );

            if (existingActeIndex !== -1) {
                const updatedActes = [...prevData.data[patientIndex].actes];
                updatedActes[existingActeIndex] = { ...updatedActes[existingActeIndex], ...newActe };
                prevData.data[patientIndex].actes = updatedActes;
            } else {
                prevData.data[patientIndex].actes.push(newActe);
            }

            return { ...prevData };
        };

        const updatedJsonData = updatedData(jsonData);
        updateJsonFile(updatedJsonData, filename);
    };





    // Lire un patient par ID avec rechargement des données depuis localStorage
    const findPatientById = (patientId: string, filename: string) => {
        loadFromLocalStorage(filename);
        const patient = jsonData.data.find((entry: any) => String(entry.patient.id) === String(patientId)) || null;
        if (patient) {
            // Si le patient n'a pas d'actes, ajoute un acte par défaut
            if (!patient.actes || patient.actes.length === 0) {

                patient.actes = [acte];
            }
        }

        return patient.patient;
    };

    // Lister tous les patients avec rechargement des données depuis localStorage
    const listPatients = (filename: string) => {
        loadFromLocalStorage(filename); // Charger les données du fichier correspondant

        return jsonData.data.length
            ? jsonData.data.map((entry: any) => {
                // Vérifie si le patient a des actes, sinon ajoute un acte par défaut
                if (!entry.actes || entry.actes.length === 0) {
                    entry.actes = [acte];
                }
                return entry.patient;
            })
            : [emptyPatient];
    };


    // Supprimer un patient
    const deletePatient = (patientId: string, filename: string) => {
        const updatedData = {
            data: jsonData.data.filter((entry: any) => entry.patient.id !== patientId)
        };
        updateJsonFile(updatedData, filename);
    };



    // Lire un acte par loggId et id
    const findActeByLoggId = (patientId: string) => {

        const patientEntry = jsonData.data.find((entry: any) => String(entry.patient.id) === String(patientId));
        if (!patientEntry) {
            return null;
        }
        return patientEntry.actes//.find((acte: any) => acte.id == acteId && acte.loggId == loggId) || null;
    };

    // Supprimer un acte
    const deleteActe = (patientId: string, acteId: string, loggId: string, filename: string) => {
        const updatedData = (prevData: any) => {
            const patientIndex = prevData.data.findIndex((entry: any) => String(entry.patient.id) === String(patientId));
            if (patientIndex === -1) {
                return prevData;
            }

            const filteredActes = prevData.data[patientIndex].actes.filter(
                (acte: any) => !(String(acte.acte.id) === String(acteId))
            );

            prevData.data[patientIndex].actes = filteredActes;


            return { ...prevData };
        };

        const updatedJsonData = updatedData(jsonData);

        updateJsonFile(updatedJsonData, filename);
    };

    return {
        addOrUpdatePatient,
        findPatientById,
        listPatients,
        deletePatient,
        addOrUpdateActe,
        findActeByLoggId,
        deleteActe,
    };
};
