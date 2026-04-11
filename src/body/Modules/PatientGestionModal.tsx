import React from "react";
import CustomFieldsButton from "./CustomFieldsButton.js";
import { Modal as ModalGlobal } from "../../items/Modal.tsx";
import { normalizePhoneInput } from "../helpers/phoneFormat.ts";

export interface PatientGestionFormState {
    nom: string;
    prenom: string;
    nomDeJeuneFille: string;
    login: string;
    telephone: string;
    naissance: string;
    adresse: string;
    profession: string;
    adresserPar: string;
    observation: string;
}

interface FormFieldProps {
    id: string;
    label: string;
    type?: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
    rows?: number;
    placeholder?: string;
}

const FormField: React.FC<FormFieldProps> = ({ id, label, type = "text", value, onChange, rows, placeholder }) => (
    <div className="form-group">
        <label htmlFor={id} className="text-color-jaune">
            {label} :
        </label>
        {rows ? (
            <textarea id={id} value={value} onChange={onChange} rows={rows} placeholder={placeholder} style={{ backgroundColor: "#fff" }} />
        ) : (
            <input type={type} id={id} value={value} onChange={onChange} style={{ backgroundColor: "#fff" }} />
        )}
    </div>
);

export type PatientGestionModalProps = {
    show: boolean;
    onClose: () => void;
    formData: PatientGestionFormState;
    customColumns: string[];
    customFields: Record<string, string>;
    onFieldChange: (field: string, value: string) => void;
    onCustomFieldChange: (field: string, value: string) => void;
    onSave: (e: React.MouseEvent<HTMLButtonElement>) => void;
    onDelete: () => void;
    theme: any;
};

/** Modal modification / suppression patient (liste patients ou fiche détail). */
export default function PatientGestionModal({
    show,
    onClose,
    formData,
    customColumns,
    customFields,
    onFieldChange,
    onCustomFieldChange,
    onSave,
    onDelete,
    theme,
}: PatientGestionModalProps) {
    return (
        <ModalGlobal
            show={show}
            onClose={onClose}
            title="Gestion du Patient :"
            style={{
                boxShadow: `-6px 0 8px 0 ${theme.shadowViolet}, 0 25px 70px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.05)`,
            }}
            maxWidth="900px"
        >
            <form action="/patient-detail" className="form-patient">
                <div className="mx-4">
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
                        <FormField
                            id="txtNomPatient"
                            label="Nom"
                            value={formData.nom}
                            onChange={(e) => onFieldChange("nom", e.target.value.toUpperCase())}
                        />
                        <FormField
                            id="txtPrenomPatient"
                            label="Prénom"
                            value={formData.prenom}
                            onChange={(e) => onFieldChange("prenom", e.target.value.toLowerCase())}
                        />
                        <FormField
                            id="txtNomDeJeuneFillePatient"
                            label="Nom de jeune fille"
                            value={formData.nomDeJeuneFille}
                            onChange={(e) => onFieldChange("nomDeJeuneFille", e.target.value)}
                        />
                        <FormField
                            id="txtNaissancePatient"
                            label="Date de naissance"
                            type="date"
                            value={formData.naissance}
                            onChange={(e) => onFieldChange("naissance", e.target.value)}
                        />
                        <FormField
                            id="txtTelephonePatient"
                            label="Téléphone"
                            value={formData.telephone}
                            onChange={(e) => onFieldChange("telephone", normalizePhoneInput(e.target.value))}
                            placeholder="+221 …"
                        />
                        <FormField
                            id="txtLoginPatient"
                            label="Email"
                            type="email"
                            value={formData.login}
                            onChange={(e) => onFieldChange("login", e.target.value)}
                        />
                        <FormField
                            id="txtProfessionPatient"
                            label="Profession"
                            value={formData.profession}
                            onChange={(e) => onFieldChange("profession", e.target.value)}
                        />
                        <FormField
                            id="txtAdresserParPatient"
                            label="Adressé par"
                            value={formData.adresserPar}
                            onChange={(e) => onFieldChange("adresserPar", e.target.value)}
                        />
                    </div>
                    <div style={{ marginTop: "15px" }}>
                        <FormField
                            id="txtAdressePatient"
                            label="Adresse complète"
                            value={formData.adresse}
                            onChange={(e) => onFieldChange("adresse", e.target.value)}
                        />
                        <FormField
                            id="txtObservationPatient"
                            label="Observations"
                            value={formData.observation}
                            onChange={(e) => onFieldChange("observation", e.target.value)}
                            rows={4}
                            placeholder="Ajoutez vos observations ici..."
                        />
                    </div>
                    <CustomFieldsButton
                        customColumns={customColumns}
                        data={customFields}
                        onFieldChange={onCustomFieldChange}
                        theme={theme}
                        nativeFieldCount={10}
                        minNativeFields={3}
                    />
                </div>
            </form>
            <div className="my-3" style={{ backgroundColor: "var(--primary)", color: "var(--secondary)" }}>
                <center>
                    <div className="row mx-3">
                        <div className="col col-xl-6">
                            <button
                                type="button"
                                className="btn color-violet w-5 border-2 px-5"
                                style={{ color: "var(--success)", borderColor: theme.success }}
                                onClick={onSave}
                            >
                                Modifier les informations et Fermer
                            </button>
                        </div>
                        <div className="col col-xl-6">
                            <button
                                type="button"
                                className="btn color-violet w-5 border-2 px-5"
                                style={{ color: "var(--danger)", borderColor: theme.danger }}
                                onClick={onDelete}
                            >
                                Supprimer le patient
                            </button>
                        </div>
                    </div>
                </center>
            </div>
        </ModalGlobal>
    );
}
