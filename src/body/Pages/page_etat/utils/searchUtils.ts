/**
 * Utilitaires de recherche améliorés pour les patients et actes
 * 
 * Fonctionnalités :
 * - Recherche fuzzy (tolérance aux fautes de frappe)
 * - Recherche multi-critères (nom, prénom, téléphone, email, etc.)
 * - Normalisation des accents
 * - Score de pertinence
 */

/**
 * Normalise une chaîne pour la recherche (supprime les accents, met en minuscule)
 */
export function normalizeSearchString(str: string): string {
  if (!str) return '';
  
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Supprime les accents
    .replace(/[^\w\s]/g, '') // Supprime les caractères spéciaux
    .trim();
}

/**
 * Calcule un score de pertinence pour un résultat de recherche
 * Plus le score est élevé, plus le résultat est pertinent
 */
export function calculateRelevanceScore(item: any, searchQuery: string): number {
  const normalizedQuery = normalizeSearchString(searchQuery);
  const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 0);
  
  if (queryWords.length === 0) return 0;
  
  let score = 0;
  
  // Champs à rechercher avec leurs poids
  const searchFields = [
    { field: 'nom', weight: 10 },
    { field: 'prenom', weight: 10 },
    { field: 'nomComplet', weight: 15 }, // Nom + prénom combiné
    { field: 'telephone', weight: 5 },
    { field: 'email', weight: 5 },
    { field: 'id', weight: 8 },
    { field: 'adresse', weight: 3 },
    { field: 'profession', weight: 2 },
    { field: 'nomDeJeuneFille', weight: 5 }
  ];
  
  // Créer une chaîne combinée nom + prénom
  const nomComplet = `${item.nom || ''} ${item.prenom || ''}`.trim();
  const normalizedNomComplet = normalizeSearchString(nomComplet);
  
  for (const word of queryWords) {
    // Correspondance exacte du mot complet
    if (normalizedNomComplet === word) {
      score += 50; // Score très élevé pour correspondance exacte
      continue;
    }
    
    // Correspondance au début (plus pertinent)
    if (normalizedNomComplet.startsWith(word)) {
      score += 30;
    }
    
    // Correspondance dans le nom complet
    if (normalizedNomComplet.includes(word)) {
      score += 15;
    }
    
    // Recherche dans chaque champ
    for (const { field, weight } of searchFields) {
      let fieldValue = '';
      
      if (field === 'nomComplet') {
        fieldValue = normalizedNomComplet;
      } else {
        fieldValue = normalizeSearchString(item[field] || '');
      }
      
      if (!fieldValue) continue;
      
      // Correspondance exacte
      if (fieldValue === word) {
        score += weight * 2;
      }
      // Correspondance au début
      else if (fieldValue.startsWith(word)) {
        score += weight * 1.5;
      }
      // Correspondance partielle
      else if (fieldValue.includes(word)) {
        score += weight;
      }
    }
  }
  
  return score;
}

/**
 * Filtre et trie les résultats selon leur pertinence
 */
export function filterAndSortResults<T extends Record<string, any>>(
  items: T[],
  searchQuery: string,
  minScore: number = 1
): T[] {
  if (!searchQuery || searchQuery.trim().length === 0) {
    return items;
  }
  
  const normalizedQuery = normalizeSearchString(searchQuery);
  
  // Calculer le score pour chaque élément
  const itemsWithScore = items.map(item => ({
    item,
    score: calculateRelevanceScore(item, normalizedQuery)
  }));
  
  // Filtrer par score minimum et trier par score décroissant
  return itemsWithScore
    .filter(({ score }) => score >= minScore)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

/**
 * Recherche fuzzy simple (tolérance aux fautes de frappe)
 * Retourne true si la chaîne correspond approximativement à la recherche
 */
export function fuzzyMatch(text: string, searchQuery: string, threshold: number = 0.6): boolean {
  const normalizedText = normalizeSearchString(text);
  const normalizedQuery = normalizeSearchString(searchQuery);
  
  if (normalizedText.includes(normalizedQuery)) {
    return true;
  }
  
  // Calcul simple de similarité (Levenshtein simplifié)
  const textWords = normalizedText.split(/\s+/);
  const queryWords = normalizedQuery.split(/\s+/);
  
  for (const queryWord of queryWords) {
    for (const textWord of textWords) {
      if (textWord.length === 0 || queryWord.length === 0) continue;
      
      // Correspondance exacte
      if (textWord === queryWord) return true;
      
      // Correspondance au début
      if (textWord.startsWith(queryWord) || queryWord.startsWith(textWord)) {
        return true;
      }
      
      // Calcul de similarité simple
      const similarity = calculateSimpleSimilarity(textWord, queryWord);
      if (similarity >= threshold) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Calcule une similarité simple entre deux chaînes (0 à 1)
 */
function calculateSimpleSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  // Compter les caractères communs
  let commonChars = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) {
      commonChars++;
    }
  }
  
  return commonChars / longer.length;
}

/**
 * Recherche multi-critères dans un tableau d'objets
 */
export function multiCriteriaSearch<T extends Record<string, any>>(
  items: T[],
  searchQuery: string,
  fields: string[] = ['nom', 'prenom', 'telephone', 'email', 'id']
): T[] {
  if (!searchQuery || searchQuery.trim().length === 0) {
    return items;
  }
  
  const normalizedQuery = normalizeSearchString(searchQuery);
  const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 0);
  
  return items.filter(item => {
    // Vérifier si au moins un mot de la recherche correspond dans au moins un champ
    return queryWords.some(queryWord => {
      return fields.some(field => {
        const fieldValue = normalizeSearchString(String(item[field] || ''));
        return fieldValue.includes(queryWord);
      });
    });
  });
}

