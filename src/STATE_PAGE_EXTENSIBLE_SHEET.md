# Documentation : Mode Feuille Extensible - Page des États

## Vue d'ensemble

Le mode **EXTENSIBLE** permet de créer une feuille de document avec une **hauteur dynamique illimitée** qui s'adapte automatiquement au contenu, contrairement au mode **PAGED** qui divise le contenu en pages fixes de taille A4.

## Principe de fonctionnement

### Mode EXTENSIBLE vs Mode PAGED

| Caractéristique | Mode EXTENSIBLE | Mode PAGED |
|----------------|-----------------|------------|
| **Largeur** | Fixe (A4_WIDTH = 794px) | Fixe (A4_WIDTH = 794px) |
| **Hauteur** | Dynamique (selon le contenu) | Fixe (A4_HEIGHT = 1123px) |
| **Pagination** | Aucune (surface continue) | Automatique (saut de page) |
| **Débordement** | La feuille s'étend | Contenu réparti sur plusieurs pages |
| **Cas d'usage** | Documents longs, tableaux volumineux | Documents imprimables standardisés |

### Calcul de la hauteur dynamique

La hauteur de la feuille est calculée selon la formule suivante :

```
sheetHeight = maxBottom + marginBottom + paddingBottom
```

Où :
- `maxBottom` : Position Y la plus basse parmi tous les éléments (`max(y + height)`)
- `marginBottom` : Marge du bas (par défaut : 50px)
- `paddingBottom` : Padding de sécurité (50px) pour éviter que les éléments touchent le bord

### Pipeline de calcul

1. **Mesure des éléments** : Chaque élément est mesuré à `scale=1` pour obtenir ses dimensions réelles
2. **Tri par ordre logique** : Les éléments sont triés par `zIndex` pour respecter l'ordre d'affichage
3. **Calcul de `maxBottom`** : Parcours de tous les éléments pour trouver la position la plus basse
4. **Calcul de `sheetHeight`** : Application de la formule ci-dessus
5. **Ajustement des positions X** : Les éléments sont ajustés pour respecter les marges latérales

## Architecture technique

### Modules créés

#### 1. `extensibleSheetEngine.ts`
Moteur de calcul pour le mode extensible.

**Classe principale** : `ExtensibleSheetEngine`

**Méthodes principales** :
- `computeSheetHeight(elements: Element[]): Promise<ExtensibleSheetResult>`
  - Calcule la hauteur dynamique de la feuille
  - Retourne les éléments ajustés et leurs mesures

**Interface** :
```typescript
interface ExtensibleSheetResult {
  sheetHeight: number;
  elements: Element[];
  measurements: Map<string, { width: number; height: number }>;
}
```

#### 2. `useExtensibleSheet.ts`
Hook React pour gérer le mode extensible.

**Fonction principale** : `useExtensibleSheet(elements, options)`

**Retour** :
```typescript
{
  sheetHeight: number;
  isCalculating: boolean;
  recalculate: () => Promise<void>;
  setDebugMode: (enabled: boolean) => void;
  setMargins: (margins: PageMargins) => void;
  adjustedElements: Element[];
}
```

**Fonctionnalités** :
- Recalcul automatique lorsque les éléments changent
- Mode debug pour le diagnostic
- Gestion des marges configurables

#### 3. `ExtensibleSheetRenderer.tsx`
Composant React pour le rendu de la feuille extensible.

**Props** :
```typescript
{
  elements: Element[];
  sheetHeight: number;
  renderElement: (element, previewMode, pageIndex) => ReactNode;
  previewMode: boolean;
  showGrid?: boolean;
  onSheetClick?: () => void;
  zoom?: number;
  canvasRef?: RefObject<HTMLDivElement>;
}
```

**Fonctionnalités** :
- Rendu de la feuille avec hauteur dynamique
- Support de la grille optionnelle
- Clipping strict en mode aperçu
- Support du zoom visuel

## Gestion du zoom

### Principe

Le zoom est appliqué **uniquement visuellement** via `CSS transform: scale()`. Les calculs de layout sont toujours effectués à `zoom=1`.

### Implémentation

1. **Calcul à zoom=1** : Tous les calculs de hauteur et de position sont effectués sans tenir compte du zoom
2. **Application visuelle** : Le zoom est appliqué au conteneur parent via `transform: scale(zoom)`
3. **Mesure offscreen** : Les éléments sont mesurés dans un contexte non-zoomé pour garantir la précision

### Pourquoi le zoom ne casse pas le layout ?

- Les calculs sont indépendants du zoom
- La hauteur de la feuille est calculée en pixels réels (non zoomés)
- Le zoom est appliqué uniquement au niveau CSS, sans modifier les dimensions réelles

## Basculer entre les modes

