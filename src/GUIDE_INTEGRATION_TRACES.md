# Guide d'intégration du système de traçabilité

## 📖 Introduction

Le système de traçabilité permet de conserver un historique de toutes les actions effectuées dans l'application (création, modification, suppression d'entités).

## 🎯 Comment ajouter une trace

### 1. Importer le helper

```typescript
import { creerTrace } from '../controllers/TraceController';
```

### 2. Appeler la fonction après une action réussie

```typescript
// Exemple : Après la création d'un acte
await PagePatientDetailController(pays).ajouterUnActe(mode, newActe, modeFileName);

// Ajouter la trace
await creerTrace(
    'create',                    // Action: 'create', 'update', ou 'delete'
    'acte',                      // Type d'entité
    selectionActe,               // Nom de l'entité
    newActe.acte.id,            // ID de l'entité
    userId,                      // ID de l'utilisateur
    "Dr. Nom Prénom",           // Nom de l'utilisateur
    "docteur",                   // Rôle de l'utilisateur
    tabId,                       // ID du cabinet/docteur
    tabId,                       // tabId
    pays,                        // Pays
    `Acte créé pour le patient ${thePatient.nom}` // Détails optionnels
);
```

## 📋 Exemples d'intégration

### Création d'un acte (FormGerrerActe.tsx)

```typescript
// Après l'appel réussi
await PagePatientDetailController(pays).ajouterUnActe(mode, newFullActe, modeFileName);

// Ajouter la trace
await creerTrace(
    'create',
    'acte',
    selectionActe,
    newFullActe.acte.id,
    userId ?? "",
    docteurNom, // À récupérer depuis le contexte ou l'état
    "docteur",
    tabId ?? "",
    tabId ?? "",
    pays,
    `Prix: ${prixActe} FCFA - Patient: ${thePatient?.nom} ${thePatient?.prenom}`
);
```

### Modification d'un acte (PayementDetail.tsx)

```typescript
// Après la modification réussie
await PagePatientDetailController(pays).modifierUnActe(mode, updatedActe, modeFileName);

// Ajouter la trace
await creerTrace(
    'update',
    'acte',
    acteAssuranceFacture.acte.nom,
    acteAssuranceFacture.acte.id,
    userId ?? "",
    docteurNom,
    "docteur",
    tabId ?? "",
    tabId ?? "",
    pays,
    `Modification paiement - Nouveau montant: ${montantDejaPayer} FCFA`
);
```

### Suppression d'un acte

```typescript
// Après la suppression réussie
await PagePatientDetailController(pays).supprimerActe(mode, patientId, acteId, loggId, tabId, modeFileName);

// Ajouter la trace
await creerTrace(
    'delete',
    'acte',
    nomActe,
    acteId,
    userId ?? "",
    docteurNom,
    "docteur",
    tabId ?? "",
    tabId ?? "",
    pays
);
```

### Création d'un patient (Modal.tsx)

```typescript
// Après la création réussie
await PagePatientController(pays).ajouterUnPatient(mode, newPatient, modeFileName);

// Ajouter la trace
await creerTrace(
    'create',
    'patient',
    `${nom} ${prenom}`,
    newPatient.id,
    userId ?? "",
    docteurNom,
    "docteur",
    tabId ?? "",
    tabId ?? "",
    pays,
    `Téléphone: ${telephone} - Email: ${login}`
);
```

### Création d'un type d'acte (GerrerNomActes.tsx)

```typescript
// Après la création réussie
await PageParametreController(pays).ajouterUnNomActe(mode, newNomActe, modeFileName);

// Ajouter la trace
await creerTrace(
    'create',
    'nomActe',
    nom,
    newNomActe.id,
    userId ?? "",
    docteurNom,
    "docteur",
    tabId ?? "",
    tabId ?? "",
    pays,
    `Prix par défaut: ${prix} FCFA`
);
```

### Création d'un type d'assurance (GerrerNomAssurance.tsx)

```typescript
// Après la création réussie
await PageParametreController(pays).ajouterUnNomAssurance(mode, newNomAssurance, modeFileName);

// Ajouter la trace
await creerTrace(
    'create',
    'nomAssurance',
    nom,
    newNomAssurance.id,
    userId ?? "",
    docteurNom,
    "docteur",
    tabId ?? "",
    tabId ?? "",
    pays,
    `Pourcentage: ${pourcentage}%`
);
```

## 🗂️ Types d'entités disponibles

- `acte` - Acte médical
- `patient` - Patient
- `assurance` - Assurance d'un acte
- `nomActe` - Type d'acte
- `nomAssurance` - Type d'assurance
- `secretaire` - Secrétaire
- `assistant` - Assistant
- `comptable` - Comptable

## 🔑 Récupérer les informations utilisateur

Pour obtenir le nom et le rôle de l'utilisateur, vous pouvez :

1. Les récupérer depuis un contexte global
2. Les passer en props depuis le composant parent
3. Les récupérer via un appel API si nécessaire

## ⚠️ Points importants

1. Les traces sont ajoutées **après** l'action réussie
2. Les échecs de traçabilité **ne bloquent pas** l'action principale
3. Les traces sont stockées dans `dblaAdmin` (base de données administrative)
4. Limite recommandée : 200 traces affichées maximum
5. Les vieilles traces peuvent être supprimées automatiquement (fonction `supprimerAnciennes`)

## 🔧 API Backend disponible

- `POST /api/trace` - Ajouter une trace
- `GET /api/trace/:tabId/:pays/:limit` - Lister toutes les traces
- `GET /api/trace/loggId/:loggId/:tabId/:pays/:limit` - Lister par docteur

## 📊 Structure d'une trace

```typescript
interface Trace {
    id: string;                    // Timestamp unique
    action: 'create' | 'update' | 'delete';
    type_entite: string;           // Type d'entité
    nom_entite: string;            // Nom/titre de l'entité
    id_entite: string;             // ID de l'entité
    date_action: Date | string;    // Date de l'action
    user_id: string;               // ID de l'utilisateur
    user_nom: string;              // Nom de l'utilisateur
    user_role: string;             // Rôle de l'utilisateur
    details?: string;              // Détails optionnels
    logg_id: string;               // ID du cabinet/docteur
}
```

## 🚀 Accéder à l'historique

L'historique des actions est accessible depuis la navigation principale :
**Autres Pages → 📜 Historique des actions**

