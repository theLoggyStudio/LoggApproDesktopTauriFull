// ✅ ModelPanel.tsx - Templates multi-éléments pour éditeur graphique
import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { useTheme } from '../context/ThemeContext.js';
import { themes } from '../../constants/index.ts';
import { DOCUMENT_TEMPLATES, type DocumentTemplate } from '../Pages/page_etat/templates/documentTemplates.js';
import { ModeleEtatController } from '../controllers/ModeleEtatController.js';

const ModelPanel: React.FC<{
  onInsertTemplate?: (template: DocumentTemplate) => void;
  onCreateModelClick?: () => void;
  tabId?: string;
  pays?: string;
  modelesVersion?: number;
}> = ({ onInsertTemplate, onCreateModelClick, tabId, pays, modelesVersion = 0 }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [customTemplates, setCustomTemplates] = useState<DocumentTemplate[]>([]);
  const [loadingModeles, setLoadingModeles] = useState(false);
  const { themeNumber } = useTheme();

  const loadModelesFromDb = useCallback(async () => {
    if (!tabId || !pays) return;
    setLoadingModeles(true);
    try {
      const modeles = await ModeleEtatController(pays).listModeles(tabId);
      setCustomTemplates(modeles);
    } catch {
      setCustomTemplates([]);
    } finally {
      setLoadingModeles(false);
    }
  }, [tabId, pays]);

  // Charger les modèles depuis la base de données (ou quand modelesVersion change après une sauvegarde)
  useEffect(() => {
    loadModelesFromDb();
  }, [loadModelesFromDb, modelesVersion]);

  // Combiner templates par défaut + personnalisés
  const allTemplates = [...DOCUMENT_TEMPLATES, ...customTemplates];

  // Filtrer par catégorie
  const filteredTemplates = selectedCategory === 'all'
    ? allTemplates
    : allTemplates.filter(t => t.category === selectedCategory);

  // Supprimer un modèle personnalisé (depuis la base de données)
  const handleDeleteCustomTemplate = async (templateId: string) => {
    if (!templateId.startsWith('custom_')) return;
    if (!tabId || !pays) return;
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce modèle personnalisé ?')) return;

    try {
      await ModeleEtatController(pays).deleteModele(tabId, templateId);
      setCustomTemplates(prev => prev.filter(t => t.id !== templateId));
    } catch (err) {
      console.error('Erreur suppression modèle:', err);
    }
  };

  // Catégories disponibles
  const categories = [
    { id: 'all', name: 'Tous', icon: '📁' },
    { id: 'prescription', name: 'Ordonnance', icon: '💊' },
    { id: 'devis', name: 'Devis', icon: '💰' },
    { id: 'certificat', name: 'Certificat', icon: '📋' },
    { id: 'consultation', name: 'Consultation', icon: '👨‍⚕️' },
    { id: 'administratif', name: 'Administratif', icon: '📄' }
  ];

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'consultation': return '#3498db';
      case 'prescription': return '#e74c3c';
      case 'certificat': return '#2ecc71';
      case 'devis': return '#f39c12';
      case 'administratif': return '#9b59b6';
      default: return '#95a5a6';
    }
  };

  return (
    <div style={{ padding: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '6px' }}>
        <h4 style={{ margin: 0, fontSize: '13px', color: themes[themeNumber].primary, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <FileText size={16} />
          📄 Modèles Dentaires
          {loadingModeles && <span style={{ fontSize: '10px', fontStyle: 'italic' }}>(chargement...)</span>}
        </h4>
        {onCreateModelClick && (
          <button
            onClick={onCreateModelClick}
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              backgroundColor: themes[themeNumber].primary,
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontWeight: '500'
            }}
          >
            <Plus size={14} />
            Créer
          </button>
        )}
      </div>

      {/* Filtres par catégorie */}
      <div style={{ marginBottom: '10px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {categories.map(category => (
          <button
            key={category.id}
            onClick={() => setSelectedCategory(category.id)}
            style={{
              padding: '4px 8px',
              backgroundColor: selectedCategory === category.id ? themes[themeNumber].primary : '#f5f5f5',
              color: selectedCategory === category.id ? 'white' : themes[themeNumber].primary,
              border: `1px solid ${themes[themeNumber].primary}`,
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '10px',
              fontWeight: '500'
            }}
          >
            <span style={{ fontSize: '12px', marginRight: '3px' }}>{category.icon}</span>
            {category.name}
          </button>
        ))}
      </div>

      {/* Liste des templates */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {filteredTemplates.map(template => (
          <div 
            key={template.id} 
            style={{
              padding: '8px',
              backgroundColor: 'white',
              border: `1px solid ${getCategoryColor(template.category)}`,
              borderRadius: '5px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
              <span style={{ fontSize: '18px' }}>{template.icon}</span>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: '12px', color: themes[themeNumber].primary, display: 'block' }}>
                  {template.name}
                  {template.id.startsWith('custom_') && (
                    <span style={{ 
                      fontSize: '8px', 
                      backgroundColor: '#9b59b6', 
                      color: 'white', 
                      padding: '2px 4px', 
                      borderRadius: '3px',
                      marginLeft: '5px'
                    }}>
                      PERSO
                    </span>
                  )}
                </strong>
                <span style={{ 
                  fontSize: '9px', 
                  color: '#7f8c8d'
                }}>
                  {template.elements.length} élément{template.elements.length > 1 ? 's' : ''}
                </span>
              </div>
              {template.id.startsWith('custom_') && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteCustomTemplate(template.id);
                  }}
                  style={{
                    padding: '4px',
                    backgroundColor: '#ffebee',
                    border: '1px solid #f44336',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="Supprimer ce modèle personnalisé"
                >
                  <Trash2 size={12} color="#f44336" />
                </button>
              )}
        </div>
            <p style={{ fontSize: '10px', color: '#666', margin: '0 0 6px 0' }}>{template.description}</p>
            <button
              onClick={() => onInsertTemplate && onInsertTemplate(template)}
              style={{
                width: '100%',
                padding: '6px',
                backgroundColor: getCategoryColor(template.category),
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px'
              }}
            >
              <Plus size={14} />
              Insérer le modèle
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ModelPanel;
