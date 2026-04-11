export interface Patient {
  id?: "" | string,
  photo?: "" | Photo,
  nom?: "" | string,
  prenom?: "" | string,
  login?: "" | string,
  password?: "" | string,
  telephone?: "" | string,
  naissance?: "" | string,
  role?: "" | string,
  privileges?: ["selfInfo"] | Privilege[],
  adresse?: "" | string,
  nomDeJeuneFille?: "" | string,
  profession?: "" | string,
  adresserPar?: "" | string,
  observation?: "" | string,
  dateCreation?: Date,
  loggId?: "" | string,
  limit?: 100 | number
}

export const emptyPatient: Patient = {
  id: "",
  photo: { id: "", part1: "", part2: "", part3: "", part4: "", part5: "", part6: "", part7: "", part8: "", part9: "", part10: "", loggId: "", dateCreation: new Date(), limit: 100 },
  nom: "",
  prenom: "",
  login: "",
  password: "1234",
  telephone: "",
  naissance: "",
  role: "",
  privileges: ["selfInfo"],
  adresse: "",
  nomDeJeuneFille: "",
  profession: "",
  adresserPar: "",
  observation: "",
  dateCreation: new Date(),
  loggId: "",
  limit: 100
};

export interface Secretaire {
  id?: "" | string,
  nom?: "" | string,
  photo?: "" | Photo,
  prenom?: "" | string,
  login?: "" | string,
  password?: "" | string,
  telephone?: "" | string,
  naissance?: "" | string,
  role?: "" | string,
  privileges?: ["selfInfo", "voirActe"] | Privilege[],
  dateCreation?: Date,
  adresse?: "" | string,
  loggId?: "" | string,
  limit?: 100 | number
}

export const emptySecretaire: Secretaire = {
  id: "",
  nom: "",
  photo: { id: "", part1: "", part2: "", part3: "", part4: "", part5: "", part6: "", part7: "", part8: "", part9: "", part10: "", loggId: "", dateCreation: new Date(), limit: 100 },
  prenom: "",
  login: "",
  password: "1234",
  telephone: "",
  naissance: "",
  role: "",
  privileges: ["selfInfo", "voirActe"],
  dateCreation: new Date(),
  adresse: "",
  loggId: "",
  limit: 100
};

export interface Comptable {
  id?: "" | string,
  nom?: "" | string,
  photo?: "" | Photo,
  prenom?: "" | string,
  login?: "" | string,
  password?: "" | string,
  telephone?: "" | string,
  naissance?: "" | string,
  role?: "" | string,
  privileges?: ["selfInfo", "statistique", "impression", "voirPatient", "voirActe"] | Privilege[],
  dateCreation?: Date,
  adresse?: "" | string,
  loggId?: "" | string,
  limit?: 100 | number
}

export const emptyComptable: Comptable = {
  id: "",
  nom: "",
  photo: { id: "", part1: "", part2: "", part3: "", part4: "", part5: "", part6: "", part7: "", part8: "", part9: "", part10: "", loggId: "", dateCreation: new Date(), limit: 100 },
  prenom: "",
  login: "",
  password: "1234",
  telephone: "",
  naissance: "",
  role: "",
  privileges: ["selfInfo", "statistique", "impression", "voirPatient", "voirActe"],
  dateCreation: new Date(),
  adresse: "",
  loggId: "",
  limit: 100
};

export interface Docteur {
  id?: "" | string,
  photo?: "" | Photo,
  nom?: "" | string,
  prenom?: "" | string,
  login?: "" | string,
  password?: "" | string,
  telephone?: "" | string,
  naissance?: "" | string,
  role?: "" | string,
  privileges?: ["selfInfo", "crudPatient", "crudActe", "crudNomActe", "crudNomAssurance", "statistique", "impression", "voirPatient", "voirActe", "voirNomActe", "voirNomAssurance", "voirAction"] | Privilege[],
  dateCreation?: Date,
  adresse?: "" | string,
  loggId?: "" | string,
  limit?: 100 | number
}

