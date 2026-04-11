import React, { useState } from "react";
import { Plus, ChevronDown, ChevronUp } from "lucide-react";

/** Convertit un nom de colonne en libellé affichable */
const columnToLabel = (col: string): string => {
  return col
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
};

interface CustomFieldsButtonProps {
  customColumns: string[];
  data: Record<string, any>;
  onFieldChange: (field: string, value: string) => void;
  theme: { primary: string; secondary: string };
  disabled?: boolean;
  /** Nombre minimum de champs natifs pour afficher le bouton (défaut: 3) */
  minNativeFields?: number;
  nativeFieldCount?: number;
  /** Mode lecture seule (affichage uniquement) */
  readOnly?: boolean;
}

const CustomFieldsButton: React.FC<CustomFieldsButtonProps> = ({
  customColumns,
  data,
  onFieldChange,
  theme,
  disabled = false,
  minNativeFields = 3,
  nativeFieldCount = 10,
  readOnly = false,
}) => {
  const [expanded, setExpanded] = useState(false);

  const sortedColumns = [...customColumns].sort((a, b) => a.localeCompare(b, "fr"));
  const shouldShow = customColumns.length > 0 && nativeFieldCount >= minNativeFields;

  if (!shouldShow) return null;

  return (
    <div style={{ marginTop: "12px", marginBottom: "12px" }}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        disabled={disabled}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 16px",
          backgroundColor: theme.primary + "20",
          border: `2px solid ${theme.primary}`,
          borderRadius: "8px",
          color: theme.primary,
          cursor: disabled ? "not-allowed" : "pointer",
          fontSize: "14px",
          fontWeight: "600",
          width: "100%",
          justifyContent: "center",
        }}
      >
        <Plus size={20} />
        Champs ajoutés ({customColumns.length})
        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {expanded && (
        <div
          style={{
            marginTop: "12px",
            padding: "12px",
            backgroundColor: "#f8f9fa",
            borderRadius: "8px",
            border: `1px solid ${theme.primary}30`,
          }}
        >
          {sortedColumns.map((col) => (
            <div key={col} className="form-group" style={{ marginBottom: "12px" }}>
              <label
                htmlFor={`custom-${col}`}
                style={{
                  display: "block",
                  marginBottom: "4px",
                  fontSize: "13px",
                  fontWeight: "600",
                  color: theme.primary,
                }}
              >
                {columnToLabel(col)} *
              </label>
              {readOnly ? (
                <div
                  style={{
                    padding: "8px 10px",
                    backgroundColor: "#fff",
                    borderRadius: "4px",
                    border: `1px solid ${theme.primary}50`,
                    fontSize: "14px",
                    color: theme.primary,
                  }}
                >
                  {data[col] ?? ""}
                </div>
              ) : (
                <input
                  type="text"
                  id={`custom-${col}`}
                  value={data[col] ?? ""}
                  onChange={(e) => onFieldChange(col, e.target.value)}
                  disabled={disabled}
                  placeholder={columnToLabel(col)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    backgroundColor: "#fff",
                    borderRadius: "4px",
                    border: `2px solid ${theme.secondary}`,
                    fontSize: "14px",
                    color: theme.primary,
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CustomFieldsButton;
