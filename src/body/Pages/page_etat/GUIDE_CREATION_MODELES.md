# 📘 Guide Complet - Création Manuelle de Modèles

Ce guide explique comment reproduire manuellement tout ce que font les modèles automatiques, pour créer vos propres documents personnalisés.

---

## 🎯 Objectif

Les **modèles automatiques** (Ordonnance, Devis, Certificat) insèrent plusieurs éléments positionnés sur le canvas. Vous pouvez créer les mêmes résultats manuellement en suivant ce guide.

---

## 🛠️ Outils Disponibles

### **Barre d'outils principale** :

1. **📝 Texte** - Ajoute un bloc de texte éditable
2. **🖼️ Image** - Insère une image depuis votre ordinateur
3. **⬜ Rectangle** - Crée un rectangle (bordures, lignes, arrière-plans)
4. **⭕ Cercle** - Crée un cercle/ovale
5. **📊 Variables** - Insère des variables dynamiques (patient, acte, docteur, cabinet)

### **Actions sur éléments** :

- **Copier** - Duplique l'élément sélectionné
- **Supprimer** - Supprime l'élément
- **↑ Monter / ↓ Descendre** - Gère l'ordre d'empilement (z-index)

### **Propriétés modifiables** (sidebar gauche) :

- **Position** : X, Y (coordonnées)
- **Taille** : Largeur, Hauteur
- **Rotation** : Angle en degrés
- **Texte** : Police, Taille, Couleur, Gras, Italique, Souligné, Alignement
- **Apparence** : Fond, Bordure, Épaisseur, Arrondi

---

## 📋 Exemple 1 : Créer une Ordonnance Manuellement

### **Étape 1 : En-tête avec titre**

1. Cliquez sur **📝 Texte**
2. Double-cliquez sur le texte → Tapez `ORDONNANCE DENTAIRE`
3. Dans **Propriétés** (gauche) :
   - Position : X = 50, Y = 40
   - Taille : Largeur = 694, Hauteur = 50
   - Texte : Police = Georgia, Taille = 24
   - Cliquez sur **Gras**
   - Alignement : Centre
   - Apparence : Fond = Transparent, Bordure = 0

---

### **Étape 2 : Ligne de séparation**

1. Cliquez sur **⬜ Rectangle**
2. Dans **Propriétés** :
   - Position : X = 50, Y = 100
   - Taille : Largeur = 694, Hauteur = 3
   - Apparence : Fond = #3498db (bleu), Bordure = 0

---

### **Étape 3 : Titre de section "PATIENT"**

1. Cliquez sur **📝 Texte**
2. Double-cliquez → Tapez `PATIENT`
3. Dans **Propriétés** :
   - Position : X = 50, Y = 130
   - Taille : Largeur = 200, Hauteur = 25
   - Texte : Taille = 14, Couleur = #3498db (bleu)
   - Cliquez sur **Gras**
   - Apparence : Fond = Transparent, Bordure = 0

---

### **Étape 4 : Label "Nom :"**

1. Cliquez sur **📝 Texte**
2. Double-cliquez → Tapez `Nom : `
3. Dans **Propriétés** :
   - Position : X = 50, Y = 165
   - Taille : Largeur = 50, Hauteur = 20
   - Texte : Taille = 12
   - Cliquez sur **Gras**
   - Apparence : Fond = Transparent, Bordure = 0

---

### **Étape 5 : Variable nom patient**

1. Ouvrez **📊 Données** (sidebar droite)
2. Section **👤 Patient** → Cliquez sur `{{patient.nom}}`
3. L'élément apparaît sur le canvas
4. Déplacez-le à côté du label "Nom :"
5. Dans **Propriétés** ajustez :
   - Position : X = 100, Y = 165
   - Pour rendre transparent : Fond = Transparent, Bordure = 0

---

### **Étape 6 : Variable prénom patient**

1. Cliquez sur `{{patient.prenom}}`
2. Dans **Propriétés** :
   - Position : X = 310, Y = 165
   - Fond = Transparent, Bordure = 0

---

### **Répétez pour les autres champs** :

- Date de naissance : Label + Variable `{{patient.naissance}}`
- Adresse : Label + Variable `{{patient.adresse}}`
- Acte : Label + Variable `{{acte.nom}}`
- Date : Label + Variable `{{acte.date}}`

---

### **Étape 7 : Zone de prescription**

1. Cliquez sur **📝 Texte**
2. Double-cliquez → Collez le texte des médicaments
3. Dans **Propriétés** :
   - Position : X = 50, Y = 435
   - Taille : Largeur = 694, Hauteur = 200
   - Texte : Taille = 12
   - Apparence : 
     - Fond = #f8f9fa (gris très clair)
     - Bordure = #dee2e6 (gris)
     - Épaisseur bordure = 1

