# Documentation : Système de Pagination de la Page des États

## 📋 Table des matières

1. [Description du problème](#description-du-problème)
2. [Solution retenue](#solution-retenue)
3. [Architecture technique](#architecture-technique)
4. [Pipeline de mesure et pagination](#pipeline-de-mesure-et-pagination)
5. [Règles de split](#règles-de-split)
6. [Système de zoom](#système-de-zoom)
7. [Ajouter un nouveau type d'élément](#ajouter-un-nouveau-type-délément)
8. [Mode debug](#mode-debug)
9. [Exemples d'utilisation](#exemples-dutilisation)

---

## Description du problème

### Problème initial

La "Page des États" est un éditeur de documents médicaux (ordonnances, certificats, devis) qui génère dynamiquement des documents à partir d'un JSON. Chaque élément du JSON (textes, tableaux, images, formes, variables) est positionné sur une feuille blanche simulant une page A4.

**Problèmes rencontrés :**

1. **Débordement visuel** : Quand le contenu dépasse la hauteur maximale de la feuille (1123px), les éléments sortent visuellement de la feuille, créant des incohérences et rendant certaines informations invisibles.

2. **Absence de pagination robuste** : Aucun mécanisme fiable ne gérait le dépassement de contenu. Les éléments se superposaient ou étaient coupés de manière imprévisible.

3. **Zoom cassant le layout** : Le zoom était appliqué directement sur les éléments, ce qui cassait les calculs de positionnement et de pagination.

4. **Pas de split des éléments longs** : Les tableaux ou textes très longs ne pouvaient pas être répartis sur plusieurs pages.

---

## Solution retenue

### Principes fondamentaux

1. **Séparation des modes** :
   - **Mode Édition** : Canvas avec pages visibles, éléments manipulables, scroll vertical possible
   - **Mode Aperçu/Impression** : Rendu strict paginé, clipping strict par page, zéro débordement

2. **Mesure réelle des éléments** :
   - Utilisation d'un rendu "offscreen" (div invisible) à `scale=1` pour obtenir les dimensions réelles
   - Mesure via `getBoundingClientRect()` / `offsetHeight` après rendu DOM

3. **Pagination algorithmique** :
   - Algorithme de placement séquentiel avec gestion des marges
   - Split automatique des éléments trop grands (tableaux ligne par ligne)
   - Conservation de l'ordre logique et du z-index

4. **Zoom visuel uniquement** :
   - Zoom appliqué via CSS `transform: scale()` sur le conteneur d'affichage
   - Tous les calculs de layout/pagination effectués à `zoom=1`

---

## Architecture technique

### Structure des modules

```
page_etat/
├── utils/
│   ├── elementMeasurer.ts      # Mesure des dimensions réelles des éléments
│   ├── tableSplitter.ts         # Split des tableaux sur plusieurs pages
│   └── paginationEngine.ts      # Moteur de pagination principal
├── hooks/
│   ├── usePagination.ts         # Hook React pour la pagination
│   └── useZoom.ts               # Hook React pour le zoom
├── components/
│   └── PaginatedPageRenderer.tsx # Composant de rendu des pages paginées
└── PageEtat.tsx                 # Composant principal (intégration)
```

### Flux de données

```
Éléments JSON
    ↓
[usePagination Hook]
    ↓
[PaginationEngine]
    ↓
[elementMeasurer] → Mesure des dimensions réelles
    ↓
[tableSplitter] → Split si nécessaire
    ↓
[PaginationEngine] → Calcul des positions par page
    ↓
[PaginatedPageRenderer] → Rendu visuel
    ↓
[useZoom] → Application du zoom CSS (scale)
```

---

## Pipeline de mesure et pagination

### Étape 1 : Mesure des éléments

**Fichier : `utils/elementMeasurer.ts`**

Chaque élément est mesuré dans un conteneur invisible à `scale=1` pour obtenir ses dimensions réelles :

```typescript
// Exemple pour un élément texte
const measureContainer = document.createElement('div');
measureContainer.style.position = 'absolute';
measureContainer.style.visibility = 'hidden';
measureContainer.style.width = `${element.width}px`;
// ... configuration des styles
const rect = textElement.getBoundingClientRect();
const height = Math.max(element.height || 20, rect.height);
```

**Types d'éléments supportés :**
- `text` : Mesure via DOM avec `getBoundingClientRect()`
- `image` : Mesure via `Image.onload` avec calcul du ratio
- `table` : Calcul basé sur le nombre de lignes × hauteur de ligne
- `variable` : Traité comme du texte
- `shape` : Dimensions fixes définies dans l'élément

### Étape 2 : Algorithme de pagination

**Fichier : `utils/paginationEngine.ts`**

L'algorithme fonctionne comme suit :

1. **Tri des éléments** : Par `zIndex` (ordre logique)

2. **Placement séquentiel** :
   ```typescript
   let cursorY = margins.top; // Position Y actuelle sur la page
   
   for (const element of sortedElements) {
     const elementHeight = measured.height;
     const spaceRemaining = availableHeight - (cursorY - margins.top);
     
     if (elementHeight <= spaceRemaining) {
       // Placer sur la page actuelle
       element.y = cursorY;
       cursorY += elementHeight + spacing;
     } else {
       // Créer une nouvelle page
       createNewPage();
       cursorY = margins.top;
       element.y = cursorY;
       cursorY += elementHeight + spacing;
     }
   }
   ```

3. **Gestion des éléments trop grands** :
   - Si `elementHeight > availableHeight` :
     - Vérifier si l'élément peut être splité (tableaux)
     - Si oui : Split et placer chaque partie
     - Si non : Forcer sur une page dédiée

### Étape 3 : Clipping strict

**Fichier : `components/PaginatedPageRenderer.tsx`**

En mode aperçu, chaque page a un clipping strict :

```typescript
style={{
  overflow: 'hidden',
  clipPath: previewMode ? `inset(0 0 0 0)` : undefined
}}
```

Les éléments sont également ajustés pour garantir qu'ils ne dépassent pas :

```typescript
const adjustedElement = {
  ...element,
  y: Math.max(0, Math.min(element.y, A4_HEIGHT - element.height)),
  x: Math.max(0, Math.min(element.x, A4_WIDTH - element.width))
};
```

---

## Règles de split

### Split des tableaux

**Fichier : `utils/tableSplitter.ts`**

Les tableaux sont splités ligne par ligne :

1. **Calcul du nombre de lignes par page** :
   ```typescript
   const headerHeight = 40;
   const rowHeight = 35;
   const availableHeight = A4_HEIGHT - margins.top - margins.bottom;
   const rowsPerPage = Math.floor((availableHeight - headerHeight) / rowHeight);
   ```

2. **Création de pages multiples** :
   - Chaque page contient l'en-tête du tableau
   - Les lignes sont réparties équitablement
   - La dernière page peut contenir moins de lignes

3. **Exemple** :
   ```
   Tableau avec 50 lignes, 20 lignes par page
   → Page 1 : En-tête + lignes 0-19
   → Page 2 : En-tête + lignes 20-39
   → Page 3 : En-tête + lignes 40-49
   ```

### Split des textes longs (à venir)

Pour l'instant, les textes très longs ne sont pas splités automatiquement. Une amélioration future pourrait :
- Détecter les textes qui dépassent une page
- Les découper par paragraphe ou ligne
- Répartir sur plusieurs pages

---

## Système de zoom

### Principe

**Fichier : `hooks/useZoom.ts`**

Le zoom est appliqué **uniquement visuellement** via CSS `transform: scale()` :

```typescript
<div style={{
  transform: `scale(${zoom})`,
  transformOrigin: 'top center'
}}>
  {/* Pages paginées */}
</div>
```

### Pourquoi le zoom ne casse pas le layout ?

1. **Calculs à zoom=1** :
   - Toutes les mesures sont effectuées à `scale=1`
   - Le moteur de pagination ne connaît pas le niveau de zoom
   - Les positions et dimensions sont calculées en pixels réels

2. **Application visuelle uniquement** :
   - Le zoom est appliqué sur le conteneur d'affichage
   - Les éléments à l'intérieur conservent leurs dimensions réelles
   - Le navigateur gère le scale CSS de manière transparente

3. **Exemple** :
   ```
   Élément mesuré : 200px × 100px (à zoom=1)
   Zoom appliqué : 150% (1.5)
   Affichage visuel : 300px × 150px
   Calculs de pagination : Toujours basés sur 200px × 100px
   ```

### Contrôles de zoom

- **Zoom In** : `zoom += 0.1` (max 3.0)
- **Zoom Out** : `zoom -= 0.1` (min 0.25)
- **Reset** : `zoom = 1.0`
- **Fit to Page** : Calcul automatique pour que la page tienne dans le conteneur

---

## Ajouter un nouveau type d'élément

### Étape 1 : Ajouter la mesure

**Fichier : `utils/elementMeasurer.ts`**

```typescript
export async function measureNewElementType(element: Element): Promise<{ width: number; height: number }> {
  // Logique de mesure spécifique au nouveau type
  // Retourner les dimensions réelles
  return { width: element.width, height: element.height };
}

// Ajouter dans measureElement()
case 'newType':
  return await measureNewElementType(element);
```

### Étape 2 : Ajouter le split si nécessaire

**Fichier : `utils/tableSplitter.ts`**

Si le nouveau type peut être splité :

```typescript
export function canSplitElement(element: Element): boolean {
  return element.type === 'table' || element.type === 'newType';
}

export function splitNewElementType(
  element: Element,
  availableHeight: number
): Element[] {
  // Logique de split spécifique
  // Retourner un tableau d'éléments splités
  return [element]; // Par défaut, pas de split
}
```

### Étape 3 : Ajouter le rendu

**Fichier : `PageEtat.tsx`**

Dans la fonction `renderElement()` :

```typescript
case 'newType':
  return (
    <div style={commonStyle}>
      {/* Rendu du nouveau type */}
    </div>
  );
```

---

## Mode debug

### Activation

Le mode debug peut être activé via le bouton "🐛 Debug" dans la barre d'outils (uniquement en mode édition).

### Informations affichées

1. **Sur chaque page** :
   - Nombre d'éléments sur la page
   - Position Y du curseur (`cursorY`)

2. **Dans la console** :
   - Messages de log du `PaginationEngine`
   - Indication des sauts de page
   - Dimensions mesurées des éléments

### Utilisation

```typescript
// Dans PageEtat.tsx
const [showDebugInfo, setShowDebugInfo] = useState(false);

// Passer au composant de rendu
<PaginatedPagesContainer
  showDebugInfo={showDebugInfo}
  // ...
/>
```

---

## Exemples d'utilisation

### Exemple 1 : Pagination simple

```typescript
// Éléments JSON
const elements = [
  { id: '1', type: 'text', y: 50, height: 100, ... },
  { id: '2', type: 'text', y: 200, height: 100, ... },
  { id: '3', type: 'text', y: 350, height: 100, ... }
];

// Utilisation du hook
const pagination = usePagination(elements, {
  margins: { top: 50, right: 50, bottom: 50, left: 50 },
  autoRecalculate: true
});

// Résultat : 1 page si tout tient, sinon plusieurs pages
```

### Exemple 2 : Tableau long

```typescript
// Tableau avec 100 lignes
const tableElement = {
  id: 'table1',
  type: 'table',
  tableData: [...100 lignes...],
  height: 3500 // Dépasse une page
};

// Le système split automatiquement :
// → Page 1 : En-tête + lignes 0-19
// → Page 2 : En-tête + lignes 20-39
// → ... (5 pages au total)
```

### Exemple 3 : Zoom avec pagination

```typescript
// Zoom à 150%
zoomControls.setZoom(1.5);

// Les calculs de pagination restent à zoom=1
// L'affichage visuel est agrandi de 50%
// Les éléments ne se chevauchent pas car les calculs sont indépendants
```

---

## Points critiques à retenir

### ✅ À faire

1. **Toujours mesurer les éléments** avant de paginer
2. **Calculer à zoom=1** pour tous les calculs de layout
3. **Appliquer le zoom visuellement** uniquement via CSS transform
4. **Clipper strictement** en mode aperçu
5. **Conserver l'ordre logique** des éléments (zIndex)

### ❌ À éviter

1. **Ne pas utiliser le zoom** dans les calculs de positionnement
2. **Ne pas masquer du contenu** sans pagination correcte
3. **Ne pas utiliser overflow:scroll** pour cacher le problème
4. **Ne pas modifier les dimensions** originales des éléments de manière destructive

---

## Améliorations futures

1. **Split des textes longs** : Découpage automatique par paragraphe
2. **Marges configurables par page** : Permettre des marges différentes
3. **En-têtes/pieds de page** : Support des en-têtes répétés
4. **Saut de page manuel** : Permettre à l'utilisateur de forcer un saut
5. **Prévisualisation avant impression** : Aperçu optimisé pour l'impression

---

## Conclusion

Le système de pagination de la Page des États garantit :

- ✅ **Zéro débordement visuel** en mode aperçu
- ✅ **Pagination fiable** avec split automatique des tableaux
- ✅ **Zoom indépendant** des calculs de layout
- ✅ **Code maintenable** avec séparation claire des responsabilités
- ✅ **Extensibilité** pour ajouter de nouveaux types d'éléments

Pour toute question ou amélioration, consulter les fichiers source dans `src/body/modules/page_etat/`.

