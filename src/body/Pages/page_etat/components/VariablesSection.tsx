import React from 'react';
import VariableButton from './VariableButton';
import { VARIABLE_CATEGORIES } from '../constants/medicalData';

interface VariablesSectionProps {
  onInsertVariable: (variablePath: string) => void;
  themeColor: string;
  onOpenActesModal?: () => void;
  onOpenPatientsModal?: () => void;
  onOpenCollaborateursTableModal?: () => void;
  customPatientVars?: string[];
  customActeVars?: string[];
}

const VariablesSection: React.FC<VariablesSectionProps> = ({
  onInsertVariable,
  themeColor,
  onOpenActesModal,
  onOpenPatientsModal,
  onOpenCollaborateursTableModal,
  customPatientVars = [],
  customActeVars = [],
}) => {
  const visibleCategories = Object.entries(VARIABLE_CATEGORIES);
  return (
    <div style={{ marginTop: '15px', padding: '10px', backgroundColor: 'white', borderRadius: '5px' }}>
      <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: themeColor, fontWeight: 'bold' }}>
        📊 Variables Médicales
      </h4>
      
      {visibleCategories.map(([key, category]) => (
        <div key={key} style={{ marginBottom: '10px' }}>
          <p style={{ margin: '0 0 5px 0', fontSize: '11px', fontWeight: 'bold', color: '#666' }}>
            {category.label}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {category.variables.map(varName => (
              <VariableButton
                key={varName}
                variablePath={varName}
                color={category.color}
                onClick={onInsertVariable}
              />
            ))}
            {key === 'PATIENT' &&
              customPatientVars.map((col) => (
                <VariableButton
                  key={`patient.${col}`}
                  variablePath={`patient.${col}`}
                  label="*"
                  color={category.color}
                  onClick={onInsertVariable}
                />
              ))}
            {key === 'ACTE' &&
              customActeVars.map((col) => (
                <VariableButton
                  key={`acte.${col}`}
                  variablePath={`acte.${col}`}
                  label="*"
                  color={category.color}
                  onClick={onInsertVariable}
                />
              ))}
            
            {/* Bouton Tableau des Patients sous la catégorie Patient */}
            {key === 'PATIENT' && onOpenPatientsModal && (
              <button
                onClick={onOpenPatientsModal}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: '#4caf50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  marginTop: '5px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#388e3c'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#4caf50'}
                title="Insérer un tableau de patients"
              >
                📋 Tableau des Patients
              </button>
            )}
            
            {key === 'ACTE' && onOpenActesModal && (
              <button
                onClick={onOpenActesModal}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: '#27ae60',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  marginTop: '5px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#229954'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#27ae60'}
                title="Insérer un tableau d'actes"
              >
                📋 Tableau des Actes
              </button>
            )}

            {key === 'COLLABORATEUR' && onOpenCollaborateursTableModal && (
              <button
                type="button"
                onClick={onOpenCollaborateursTableModal}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: '#27ae60',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  marginTop: '5px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#229954'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#27ae60'}
                title="Insérer un tableau des Collaborateurs"
              >
                📋 Tableau des Collaborateurs
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default VariablesSection;

