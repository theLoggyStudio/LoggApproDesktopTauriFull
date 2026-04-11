/**
 * Utilitaire pour le rendu des variables médicales
 */

import {
  formatInexistantVariable,
  isForbiddenEtatVariableBasePath,
  parseVariableContent,
} from './variableFormat.js';

/**
 * Remplace une variable {{xxx}} par sa valeur réelle
 * @param variablePath - Le chemin de la variable (ex: "{{patient.nom}}")
 * @param dataContext - L'objet contenant toutes les données médicales
 * @returns La valeur rendue ou le chemin original si non trouvé
 */
export const renderVariableValue = (variablePath: string, dataContext: any): string => {
  const parsed = parseVariableContent(variablePath.trim());
  if (parsed && isForbiddenEtatVariableBasePath(parsed.basePath)) {
    return '';
  }
  if (!parsed) {
    const raw = variablePath.replace(/[{}]/g, '').trim();
    return formatInexistantVariable(raw);
  }
  const { basePath, index } = parsed;
  const parts = basePath.split('.');
  const innerVar = variablePath.replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '').trim();

  /** {{posologie}} : chaîne ou objet { texte, date, lignes } */
  if (parts.length === 1 && parts[0] === 'posologie') {
    const po = dataContext?.posologie;
    if (typeof po === 'string') return po;
    if (po && typeof po === 'object' && po.texte != null) return String(po.texte);
  }
  /** {{ordonnance}} : chaîne ou objet { texte, date, lignes } */
  if (parts.length === 1 && parts[0] === 'ordonnance') {
    const ord = dataContext?.ordonnance;
    if (typeof ord === 'string') return ord;
    if (ord && typeof ord === 'object' && ord.texte != null) return String(ord.texte);
  }

  /** {{collaborateur.champ #N}} — dataContext.collaborateursByIndex optionnel */
  if (parts[0] === 'collaborateur' && parts.length >= 2) {
    const row =
      index <= 1
        ? (dataContext?.collaborateursByIndex?.[1] ?? dataContext?.collaborateur ?? {})
        : (dataContext?.collaborateursByIndex?.[index] ?? {});
    let value: any = row;
    for (const part of parts.slice(1)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        value = value[part];
      } else {
        return formatInexistantVariable(innerVar);
      }
    }
    return value !== undefined && value !== null ? String(value) : formatInexistantVariable(innerVar);
  }

  /** {{patient.champ #N}} — dataContext optionnel : patientsByIndex, patient */
  if (parts[0] === 'patient' && parts.length >= 2) {
    const p =
      index <= 1
        ? (dataContext?.patientsByIndex?.[1] ?? dataContext?.patient ?? {})
        : (dataContext?.patientsByIndex?.[index] ?? {});
    let value: any = p;
    for (const part of parts.slice(1)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        value = value[part];
      } else {
        return formatInexistantVariable(innerVar);
      }
    }
    return value !== undefined && value !== null ? String(value) : formatInexistantVariable(innerVar);
  }

  /** {{acte.champ #N}} — dataContext.acte prérempli ou actes[index-1] */
  if (parts[0] === 'acte' && parts.length >= 2) {
    const row =
      dataContext?.acte && typeof dataContext.acte === 'object'
        ? dataContext.acte
        : dataContext?.actes && index >= 1 && dataContext.actes.length >= index
          ? dataContext.actes[index - 1]
          : undefined;
    if (row === undefined) return formatInexistantVariable(innerVar);
    let value: any = row;
    for (const part of parts.slice(1)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        value = value[part];
      } else {
        return formatInexistantVariable(innerVar);
      }
    }
    return value !== undefined && value !== null ? String(value) : formatInexistantVariable(innerVar);
  }

  /** {{actes.champ #N}} */
  if (parts[0] === 'actes' && parts.length >= 2) {
    const row =
      dataContext?.actes && index >= 1 && dataContext.actes.length >= index
        ? dataContext.actes[index - 1]
        : undefined;
    if (row === undefined) return formatInexistantVariable(innerVar);
    let value: any = row;
    for (const part of parts.slice(1)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        value = value[part];
      } else {
        return formatInexistantVariable(innerVar);
      }
    }
    return value !== undefined && value !== null ? String(value) : formatInexistantVariable(innerVar);
  }

  let value: any = dataContext;
  for (const part of parts) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      value = value[part];
    } else {
      return variablePath;
    }
  }

  return value !== undefined && value !== null ? String(value) : variablePath;
};

/**
 * Remplace toutes les variables dans un texte
 * @param text - Le texte contenant des variables {{xxx}}
 * @param dataContext - L'objet contenant toutes les données médicales
 * @returns Le texte avec toutes les variables remplacées
 */
export const replaceAllVariables = (text: string, dataContext: any): string => {
  return text.replace(/\{\{([^}]+)\}\}/g, (match) => {
    return renderVariableValue(match, dataContext);
  });
};

