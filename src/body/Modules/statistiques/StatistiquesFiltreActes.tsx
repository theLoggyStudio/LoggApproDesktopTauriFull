import React, { memo } from "react";
import { upperLow } from "../../helpers/helpers.js";

export type StatistiquesFiltreActesProps = {
  noms: string[];
  selection: string[];
  loading: boolean;
  onToggle: (nom: string) => void;
  onClear: () => void;
  primaryColor: string;
  secondaryColor: string;
};

/**
 * Liste de cases à cocher **contrôlée** : les libellés viennent toujours de `noms` (catalogue API).
 * La sélection peut contenir des noms encore cochés même si le catalogue est en cours de chargement.
 */
const StatistiquesFiltreActesInner = ({
  noms,
  selection,
  loading,
  onToggle,
  onClear,
  primaryColor,
  secondaryColor,
}: StatistiquesFiltreActesProps) => {
  const selectionSet = React.useMemo(() => new Set(selection), [selection]);

  /** Noms à afficher : catalogue + éventuels noms sélectionnés absents du catalogue (ne pas les perdre visuellement). */
  const nomsAffichage = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const n of noms) m.set(n, n);
    for (const s of selection) {
      if (!m.has(s)) m.set(s, s);
    }
    return [...m.values()].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
  }, [noms, selection]);
  let temporarybool = true;

  return (
    temporarybool ?<div></div>:
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: primaryColor }}>
        Filtrer par type(s) d&apos;acte
      </span>
      <p style={{ fontSize: 12, opacity: 0.88, margin: 0, fontWeight: 400, color: primaryColor }}>
        Aucune case cochée = <strong>tous</strong> les types sur la période. Les noms listés correspondent aux actes
        présents entre les deux dates.
      </p>
      {loading && noms.length === 0 ? (
        <div
          style={{
            padding: 16,
            borderRadius: 8,
            border: `2px dashed ${primaryColor}44`,
            color: primaryColor,
            fontSize: 13,
          }}
        >
          Chargement des types d&apos;acte…
        </div>
      ) : (
        <div
          style={{
            maxHeight: 200,
            overflowY: "auto",
            border: `2px solid ${primaryColor}33`,
            borderRadius: 8,
            padding: 10,
            backgroundColor: secondaryColor,
          }}
        >
          {nomsAffichage.length === 0 ? (
            <span style={{ fontSize: 13, color: primaryColor }}>
              Aucun acte sur cette période — élargissez les dates.
            </span>
          ) : (
            nomsAffichage.map((nom) => (
              <label
                key={nom}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                  cursor: "pointer",
                  fontSize: 14,
                  color: primaryColor,
                }}
              >
                <input
                  type="checkbox"
                  checked={selectionSet.has(nom)}
                  onChange={() => onToggle(nom)}
                />
                <span>{upperLow(nom)}</span>
              </label>
            ))
          )}
        </div>
      )}
      {nomsAffichage.length > 0 && (
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClear}>
          Tout afficher (effacer le filtre)
        </button>
      )}
    </div>
  );
};

export const StatistiquesFiltreActes = memo(StatistiquesFiltreActesInner);
