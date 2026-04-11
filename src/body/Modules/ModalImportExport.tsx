import React, { useState, useEffect, useRef } from "react";
import { Modal as ModalGlobal } from "../../items/Modal.tsx";
import { themes } from "../../constants/index.ts";
import { useTheme } from "../context/ThemeContext";
import { useAlert, useMode } from "../context/SearchContext";
import { useNavigationParams } from "../hooks/useNavigationParams";
import { DataImportExportController } from "../controllers/DataImportExportController";
import AutorisationController from "../controllers/AutorisationController";
import { checkPrivilege } from "../helpers/helpers";
import { Download, Upload, Database, Loader } from "lucide-react";

interface TableInfo {
    name: string;
    dbColor: string;
    columns: string[];
    /** Libellé lisible pour les groupes combinés (ex: "Docteurs + Collaborateurs + Users") */
    label?: string;
}

interface ModalImportExportProps {
    show: boolean;
    onClose: () => void;
}

const MSG_DROITS_NEW_COLONNES =
    "Vous n’avez pas le droit d’importer des colonnes NEW_ (schéma). Demandez au praticien le privilège « Schéma import — nouvelles colonnes » (code iex03), ou retirez ces colonnes de votre fichier CSV.";

const firstNonEmptyLine = (text: string) => text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";

const csvLineContainsNewColumn = (line: string) => /\bNEW_/i.test(line);

/** Alerte globale + message clair si le serveur refuse pour iex03 */
const alerteSiErreurDroitsImport = (raw: string | undefined, setAlertObj: (a: { type: string; show: boolean; text: string }) => void) => {
    const m = (raw ?? "").toLowerCase();
    if (
        m.includes("iex03") ||
        m.includes("new_") ||
        m.includes("schéma import") ||
        m.includes("schema import") ||
        m.includes("nouvelles colonnes") ||
        m.includes("colonnes new_")
    ) {
        setAlertObj({ type: "error", show: true, text: MSG_DROITS_NEW_COLONNES });
        return true;
    }
    return false;
};