---

### **Étape 8 : Signature**

1. **Label "Dr."** : Texte à X=50, Y=950
2. **Variable nom** : `{{docteur.nom}}` à X=85, Y=950
3. **Variable prénom** : `{{docteur.prenom}}` à X=220, Y=950
4. **Ligne signature** : Texte `Signature : _________` à Y=980

---

## 📐 Exemple 2 : Créer un Tableau (Devis)

### **En-tête de tableau** :

1. **Rectangle pour fond** :
   - Créez un rectangle : X=50, Y=305, Largeur=400, Hauteur=25
   - Fond = #ecf0f1, Bordure = #bdc3c7, Épaisseur = 1

2. **Texte "Désignation"** :
   - Créez un texte par-dessus : X=60, Y=310, Hauteur=20
   - Taille = 11, Gras
   - Fond = Transparent

3. **Rectangle colonne 2** :
   - X=450, Y=305, Largeur=294, Hauteur=25
   - Même style

4. **Texte "Montant (FCFA)"** :
   - X=450, Y=310
   - Alignement = Centre

### **Ligne de données** :

1. Rectangle fond : X=50, Y=330, Largeur=400, Hauteur=30
2. Variable `{{acte.nom}}` positionnée dessus
3. Rectangle colonne prix : X=450, Y=330, Largeur=294, Hauteur=30
4. Variable `{{acte.prix}}` centrée, couleur verte, gras

---

## 🎨 Exemple 3 : Bordure Décorative (Certificat)

### **Créer une double bordure** :

1. **Bordure extérieure** :
   - Rectangle : X=30, Y=30, Largeur=734, Hauteur=1063
   - Fond = Transparent
   - Bordure = #3498db (bleu)
   - Épaisseur = 3

2. **Bordure intérieure** :
   - Rectangle : X=40, Y=40, Largeur=714, Hauteur=1043
   - Fond = Transparent
   - Bordure = #3498db
   - Épaisseur = 1

3. **Tous les autres éléments** vont entre les deux bordures (X entre 50 et 720)

---

## 💡 Astuces Professionnelles

### **1. Alignement précis**

- Utilisez la **grille** (activée par défaut)
- Espacement de 20px = grille
- Pour aligner plusieurs éléments : utilisez les mêmes valeurs X ou Y

### **2. Hiérarchie visuelle**

