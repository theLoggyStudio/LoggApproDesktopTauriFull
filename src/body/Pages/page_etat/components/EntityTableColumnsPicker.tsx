import React from 'react';
import type { TableEntityKind } from '../medicalVariables/medicalVariablesRegistry.js';
import {
  applyAllTableColumns,
  applyEssentialTableColumns,
  applyNoneTableColumns,
  getTableFieldGroups,
  type TableColumnsVisibility,
} from '../medicalVariables/medicalVariablesHelpers.js';

interface EntityTableColumnsPickerProps {
  entity: TableEntityKind;
  columns: TableColumnsVisibility;
  onChange: (next: TableColumnsVisibility) => void;
  /** Style bandeau (patient = vert, acte = bleu, collaborateur = teal) */
  variant?: 'patient' | 'acte' | 'collaborateur';
}

const VARIANT_BG: Record<NonNullable<EntityTableColumnsPickerProps['variant']>, string> = {
  patient: '#e8f5e9',
  acte: '#e3f2fd',
  collaborateur: '#e0f7fa',
};

const GROUP_TITLE_COLOR: Record<NonNullable<EntityTableColumnsPickerProps['variant']>, string> = {
  patient: '#1976d2',
  acte: '#1976d2',
  collaborateur: '#00695c',
};

/**
 * Sélecteur de colonnes pour les modales « Tableau patients » / « Tableau actes ».
 * Entièrement piloté par le registre médical (medicalVariablesRegistry).
 */
const EntityTableColumnsPicker: React.FC<EntityTableColumnsPickerProps> = ({
  entity,
  columns,
  onChange,
  variant = 'patient',
}) => {
  const groups = React.useMemo(() => getTableFieldGroups(entity), [entity]);

  const setKey = (key: string, checked: boolean) => {
    onChange({ ...columns, [key]: checked });
  };

  return (
    <div
      style={{
        padding: '15px',
        backgroundColor: VARIANT_BG[variant],
        borderRadius: '8px',
        marginBottom: '20px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h3 style={{ margin: 0, fontSize: '15px', color: '#2c3e50' }}>📊 Colonnes à afficher</h3>
        <div style={{ display: 'flex', gap: '5px' }}>
          <button
            type="button"
            onClick={() => onChange(applyAllTableColumns(entity))}
            style={{
              padding: '4px 8px',
              backgroundColor: '#2196f3',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 'bold',
            }}
          >
            ✓ Tout
          </button>
          <button
            type="button"
            onClick={() => onChange(applyEssentialTableColumns(entity))}
            style={{
              padding: '4px 8px',
              backgroundColor: variant === 'acte' ? '#f39c12' : '#4caf50',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 'bold',
            }}
          >
            ⭐ Essentielles
          </button>
          <button
            type="button"
            onClick={() => onChange(applyNoneTableColumns(entity))}
            style={{
              padding: '4px 8px',
              backgroundColor: '#95a5a6',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 'bold',
            }}
          >
            ✗ Aucune
          </button>
        </div>
      </div>

      {groups.map(({ group, fields }) => (
        <div key={group} style={{ marginBottom: '15px' }}>
          <p
            style={{
              margin: '0 0 8px 0',
              fontSize: '13px',
              fontWeight: 'bold',
              color: GROUP_TITLE_COLOR[variant],
            }}
          >
            {group}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {fields.map(({ key, label }) => (
              <label
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: '#2c3e50',
                }}
              >
                <input
                  type="checkbox"
                  checked={!!columns[key]}
                  onChange={(e) => setKey(key, e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default EntityTableColumnsPicker;
