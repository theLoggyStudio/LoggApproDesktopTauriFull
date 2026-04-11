# 🎨 Page des États - Version Graphique (Test)

## 🎯 Concept : Éditeur de Mise en Page Libre

### Vision
Créer un **éditeur graphique de type Canva/Illustrator** pour documents médicaux, où chaque élément peut être **positionné librement** sur une page A4, sans contraintes de flux de texte.

---

## ✨ Fonctionnalités Implémentées

### 📄 **Canvas A4 Réel**
- ✅ Dimensions exactes : **794px × 1123px** (210mm × 297mm à 96 DPI)
- ✅ Fond blanc avec ombre portée
- ✅ Grille de guidage (20px × 20px)
- ✅ Zoom : 50% à 200%
- ✅ Défilement si zoom > 100%

### 🎨 **Éléments Déplaçables**

#### 1. **Texte** 📝
- Positionnement libre (x, y)
- Taille et dimensions personnalisables
- Double-clic pour éditer
- Propriétés :
  - Police (5 choix)
  - Taille (pixels)
  - Couleur
  - Gras, Italique, Souligné
  - Alignement (gauche/centre/droite)
  - Fond et bordure

#### 2. **Image** 🖼️
- URL personnalisée
- Redimensionnement
- Rotation
- Positionnement absolu

#### 3. **Formes** 🔷
- Rectangle
- Cercle (arrondi à 50%)
- Couleur de fond
- Bordure personnalisable
- Arrondi ajustable (0-50%)

#### 4. **Variables** 📊
- Badges colorés
- Variables médicales prédéfinies :
  - `{{patient.nom}}`
  - `{{patient.prenom}}`
  - `{{patient.naissance}}`
  - `{{acte.nom}}`
  - `{{acte.date}}`
  - `{{docteur.nom}}`
- Style distinct (fond bleu clair)

---

## 🎯 Interface Utilisateur

### Barre d'Outils Supérieure

**Section 1 - Insertion** :
- 📝 Texte
- 🖼️ Image
- ⬜ Rectangle
- ⭕ Cercle

**Section 2 - Actions** :
- 📋 Dupliquer
- 🗑️ Supprimer

**Section 3 - Zoom** :
- 🔍+ Zoom avant
- 🔍- Zoom arrière
- Affichage pourcentage

**Section 4 - Fichier** :
- 📂 Ouvrir (.json)
- 💾 Sauvegarder (.json)
- 🖨️ Imprimer (PDF)

### Sidebar Gauche - Calques

**Fonctionnalités** :
- ✅ Liste de tous les éléments
- ✅ Ordre Z (du plus haut au plus bas)
- ✅ Icônes par type (📝🖼️🔷📊)
- ✅ Aperçu du contenu (30 premiers caractères)
- ✅ Sélection par clic
- ✅ Surbrillance élément sélectionné

### Sidebar Droite - Propriétés

**Sections dynamiques selon type d'élément** :

#### 📐 Position & Taille
- X, Y (pixels)
- Largeur, Hauteur (pixels)
- Rotation (degrés)

#### ✍️ Texte (si type texte/variable)
- Police (sélecteur)
- Taille (nombre)
- Couleur (picker)
- Boutons toggle : **B** / *I* / <u>U</u>
- Alignement : ⬅️ ⬛ ➡️

#### 🎨 Apparence
- Couleur de fond
- Couleur de bordure
- Épaisseur bordure
- Arrondi (slider 0-50%)

#### 📊 Variables Rapides
- 6 variables prédéfinies
- Boutons cliquables
- Insertion instantanée

---

## 🖱️ Interactions

### Sélection
- **Clic simple** : Sélectionner un élément
- **Clic sur canvas vide** : Désélectionner

### Déplacement
- **Clic + Drag** : Déplacer l'élément
- **Contraintes** : L'élément reste dans les limites A4
- **Curseur** : `grab` → `grabbing`

### Édition
- **Double-clic** (texte/variable) : Modifier le contenu via prompt
- **Panel propriétés** : Modification temps réel

### Redimensionnement
- **Inputs numériques** : Largeur/Hauteur précises
- **Conservation** : Possibilité de déformer (pas de ratio forcé)

### Rotation
- **Input numérique** : Angle en degrés
- **Transform CSS** : `rotate(Xdeg)`

---

## 💾 Sauvegarde & Export

### Format JSON
```json
[
  {
    "id": "text_1234567890",
    "type": "text",
    "x": 100,
    "y": 50,
    "width": 300,
    "height": 40,
    "content": "Dr. {{docteur.nom}}",
    "fontSize": 18,
    "fontFamily": "Georgia, serif",
    "color": "#2c3e50",
    "fontWeight": "bold",
    "zIndex": 0
  }
]
```

### Import/Export
- ✅ **Exporter** : Télécharge fichier `.json`
- ✅ **Importer** : Upload fichier `.json`
- ✅ **Nom auto** : `etat_{timestamp}.json`

### Impression
- ✅ **window.print()** : Dialogue natif du navigateur
- ✅ **@media print** : CSS d'impression
- ✅ **Format A4** : Dimensions exactes

---

## 🎨 Avantages vs CKEditor

