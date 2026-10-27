import { useRef, useState, type CSSProperties, type DragEvent, type ChangeEvent } from "react";
import { Couleur } from "../constants/ts/Couleur.constant";

export type FileDropZoneProps = {
  /** Texte principal sous le logo (glisser-déposer / cliquer). */
  dropHint: string;
  /** Texte d’aide sous la zone (facultatif). */
  extra?: string;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  /** Chemin du logo (défaut : logo d’ouverture LoggAppro). */
  logoSrc?: string;
  logoAlt?: string;
  /** Fichiers déjà sélectionnés (affichage tags). */
  files?: File[];
  onAddFiles: (files: File[]) => void;
  onRemoveFile?: (index: number) => void;
  /** Libellé accessibilité du bouton retirer (fichier sélectionné). */
  removeFileLabel?: string;
  style?: CSSProperties;
};

const zoneBase: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  width: "100%",
  minHeight: 168,
  padding: "28px 20px",
  boxSizing: "border-box",
  border: `2px dashed ${Couleur.primary}`,
  borderRadius: 12,
  background: `color-mix(in srgb, ${Couleur.primary} 10%, ${Couleur.tertiary})`,
  cursor: "pointer",
  transition: "background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
  textAlign: "center",
  outline: "none",
};

/** Zone de dépôt fichier (logo + couleurs thème LoggAppro). */
export const FileDropZone = ({
  dropHint,
  extra,
  accept = "image/png,image/jpeg",
  multiple = true,
  disabled = false,
  logoSrc = "/opening-logo.png",
  logoAlt = "",
  files = [],
  onAddFiles,
  onRemoveFile,
  removeFileLabel,
  style,
}: FileDropZoneProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const openPicker = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  const takeFiles = (list: FileList | null) => {
    if (!list || list.length === 0 || disabled) return;
    onAddFiles(Array.from(list));
  };

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    takeFiles(e.target.files);
    e.target.value = "";
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setDragOver(true);
  };

  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    takeFiles(e.dataTransfer.files);
  };

  const zoneStyle: CSSProperties = {
    ...zoneBase,
    ...style,
    opacity: disabled ? 0.55 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
    borderColor: Couleur.primary,
    background: dragOver
      ? `color-mix(in srgb, ${Couleur.primary} 22%, ${Couleur.tertiary})`
      : `color-mix(in srgb, ${Couleur.primary} 10%, ${Couleur.tertiary})`,
    boxShadow: dragOver ? `inset 0 0 0 1px ${Couleur.primary}` : undefined,
  };

  return (
    <div style={{ width: "100%" }}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label={dropHint}
        style={zoneStyle}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPicker();
          }
        }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <img
          src={logoSrc}
          alt={logoAlt}
          width={72}
          height={72}
          style={{ objectFit: "contain", pointerEvents: "none", userSelect: "none" }}
          draggable={false}
        />
        <span
          style={{
            color: Couleur.textBodySecondary,
            fontSize: 14,
            fontWeight: 500,
            lineHeight: 1.45,
            maxWidth: 420,
            pointerEvents: "none",
          }}
        >
          {dropHint}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          style={{ display: "none" }}
          onChange={onInputChange}
        />
      </div>
      {extra ? (
        <p
          style={{
            margin: "8px 0 0",
            color: Couleur.textBodyTertiary,
            fontSize: 12,
            lineHeight: 1.4,
          }}
        >
          {extra}
        </p>
      ) : null}
      {files.length > 0 ? (
        <ul
          style={{
            listStyle: "none",
            margin: "10px 0 0",
            padding: 0,
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: 999,
                background: `color-mix(in srgb, ${Couleur.primary} 12%, ${Couleur.tertiary})`,
                color: Couleur.textBody,
                fontSize: 13,
                border: `1px solid color-mix(in srgb, ${Couleur.primary} 35%, transparent)`,
              }}
            >
              <span style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {f.name}
              </span>
              {onRemoveFile ? (
                <button
                  type="button"
                  aria-label={removeFileLabel || dropHint}
                  title={removeFileLabel}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveFile(i);
                  }}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: Couleur.primary,
                    cursor: "pointer",
                    fontSize: 16,
                    lineHeight: 1,
                    padding: 0,
                  }}
                >
                  ×
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};
