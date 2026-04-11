import React, { useState } from "react";
import { PageProfilController } from "../controllers/PageProfilController";
import { checkPrivilege } from "../helpers/helpers";
import { useAlert } from "../context/SearchContext";
import {
  themes,
  decodePrivileges,
  encodePrivileges,
  PRIVILEGE_LIST_FOR_SELECTION,
} from "../../constants/index.ts";
import { useTheme } from "../context/ThemeContext";
import type { TypeCollaborateur } from "../Entities/entities";
import { Modal } from "../../items/Modal.tsx";
import { ModalField, ModalSection, ModalGrid, ModalActions } from "./ModalFormComponents";
import { Table as Tables } from "../../items/Table.tsx";


interface GerrerTypesCollaborateursProps {
    allTypes: TypeCollaborateur[];
    tabId: string;
    pays: string;
    privs: string[];
    onTypesChange: () => void;
}

export function GerrerTypesCollaborateurs({ allTypes, tabId, pays, privs, onTypesChange }: GerrerTypesCollaborateursProps) {
    const [nomType, setNomType] = useState("");
    const [selectedPrivs, setSelectedPrivs] = useState<string[]>([]);
    const [showModal, setShowModal] = useState(false);
    const { setAlertObj } = useAlert();
    const { themeNumber } = useTheme();
    const effectiveTabId = (tabId === "0" || !tabId) ? "main" : tabId;

    const hasPriv = checkPrivilege("col02", privs);
    const peutVoirTypes = checkPrivilege("col01", privs) || checkPrivilege("col02", privs);

    const handleCreate = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!hasPriv) {
            setAlertObj({ type: "error", show: true, text: "Droits insuffisants pour créer un type (col02 / gtc02)." });
            return;
        }
        if (!nomType.trim()) {
            setAlertObj({ type: "error", show: true, text: "Le nom du type est obligatoire." });
            return;
        }
        if (nomType.trim().toLowerCase() === "docteur") {
            setAlertObj({ type: "error", show: true, text: "Le nom 'Docteur' est réservé." });
            return;
        }
        try {
            setAlertObj({ type: "warning", show: true, text: "Création en cours..." });
            const rolesStr = encodePrivileges(selectedPrivs);
            await PageProfilController(pays).creerTypeCollaborateur(
                { nom: nomType.trim(), rolesParDefaut: rolesStr },
                effectiveTabId
            );
            setAlertObj({ type: "success", show: true, text: "Type de collaborateur créé." });
            setNomType("");
            setSelectedPrivs([]);
            setShowModal(false);
            onTypesChange();
        } catch (error) {
            console.error("Erreur création type:", error);
            setAlertObj({ type: "error", show: true, text: "Erreur lors de la création." });
        }
    };

    const handleOpenModal = () => {
        setNomType("");
        setSelectedPrivs([]);
        setShowModal(true);
    };

    const togglePriv = (code: string) => {
        setSelectedPrivs((prev) =>
            prev.includes(code) ? prev.filter((p) => p !== code) : [...prev, code]
        );
    };

    const tableContent = {
        columns: ["#", "Nom du type", "Rôles par défaut"],
        data: allTypes.map((t, i) => ({
            "#": String(i + 1).padStart(2, "0"),
            "Nom du type": t.nom ?? "",
            "Rôles par défaut": t.rolesParDefaut
                ? decodePrivileges(t.rolesParDefaut).join(", ")
                : "-",
        })),
    };

    return (
        <>
            <div className="row">
                {hasPriv && (
                    <div style={{ padding: "0 0 15px 0", display: "flex", justifyContent: "flex-end", width: "100%" }}>
                        <button
                            onClick={handleOpenModal}
                            style={{
                                backgroundColor: themes[themeNumber].primary,
                                color: themes[themeNumber].secondary,
                                border: "none",
                                borderRadius: "8px",
                                padding: "12px 24px",
                                fontSize: "14px",
                                fontWeight: "600",
                                cursor: "pointer",
                            }}
                        >
                            + Créer un type de collaborateur
                        </button>
                    </div>
                )}
                <div className="col-12">
                    {peutVoirTypes ? (
                        <Tables
                            tableContent={tableContent}
                            reverseColors={false}
                            setLimit={() => {}}
                            onRowClick={() => {}}
                        />
                    ) : (
                        <div className="alert alert-danger text-center">
                            Vous n&apos;avez pas les droits pour consulter les types de collaborateurs (col01 / col02 ou
                            gtc01 / gtc02).
                        </div>
                    )}
                </div>
            </div>

            {showModal && (
                <Modal
                    show={showModal}
                    onClose={() => setShowModal(false)}
                    title="Créer un type de collaborateur"
                    maxWidth="600px"
                >
                    <form onSubmit={handleCreate}>
                        <ModalSection>
                            <ModalGrid columns={1}>
                                <ModalField
                                    id="nomType"
                                    label="Nom du type"
                                    value={nomType}
                                    onChange={(e) => setNomType(e.target.value)}
                                    placeholder="Ex: Assistant, Comptable..."
                                    style={{ borderColor: themes[themeNumber].primary }}
                                />
                            </ModalGrid>
                            <div style={{ marginTop: 20 }}>
                                <label style={{ marginBottom: 10, display: "block", fontWeight: 600 }}>
                                    Rôles par défaut
                                </label>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                                    {PRIVILEGE_LIST_FOR_SELECTION.map((p) => (
                                        <label
                                            key={p.code}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 8,
                                                cursor: "pointer",
                                                padding: "8px 12px",
                                                borderRadius: 8,
                                                background: selectedPrivs.includes(p.code)
                                                    ? `${themes[themeNumber].primary}20`
                                                    : "#f5f5f5",
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedPrivs.includes(p.code)}
                                                onChange={() => togglePriv(p.code)}
                                            />
                                            <span style={{ fontSize: 13 }}>{p.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </ModalSection>
                        <ModalActions>
                            <button type="button" onClick={() => setShowModal(false)} style={{ padding: "8px 16px", marginRight: 8 }}>
                                Annuler
                            </button>
                            <button type="submit" style={{ padding: "8px 16px", backgroundColor: themes[themeNumber].primary, color: themes[themeNumber].secondary, border: "none", borderRadius: 6 }}>
                                Créer
                            </button>
                        </ModalActions>
                    </form>
                </Modal>
            )}
        </>
    );
}
