import React, { useEffect, useMemo, useRef, useState } from "react";

type RibbonProps = {
    editorRef: React.MutableRefObject<{ editor: any } | any | null>;
    onTogglePreview?: () => void;
    isPreview?: boolean;
    autosaveKey?: string;
    value: string;
    onRestore?: (html: string) => void;
    getDocumentHtml?: () => string
};

function getPlainText(html: string) {
    const div = document.createElement("div");
    div.innerHTML = html || "";
    const text = (div.textContent || div.innerText || "").replace(/\u00A0/g, " ").trim();
    return text;
}
function commandAvailable(editor: any, name: string) {
    try { return !!editor?.commands?.get?.(name); } catch { return false; }
}

export default function RibbonWordLike({
    editorRef, onTogglePreview, isPreview,
    autosaveKey, value, onRestore,
    getDocumentHtml,            // ⬅️ add this
}: RibbonProps) {
    const [stats, setStats] = useState({ words: 0, chars: 0 });
    const [findOpen, setFindOpen] = useState(false);
    const [findText, setFindText] = useState("");
    const [replaceText, setReplaceText] = useState("");
    const [autosavedAt, setAutosavedAt] = useState<number | null>(null);
    const autosaveTimer = useRef<number | null>(null);

    // UI states
    const [showImageUrlModal, setShowImageUrlModal] = useState(false);
    const [imageUrl, setImageUrl] = useState("");
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const [showTableModal, setShowTableModal] = useState(false);
    const [tableRows, setTableRows] = useState(3);
    const [tableCols, setTableCols] = useState(3);
    const [fontFamily, setFontFamily] = useState("Arial, Helvetica, sans-serif");
    const [fontSize, setFontSize] = useState<number>(16);
    const [textColor, setTextColor] = useState<string>("#000000");
    const [highlightColor, setHighlightColor] = useState<string>("#ffff00");

    useEffect(() => {
        const text = getPlainText(value);
        setStats({ words: text ? text.split(/\s+/).filter(Boolean).length : 0, chars: text.length });
    }, [value]);

    useEffect(() => {
        if (!autosaveKey) return;
        if (autosaveTimer.current) window.clearInterval(autosaveTimer.current);
        autosaveTimer.current = window.setInterval(() => {
            localStorage.setItem(autosaveKey, value || "");
            setAutosavedAt(Date.now());
        }, 10000);
        return () => { if (autosaveTimer.current) window.clearInterval(autosaveTimer.current); };
    }, [autosaveKey, value]);

    const hasBackup = useMemo(() => {
        if (!autosaveKey) return false;
        const v = localStorage.getItem(autosaveKey);
        return v !== null && v !== undefined;
    }, [autosaveKey, value]);

    // ===== Helpers CKEditor =====
    function ed() {
        return editorRef?.current?.editor || editorRef?.current;
    }
    function focusEd() {
        try { ed()?.editing?.view?.focus(); } catch { }
    }
    function exec(name: string, payload?: any) {
        const E = ed();
        if (!E) return;
        if (commandAvailable(E, name)) {
            E.execute(name, payload);
            focusEd();
        } else {
            // Fallbacks
            if (name === "underline") insertHtml('<span style="text-decoration: underline;"></span>');
            if (name === "removeFormat") removeFormatFallback();
            if (name === "link") promptAndInsertLink();
            if (name === "unlink") unwrapLinks();
            if (name.startsWith("alignment:")) {
                const side = name.split(":")[1];
                wrapBlockWithStyle(`text-align: ${side};`);
            }
        }
    }
    function insertHtml(html: string) {
        const E = ed();
        if (!E) return;
        E.model.change(() => {
            const viewFragment = E.data.processor.toView(html);
            const modelFragment = E.data.toModel(viewFragment);
            E.model.insertContent(modelFragment);
        });
        focusEd();
    }
    function wrapBlockWithStyle(style: string) {
        insertHtml(`<p style="${style}"></p>`);
    }
    function insertPageBreak() {
        insertHtml('<div style="page-break-after: always;"></div>');
    }
    function applyHeading(value: "paragraph" | "heading1" | "heading2" | "heading3") {
        const E = ed();
        if (!E) return;
        if (commandAvailable(E, "heading")) {
            E.execute("heading", { value });
            focusEd();
        } else {
            if (value === "paragraph") insertHtml("<p></p>");
            if (value === "heading1") insertHtml('<h1 style="margin:.4em 0;"></h1>');
            if (value === "heading2") insertHtml('<h2 style="margin:.4em 0;"></h2>');
            if (value === "heading3") insertHtml('<h3 style="margin:.4em 0;"></h3>');
        }
    }

    // ===== Typo: famille, taille, couleur =====
    function applyInlineStyle(style: string) {
        insertHtml(`<span style="${style}"></span>`);
    }
    function applyFontFamily(f: string) {
        setFontFamily(f);
        // Si pas de plugin fontFamily, on insère un span inline
        applyInlineStyle(`font-family:${f};`);
    }
    function applyFontSize(px: number) {
        setFontSize(px);
        // CKEditor 5 a un plugin fontSize, sinon fallback inline
        const E = ed();
        if (commandAvailable(E, "fontSize")) {
            E.execute("fontSize", { value: `${px}px` });
            focusEd();
        } else {
            applyInlineStyle(`font-size:${px}px;`);
        }
    }
    function applyTextColor(c: string) {
        setTextColor(c);
        const E = ed();
        if (commandAvailable(E, "fontColor")) {
            E.execute("fontColor", { value: c });
            focusEd();
        } else {
            applyInlineStyle(`color:${c};`);
        }
    }
    // function applyHighlightColor(c: string) {
    //     setHighlightColor(c);
    //     const E = ed();
    //     if (commandAvailable(E, "highlight")) {
    //         E.execute("highlight", { value: c });
    //         focusEd();
    //     } else {
    //         applyInlineStyle(`background-color:${c};`);
    //     }
    // }

function applyHighlightColor(c: string) {
  setHighlightColor(c);
  // Toujours fiable, même sans plugin
  applyInlineStyle(`background-color:${c};`);
}


    // ===== Lien / remove format fallbacks =====
    function promptAndInsertLink() {
        const url = window.prompt("URL du lien :", "https://");
        if (!url) return;
        insertHtml(`<a href="${url}" target="_blank" rel="noopener noreferrer"></a>`);
    }
    function unwrapLinks() {
        // fallback simpliste: insère une balise vide qui casse la continuité du lien
        insertHtml('<span></span>');
    }
    function removeFormatFallback() {
        // Remet du texte sans style en insérant un span neutre
        insertHtml('<span style="all:unset;"></span>');
    }

    // ===== Image: fichier & URL =====
    function handleChooseImageFile() {
        fileInputRef.current?.click();
    }
    function onImageFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const src = String(reader.result || "");
            insertHtml(`<img src="${src}" alt="" style="max-width:100%; height:auto;" />`);
        };
        reader.readAsDataURL(file);
        e.target.value = ""; // reset
    }
    function insertImageUrl() {
        if (!imageUrl) return;
        insertHtml(`<img src="${imageUrl}" alt="" style="max-width:100%; height:auto;" />`);
        setImageUrl("");
        setShowImageUrlModal(false);
    }

    // ===== Table =====
    function openTableModal() {
        setShowTableModal(true);
    }
    function insertTable() {
        const r = Math.max(1, Math.min(20, tableRows));
        const c = Math.max(1, Math.min(12, tableCols));
        let thead = "<tr>";
        for (let j = 0; j < c; j++) thead += `<th>Col ${j + 1}</th>`;
        thead += "</tr>";
        let tbody = "";
        for (let i = 0; i < r; i++) {
            tbody += "<tr>";
            for (let j = 0; j < c; j++) tbody += "<td>&nbsp;</td>";
            tbody += "</tr>";
        }
        insertHtml(
            `<table border="1" style="border-collapse:collapse;width:100%;margin:10px 0;">
        <thead>${thead}</thead>
        <tbody>${tbody}</tbody>
      </table>`
        );
        setShowTableModal(false);
    }

    // ===== Find / Replace =====
    function doReplaceAll() {
        const E = ed();
        if (!E || !findText) return;
        const html = E.getData() || "";
        const safeFind = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
        const replaced = html.replace(safeFind, replaceText);
        E.setData(replaced);
        setFindOpen(false);
    }

    // ===== Undo/Redo =====
    function undo() { exec("undo"); }
    function redo() { exec("redo"); }


    const [printOpen, setPrintOpen] = useState(false);
    const [printOrientation, setPrintOrientation] = useState<"portrait" | "landscape">("portrait");
    const [printMargins, setPrintMargins] = useState<"normal" | "narrow" | "wide">("normal");

    function buildPrintCss(orientation: "portrait" | "landscape", margins: "normal" | "narrow" | "wide") {
        const marginMap = {
            normal: "20mm",
            narrow: "12mm",
            wide: "25mm"
        } as const;
        const m = marginMap[margins];

        // CSS minimal pour imprimer une feuille A4 propre
        return `
      @page {
        size: A4 ${orientation};
        margin: ${m};
      }
      html, body {
        height: auto;
        background: #fff !important;
      }
      /* Neutraliser tout le chrome de l'app */
      .no-print, .no-print * { display: none !important; }
      /* Corps du document */
      .print-container {
        color: #111;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 12pt;
      }
      /* Tables */
      .print-container table {
        width: 100%;
        border-collapse: collapse;
      }
      .print-container th, .print-container td {
        border: 1px solid #ccc;
        padding: 4px 6px;
      }
      /* Sauts de page explicitement insérés */
      .page-break { page-break-after: always; }
      /* Empêcher que certains éléments se coupent mal */
      h1, h2, h3 { page-break-after: avoid; }
      img { max-width: 100%; height: auto; }
    `;
    }

    function doNativePrint() {
        const htmlToPrint =
            (typeof getDocumentHtml === "function" ? getDocumentHtml() : value) || "";

        // Ouvre une nouvelle fenêtre (plus fiable que print d’une div)
        const w = window.open("", "_blank", "noopener,noreferrer");
        if (!w) return;

        const css = buildPrintCss(printOrientation, printMargins);
        w.document.open();
        w.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Impression</title>
<style>${css}</style>
</head>
<body>
  <!-- On masque le reste si jamais -->
  <div class="print-container">
    ${htmlToPrint}
  </div>
  <script>
    // Attendre le rendu (images, fonts)
    window.onload = function() {
      window.focus();
      window.print();
      // Important: laisser l'utilisateur décider de fermer; on peut auto-fermer si besoin:
      // setTimeout(() => window.close(), 200);
    };
  </script>
</body>
</html>`);
        w.document.close();
    }
    return (
        <div className="border rounded mb-2">
            {/* Toolbar */}
            <div className="btn-toolbar d-flex flex-wrap gap-2 p-2 bg-light border-bottom" role="toolbar" aria-label="Ribbon toolbar">

                {/* Fichier / Edition */}
                <div className="btn-group btn-group-sm me-2" role="group" aria-label="Edition">
                    <button className="btn btn-outline-secondary" onClick={undo} title="Annuler (Ctrl+Z)">↶</button>
                    <button className="btn btn-outline-secondary" onClick={redo} title="Rétablir (Ctrl+Y)">↷</button>
                    <button className="btn btn-outline-secondary" onClick={() => exec("removeFormat")} title="Effacer la mise en forme">Tx</button>
                </div>

                {/* Accueil (gras/ital/souligné/listes/alignements) */}
                <div className="btn-group btn-group-sm me-2" role="group" aria-label="Accueil">
                    <button className="btn btn-outline-secondary" onClick={() => exec("bold")} title="Gras (Ctrl+B)">B</button>
                    <button className="btn btn-outline-secondary" onClick={() => exec("italic")} title="Italique (Ctrl+I)"><i>I</i></button>
                    <button className="btn btn-outline-secondary" onClick={() => exec("underline")} title="Souligné">U</button>
                    <button className="btn btn-outline-secondary" onClick={() => exec("bulletedList")} title="Liste à puces">•</button>
                    <button className="btn btn-outline-secondary" onClick={() => exec("numberedList")} title="Liste numérotée">1.</button>
                    <div className="btn-group btn-group-sm ms-2" role="group" aria-label="Alignements">
                        <button className="btn btn-outline-secondary" title="Gauche" onClick={() => exec("alignment:left")}>⟸</button>
                        <button className="btn btn-outline-secondary" title="Centre" onClick={() => exec("alignment:center")}>≡</button>
                        <button className="btn btn-outline-secondary" title="Droite" onClick={() => exec("alignment:right")}>⟹</button>
                        <button className="btn btn-outline-secondary" title="Justifier" onClick={() => exec("alignment:justify")}>≔</button>
                    </div>
                </div>

                {/* Styles */}
                <div className="btn-group btn-group-sm me-2" role="group" aria-label="Styles">
                    <button className="btn btn-outline-secondary" onClick={() => applyHeading("paragraph")}>Normal</button>
                    <button className="btn btn-outline-secondary" onClick={() => applyHeading("heading1")}>Titre 1</button>
                    <button className="btn btn-outline-secondary" onClick={() => applyHeading("heading2")}>Titre 2</button>
                    <button className="btn btn-outline-secondary" onClick={() => applyHeading("heading3")}>Titre 3</button>
                </div>

                {/* Typographie */}
                <div className="btn-group btn-group-sm me-2 align-items-center" role="group" aria-label="Typographie">
                    <select className="form-select form-select-sm" style={{ width: 170 }}
                        value={fontFamily} onChange={e => applyFontFamily(e.target.value)}>
                        <option value="Arial, Helvetica, sans-serif">Arial</option>
                        <option value="'Times New Roman', Times, serif">Times New Roman</option>
                        <option value="Georgia, serif">Georgia</option>
                        <option value="Verdana, Geneva, sans-serif">Verdana</option>
                        <option value="'Courier New', Courier, monospace">Courier New</option>
                        <option value="Tahoma, Geneva, sans-serif">Tahoma</option>
                    </select>
                    <select className="form-select form-select-sm" style={{ width: 90 }}
                        value={fontSize} onChange={e => applyFontSize(Number(e.target.value))}>
                        {[10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48].map(px => (
                            <option key={px} value={px}>{px}px</option>
                        ))}
                    </select>
                </div>

                {/* Couleurs */}
                <div className="btn-group btn-group-sm me-2 align-items-center" role="group" aria-label="Couleurs">
                    <span className="input-group-text py-0">Texte</span>
                    <input type="color" className="form-control form-control-color"
                        value={textColor} onChange={e => applyTextColor(e.target.value)} title="Couleur du texte" />
                    <span className="input-group-text py-0 ms-2">Surlignage</span>
                    <input type="color" className="form-control form-control-color"
                        value={highlightColor} onChange={e => applyHighlightColor(e.target.value)} title="Couleur de surlignage" />
                </div>

                {/* Liens */}
                <div className="btn-group btn-group-sm me-2" role="group" aria-label="Liens">
                    <button className="btn btn-outline-secondary" onClick={() => exec("link")} title="Insérer un lien">🔗</button>
                    <button className="btn btn-outline-secondary" onClick={() => exec("unlink")} title="Supprimer le lien">✖︎</button>
                </div>

                {/* Insertion */}
                <div className="btn-group btn-group-sm me-2" role="group" aria-label="Insertion">
                    <button className="btn btn-outline-secondary" onClick={insertPageBreak} title="Saut de page">Saut de page</button>
                    <button className="btn btn-outline-secondary" onClick={openTableModal} title="Tableau">Table</button>
                    <button className="btn btn-outline-secondary" onClick={() => setShowImageUrlModal(true)} title="Image par URL">Image URL</button>
                    <button className="btn btn-outline-secondary" onClick={handleChooseImageFile} title="Image depuis fichier">Image Fichier</button>
                    <input ref={fileInputRef} type="file" accept="image/*" className="d-none" onChange={onImageFileChange} />
                </div>

                {/* Révision */}
                <div className="btn-group btn-group-sm me-2" role="group" aria-label="Révision">
                    <button className="btn btn-outline-secondary" onClick={() => setFindOpen(v => !v)}>Rech/Rempl</button>
                </div>

                {/* Affichage */}
                {onTogglePreview && (
                    <div className="btn-group btn-group-sm" role="group" aria-label="Affichage">
                        <button className="btn btn-primary" onClick={onTogglePreview}>
                            {isPreview ? "Retour édition" : "Aperçu"}
                        </button>
                    </div>
                )}
            </div>

            {/* Status bar */}
            <div className="d-flex justify-content-between align-items-center px-2 py-1 bg-white border-top">
                <div className="d-flex align-items-center gap-2">
                    <span className="badge text-bg-secondary">Mots : {stats.words}</span>
                    <span className="badge text-bg-secondary">Caractères : {stats.chars}</span>
                    {autosavedAt && (
                        <span className="badge text-bg-light border">
                            Auto-sauv. {new Date(autosavedAt).toLocaleTimeString()}
                        </span>
                    )}
                </div>
                <div>
                    {hasBackup && onRestore && (
                        <button
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => {
                                const v = autosaveKey ? localStorage.getItem(autosaveKey) : null;
                                if (v !== null) onRestore(v);
                            }}
                        >
                            Restaurer version locale
                        </button>
                    )}
                </div>
            </div>

            {/* Modal Rechercher/Remplacer */}
            {findOpen && (
                <div className="modal fade show" style={{ display: "block", background: "rgba(0,0,0,.35)" }} role="dialog" aria-modal="true">
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title">Rechercher / Remplacer</h5>
                                <button type="button" className="btn-close" onClick={() => setFindOpen(false)} />
                            </div>
                            <div className="modal-body">
                                <div className="mb-3">
                                    <label className="form-label">Rechercher</label>
                                    <input className="form-control" value={findText} onChange={e => setFindText(e.target.value)} />
                                </div>
                                <div className="mb-3">
                                    <label className="form-label">Remplacer par</label>
                                    <input className="form-control" value={replaceText} onChange={e => setReplaceText(e.target.value)} />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setFindOpen(false)}>Annuler</button>
                                <button className="btn btn-primary" onClick={doReplaceAll}>Remplacer tout</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Image URL */}
            {showImageUrlModal && (
                <div className="modal fade show" style={{ display: "block", background: "rgba(0,0,0,.35)" }} role="dialog" aria-modal="true">
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title">Insérer une image par URL</h5>
                                <button type="button" className="btn-close" onClick={() => setShowImageUrlModal(false)} />
                            </div>
                            <div className="modal-body">
                                <input className="form-control" placeholder="https://exemple.com/image.jpg"
                                    value={imageUrl} onChange={e => setImageUrl(e.target.value)} />
                                <small className="text-muted">L’image sera insérée à la position du curseur (largeur max 100%).</small>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setShowImageUrlModal(false)}>Annuler</button>
                                <button className="btn btn-primary" onClick={insertImageUrl}>Insérer</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {printOpen && (
                <div className="modal fade show" style={{ display: "block", background: "rgba(0,0,0,.35)" }} role="dialog" aria-modal="true">
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title">Options d’impression</h5>
                                <button type="button" className="btn-close" onClick={() => setPrintOpen(false)} />
                            </div>
                            <div className="modal-body">
                                <div className="mb-3">
                                    <label className="form-label d-block">Orientation</label>
                                    <div className="btn-group" role="group">
                                        <input type="radio" className="btn-check" name="orientation" id="ori-portrait"
                                            checked={printOrientation === "portrait"} onChange={() => setPrintOrientation("portrait")} />
                                        <label className="btn btn-outline-primary" htmlFor="ori-portrait">Portrait</label>

                                        <input type="radio" className="btn-check" name="orientation" id="ori-landscape"
                                            checked={printOrientation === "landscape"} onChange={() => setPrintOrientation("landscape")} />
                                        <label className="btn btn-outline-primary" htmlFor="ori-landscape">Paysage</label>
                                    </div>
                                </div>

                                <div className="mb-2">
                                    <label className="form-label d-block">Marges</label>
                                    <select className="form-select"
                                        value={printMargins}
                                        onChange={e => setPrintMargins(e.target.value as any)}>
                                        <option value="normal">Normales (20mm)</option>
                                        <option value="narrow">Étroites (12mm)</option>
                                        <option value="wide">Larges (25mm)</option>
                                    </select>
                                </div>

                                <small className="text-muted">
                                    Astuce : les en-têtes/pieds de page (numéro de page) peuvent être ajoutés dans la boîte d’impression de votre navigateur ou via une CSS avancée avec <code>@page</code>.
                                </small>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setPrintOpen(false)}>Fermer</button>
                                <button className="btn btn-success" onClick={() => { setPrintOpen(false); doNativePrint(); }}>
                                    Imprimer
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}



            {/* Modal Tableau */}
            {showTableModal && (
                <div className="modal fade show" style={{ display: "block", background: "rgba(0,0,0,.35)" }} role="dialog" aria-modal="true">
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title">Insérer un tableau</h5>
                                <button type="button" className="btn-close" onClick={() => setShowTableModal(false)} />
                            </div>
                            <div className="modal-body">
                                <div className="row g-2">
                                    <div className="col-6">
                                        <label className="form-label">Lignes</label>
                                        <input type="number" className="form-control" min={1} max={20}
                                            value={tableRows} onChange={e => setTableRows(Number(e.target.value))} />
                                    </div>
                                    <div className="col-6">
                                        <label className="form-label">Colonnes</label>
                                        <input type="number" className="form-control" min={1} max={12}
                                            value={tableCols} onChange={e => setTableCols(Number(e.target.value))} />
                                    </div>
                                </div>
                                <small className="text-muted">Les bordures seront fines, largeur 100%.</small>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setShowTableModal(false)}>Annuler</button>
                                <button className="btn btn-primary" onClick={insertTable}>Insérer</button>
                            </div>
                            <div className="btn-group btn-group-sm ms-auto" role="group" aria-label="Fichier">
                                <button className="btn btn-success" onClick={() => setPrintOpen(true)}>
                                    Imprimer (PDF)
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
