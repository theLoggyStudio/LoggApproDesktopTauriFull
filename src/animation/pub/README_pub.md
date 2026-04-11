# Publicité LoggAppro (`src/animation/pub`)

## Lancer

```bash
npm run pub
```

## Contenu des diapositives

1. **Ouverture** — splash LoggAppro (logo **`src/assets/logo.png`**, pas le SVG).
2. **Une diapositive par fichier** dans **`src/assets/apkImg`**, tri **alphabétique** (ordre naturel : `01.png`, `02.png`, … `mobile01.jpeg`, …).
3. **Clôture** — même splash que l’ouverture (mode fin).

Les anciennes maquettes HTML dans le cadre jaune ne sont plus utilisées : chaque capture occupe le cadre jaune.

## Durée d’affichage

Réglée dans **`config/pub.config.ts`** → objet **`slideTiming`** :

- `targetTotalMs` : durée globale visée pour toute la séquence.
- `splashOpeningMs` / `splashEndingMs` : intro et outro.
- Le temps **par image** ≈ `(targetTotalMs − intro − outro) ÷ nombre de fichiers`, entre **`perImageMinMs`** et **`perImageMaxMs`**.

Ajouter ou retirer des fichiers dans `apkImg` change automatiquement le nombre de diapositives et recalcule la durée par slide.

## Animations dans le cadre (anti-monotonie)

Chaque capture se voit attribuer un **lot** parmi **6** variantes CSS (`zoom`, `pan X/Y`, `respiration`, type Ken Burns, pulse légère).  
Le lot dépend de l’**index** de l’image et du **nombre total** d’images (répartition variée, stable pour une même liste).

Constante **`SLIDE_ANIM_LOT_COUNT`** et classes `.pub-img-slide__viewport--lot-*` dans **`PubAnimation.css`**.

## Textes au-dessus du cadre

- **Intro / fin** : pas de bandeau marketing (texte dans le splash).
- **Captures** : rotation des entrées de **`marketingRotationForImageSlides`** → textes détaillés dans **`marketingCopy`**.

## Modifier couleurs et transitions

- Couleurs : **`colors`** dans `pub.config.ts`.
- Fondu entre diapos : **`PUB_TRANSITION_MS`**.

## Point d’entrée

Racine du projet : **`pub.html`**.
