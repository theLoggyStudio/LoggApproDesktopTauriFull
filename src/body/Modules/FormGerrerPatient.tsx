import React, { useState, useEffect, useMemo } from "react";
import ButtonAjouter from "./ButtonAjouter.tsx";
import CustomFieldsButton from "./CustomFieldsButton.tsx";
import type { Patient } from "../Entities/entities.tsx";
import { PagePatientController } from "../controllers/PagePatientController.tsx";
import { DataImportExportController } from "../controllers/DataImportExportController.tsx";
import { upperLow } from "../helpers/helpers.tsx";
import { getPagePatientAccess } from "../policies/pagePatientPolicy.js";
import { useAlert, useMode, useSearch } from "../context/SearchContext.js";
import { useSession } from "../context/SessionContext.tsx"; // Import du contexte pour les alertes
import { themes, ActualthemeNumber } from "../../constants/index.ts";
import { Input } from "../../items/Input.tsx";
import { useTheme } from '../context/ThemeContext.js';
import { creerTrace } from "../controllers/TraceController.tsx";
import { phoneOnChangeHandler } from "../helpers/phoneFormat.ts";

type FormGerrerPatientProps = {
    privs: string[];
    setPatients: React.Dispatch<React.SetStateAction<Patient[]>>;
    patients: Patient[];
    pays?: string;
    /** Après création réussie : recharger la liste (API) et réinitialiser la recherche — évite d’afficher d’anciens `itemsTab`. */
    onPatientListRefresh?: () => void | Promise<void>;
};

