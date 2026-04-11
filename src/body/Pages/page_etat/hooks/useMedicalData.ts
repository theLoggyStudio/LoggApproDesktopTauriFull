import { useState, useEffect, useMemo } from 'react';
import { DEFAULT_MEDICAL_DATA } from '../constants/medicalData';

export const useMedicalData = () => {
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [actes, setActes] = useState<any[]>([]);
  const [docteur, setDocteur] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [cabinet, setCabinet] = useState<any>(null);

  // Charger les données du cabinet et données de test au démarrage
  useEffect(() => {
    setCabinet(DEFAULT_MEDICAL_DATA.cabinet);

    // Données de test si aucun patient n'est sélectionné
    if (!selectedPatient) {
      setSelectedPatient(DEFAULT_MEDICAL_DATA.testPatient);
      setActes(DEFAULT_MEDICAL_DATA.testActes);
      setDocteur(DEFAULT_MEDICAL_DATA.testDocteur);
      setUser(DEFAULT_MEDICAL_DATA.testUser);
    }
  }, []);

  // Objet de données pour le rendu des variables
  const medicalDataContext = useMemo(() => ({
    patient: selectedPatient || {},
    actes: actes || [],
    acte: actes.length > 0 ? actes[0] : {},
    docteur: docteur || {},
    user: user || {},
    cabinet: cabinet || {}
  }), [selectedPatient, actes, docteur, user, cabinet]);

  return {
    selectedPatient,
    setSelectedPatient,
    actes,
    setActes,
    docteur,
    setDocteur,
    user,
    setUser,
    cabinet,
    setCabinet,
    medicalDataContext
  };
};