**Titres** :
- Taille : 18-24px
- Police : Georgia (serif) pour formel, Arial pour moderne
- Couleur : Primaire (#3498db) ou Noir (#2c3e50)
- Gras : Oui

**Sous-titres** :
- Taille : 13-14px
- Couleur : Bleu (#3498db)
- Gras : Oui

**Corps de texte** :
- Taille : 11-12px
- Couleur : Noir (#2c3e50)

**Notes/Mentions** :
- Taille : 9-11px
- Couleur : Gris (#7f8c8d)
- Italique : Oui

---

### **3. Espacement**

- **Marges** : 50px des bords (X=50 pour gauche, X=750 max pour droite)
- **Entre sections** : 40-60px vertical
- **Entre lignes** : 25-30px
- **Dans un bloc** : 10-15px

---

### **4. Couleurs professionnelles**

| Usage | Couleur | Code |
|-------|---------|------|
| Titres primaires | Bleu foncé | #2c3e50 |
| Accents | Bleu clair | #3498db |
| Succès/Montants | Vert | #27ae60 |
| Avertissements | Orange | #f39c12 |
| Erreurs | Rouge | #e74c3c |
| Texte secondaire | Gris | #7f8c8d |
| Fonds clairs | Gris très clair | #f8f9fa / #ecf0f1 |
| Bordures | Gris moyen | #bdc3c7 / #dee2e6 |

---

### **5. Encadrés et blocs**

**Bloc d'information (ex: Patient)** :
1. Rectangle : Fond = #ecf0f1, Bordure = #3498db, Épaisseur = 2
2. Textes et variables positionnés à l'intérieur (padding 15px)

**Bloc d'alerte (ex: Notes)** :
1. Rectangle : Fond = #fef9e7 (jaune clair), Bordure = #f39c12
2. Texte en italique à l'intérieur

---

### **6. Positionnement des signatures**

**Signature en bas à droite** :
- Y = 950-1000 (zone basse de la page A4)
- X = 450-650 (moitié droite)

**Signature centrée** :
- X = 250-550
- Y = 950-1000

**Avec date et lieu** :
- "Fait à [ville]" : Y = 900
- "Le : [date]" : Y = 925
- "Dr. [nom]" : Y = 970
- "Signature" : Y = 1000

---

## 🔄 Workflow Recommandé

### **Pour créer un nouveau document** :

1. **Planifiez la structure** :
   - En-tête (titre, logo)
   - Sections (patient, acte, prescription, etc.)
   - Pied de page (signature, date)

2. **Commencez par les bordures/formes** :
   - Rectangles de fond
   - Lignes de séparation
   - Cadres

3. **Ajoutez les titres** :
   - Titre principal
   - Titres de sections

4. **Remplissez le contenu** :
   - Labels (en gras)
   - Variables (transparentes)
   - Textes fixes

5. **Ajustez les z-index** :
   - Bordures/fonds en arrière-plan (z faible)
   - Texte/variables au premier plan (z élevé)

6. **Affinez les positions** :
   - Utilisez la grille
   - Alignez avec précision

---

## 📏 Dimensions de Référence

**Page A4** :
- Largeur : 794px
- Hauteur : 1123px

**Marges recommandées** :
- Haut : 30-50px
- Bas : 30-50px
- Gauche : 50px
- Droite : 50px

**Zone de contenu** :
- X : 50 à 744 (694px de largeur)
- Y : 40 à 1073

---

## 🎨 Templates de Composants Réutilisables

### **1. En-tête avec ligne**

```
Élément 1 : Texte "TITRE DU DOCUMENT"
- X=50, Y=40, Largeur=694, Hauteur=50
- Police=Georgia, Taille=24, Gras, Centré
- Fond=Transparent

Élément 2 : Rectangle (ligne)
- X=50, Y=100, Largeur=694, Hauteur=3
- Fond=#3498db, Bordure=0
```

### **2. Titre de section**

```
Élément : Texte "NOM DE LA SECTION"
- Largeur=200-300, Hauteur=25
- Taille=14, Couleur=#3498db, Gras
- Fond=Transparent
```

### **3. Paire Label + Variable**

```
Élément 1 : Texte "Label : "
- Hauteur=20, Taille=12, Gras
- Fond=Transparent

Élément 2 : Variable {{xxx}}
- Même Y que le label
- X = X du label + 50 à 100px
- Fond=Transparent, Bordure=0
```

### **4. Encadré coloré**

```
Élément 1 : Rectangle
- Largeur=694, Hauteur=100-150
- Fond=#ecf0f1, Bordure=#3498db, Épaisseur=2

Éléments 2-X : Textes/Variables à l'intérieur
- X = X du rectangle + 15px (padding)
- Y = Y du rectangle + 15px
```

### **5. Tableau simple**

**Header** :
```
Rectangle : Fond=#ecf0f1, Bordure=1
Texte par-dessus : Gras, Centré
```

**Cellules** :
```
Rectangle : Fond=#ffffff, Bordure=1
Variable par-dessus : Centrée
```

### **6. Signature formelle**

```
1. Texte "Fait à [ville]," - Y=900
2. Texte "Le : " + Variable {{date}} - Y=925
3. Texte "Dr. " + Variable {{nom}} + Variable {{prénom}} - Y=970
4. Texte "Signature : ___________" - Y=1000, Italique, Gris
```

---

## 🎓 Tutoriel Complet : Créer un Devis

### **Étape par étape - Devis professionnel**

#### **A. En-tête (Y: 40-120)**

1. **Logo/Nom cabinet** (gauche) :
   - Variable `{{cabinet.nom}}` : X=50, Y=40, Largeur=300, Hauteur=30
   - Taille=18, Gras, Georgia

2. **Adresse cabinet** :
   - Variable `{{cabinet.adresse}}` : X=50, Y=75, Largeur=300, Hauteur=15
   - Taille=10, Couleur=#7f8c8d

3. **Téléphone cabinet** :
   - Variable `{{cabinet.telephone}}` : X=50, Y=95
   - Même style que adresse

4. **Bloc "DEVIS"** (droite) :
   - Texte : X=450, Y=40, Largeur=294, Hauteur=60
   - Contenu : `DEVIS DE SOINS`
   - Taille=22, Gras, Centré
   - Fond=#27ae60 (vert), Texte=blanc

5. **Date** :
   - Texte "Date : " : X=450, Y=110
   - Variable `{{acte.date}}` : X=500, Y=110

#### **B. Ligne séparatrice (Y: 150)**

- Rectangle : X=50, Y=150, Largeur=694, Hauteur=2
- Fond=#bdc3c7

#### **C. Section Patient (Y: 180-240)**

1. **Barre de titre** :
   - Rectangle : X=50, Y=180, Largeur=694, Hauteur=25
   - Fond=#34495e (gris foncé)
   
2. **Texte sur la barre** :
   - Texte "INFORMATIONS PATIENT" : X=60, Y=185
   - Couleur=blanc, Gras

3. **Ligne info** :
   - Texte "Nom : " : X=60, Y=215
   - Variable `{{patient.nom}} {{patient.prenom}}` : X=140, Y=215
   - Texte "Tél : " : X=400, Y=215
   - Variable `{{patient.telephone}}` : X=440, Y=215

#### **D. Section Traitement (Y: 270-400)**

1. **Barre de titre** :
   - Rectangle : X=50, Y=270, Largeur=694, Hauteur=25
   - Fond=#34495e, Texte blanc "TRAITEMENT PROPOSÉ"

2. **Tableau - Header** :
   - Rectangle 1 : X=50, Y=305, Largeur=400, Hauteur=25
   - Texte "Désignation" par-dessus : Gras, Fond=#ecf0f1
   
   - Rectangle 2 : X=450, Y=305, Largeur=294, Hauteur=25
   - Texte "Montant (FCFA)" par-dessus : Centré, Gras

3. **Tableau - Ligne acte** :
   - Rectangle : X=50, Y=330, Largeur=400, Hauteur=30, Bordure=1
   - Variable `{{acte.nom}}` par-dessus
   
   - Rectangle : X=450, Y=330, Largeur=294, Hauteur=30, Bordure=1
   - Variable `{{acte.prix}}` : Vert, Gras, Centré

4. **Total** :
   - Rectangle "TOTAL :" : X=450, Y=370, Largeur=200, Hauteur=30
   - Fond=#e8f5e9, Bordure=#27ae60 (épaisseur 2), Texte gras
   
   - Rectangle prix : X=650, Y=370, Largeur=94, Hauteur=30
   - Variable `{{acte.prix}}` : Vert, Gras, Centré

#### **E. Notes (Y: 430)**

- Rectangle : X=50, Y=430, Largeur=694, Hauteur=80
- Fond=#fef9e7 (jaune), Bordure=#f39c12
- Texte multi-lignes en italique, Taille=10

#### **F. Signature (Y: 950-1000)**

- Même structure que l'ordonnance

---

## 🔑 Raccourcis Clavier

- **Suppr** : Supprimer l'élément sélectionné
- **Ctrl + D** : Dupliquer
- **Ctrl + S** : Sauvegarder
- **Échap** : Désélectionner

---

## 💾 Sauvegarder votre Modèle Personnalisé

1. Créez votre document manuellement
2. Cliquez sur **💾 Sauvegarder** (barre d'outils)
3. Le fichier JSON contient tous les éléments
4. Vous pouvez le réimporter avec **📂 Ouvrir**

---

## ✨ Conseils Avancés

### **Superposition d'éléments** :

- Rectangle de fond → Z index faible
- Texte/Variables → Z index élevé
- Utilisez **↑ Monter** / **↓ Descendre** dans les calques

### **Copier-coller efficace** :

1. Créez un élément parfait (ex: ligne patient)
2. **Dupliquez-le** (Ctrl+D)
3. Ajustez juste la position Y (+30px)
4. Modifiez le contenu

### **Variables transparentes** :

Pour un rendu propre en mode Aperçu :
- Fond = Transparent
- Bordure = Transparent ou 0

### **Zones de texte long** :

- Augmentez la hauteur (200-400px)
- Le texte scrollera automatiquement
- `overflow: auto` est géré automatiquement

---

## 📊 Récapitulatif

| Élément | Usage | Position typique |
|---------|-------|------------------|
| Titre principal | En-tête document | Y=40-80, Centré |
| Logo/Cabinet | Identification | X=50, Y=40 (gauche) |
| Lignes séparation | Structurer | Largeur=694, Hauteur=2-3 |
| Titres section | Organiser | Y espacé de 50-80px |
| Labels | Identifier champs | Largeur=80-150, Gras |
| Variables | Données dynamiques | Après labels, Transparent |
| Tableaux | Données structurées | Rectangles + Textes superposés |
| Signature | Validation | Y=950-1000, Droite ou Centre |
| Bordures | Décoration | Transparent, Bordure colorée |

---

## 🎯 Conclusion

Vous pouvez maintenant :
✅ Créer n'importe quel document professionnel
✅ Personnaliser complètement la mise en page
✅ Comprendre la structure des modèles automatiques
✅ Construire vos propres templates

**Bonne création !** 🚀