### Liberté Totale
- ✅ Positionnement pixel-perfect
- ✅ Pas de contrainte de flux
- ✅ Superposition d'éléments
- ✅ Design graphique libre

### Simplicité
- ✅ Pas de dépendance lourde (CKEditor)
- ✅ Code maison (100% contrôlable)
- ✅ Pas de bugs tiers
- ✅ Légèreté (~400 lignes)

### Puissance
- ✅ Rotation d'éléments
- ✅ Z-index géré
- ✅ Variables dynamiques
- ✅ Export/Import natif

---

## 🚀 Cas d'Usage

### 1. Ordonnance avec Logo
```
┌─────────────────────────────────┐
│  [LOGO]              [NOM]      │ ← Image + Texte libre
│                                 │
│  Patient: {{patient.nom}}       │ ← Variable
│  Date: {{acte.date}}            │ ← Variable
│                                 │
│  [Prescription en texte libre]  │ ← Texte multiligne
│                                 │
│  ________________               │ ← Forme (ligne)
│  Dr. {{docteur.nom}}            │ ← Variable
└─────────────────────────────────┘
```

### 2. Certificat avec Cadre Décoratif
```
┌─────────────────────────────────┐
│ ╔═══════════════════════════╗  │ ← Rectangle décoratif
│ ║   CERTIFICAT MÉDICAL      ║  │ ← Texte centré
│ ╚═══════════════════════════╝  │
│                                 │
│  [Contenu libre...]             │ ← Textes positionnés
│                                 │
│  [Cachet]    [Signature]        │ ← Images côte à côte
└─────────────────────────────────┘
```

### 3. Rapport avec Graphiques
```
┌─────────────────────────────────┐
│  RAPPORT STATISTIQUE            │ ← Texte titre
│  [Graphique PNG]                │ ← Image
│  [Texte analyse]  [Valeurs]     │ ← Colonnes libres
│                                 │
│  {{tableau variables}}          │ ← À implémenter
└─────────────────────────────────┘
```

---

## 🔮 Fonctionnalités à Ajouter

### Priorité Haute
1. ⏳ **Redimensionnement visuel** : Poignées aux coins
2. ⏳ **Sélection multiple** : Shift+Clic
3. ⏳ **Alignement automatique** : Guides magnétiques
4. ⏳ **Groupement** : Groupe d'éléments
5. ⏳ **Ordre Z via UI** : Monter/Descendre dans calques

### Priorité Moyenne
6. ⏳ **Texte multiligne** : Textarea au lieu de prompt
7. ⏳ **Copier/Coller** : Ctrl+C / Ctrl+V
8. ⏳ **Annuler/Rétablir** : Historique des actions
9. ⏳ **Grille magnétique** : Snap to grid
10. ⏳ **Règles graduées** : En haut et à gauche

### Priorité Basse
11. ⏳ **Formes avancées** : Lignes, flèches, polygones
12. ⏳ **Tableaux graphiques** : Grille de cellules
13. ⏳ **Gradients** : Dégradés de couleurs
14. ⏳ **Ombres portées** : Box-shadow personnalisable
15. ⏳ **Templates** : Modèles pré-faits

---

## 🎓 Guide Rapide

### Pour commencer :
1. Cliquez sur **"📝 Texte"** pour ajouter du texte
2. Déplacez-le où vous voulez sur la page
3. Modifiez les propriétés dans le panneau de droite
4. Double-cliquez pour changer le contenu

### Pour une ordonnance :
1. Ajoutez une **image** (logo cabinet) en haut
2. Ajoutez des **variables** patient
3. Ajoutez du **texte libre** pour la prescription
4. Ajoutez une **forme** (ligne) pour la signature
5. Ajoutez des **variables** docteur en bas
6. **Imprimez** !

### Pour sauvegarder :
1. Cliquez sur **"💾 Sauvegarder"**
2. Fichier `.json` téléchargé
3. Pour rouvrir : **"📂 Ouvrir"** + sélectionnez le fichier

---

## 🔗 Accès

**URL de test** :
```
http://localhost:3000/etats-test/{userId}/{tabId}/{pays}
```

**Exemple** :
```
http://localhost:3000/etats-test/123/456/SN
```

---

## 💡 Philosophie de Design

### Inspiration
- **Canva** : Simplicité et intuitivité
- **Illustrator** : Positionnement précis
- **Word (mode dessin)** : Familier pour les utilisateurs
- **PowerPoint** : Manipulation d'objets

### Objectifs
- 🎯 **Zéro apprentissage** : Drag & drop naturel
- 🎯 **Liberté créative** : Aucune contrainte
- 🎯 **Précision** : Positionnement au pixel près
- 🎯 **Rapidité** : Templates + variables = documents en 2min

---

## 🧪 Test Recommandés

1. ✅ Ajouter 5 éléments de types différents
2. ✅ Les déplacer partout sur la page
3. ✅ Modifier leurs propriétés
4. ✅ Les faire pivoter
5. ✅ Sauvegarder le document
6. ✅ Recharger la page
7. ✅ Importer le document
8. ✅ Vérifier que tout est resté en place

---

**Prêt à révolutionner la création de documents médicaux !** 🚀✨

**LoggyStudio - Innovation Continue** 🦷💙