export default function FormGerrerPatient({ privs, setPatients, patients, pays, onPatientListRefresh }: FormGerrerPatientProps) {
    const { session } = useSession();
    const { userId, tabId } = session;
    const { mode } = useMode()
    const { theValueSearch } = useSearch()
    const { themeNumber } = useTheme();

    const [newPatient, setNewPatient] = useState<Patient>({
        nom: "",
        prenom: "",
        login: "",
        password: "1234",
        telephone: "",
        naissance: new Date().toISOString().slice(0, 10),
        adresse: "",
        nomDeJeuneFille: "",
        profession: "",
        adresserPar: "",
        observation: ""
    });

    const [customColumns, setCustomColumns] = useState<string[]>([]);
    const [customFields, setCustomFields] = useState<Record<string, string>>({});

    const { setAlertObj } = useAlert(); // Utilisation du contexte pour gérer les alertes
    const paysSafe = pays ?? "sn";

    const patientAccess = useMemo(() => getPagePatientAccess(privs), [privs]);

    useEffect(() => {
        if (!tabId || mode === "admin") return;
        DataImportExportController(paysSafe).listCustomColumns(tabId).then((res) => {
            const cols = res?.patient ?? [];
            setCustomColumns(cols);
            setCustomFields((prev) => {
                const next = { ...prev };
                cols.forEach((c: string) => { if (next[c] === undefined) next[c] = ""; });
                return next;
            });
        }).catch(() => setCustomColumns([]));
    }, [tabId, pays, mode]);

    const ajouterUnPatient = async (event) => {
        event.preventDefault();
        const syncDateInSecond = new Date().getTime();

        // Vérification du privilège pour ajouter un patient
        if (!patientAccess.canManagePatients) {
            setAlertObj({ type: "warning", show: true, text: "Vous n'avez pas les droits pour ajouter un patient, veuillez demander les autorisations à votre Docteur" });
            return;
        }

        // Vérification des champs obligatoires
        const champsManquants: string[] = [];
        if (!newPatient.nom || newPatient.nom.trim() === "") champsManquants.push("Nom");
        if (!newPatient.prenom || newPatient.prenom.trim() === "") champsManquants.push("Prénom");
        if (!newPatient.login || newPatient.login.trim() === "") champsManquants.push("Adresse e-mail");
        if (!newPatient.naissance || newPatient.naissance.trim() === "") champsManquants.push("Date de naissance");
        
        if (champsManquants.length > 0) {
            setAlertObj({ 
                type: "error", 
                show: true, 
                text: `Veuillez remplir les champs obligatoires suivants : ${champsManquants.join(", ")}` 
            });
            return;
        }

        try {
            await PagePatientController(paysSafe).createPatient(mode, {
                ...newPatient,
                ...customFields,
                id: syncDateInSecond + "",
                role: "patient",
                dateCreation: new Date(),
                loggId: tabId,
                tabId
            }, theValueSearch);

            // Ajouter la trace de création du patient
            await creerTrace(
                'create',
                'patient',
                `${newPatient.nom} ${newPatient.prenom}`,
                syncDateInSecond.toString(),
                userId ?? "",
                "Utilisateur",
                "docteur",
                tabId ?? "",
                tabId ?? "",
                paysSafe,
                `Téléphone: ${newPatient.telephone} - Email: ${newPatient.login}`
            );

            setAlertObj({ type: "success", show: true, text: `Le client ${newPatient.nom} ${newPatient.prenom} a été ajouté avec succès` });
            setNewPatient({
                nom: "",
                prenom: "",
                login: "",
                password: "1234",
                telephone: "",
                naissance: new Date().toISOString().slice(0, 10),
                adresse: "",
                nomDeJeuneFille: "",
                profession: "",
                adresserPar: "",
                observation: ""
            });
            setCustomFields((prev) => Object.fromEntries(Object.keys(prev).map((k) => [k, ""])));

            if (onPatientListRefresh) {
                await onPatientListRefresh();
            } else {
                setPatients((prev) => [
                    ...prev,
                    {
                        ...newPatient,
                        id: syncDateInSecond + "",
                        role: "patient",
                        dateCreation: new Date(),
                        loggId: tabId,
                        tabId,
                    } as Patient,
                ]);
            }

        } catch (error) {
            console.error("Erreur lors de l'ajout du patient :", error);
            setAlertObj({ type: "error", show: true, text: "Une erreur est survenue lors de l'ajout du patient. Veuillez réessayer." });
        }
    };


    if (patientAccess.hideAddPatientForm) {
        return (
            <div className="form-patient mx-5 mb-4" style={{ opacity: 0.95 }}>
                <p className="text-center small" style={{ maxWidth: 520, margin: "0 auto" }}>
                    L’ajout d’un patient depuis cette page n’est pas disponible avec votre profil. Utilisez la liste à droite pour ouvrir la fiche d’un patient.
                </p>
            </div>
        );
    }

    return (
        <>
            <div className="form-patient">
                <div className="mx-5">
                    {/* Ligne 1: Nom + Prénom */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px", marginBottom: "24px" }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <Input
                                type="text"
                                id="txtNomPatient"
                                placeholder="Nom"
                                value={newPatient.nom}
                                onChange={(e) => setNewPatient({ ...newPatient, nom: e.target.value.toUpperCase() })}
                                disabled={!patientAccess.canManagePatients}
                                style={{ 
                                    color: themes[themeNumber].primary, 
                                    backgroundColor: "#fff",
                                    borderColor: themes[themeNumber].secondary,
                                    width: "100%",
                                    padding: "5px 10px",
                                    borderRadius: "2px",
                                    border: `2px solid ${themes[themeNumber].secondary}`,
                                    fontSize: "14px"
                                }}
                            />
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                            <Input
                                type="text"
                                id="txtPrenomPatient"
                                placeholder="Prénom"
                                value={newPatient.prenom}
                                onChange={(e) => setNewPatient({ ...newPatient, prenom: upperLow(e.target.value) })}
                                disabled={!patientAccess.canManagePatients}
                                style={{ 
                                    color: themes[themeNumber].primary, 
                                    backgroundColor: "#fff",
                                    borderColor: themes[themeNumber].secondary,
                                    width: "100%",
                                    padding: "5px 10px",
                                    borderRadius: "2px",
                                    border: `2px solid ${themes[themeNumber].secondary}`,
                                    fontSize: "14px"
                                }}
                            />
                        </div>
                    </div>

                    {/* Ligne 2: Nom de jeune fille + Login */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px", marginBottom: "24px" }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <Input
                                type="text"
                                id="txtNomDeJeuneFillePatient"
                                placeholder="Nom de jeune fille"
                                value={newPatient.nomDeJeuneFille}
                                onChange={(e) => setNewPatient({ ...newPatient, nomDeJeuneFille: e.target.value.toUpperCase() })}
                                disabled={!patientAccess.canManagePatients}
                                style={{ 
                                    color: themes[themeNumber].primary, 
                                    backgroundColor: "#fff",
                                    borderColor: themes[themeNumber].secondary,
                                    width: "100%",
                                    padding: "5px 10px",
                                    borderRadius: "2px",
                                    border: `2px solid ${themes[themeNumber].secondary}`,
                                    fontSize: "14px"
                                }}
                            />
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                            <Input
                                type="email"
                                id="txtLoginPatient"
                                placeholder="Email"
                                value={newPatient.login}
                                onChange={(e) => setNewPatient({ ...newPatient, login: e.target.value })}
                                disabled={!patientAccess.canManagePatients}
                                style={{ 
                                    color: themes[themeNumber].primary, 
                                    backgroundColor: "#fff",
                                    borderColor: themes[themeNumber].secondary,
                                    width: "100%",
                                    padding: "5px 10px",
                                    borderRadius: "2px",
                                    border: `2px solid ${themes[themeNumber].secondary}`,
                                    fontSize: "14px"
                                }}
                            />
                        </div>
                    </div>

                    {/* Ligne 3: Téléphone + Naissance */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px", marginBottom: "24px" }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <Input
                                type="text"
                                id="txtTelephonePatient"
                                value={newPatient.telephone}
                                onChange={(e) =>
                                    phoneOnChangeHandler(e, (v) =>
                                        setNewPatient({ ...newPatient, telephone: v })
                                    )
                                }
                                placeholder="+221 … (indicatif pays obligatoire)"
                                disabled={!patientAccess.canManagePatients}
                                style={{ 
                                    color: themes[themeNumber].primary, 
                                    backgroundColor: "#fff",
                                    borderColor: themes[themeNumber].secondary,
                                    width: "100%",
                                    padding: "5px 10px",
                                    borderRadius: "2px",
                                    border: `2px solid ${themes[themeNumber].secondary}`,
                                    fontSize: "14px"
                                }}
                            />
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                            <Input
                                type="date"
                                id="txtNaissancePatient"
                                placeholder="Date de naissance"
                                value={newPatient.naissance}
                                onChange={(e) => setNewPatient({ ...newPatient, naissance: e.target.value })}
                                disabled={!patientAccess.canManagePatients}
                                style={{ 
                                    color: themes[themeNumber].primary, 
                                    backgroundColor: "#fff",
                                    borderColor: themes[themeNumber].secondary,
                                    width: "100%",
                                    padding: "5px 10px",
                                    borderRadius: "2px",
                                    border: `2px solid ${themes[themeNumber].secondary}`,
                                    fontSize: "14px"
                                }}
                            />
                        </div>
                    </div>

                    {/* Ligne 4: Adresse + Profession */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px", marginBottom: "24px" }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <Input
                                type="text"
                                id="txtAdressePatient"
                                placeholder="Adresse"
                                value={newPatient.adresse}
                                onChange={(e) => setNewPatient({ ...newPatient, adresse: e.target.value })}
                                disabled={!patientAccess.canManagePatients}
                                style={{ 
                                    color: themes[themeNumber].primary, 
                                    backgroundColor: "#fff",
                                    borderColor: themes[themeNumber].secondary,
                                    width: "100%",
                                    padding: "5px 10px",
                                    borderRadius: "2px",
                                    border: `2px solid ${themes[themeNumber].secondary}`,
                                    fontSize: "14px"
                                }}
                            />
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                            <Input
                                type="text"
                                id="txtProfessionPatient"
                                placeholder="Profession"
                                value={newPatient.profession}
                                onChange={(e) => setNewPatient({ ...newPatient, profession: upperLow(e.target.value) })}
                                disabled={!patientAccess.canManagePatients}
                                style={{ 
                                    color: themes[themeNumber].primary, 
                                    backgroundColor: "#fff",
                                    borderColor: themes[themeNumber].secondary,
                                    width: "100%",
                                    padding: "5px 10px",
                                    borderRadius: "2px",
                                    border: `2px solid ${themes[themeNumber].secondary}`,
                                    fontSize: "14px"
                                }}
                            />
                        </div>
                    </div>

                    {/* Ligne 5: Adressé par (pleine largeur) */}
                    <div className="form-group" style={{ marginBottom: "24px" }}>
                        <Input
                            type="text"
                            id="txtAdresserParPatient"
                            placeholder="Adressé par"
                            value={newPatient.adresserPar}
                            onChange={(e) => setNewPatient({ ...newPatient, adresserPar: e.target.value })}
                            disabled={!patientAccess.canManagePatients}
                            style={{ 
                                color: themes[themeNumber].primary, 
                                borderColor: themes[themeNumber].secondary,
                                width: "100%",
                                padding: "5px 10px",
                                borderRadius: "6px",
                                border: `2px solid ${themes[themeNumber].secondary}`,
                                fontSize: "14px"
                            }}
                        />
                    </div>

                    {/* Ligne 6: Observations (pleine largeur) */}
                    <div className="form-group" style={{ marginBottom: "24px" }}>
                        <textarea
                            id="txtObservationPatient"
                            value={newPatient.observation}
                            onChange={(e) => setNewPatient({ ...newPatient, observation: e.target.value })}
                            rows={4}
                            placeholder="Observation(s)"
                            disabled={!patientAccess.canManagePatients}
                            style={{ 
                                color: themes[themeNumber].primary, 
                                backgroundColor: "#fff",
                                borderColor: themes[themeNumber].secondary,
                                width: "100%",
                                padding: "8px 10px",
                                borderRadius: "2px",
                                border: `2px solid ${themes[themeNumber].secondary}`,
                                fontSize: "14px"
                            }}
                        />
                    </div>

                    <CustomFieldsButton
                        customColumns={customColumns}
                        data={customFields}
                        onFieldChange={(field, value) => setCustomFields((prev) => ({ ...prev, [field]: value }))}
                        theme={themes[themeNumber]}
                        disabled={!patientAccess.canManagePatients}
                        nativeFieldCount={10}
                        minNativeFields={3}
                    />
                </div>
                <div style={{ marginBottom: "40px", marginTop: "20px" }}>
                    <ButtonAjouter onClick={ajouterUnPatient} visibility={"block"} />
                </div>
            </div>
        </>
    );
}