export const emptyDocteur: Docteur = {
  id: "",
  photo: { id: "", part1: "", part2: "", part3: "", part4: "", part5: "", part6: "", part7: "", part8: "", part9: "", part10: "", loggId: "", dateCreation: new Date(), limit: 100 },
  nom: "",
  prenom: "",
  login: "",
  password: "1234",
  telephone: "",
  naissance: "",
  role: "",
  privileges: ["selfInfo", "crudPatient", "crudActe", "crudNomActe", "crudNomAssurance", "statistique", "impression", "voirPatient", "voirActe", "voirNomActe", "voirNomAssurance", "voirAction"],
  dateCreation: new Date(),
  adresse: "",
  loggId: "",
  limit: 100
};

export interface TypeCollaborateur {
  id?: "" | string,
  nom?: "" | string,
  rolesParDefaut?: "" | string,
  dateCreation?: Date | string
}

export const emptyTypeCollaborateur: TypeCollaborateur = {
  id: "",
  nom: "",
  rolesParDefaut: "",
  dateCreation: new Date()
};

export interface Collaborateur {
  id?: "" | string,
  typeId?: "" | string,
  nom?: "" | string,
  prenom?: "" | string,
  login?: "" | string,
  password?: "" | string,
  telephone?: "" | string,
  naissance?: "" | string,
  adresse?: "" | string,
  loggId?: "" | string,
  dateCreation?: Date
}

export const emptyCollaborateur: Collaborateur = {
  id: "",
  typeId: "",
  nom: "",
  prenom: "",
  login: "",
  password: "1234",
  telephone: "",
  naissance: "",
  adresse: "",
  loggId: "",
  dateCreation: new Date()
};

export interface Assistant {
  id?: "" | string,
  nom?: "" | string,
  photo?: "" | Photo,
  prenom?: "" | string,
  login?: "" | string,
  password?: "" | string,
  telephone?: "" | string,
  naissance?: "" | string,
  role?: "" | string,
  privileges?: ["selfInfo", "crudPatient", "crudActe", "crudNomActe", "crudNomAssurance", "statistique", "impression", "voirPatient", "voirActe", "voirNomActe", "voirNomAssurance"] | Privilege[],
  dateCreation?: Date,
  adresse?: "" | string,
  loggId?: "" | string,
  limit?: 100 | number
}

export const emptyAssistant: Assistant = {
  id: "",
  nom: "",
  photo: { id: "", part1: "", part2: "", part3: "", part4: "", part5: "", part6: "", part7: "", part8: "", part9: "", part10: "", loggId: "", dateCreation: new Date(), limit: 100 },
  prenom: "",
  login: "",
  password: "1234",
  telephone: "",
  naissance: "",
  role: "",
  privileges: ["selfInfo", "crudPatient", "crudActe", "crudNomActe", "crudNomAssurance", "statistique", "impression", "voirPatient", "voirActe", "voirNomActe", "voirNomAssurance"],
  dateCreation: new Date(),
  adresse: "",
  loggId: "",
  limit: 100
};

export interface User {
  id?: "" | string,
  photo?: "" | Photo,
  nom?: "" | string,
  prenom?: "" | string,
  login?: "" | string,
  password?: "" | string,
  telephone?: "" | string,
  naissance?: "" | string,
  role?: "" | string,
  privileges?: ["selfInfo", "voirPatient", "voirActe"] | Privilege[],
  dateCreation?: Date,
  loggId?: "" | string,
  limit?: 100 | number
}

export const emptyUser: User = {
  id: "",
  photo: { id: "", part1: "", part2: "", part3: "", part4: "", part5: "", part6: "", part7: "", part8: "", part9: "", part10: "", loggId: "", dateCreation: new Date(), limit: 100 },
  nom: "",
  prenom: "",
  login: "",
  password: "1234",
  telephone: "",
  naissance: "",
  role: "",
  privileges: ["selfInfo", "voirPatient", "voirActe"],
  dateCreation: new Date(),
  loggId: "",
  limit: 100
};

export interface Photo {
  id?: "" | string,
  part1?: "" | string,
  part2?: "" | string,
  part3?: "" | string,
  part4?: "" | string,
  part5?: "" | string,
  part6?: "" | string,
  part7?: "" | string,
  part8?: "" | string,
  part9?: "" | string,
  part10?: "" | string,
  loggId?: "" | string,
  dateCreation?: Date,
  limit?: 100 | number
}

export const emptyPhoto: Photo = {
  id: "",
  part1: "",
  part2: "",
  part3: "",
  part4: "",
  part5: "",
  part6: "",
  part7: "",
  part8: "",
  part9: "",
  part10: "",
  loggId: "",
  dateCreation: new Date(),
  limit: 100
};