### Dans l'interface utilisateur

Un select dans la barre d'outils permet de choisir entre :
- **📄 Feuille extensible** : Mode EXTENSIBLE
- **📑 Pages multiples** : Mode PAGED

### Dans le code

```typescript
const [renderMode, setRenderMode] = useState<RenderMode>('EXTENSIBLE');

// Mode EXTENSIBLE
const extensibleSheet = useExtensibleSheet(elements, {
  margins: { top: 50, right: 50, bottom: 50, left: 50 },
  autoRecalculate: renderMode === 'EXTENSIBLE'
});

// Mode PAGED
const pagination = usePagination(elements, {
  margins: { top: 50, right: 50, bottom: 50, left: 50 },
  autoRecalculate: renderMode === 'PAGED'
});
```

## Impression

### Mode PAGED
L'impression utilise directement les pages calculées par le système de pagination.

### Mode EXTENSIBLE
L'impression divise la feuille extensible en pages A4 :
1. Calcul du nombre de pages nécessaires : `Math.ceil(totalHeight / A4_HEIGHT)`
2. Pour chaque page :
   - Filtrage des éléments qui chevauchent la zone de la page
   - Ajustement des positions Y relatives à la page
   - Génération du HTML pour l'impression

## Cas d'usage

### Quand utiliser le mode EXTENSIBLE ?

✅ **Recommandé pour** :
- Documents avec beaucoup de contenu (rapports longs, listes)
- Tableaux volumineux qui ne doivent pas être coupés
- Documents qui ne nécessitent pas de pagination stricte
- Édition de contenu où la continuité est importante

### Quand utiliser le mode PAGED ?

✅ **Recommandé pour** :
- Documents destinés à l'impression physique
- Documents qui doivent respecter un format A4 strict
- Cas où la pagination est importante (numéros de page, en-têtes/pieds de page)

## Contraintes et limitations

### Limitations actuelles

1. **Impression** : En mode EXTENSIBLE, l'impression divise automatiquement en pages A4, ce qui peut couper des éléments au milieu
2. **Performance** : Pour des documents très longs (plusieurs milliers d'éléments), le calcul de hauteur peut prendre du temps
3. **Mémoire** : Les documents très longs peuvent consommer beaucoup de mémoire

### Bonnes pratiques

1. **Utiliser le mode EXTENSIBLE** pour l'édition et le mode **PAGED** pour l'impression finale
2. **Limiter le nombre d'éléments** si possible (regrouper en tableaux plutôt qu'en éléments individuels)
3. **Activer le mode debug** pour diagnostiquer les problèmes de calcul de hauteur

## Mode debug

### Activation

```typescript
extensibleSheet.setDebugMode(true);
```

### Informations affichées

- Position de chaque élément
- Calcul de `maxBottom`
- Hauteur calculée de la feuille
- Avertissements si un élément n'a pas pu être mesuré

## Ajout d'un nouveau type d'élément

Pour ajouter un nouveau type d'élément JSON qui fonctionne avec le mode extensible :

1. **Ajouter la mesure** dans `elementMeasurer.ts` :
   ```typescript
   export async function measureNewElementType(element: NewElementType): Promise<{ width: number; height: number }> {
     // Mesurer les dimensions réelles de l'élément
     // Retourner { width, height }
   }
   ```

2. **Ajouter le rendu** dans `ExtensibleSheetRenderer.tsx` :
   ```typescript
   // Dans le composant, ajouter le cas pour le nouveau type
   if (element.type === 'newType') {
     // Rendu spécifique
   }
   ```

3. **Tester** avec le mode debug activé pour vérifier que les mesures sont correctes

## Exemples

### Exemple 1 : Document simple

```typescript
const elements = [
  { id: '1', type: 'text', x: 50, y: 50, width: 200, height: 30, content: 'Titre' },
  { id: '2', type: 'text', x: 50, y: 100, width: 200, height: 30, content: 'Contenu' }
];

// Résultat : sheetHeight ≈ 180px (50 + 30 + 50 + 50)
```

### Exemple 2 : Document avec tableau long

```typescript
const elements = [
  { id: '1', type: 'text', x: 50, y: 50, width: 200, height: 30, content: 'Titre' },
  { id: '2', type: 'table', x: 50, y: 100, width: 700, height: 2000, tableData: [...] }
];

// Résultat : sheetHeight ≈ 2200px (100 + 2000 + 50 + 50)
// La feuille s'étend automatiquement pour contenir le tableau
```

## Conclusion

Le mode **EXTENSIBLE** offre une flexibilité maximale pour créer des documents de longueur variable, tandis que le mode **PAGED** garantit une pagination stricte pour l'impression. Le choix entre les deux modes dépend des besoins spécifiques du document.