const ModalImportExport: React.FC<ModalImportExportProps> = ({ show, onClose }) => {
    const { themeNumber } = useTheme();
    const { setAlertObj } = useAlert();
    const { pays, tabId, userId } = useNavigationParams();
    const { mode } = useMode();
    const controller = DataImportExportController(pays ?? "sn", tabId ?? "main");

    const [privs, setPrivs] = useState<string[]>([]);
    const [tables, setTables] = useState<TableInfo[]>([]);
    const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingTables, setLoadingTables] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importPreview, setImportPreview] = useState<string>("");
    const [confirmModifyModal, setConfirmModifyModal] = useState<{
        show: boolean;
        table: TableInfo;
        csvContent: string;
        columnsToModify: { column: string; oldFormula: string; newFormula: string }[];
    } | null>(null);
    const [privsLoaded, setPrivsLoaded] = useState(false);
    const importRightsBannerAlertSent = useRef(false);

    useEffect(() => {
        if (show) {
            loadTables();
        }
    }, [show]);

    useEffect(() => {
        if (!show || !userId || !tabId) {
            setPrivsLoaded(false);
            return;
        }
        if (mode === "superAdmin" || userId === "sadmin") {
            setPrivs([]);
            setPrivsLoaded(true);
            return;
        }
        setPrivsLoaded(false);
        AutorisationController(pays ?? "")
            .recupererPriviliegesDuUser(userId, tabId)
            .then((p) => {
                setPrivs(Array.isArray(p) ? p : []);
                setPrivsLoaded(true);
            })
            .catch(() => {
                setPrivs([]);
                setPrivsLoaded(true);
            });
    }, [show, userId, tabId, pays, mode]);

    const allowNewColumnsImport =
        mode === "superAdmin" ||
        userId === "sadmin" ||
        checkPrivilege("iex03", privs);

    /** Alerte globale à l’ouverture du modal si pas iex03 (une fois par ouverture). */
    useEffect(() => {
        if (!show) {
            importRightsBannerAlertSent.current = false;
            return;
        }
        if (!privsLoaded || allowNewColumnsImport || importRightsBannerAlertSent.current) return;
        importRightsBannerAlertSent.current = true;
        setAlertObj({
            type: "warning",
            show: true,
            text: "Import / export : vous n’avez pas le privilège pour créer des colonnes via CSV (code iex03). Les fichiers avec en-têtes NEW_… seront refusés.",
        });
    }, [show, privsLoaded, allowNewColumnsImport, setAlertObj]);

    const loadTables = async () => {
        setLoadingTables(true);
        try {
            const list = await controller.listTables();
            setTables(Array.isArray(list) ? list : []);
            setSelectedTable(null);
        } catch (err) {
            console.error("Erreur chargement tables:", err);
            setAlertObj({ type: "error", show: true, text: "Erreur lors du chargement des tables." });
            setTables([]);
        } finally {
            setLoadingTables(false);
        }
    };

    const handleExport = async () => {
        if (!selectedTable) {
            setAlertObj({ type: "warning", show: true, text: "Sélectionnez une table." });
            return;
        }
        setLoading(true);
        try {
            const isTabActe =
                selectedTable.dbColor === "blue" &&
                /^tab_acte/i.test(selectedTable.name);

            const isGroupPosologieOrdonnance =
                selectedTable.name === "group_posologie_et_modeles_ordonnance";

            if (isTabActe) {
                /** Noms SQL fixes (plus de suffixe tabId / main) — même base blue. */
                const tablesToExport = ["tab_acte", "tab_assurance", "tab_facture"];
                const parts: string[] = [];
                for (const t of tablesToExport) {
                    try {
                        const csv = await controller.exportTable(t, selectedTable.dbColor);
                        if (csv !== undefined && csv !== null && csv.trim()) {
                            parts.push(`=== ${t} ===`);
                            parts.push(csv.trim());
                        }
                    } catch {
                        /* ignorer table inexistante */
                    }
                }
                if (parts.length === 0) {
                    setAlertObj({ type: "warning", show: true, text: "Tables vides ou erreur." });
                    return;
                }
                const content = "\uFEFF" + parts.join("\n\n");
                const defaultName = "tab_acte_export.csv";
                const isTauri = "__TAURI__" in window;
                if (isTauri) {
                    const { save } = await import("@tauri-apps/plugin-dialog");
                    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
                    const filePath = await save({
                        filters: [{ name: "CSV", extensions: ["csv"] }],
                        defaultPath: defaultName,
                    });
                    if (filePath) {
                        await writeTextFile(filePath, content);
                        setAlertObj({ type: "success", show: true, text: "Export réussi (tab_acte, tab_assurance, tab_facture)." });
                    }
                } else {
                    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = defaultName;
                    link.click();
                    URL.revokeObjectURL(url);
                    setAlertObj({ type: "success", show: true, text: "Export réussi (tab_acte, tab_assurance, tab_facture)." });
                }
            } else if (isGroupPosologieOrdonnance) {
                const csv = await controller.exportTable(selectedTable.name, selectedTable.dbColor);
                if (csv) {
                    const content = "\uFEFF" + csv;
                    const defaultName = "group_posologie_et_modeles_ordonnance.csv";
                    const isTauri = "__TAURI__" in window;
                    if (isTauri) {
                        const { save } = await import("@tauri-apps/plugin-dialog");
                        const { writeTextFile } = await import("@tauri-apps/plugin-fs");
                        const filePath = await save({
                            filters: [{ name: "CSV", extensions: ["csv"] }],
                            defaultPath: defaultName,
                        });
                        if (filePath) {
                            await writeTextFile(filePath, content);
                            setAlertObj({
                                type: "success",
                                show: true,
                                text: "Export réussi (posologies tous dossiers + modèles ordonnance).",
                            });
                        }
                    } else {
                        const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement("a");
                        link.href = url;
                        link.download = defaultName;
                        link.click();
                        URL.revokeObjectURL(url);
                        setAlertObj({
                            type: "success",
                            show: true,
                            text: "Export réussi (posologies tous dossiers + modèles ordonnance).",
                        });
                    }
                } else {
                    setAlertObj({ type: "warning", show: true, text: "Export vide ou erreur." });
                }
            } else {
                const csv = await controller.exportTable(selectedTable.name, selectedTable.dbColor);
                if (csv) {
                    const content = "\uFEFF" + csv;
                    const defaultName = `${selectedTable.name}.csv`;
                    const isTauri = "__TAURI__" in window;
                    if (isTauri) {
                        const { save } = await import("@tauri-apps/plugin-dialog");
                        const { writeTextFile } = await import("@tauri-apps/plugin-fs");
                        const filePath = await save({
                            filters: [{ name: "CSV", extensions: ["csv"] }],
                            defaultPath: defaultName,
                        });
                        if (filePath) {
                            await writeTextFile(filePath, content);
                            setAlertObj({ type: "success", show: true, text: "Export réussi." });
                        }
                    } else {
                        const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement("a");
                        link.href = url;
                        link.download = defaultName;
                        link.click();
                        URL.revokeObjectURL(url);
                        setAlertObj({ type: "success", show: true, text: "Export réussi." });
                    }
                } else {
                    setAlertObj({ type: "warning", show: true, text: "Table vide ou erreur." });
                }
            }
        } catch (err) {
            console.error("Erreur export:", err);
            setAlertObj({ type: "error", show: true, text: "Erreur lors de l'export." });
        } finally {
            setLoading(false);
        }
    };

    /** Extrait le nom de la table depuis le nom du fichier CSV.
     * Format : NomTable.csv (nom de la table = nom du fichier)
     */
    const getTableNameFromFileName = (fileName: string): string => {
        const baseName = fileName.replace(/\.csv$/i, "").trim();
        const uuidPattern = /_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
        const withoutUuid = baseName.replace(uuidPattern, "");
        return withoutUuid || baseName;
    };

    /** Anciennes bases : `tab_acte<suffixe>`. Fichiers CSV nommés ainsi → table canonique (ex. `tab_actemain` → `tab_acte`). */
    const legacyTableFileNameToCanonical = (name: string): string => {
        const n = name.trim();
        if (!/^tab_/i.test(n)) return n;
        const prefixes = [
            "tab_acte_materiel",
            "tab_type_collaborateur",
            "tab_type_docteur",
            "tab_posologie",
            "tab_medicament",
            "tab_nom_materiel",
            "tab_nom_assurance",
            "tab_nom_acte",
            "tab_modele_etat",
            "tab_collaborateur",
            "tab_secretaire",
            "tab_comptable",
            "tab_assistant",
            "tab_docteur",
            "tab_patient",
            "tab_privilege",
            "tab_cabinet",
            "tab_facture",
            "tab_assurance",
            "tab_acte",
            "tab_photo",
            "tab_trace",
            "tab_task",
            "tab_admin",
            "tab_config",
            "tab_user",
        ];
        const lower = n.toLowerCase();
        for (const p of prefixes) {
            if (lower.startsWith(p.toLowerCase()) && lower.length > p.length) {
                return p;
            }
        }
        return n;
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImportFile(file);
            const reader = new FileReader();
            reader.onload = (ev) => {
                const text = (ev.target?.result as string) || "";
                setImportPreview(text.slice(0, 500) + (text.length > 500 ? "..." : ""));
                const line = firstNonEmptyLine(text);
                if (!allowNewColumnsImport && csvLineContainsNewColumn(line)) {
                    setAlertObj({
                        type: "error",
                        show: true,
                        text: MSG_DROITS_NEW_COLONNES,
                    });
                }
            };
            reader.readAsText(file, "UTF-8");
        } else {
            setImportFile(null);
            setImportPreview("");
        }
    };

    const resolvedImportTable = importFile
        ? (() => {
              const derived = getTableNameFromFileName(importFile.name);
              const canon = legacyTableFileNameToCanonical(derived);
              return (
                  tables.find((t) => t.name.toLowerCase() === derived.toLowerCase()) ??
                  tables.find((t) => t.name.toLowerCase() === canon.toLowerCase())
              );
          })()
        : null;

    const handleImport = async () => {
        if (!importFile) {
            setAlertObj({ type: "warning", show: true, text: "Sélectionnez un fichier CSV." });
            return;
        }
        const table = resolvedImportTable;
        if (!table) {
            const derived = getTableNameFromFileName(importFile.name);
            setAlertObj({
                type: "error",
                show: true,
                text: `Aucune table nommée "${derived}" trouvée. Tables disponibles : ${tables.map((t) => t.name).join(", ") || "aucune"}.`,
            });
            return;
        }
        setLoading(true);
        try {
            const csvContent = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve((e.target?.result as string) || "");
                reader.onerror = reject;
                reader.readAsText(importFile, "UTF-8");
            });
            const firstDataLine = firstNonEmptyLine(csvContent);
            if (!allowNewColumnsImport && csvLineContainsNewColumn(firstDataLine)) {
                setAlertObj({
                    type: "error",
                    show: true,
                    text: MSG_DROITS_NEW_COLONNES,
                });
                setLoading(false);
                return;
            }
            const result = await controller.importTable(table.name, table.dbColor, csvContent, false, allowNewColumnsImport);
            if (result?.success) {
                setAlertObj({
                    type: "success",
                    show: true,
                    text: `Import réussi : ${result.rowsInserted ?? 0} ligne(s) traitée(s) (nouvelles ou mises à jour selon l’identifiant).`,
                });
                setImportFile(null);
                setImportPreview("");
                setConfirmModifyModal(null);
                onClose();
            } else if (result?.needsConfirmation && result?.columnsToModify) {
                setConfirmModifyModal({
                    show: true,
                    table,
                    csvContent,
                    columnsToModify: result.columnsToModify,
                });
            } else {
                const msg = result?.message || "Erreur lors de l'import.";
                if (!alerteSiErreurDroitsImport(typeof msg === "string" ? msg : String(msg), setAlertObj)) {
                    setAlertObj({ type: "error", show: true, text: msg });
                }
            }
        } catch (err: any) {
            console.error("Erreur import:", err);
            const em = err?.message || "Erreur lors de l'import.";
            if (!alerteSiErreurDroitsImport(String(em), setAlertObj)) {
                setAlertObj({ type: "error", show: true, text: em });
            }
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmModify = async () => {
        if (!confirmModifyModal) return;
        setLoading(true);
        try {
            const firstLine =
                confirmModifyModal.csvContent.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
            if (!allowNewColumnsImport && csvLineContainsNewColumn(firstLine)) {
                setAlertObj({
                    type: "error",
                    show: true,
                    text: MSG_DROITS_NEW_COLONNES,
                });
                setLoading(false);
                setConfirmModifyModal(null);
                return;
            }
            const result = await controller.importTable(
                confirmModifyModal.table.name,
                confirmModifyModal.table.dbColor,
                confirmModifyModal.csvContent,
                true,
                allowNewColumnsImport
            );
            if (result?.success) {
                setAlertObj({
                    type: "success",
                    show: true,
                    text: `Import réussi : ${result.rowsInserted ?? 0} ligne(s) traitée(s) (nouvelles ou mises à jour selon l’identifiant).`,
                });
                setImportFile(null);
                setImportPreview("");
                setConfirmModifyModal(null);
                onClose();
            } else {
                const msg = result?.message || "Erreur lors de l'import.";
                if (!alerteSiErreurDroitsImport(typeof msg === "string" ? msg : String(msg), setAlertObj)) {
                    setAlertObj({ type: "error", show: true, text: msg });
                }
            }
        } catch (err: any) {
            const em = err?.message || "Erreur lors de l'import.";
            if (!alerteSiErreurDroitsImport(String(em), setAlertObj)) {
                setAlertObj({ type: "error", show: true, text: em });
            }
        } finally {
            setLoading(false);
            setConfirmModifyModal(null);
        }
    };

    return (
        <ModalGlobal
            show={show}
            onClose={onClose}
            title={
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <Database size={24} />
                    <span>Import / Export CSV</span>
                </div>
            }
            maxWidth="700px"
        >
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                {privsLoaded && !allowNewColumnsImport && (
                    <div className="alert alert-danger mb-0" role="alert">
                        <strong>Droits insuffisants</strong>
                        <p className="mb-0 mt-1 small" style={{ lineHeight: 1.45 }}>
                            {MSG_DROITS_NEW_COLONNES}
                        </p>
                    </div>
                )}
                <div>
                    <label style={{ fontWeight: "600", color: themes[themeNumber].primary, marginBottom: "8px", display: "block" }}>
                        Table à exporter
                    </label>
                    {loadingTables ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px" }}>
                            <Loader size={18} style={{ animation: "spin 1s linear infinite" }} />
                            Chargement des tables...
                        </div>
                    ) : (
                        <select
                            value={selectedTable ? `${selectedTable.dbColor}::${selectedTable.name}` : ""}
                            onChange={(e) => {
                                const v = e.target.value;
                                if (v) {
                                    const [dbColor, name] = v.split("::");
                                    const t = tables.find((x) => x.name === name && x.dbColor === dbColor);
                                    setSelectedTable(t ?? null);
                                } else {
                                    setSelectedTable(null);
                                }
                            }}
                            style={{
                                width: "100%",
                                padding: "10px 12px",
                                borderRadius: "8px",
                                border: `2px solid ${themes[themeNumber].primary}`,
                                backgroundColor: "#fff",
                                color: themes[themeNumber].primary,
                                fontSize: "14px",
                            }}
                        >
                            <option value="">-- Sélectionner une table --</option>
                            {tables.map((t) => (
                                <option key={`${t.dbColor}-${t.name}`} value={`${t.dbColor}::${t.name}`}>
                                    {t.label || t.name} ({t.dbColor})
                                </option>
                            ))}
                        </select>
                    )}
                    {selectedTable && (
                        <small style={{ display: "block", marginTop: "6px", color: themes[themeNumber].primary, opacity: 0.8 }}>
                            Colonnes : {selectedTable.columns.join(", ")}
                        </small>
                    )}
                </div>

                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    <button
                        onClick={handleExport}
                        disabled={!selectedTable || loading}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            padding: "12px 20px",
                            borderRadius: "8px",
                            border: "none",
                            backgroundColor: selectedTable && !loading ? themes[themeNumber].primary : themes[themeNumber].primary + "50",
                            color: themes[themeNumber].secondary,
                            cursor: selectedTable && !loading ? "pointer" : "not-allowed",
                            fontSize: "14px",
                            fontWeight: "600",
                        }}
                    >
                        {loading ? <Loader size={18} style={{ animation: "spin 1s linear infinite" }} /> : <Download size={18} />}
                        {selectedTable?.dbColor === "blue" && /^tab_acte/i.test(selectedTable?.name ?? "")
                            ? "Exporter en CSV (acte, assurance, facture)"
                            : selectedTable?.name === "group_posologie_et_modeles_ordonnance"
                              ? "Exporter en CSV (posologie + modèles ordonnance)"
                              : selectedTable?.name === "group_actes_assurances_factures_posologie"
                                ? "Exporter en CSV (actes + assurances + factures + posologies)"
                                : selectedTable?.name ===
                                    "group_actes_assurances_factures_posologie_et_modeles_ordonnance"
                                  ? "Exporter en CSV (actes + assurances + factures + posologies + modèles ordonnance)"
                                  : "Exporter en CSV"}
                    </button>
                </div>

                <hr style={{ borderColor: themes[themeNumber].primary + "30" }} />

                <div>
                    <label style={{ fontWeight: "600", color: themes[themeNumber].primary, marginBottom: "8px", display: "block" }}>
                        Importer depuis un fichier CSV
                    </label>
                    <div
                        style={{
                            fontSize: "13px",
                            color: themes[themeNumber].primary,
                            opacity: 0.9,
                            marginBottom: "10px",
                            padding: "10px 12px",
                            backgroundColor: themes[themeNumber].primary + "15",
                            borderRadius: "8px",
                            borderLeft: `4px solid ${themes[themeNumber].primary}`,
                        }}
                    >
                        <strong>Règle d'import :</strong> La table de destination est déterminée par le <strong>nom du fichier</strong>.
                        <br />
                        Format attendu : <code style={{ backgroundColor: "#fff", padding: "2px 6px", borderRadius: "4px" }}>NomTable_UUID.csv</code> ou <code style={{ backgroundColor: "#fff", padding: "2px 6px", borderRadius: "4px" }}>NomTable.csv</code>
                        <br />
                        Exemple : <code style={{ backgroundColor: "#fff", padding: "2px 6px", borderRadius: "4px" }}>patients_550e8400-e29b-41d4-a716-446655440000.csv</code> → import dans la table &quot;patients&quot;.
                        <br />
                        <strong>Identifiants :</strong> si la clé primaire (souvent <code>id</code>) existe déjà en base, la ligne est <strong>mise à jour</strong> ; sinon elle est <strong>créée</strong> (import groupé « actes », « posologie », « utilisateurs », etc. : même règle).
                    </div>
                    <p style={{ fontSize: "13px", color: themes[themeNumber].primary, opacity: 0.8, marginBottom: "10px" }}>
                        Séparateur : point-virgule (;) — La première ligne doit contenir les noms des colonnes.
                    </p>
                    {!allowNewColumnsImport && (
                        <div
                            style={{
                                fontSize: "12px",
                                color: "#7f6000",
                                marginBottom: "10px",
                                padding: "8px 10px",
                                backgroundColor: "#fff3cd",
                                borderRadius: "6px",
                                border: "1px solid #ffc107",
                            }}
                        >
                            <strong>Colonnes NEW_ :</strong> réservé au privilège <strong>iex03</strong> (« Schéma import — nouvelles colonnes »), attribué par le praticien.
                            Sans ce droit, un fichier contenant des en-têtes <code>NEW_…</code> sera refusé.
                        </div>
                    )}
                    {allowNewColumnsImport && (
                        <div
                            style={{
                                fontSize: "12px",
                                color: themes[themeNumber].primary,
                                opacity: 0.85,
                                marginBottom: "10px",
                                padding: "8px 10px",
                                backgroundColor: themes[themeNumber].primary + "10",
                                borderRadius: "6px",
                            }}
                        >
                            <strong>Nouvelles colonnes (privilège iex03) :</strong>
                            <br />•{" "}
                            <code style={{ backgroundColor: "#fff", padding: "1px 4px", borderRadius: "3px" }}>
                                NEW_&lt;nomTable&gt;.&lt;nomColonne&gt;[chaine]
                            </code>{" "}
                            ou{" "}
                            <code style={{ backgroundColor: "#fff", padding: "1px 4px", borderRadius: "3px" }}>
                                NEW_&lt;nomTable&gt;.&lt;nomColonne&gt;[number]
                            </code>{" "}
                            — ex:{" "}
                            <code style={{ backgroundColor: "#fff", padding: "1px 4px", borderRadius: "3px" }}>
                                NEW_tab_patient.observation[chaine]
                            </code>
                            <br />• Formule :{" "}
                            <code style={{ backgroundColor: "#fff", padding: "1px 4px", borderRadius: "3px" }}>
                                NEW_&lt;nomTable&gt;.&lt;nomColonne&gt;[col1 + col2]
                            </code>{" "}
                            (opérateurs : + - * / == &lt;= &gt;= &lt;&gt;)
                            <br />• Supprimer :{" "}
                            <code style={{ backgroundColor: "#fff", padding: "1px 4px", borderRadius: "3px" }}>nomColonne[del]</code> ou{" "}
                            <code style={{ backgroundColor: "#fff", padding: "1px 4px", borderRadius: "3px" }}>nomTable.nomColonne[del]</code>
                            <br />
                            Les colonnes créées apparaissent dans la page Modèles d&apos;état avec un <strong>*</strong> (non natives).
                        </div>
                    )}
                    <input
                        type="file"
                        accept=".csv,.txt"
                        onChange={handleFileChange}
                        style={{
                            width: "100%",
                            padding: "10px",
                            border: `2px dashed ${themes[themeNumber].primary}60`,
                            borderRadius: "8px",
                            backgroundColor: themes[themeNumber].secondary + "15",
                            color: themes[themeNumber].primary,
                        }}
                    />
                    {importFile && resolvedImportTable && (
                        <div style={{ marginTop: "8px", fontSize: "13px", color: themes[themeNumber].primary, fontWeight: "600" }}>
                            → Import dans la table : <strong>{resolvedImportTable.name}</strong> ({resolvedImportTable.dbColor})
                        </div>
                    )}
                    {importFile && !resolvedImportTable && tables.length > 0 && (
                        <div style={{ marginTop: "8px", fontSize: "13px", color: "#c0392b" }}>
                            → Table &quot;{getTableNameFromFileName(importFile.name)}&quot; introuvable. Vérifiez le nom du fichier.
                        </div>
                    )}
                    {importPreview && (
                        <pre
                            style={{
                                marginTop: "10px",
                                padding: "12px",
                                backgroundColor: "#1e1e1e",
                                color: "#d4d4d4",
                                borderRadius: "8px",
                                fontSize: "12px",
                                maxHeight: "120px",
                                overflow: "auto",
                                whiteSpace: "pre-wrap",
                            }}
                        >
                            {importPreview}
                        </pre>
                    )}
                    <button
                        onClick={handleImport}
                        disabled={!resolvedImportTable || !importFile || loading}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            marginTop: "12px",
                            padding: "12px 20px",
                            borderRadius: "8px",
                            border: "none",
                            backgroundColor: resolvedImportTable && importFile && !loading ? themes[themeNumber].primary : themes[themeNumber].primary + "50",
                            color: themes[themeNumber].secondary,
                            cursor: resolvedImportTable && importFile && !loading ? "pointer" : "not-allowed",
                            fontSize: "14px",
                            fontWeight: "600",
                        }}
                    >
                        {loading ? <Loader size={18} style={{ animation: "spin 1s linear infinite" }} /> : <Upload size={18} />}
                        Importer
                    </button>
                </div>
            </div>
            {confirmModifyModal && (
                <div
                    style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: "rgba(0,0,0,0.5)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 10001,
                    }}
                    onClick={() => setConfirmModifyModal(null)}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            backgroundColor: "#fff",
                            padding: "24px",
                            borderRadius: "12px",
                            maxWidth: "450px",
                            width: "90%",
                            boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                        }}
                    >
                        <h6 style={{ marginBottom: "16px", color: themes[themeNumber].primary }}>
                            Formule(s) modifiée(s)
                        </h6>
                        <p style={{ fontSize: "14px", marginBottom: "16px", color: "#333" }}>
                            Les colonnes suivantes ont une formule différente. Confirmer la modification ?
                        </p>
                        <ul style={{ marginBottom: "20px", paddingLeft: "20px", fontSize: "13px" }}>
                            {confirmModifyModal.columnsToModify.map((c) => (
                                <li key={c.column} style={{ marginBottom: "8px" }}>
                                    <strong>{c.column}</strong> : &quot;{c.oldFormula}&quot; → &quot;{c.newFormula}&quot;
                                </li>
                            ))}
                        </ul>
                        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                            <button
                                onClick={() => setConfirmModifyModal(null)}
                                style={{
                                    padding: "10px 20px",
                                    borderRadius: "8px",
                                    border: `2px solid ${themes[themeNumber].primary}`,
                                    backgroundColor: "#fff",
                                    color: themes[themeNumber].primary,
                                    cursor: "pointer",
                                    fontWeight: "600",
                                }}
                            >
                                Annuler
                            </button>
                            <button
                                onClick={handleConfirmModify}
                                disabled={loading}
                                style={{
                                    padding: "10px 20px",
                                    borderRadius: "8px",
                                    border: "none",
                                    backgroundColor: themes[themeNumber].primary,
                                    color: themes[themeNumber].secondary,
                                    cursor: loading ? "not-allowed" : "pointer",
                                    fontWeight: "600",
                                }}
                            >
                                {loading ? "..." : "Confirmer"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </ModalGlobal>
    );
};

export default ModalImportExport;