export interface QRCode {
  id?: "" | string,
  part1?: "" | string,
  part2?: "" | string,
  part3?: "" | string,
  part4?: "" | string,
  part5?: "" | string,
  part6?: "" | string,
  part7?: "" | string,
  part8?: "" | string,
  part9?: "" | string,
  part10?: "" | string,
  loggId?: "" | string,
  dateCreation?: Date,
  limit?: 100 | number
}

export const emptyQRCode: QRCode = {
  id: "",
  part1: "",
  part2: "",
  part3: "",
  part4: "",
  part5: "",
  part6: "",
  part7: "",
  part8: "",
  part9: "",
  part10: "",
  
  loggId: "",
  dateCreation: new Date(),
  limit: 100
};

export interface Cabinet {
  id?: "" | string,
  nom?: "" | string,
  adresse?: "" | string,
  pays?: "" | string,
  passwordDefaut?: "" | string,
  dateCreation?: Date,
  limit?: 100 | number
}

export const emptyCabinet: Cabinet = {
  id: "",
  nom: "",
  adresse: "",
  pays: "",
  passwordDefaut: "1234",
  dateCreation: new Date(),
  limit: 100
};

export interface TypeAssurance {
  id?: 0 | number,
  nom?: "" | string,
  pourcentage?: 0 | number,
  dateCreation?: Date,
  limit?: 100 | number
}

export const emptyTypeAssurance: TypeAssurance = {
  id: 0,
  nom: "",
  pourcentage: 0,
  dateCreation: new Date(),
  limit: 100
};

export interface TypeActe {
  id?: 0 | number,
  nom?: "" | string,
  prix?: 0 | number,
  dateCreation?: Date,
  limit?: 100 | number
}

export const emptyTypeActe: TypeActe = {
  id: 0,
  nom: "",
  prix: 0,
  dateCreation: new Date(),
  limit: 100
};


export interface NomMateriel {
  id?: string | number,
  nom?: string,
  quantiteDefaut?: number,
  prixDefaut?: number,
  quantite_defaut?: number,
  prix_defaut?: number,
  loggId?: string,
  dateCreation?: Date,
  limit?: number
}

export const emptyNomMateriel: NomMateriel = {
  id: "",
  nom: "",
  quantiteDefaut: 0,
  prixDefaut: 0,
  loggId: "",
  dateCreation: new Date(),
  limit: 100
};

export interface Facture {
  id?: 0 | number,
  prixAct?: 0 | number,
  argentRecuActe?: 0 | number,
  argentRestantActe?: 0 | number,
  argentAssurance?: 0 | number,
  acteId?: 0 | number,
  dateCreation?: Date,
  loggId?: string,
  limit?: 100 | number
}

export const emptyFacture: Facture = {
  id: 0,
  prixAct: 0,
  argentRecuActe: 0,
  argentRestantActe: 0,
  argentAssurance: 0,
  acteId: 0,
  dateCreation: new Date(),
  loggId: "",
  limit: 100
};

export interface Assurance {
  id?: 0 | number,
  nom?: "" | string,
  pourcentage?: 0 | number,
  dateCreation?: Date,
  loggId?: string,
  limit?: 100 | number
}

export const emptyAssurance: Assurance = {
  id: 0,
  nom: "",
  pourcentage: 0,
  dateCreation: new Date(),
  loggId: "",
  limit: 100
};

export interface Acte {
  id?: "" | string,
  nom?: "" | string,
  description?: "" | string,
  date?: Date,
  prix?: 0 | number,
  argentRecu?: 0 | number,
  argentRestant?: 0 | number,
  isDone?: false,
  patientId?: 0 | number,
  dateCreation?: Date,
  loggId?: string,
  limit?: 100 | number
}

export const emptyActe: Acte = {
  id: "",
  nom: "",
  description: "",
  date: new Date(),
  prix: 0,
  argentRecu: 0,
  argentRestant: 0,
  isDone: false,
  patientId: 0,
  dateCreation: new Date(),
  loggId: "",
  limit: 100
};

export interface Privilege {
  id?: "" | string,
  loggId?: "" | string,
  nom?: "" | string,
}

export const emptyPrivilege: Privilege = {
  id: "",
  loggId: "",
  nom: ""
};
