import { format, parse } from "date-fns";
import { fr } from "date-fns/locale";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { PagePatientDetailController } from "../controllers/PagePatientDetailController.js";
import type { TypeActe, Acte, TypeAssurance, NomMateriel } from "../Entities/entities.js";
import { emptyActe, emptyAssurance, emptyFacture } from "../Entities/entities.js";
import ButtonAjouter from "./ButtonAjouter.js";
import PayementDetail from "./PayementDetail.js";
import { PageParametreController } from "../controllers/PageParametreController.js";
import { useAlert, useMode } from "../context/SearchContext.js";
import { useSession } from "../context/SessionContext.js";
import { checkPrivilege, checkPrivilegeExact } from "../helpers/helpers.js";
import { Table as Tables } from '../../items/Table.tsx';
import { themes } from "../../constants/index.ts";
import { useTheme } from '../context/ThemeContext.js';
import { Modal as ModalGlobal } from "../../items/Modal.tsx";
import ModalRadios from "./ModalRadios.js";
import { ModalField, ModalSection, ModalGrid, ModalActions } from './ModalFormComponents.js';
import { ImgController } from "../controllers/ImgController.js";
import imageCompression from 'browser-image-compression';
import { creerTrace } from "../controllers/TraceController.js";
import { PageProfilController } from "../controllers/PageProfilController.js";
import TaskController from "../controllers/TaskController.js";
import ModalPosologie from "./ModalPosologie.js";
import { PosologieController } from "../controllers/PosologieController.js";

/** Valeur pour `<input type="datetime-local">` (fuseau local, sans secondes). */
function toDatetimeLocalInputValue(d: Date = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseDatetimeLocalAsDate(value: string): Date | null {
    if (value == null || String(value).trim() === "") return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

export default function FormGerrerActe({ thePatient, allTypeActes, allActes, allTypeAssurances, setAllActes, privs, setReloadActe, setlimit, pays, docteurNom, patientId: patientIdProp }: any) {

    const { session } = useSession();
    const { userId, tabId } = session;
    const patientId = patientIdProp ?? session.patientId ?? "";

    const [selectionActe, setSelectionActe] = useState("non-definie");
    const [nomUtilisateur, setNomUtilisateur] = useState<string>(docteurNom || "");
    const [prixActe, setPrixActe] = useState('0');
    const [montantPayeActe, setMontantPayeActe] = useState('');
    const [dateActe, setDateActe] = useState(() => toDatetimeLocalInputValue());
    const [descriptionActe, setDescriptionActe] = useState('');

    const [typeActes, setTypeActes] = useState<TypeActe[]>(allTypeActes);
    const [, setActes] = useState<Acte[]>([]);
    const [typeAssurances, setTypeAssurances] = useState<TypeAssurance[]>(allTypeAssurances);

    const [theActeAssuranceFacture, setTheActeAssuranceFacture] = useState<any>();
    const [pourcentageNewAssurance, setPourcentageNewAssurance] = useState<any>("0");
    const [nomNewAssurance, setNomNewAssurance] = useState<any>("non-assuré");
    const [nomDuParametre, setNomDuParametre] = useState<string>("typeActe");
    const [show, setShow] = useState<boolean>(false);
    const { setAlertObj } = useAlert();
    const { mode, modeFileName } = useMode();
    const { themeNumber } = useTheme();
    
    // États pour le modal d'ajout d'acte/assurance
    const [typeActe, setTypeActe] = useState("");
    const [typeAssurance, setTypeAssurance] = useState("");
    const [pourcentage, setPourcentage] = useState("");
    
    // États pour les radios
    const [radios, setRadios] = useState<File[]>([]);
    const [showModalRadios, setShowModalRadios] = useState(false);
    const [selectedActeForRadios, setSelectedActeForRadios] = useState<any>(null);
    
    // État pour le modal du formulaire d'ajout d'acte
    const [showModalAjoutActe, setShowModalAjoutActe] = useState(false);
    const [showModalPosologie, setShowModalPosologie] = useState(false);
    const [posologieActeColors, setPosologieActeColors] = useState<Record<string, string>>({});
    
    // États pour les matériels médicaux
    const [allNomMateriels, setAllNomMateriels] = useState<NomMateriel[]>([]);
    const [selectedMateriels, setSelectedMateriels] = useState<Array<{ id: string, nom: string, quantite: number, prix_defaut?: number, quantite_defaut?: number }>>([]);
    const [showModalNouveauMateriel, setShowModalNouveauMateriel] = useState(false);
    const [nouveauMaterielNom, setNouveauMaterielNom] = useState("");
    const [nouveauMaterielPrix, setNouveauMaterielPrix] = useState(0);
    const [nouveauMaterielQuantite, setNouveauMaterielQuantite] = useState(0);


    // Pagination states
    const [currentPage, setCurrentPage] = useState(1);
    const actesPerPage = 10;  // Number of acts per page
    const indexOfLastActe = currentPage * actesPerPage;

    const posologieCtrl = useMemo(() => PosologieController(pays ?? ""), [pays]);

    /** Actes réels du patient (`tab_acte` / liste détail), pas les types `tab_nom_acte`. */
    const actesOptionsPosologie = useMemo(() => {
        if (!Array.isArray(allActes)) return [];
        const rows = allActes
            .map((pack: any) => {
                const acte = pack?.acte ?? pack;
                if (acte?.id == null || acte?.id === "") return null;
                return {
                    id: String(acte.id),
                    nom: String(acte.nom ?? ""),
                    date: acte.date != null && acte.date !== "" ? String(acte.date) : "",
                    description: acte.description != null ? String(acte.description) : "",
                };
            })
            .filter(Boolean) as Array<{ id: string; nom: string; date: string; description: string }>;
        return rows.sort((a, b) => {
            const ta = Date.parse(a.date) || 0;
            const tb = Date.parse(b.date) || 0;
            return tb - ta;
        });
    }, [allActes]);

    const patientLabelPosologie = useMemo(
        () => `${thePatient?.nom ?? ""} ${thePatient?.prenom ?? ""}`.trim() || "Patient",
        [thePatient?.nom, thePatient?.prenom]
    );

    /** Posologie : pos01 uniquement (sans dérogation act02 — comme PayementDetail réservé à act02). */
    const allowPosologieModal = useMemo(() => checkPrivilege("pos01", privs), [privs]);
    /** Ordonnance PDF : oso01 uniquement. */
    const allowOrdonnanceModal = useMemo(() => checkPrivilege("oso01", privs), [privs]);
    const showOrdonnancePosologieButton = allowPosologieModal || allowOrdonnanceModal;

    /** mat01/mat02 explicites (nma01 ≠ mat01 via checkPrivilege). */
    const allowMaterielsVoirActeExact = useMemo(() => checkPrivilegeExact("mat01", privs), [privs]);
    const allowMaterielsGererActeExact = useMemo(() => checkPrivilegeExact("mat02", privs), [privs]);
    const afficherSectionMaterielsAjoutActe = allowMaterielsVoirActeExact || allowMaterielsGererActeExact;

    const refreshPosologieColors = useCallback(async () => {
        if (!patientId || !pays) return;
        try {
            const map = await posologieCtrl.listActeColors(patientId);
            setPosologieActeColors(map && typeof map === "object" ? map : {});
        } catch {
            setPosologieActeColors({});
        }
    }, [patientId, pays, posologieCtrl]);

    useEffect(() => {
        void refreshPosologieColors();
    }, [refreshPosologieColors, allActes]);

    useEffect(() => {
        const onSaved = (ev: Event) => {
            const id = (ev as CustomEvent<{ patientId?: string }>).detail?.patientId;
            if (id != null && patientId != null && String(id) === String(patientId)) {
                void refreshPosologieColors();
                setReloadActe(true);
            }
        };
        window.addEventListener("loggappro-posologie-saved", onSaved);
        return () => window.removeEventListener("loggappro-posologie-saved", onSaved);
    }, [patientId, refreshPosologieColors, setReloadActe]);

    useEffect(() => {
        setlimit(currentPage * 10 + 15)
    }, [currentPage]);


    useEffect(() => {
        const remplirTableau = async () => {
            try {
                if (checkPrivilege("act02", privs) || checkPrivilege("act01", privs)) {
                        if (Array.isArray(allActes) && allActes.length > 0) {
                            // Mapper correctement le tableau d'actes
                            const actesMapped = allActes.map((a: any) => {
                                // Vérifier si l'objet a déjà la structure { acte: {...} } ou si c'est directement l'acte
                                if (a && a.acte) {
                                    return { ...a.acte };
                                } else if (a && a.id) {
                                    // Si c'est déjà un acte directement
                                    return { ...a };
                                } else {
                                    return null;
                                }
                            }).filter((a: any) => a !== null);
                            
                            setActes(actesMapped.length > 0 ? actesMapped : [emptyActe]);
                    } else {
                        setActes([emptyActe]);
                    }
                } else {
                    setActes([emptyActe]);
                    //setAlertObj({ type: "success", show: true, text: "Vous n'êtes pas autorisé à interagir avec les actes des patients, veuillez demander les autorisations à votre Docteur" });
                }
            } catch (erreur) {
                setActes([emptyActe]);
            }
        };
        remplirTableau();
    }, [allActes, theActeAssuranceFacture, selectionActe, prixActe, privs]);

    useEffect(() => {
        const rechargerActe = async () => {
            setReloadActe(true)
        };
        rechargerActe();
    }, [theActeAssuranceFacture]);

    useEffect(() => {
        if (!checkPrivilege("act02", privs)) {
            setTheActeAssuranceFacture(undefined);
        }
    }, [privs]);

    useEffect(() => {
        // Synchroniser uniquement au montage ou si allTypeAssurances augmente
        if (allTypeAssurances.length > typeAssurances.length) {
            if (checkPrivilege("asr01", privs)) {
                        setTypeAssurances(allTypeAssurances);
            }
        }
    }, [allTypeAssurances]);

    // Charger les matériels médicaux disponibles (pour import combiné et modal ajout acte)
    useEffect(() => {
        const chargerMateriels = async () => {
            if (checkPrivilege("nma02", privs) || checkPrivilege("nma01", privs)) {
                try {
                    const materiels = await PagePatientDetailController(pays).listerLesNomMateriels(mode, tabId, 1000, modeFileName);
                    if (Array.isArray(materiels)) {
                        setAllNomMateriels(materiels);
                    }
                } catch (error) {
                    console.error("Erreur lors du chargement des matériels:", error);
                }
            }
        };
        if (showModalAjoutActe || checkPrivilege("act02", privs)) {
            chargerMateriels();
        }
    }, [showModalAjoutActe, tabId, pays, privs, mode, modeFileName]);



    const showDetails = (actualActeAssuranceFacture: any) => {
        if (checkPrivilege("act02", privs)) {
            // Panneau paiement réservé à « gérer les actes » (act02).
            const src = Array.isArray(actualActeAssuranceFacture)
                ? actualActeAssuranceFacture[0]
                : actualActeAssuranceFacture;
            setTheActeAssuranceFacture(src && typeof src === "object" ? { ...src } : {});
        } else if (checkPrivilege("act01", privs)) {
            setTheActeAssuranceFacture(undefined);
        } else {
            setTheActeAssuranceFacture({});
            setAlertObj({ type: "warning", show: true, text: "Vous n'êtes pas autorisé à voir les actes des patients, veuillez demander les autorisations à votre Docteur" });
        }
    };


    const gerrerSelectNomAct = (na: any) => {
        if (na && na.prix) {
            setPrixActe(na.prix);
        } else {
            setPrixActe('0');
        }
    }

    const gerrerSelectAssurance = (nas: any) => {
        if (nas && nas.pourcentage) {
            setPourcentageNewAssurance(nas.pourcentage);
        } else {
            setPourcentageNewAssurance('0');
        }
    }

    const handleChange = (e: any) => {
        const selectedValue = e.target.value;
        if (selectedValue === "Nouveau") {
            if (checkPrivilege("act02", privs)) {
                handleOpen();
                setNomDuParametre("typeActe");
            } else {
                setAlertObj({ type: "warning", show: true, text: "vous n'avez pas les autorisations pour modifier un acte, veuillez demander les autorisations à votre Docteur" });
            }
        } else {
            setSelectionActe(selectedValue);
            const selectedNa = typeActes.find(na => na.nom === selectedValue);
            if (selectedNa) {
                gerrerSelectNomAct(selectedNa);
            }
        }
    };

    const handleChangeAssurance = (e: any) => {
        const selectedValue = e.target.value;
        if (selectedValue === "Nouveau") {
            if ((checkPrivilege("asr02", privs) || checkPrivilege("asr01", privs))) {
                handleOpen();
                setNomDuParametre("typeAssurance");
            } else {
                setAlertObj({ type: "warning", show: true, text: "vous n'avez pas les autorisations pour interagir avec les différentes assurances, veuillez demander les autorisations au Docteur" })
            }
        } else {
            if (checkPrivilege("asr02", privs)) {
                setNomNewAssurance(selectedValue);
                const selectedNas = typeAssurances.find(nas => nas.nom === selectedValue);
                gerrerSelectAssurance(selectedNas);
            } else {
                setAlertObj({ type: "warning", show: true, text: "vous n'avez pas les autorisations pour interagir avec les différentes assurances, veuillez demander les autorisations au Docteur" })
            }
        }
    };


    useEffect(() => {
        // Synchroniser uniquement au montage ou si allTypeActes augmente
        if (allTypeActes.length > typeActes.length) {
                if ((checkPrivilege("nma01", privs) || checkPrivilege("nma02", privs))) {
                    setTypeActes(allTypeActes);
                }
            }
    }, [allTypeActes]);

    // Récupérer le nom du docteur si non fourni
    useEffect(() => {
        if (!nomUtilisateur && tabId) {
            const fetchDocteurNom = async () => {
                try {
                    const r = await PageProfilController(pays ?? "").voirInfoDocteur(tabId ?? "", tabId ?? "");
                    if (r && r.docteur) {
                        setNomUtilisateur(`${r.docteur.nom} ${r.docteur.prenom}`);
                    }
                } catch (error) {
                    console.error("Erreur récupération nom docteur:", error);
                }
            };
            fetchDocteurNom();
        }
    }, [tabId, nomUtilisateur]);

    const submitNewActe = async (e?: React.FormEvent<HTMLFormElement>) => {
        e?.preventDefault();

        // Vérifiez si l'utilisateur a les privilèges pour ajouter un acte
        // if (checkPrivilege("crudActe", privs)) {
        //     setAlertObj({ type: "warning", show: true, text: "Vous n'avez pas les droits pour ajouter un acte aux patients, veuillez demander les autorisations à votre Docteur" });
        //     return;
        // }


        // Validation des champs obligatoires
        if (selectionActe === "non-definie" || prixActe === "" || montantPayeActe === "") {
            setAlertObj({ type: "error", show: true, text: "Veuillez compléter tous les champs avant de soumettre." });
            return false;
        }

        // Validation si le prix et le montant payé sont bien des nombres
        if (isNaN(Number(prixActe)) || isNaN(Number(montantPayeActe))) {
            setAlertObj({ type: "error", show: true, text: "Le prix et le montant payé doivent être des valeurs numériques." });
            return false;
        }

        // Synchronisation de la date et génération de l'acte à soumettre
        const syncDate = new Date();
        const syncDateInSecond = syncDate.getTime();

        let newFullActe = {
            tabId: tabId,
            acte: {
                id: syncDateInSecond,
                nom: selectionActe,
                prix: prixActe,
                argentRecu: montantPayeActe,
                argentRestant: Number(prixActe) - Number(montantPayeActe),
                date: dateActe,
                description: descriptionActe,
                isDone: false,
                dateCreation: syncDate,
                loggId: patientId
            },
            assurance: {
                id: syncDateInSecond,
                nom: nomNewAssurance,
                pourcentage: pourcentageNewAssurance,
                dateCreation: syncDate,
                loggId: patientId
            },
            facture: {
                id: syncDateInSecond,
                prixActe: prixActe,
                argentRecuActe: montantPayeActe,
                argentRestantActe: ((Number(prixActe) * pourcentageNewAssurance) / 100) - Number(montantPayeActe),
                argentAssurance: (Number(prixActe) * pourcentageNewAssurance) / 100,
                acteId: 0,
                dateCreation: syncDate,
                loggId: patientId
            },
            materiels: allowMaterielsGererActeExact ? selectedMateriels : [],
        };

        //console.log("Soumission de l'acte:", newFullActe);

        const dateActePourMessage = dateActe;

        try {
            // Envoi de l'acte via le contrôleur
            await PagePatientDetailController(pays).ajouterUnActe(mode, newFullActe, modeFileName);

            // Ajouter la trace de création de l'acte
            await creerTrace(
                'create',
                'acte',
                selectionActe,
                syncDateInSecond.toString(),
                userId ?? "",
                nomUtilisateur || "Utilisateur",
                "docteur",
                tabId ?? "",
                tabId ?? "",
                pays,
                `Prix: ${prixActe} FCFA - Patient: ${thePatient?.nom} ${thePatient?.prenom} - Montant payé: ${montantPayeActe} FCFA`
            );

            // Si la date de l'acte est dans le futur : créer une tâche (rappel 30 min avant)
            const acteDate = parseDatetimeLocalAsDate(dateActe);
            if (acteDate) {
                if (acteDate.getTime() > Date.now()) {
                    const dateRappel = new Date(acteDate.getTime() - 30 * 60 * 1000);
                    try {
                        await TaskController(pays ?? "").ajouterTask(
                            {
                                titre: `Acte prévu : ${selectionActe}`,
                                description: `Patient : ${thePatient?.nom ?? ""} ${thePatient?.prenom ?? ""} - ${format(acteDate, "dd MMMM yyyy 'à' HH:mm", { locale: fr })}`,
                                dateRappel: format(dateRappel, "yyyy-MM-dd HH:mm:ss"),
                                userId: userId ?? undefined,
                                userNom: nomUtilisateur || undefined,
                                loggId: tabId ?? undefined,
                            },
                            tabId ?? "main"
                        );
                    } catch (taskErr) {
                        console.error("Erreur création tâche rappel acte:", taskErr);
                    }
                }
            }

            // Si des radios ont été ajoutées, les compresser et les envoyer
            if (radios.length > 0) {
                try {
                    for (let i = 0; i < radios.length; i++) {
                        const file = radios[i];
                        
                        const options = {
                            maxSizeMB: 0.4,
                            maxWidthOrHeight: 1200,
                            useWebWorker: true,
                            initialQuality: 0.7
                        };

                        const compressedFile = await imageCompression(file, options);
                        const reader = new FileReader();
                        
                        const base64 = await new Promise<string>((resolve) => {
                            reader.onloadend = () => resolve(reader.result as string);
                            reader.readAsDataURL(compressedFile);
                        });

                        // Utiliser ajouterRadio avec l'ID de l'acte (syncDateInSecond)
                        await ImgController(pays).ajouterRadio({
                            acteId: syncDateInSecond.toString(),
                            radioIndex: i,
                            imageBase64: base64,
                            tabId: tabId ?? ""
                        });
                        
                        // Petit délai entre chaque upload
                        if (i < radios.length - 1) {
                            await new Promise(resolve => setTimeout(resolve, 300));
                        }
                    }
                } catch (radioError) {
                    console.error("Erreur lors de l'upload des radios:", radioError);
                    setAlertObj({ type: "warning", show: true, text: "Acte ajouté mais erreur lors de l'upload des radios" });
                }
            }

            // Mettre à jour la liste des actes localement
            setAllActes([...allActes, newFullActe]);
            
            // Forcer le rechargement depuis le serveur pour synchroniser
            setReloadActe(true);

            // Réinitialisation des champs du formulaire après la soumission réussie
            setSelectionActe("non-definie");
            setPrixActe("0");
            setMontantPayeActe("");
            setSelectedMateriels([]);
            setDateActe(toDatetimeLocalInputValue());
            setDescriptionActe("");
            setNomNewAssurance("");
            setPourcentageNewAssurance("0");
            setRadios([]);

            // Message de succès
            const radioMsg = radios.length > 0 ? ` avec ${radios.length} radio(s)` : '';
            const dMsg = parseDatetimeLocalAsDate(dateActePourMessage) ?? new Date();
            setAlertObj({ type: "success", show: true, text: `L'acte ${selectionActe} prévu pour le ${format(dMsg, "dd MMMM yyyy", { locale: fr })} a été ajouté${radioMsg}` });
            return true;
        } catch (error) {
            console.error("Erreur lors de la soumission de l'acte:", error);
            setAlertObj({ type: "error", show: true, text: "Erreur lors de l'ajout de l'acte. Veuillez réessayer." });
            return false;
        }
    };



    const handleRadioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        // Max 5 radios
        const filesToAdd = Array.from(files).slice(0, 5);
        
        // Vérifier la taille
        for (const file of filesToAdd) {
            if (file.size > 50* 1024 * 1024) {
                setAlertObj({ type: "warning", show: true, text: `${file.name} trop volumineux (max 10MB)` });
                return;
            }
        }

        setRadios(filesToAdd);
        setAlertObj({ type: "success", show: true, text: `${filesToAdd.length} radio(s) sélectionnée(s)` });
    };



    // Format matériels pour export : "nom1:qty1; nom2:qty2"
    const formatMateriels = (mats: any[] | undefined) => {
        if (!mats || !Array.isArray(mats)) return "";
        return mats.map((m: any) => `${m.nom || ""}:${m.quantite ?? 0}`).filter(Boolean).join("; ");
    };

    const tableContent = {
        columns: [
            "Date de l'acte",
            "Nom Acte",
            "Prix Acte",
            "Montant Payé",
            "Argent restant acte",
            "Description",
            "Assurance (nom)",
            "Pourcentage de l'Assurance",
            "Argent assurance",
            "Matériels utilisés",
            "Radios"
        ],
        data: allActes.map((a: any) => ({
            "Date de l'acte": format(new Date(a.acte.date), 'dd MMMM yyyy', { locale: fr }),
            "Nom Acte": a.acte.nom,
            "Prix Acte": a.facture.prixActe,
            "Montant Payé": a.facture.argentRecuActe,
            "Argent restant acte": a.facture.argentRestantActe ?? "",
            "Description": a.acte.description,
            "Assurance (nom)": a.assurance.nom || "non-assuré",
            "Pourcentage de l'Assurance": a.assurance.pourcentage != null ? a.assurance.pourcentage + " %" : "",
            "Argent assurance": a.facture.argentAssurance ?? "",
            "Matériels utilisés": formatMateriels(a.materiels),
            "Radios": (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        openRadiosModal(a);
                    }}
                    style={{
                        backgroundColor: themes[themeNumber].primary,
                        color: themes[themeNumber].secondary,
                        border: "none",
                        borderRadius: "4px",
                        padding: "6px 12px",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: "600",
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        margin: "0 auto"
                    }}
                >
                    📸 Voir
                </button>
            ),
            fullData: a // Garde toutes les données ici pour les passer à showDetails
        }))
    };






    const handleOpen = () => setShow(true);
    const handleClose = () => {
        setShow(false);
        // Réinitialiser les champs du modal
        setTypeActe("");
        setPrixActe("");
        setTypeAssurance("");
        setPourcentage("");
    };

    const handleCloseModalAjoutActe = () => {
        setShowModalAjoutActe(false);
        // Réinitialiser les champs
        setSelectionActe("non-definie");
        setPrixActe('0');
        setMontantPayeActe('');
        setDateActe("" + new Date());
        setDescriptionActe('');
        setNomNewAssurance("non-assuré");
        setPourcentageNewAssurance("0");
        setRadios([]);
        setSelectedMateriels([]);
    };

    const openRadiosModal = (acte: any) => {
        setSelectedActeForRadios(acte);
        setShowModalRadios(true);
    };

    const handleSubmit = async (e: any) => {
        e.preventDefault();

        if (nomDuParametre === "typeActe") {
            if (!checkPrivilege("nma02", privs)) {
                setAlertObj({ type: "warning", show: true, text: "Vous n'avez pas les autorisations nécessaires pour ajouter un acte." });
                return;
            }
            if (typeActe.trim() && !typeActes.find((a) => a.nom?.toLowerCase() === typeActe.toLowerCase())) {
                const newActe = {
                    id: new Date().getTime(),
                    nom: typeActe, 
                    prix: Number(prixActe), 
                    dateCreation: new Date(), 
                    loggId: tabId, 
                    tabId: tabId
                };
                await PageParametreController(pays).ajouterUnTypeActe(newActe);

                // Ajouter la trace de création du type d'acte
                await creerTrace(
                    'create',
                    'typeActe',
                    typeActe,
                    newActe.id.toString(),
                    userId ?? "",
                    nomUtilisateur || "Utilisateur",
                    "docteur",
                    tabId ?? "",
                    tabId ?? "",
                    pays,
                    `Prix par défaut: ${prixActe} FCFA`
                );

                // Mettre à jour la liste locale et sélectionner le nouvel acte
                setTypeActes([...typeActes, newActe]);
                setSelectionActe(newActe.nom);
                gerrerSelectNomAct(newActe); // Mettre à jour le prix automatiquement
                setTypeActe("");
                setPrixActe("");
                setAlertObj({ type: "success", show: true, text: "Acte ajouté avec succès et sélectionné." });
            } else {
                setAlertObj({ type: "error", show: true, text: "Veuillez fournir un nom d'acte valide et unique." });
                return;
            }
        } else if (nomDuParametre === "typeAssurance") {
            if (!checkPrivilege("asr02", privs)) {
                setAlertObj({ type: "warning", show: true, text: "Vous n'avez pas les autorisations nécessaires pour ajouter une assurance." });
                return;
            }
            if (typeAssurance.trim() && !typeAssurances.find((a) => a.nom?.toLowerCase() === typeAssurance.toLowerCase())) {
                const newAssurance = {
                    id: new Date().getTime(),
                    nom: typeAssurance, 
                    pourcentage: Number(pourcentage), 
                    dateCreation: new Date(),
                    loggId: tabId, 
                    tabId: tabId
                };
                await PageParametreController(pays).ajouterUnTypeAssurance(newAssurance);
                
                // Ajouter la trace de création du type d'assurance
                await creerTrace(
                    'create',
                    'typeAssurance',
                    typeAssurance,
                    newAssurance.id.toString(),
                    userId ?? "",
                    nomUtilisateur || "Utilisateur",
                    "docteur",
                    tabId ?? "",
                    tabId ?? "",
                    pays,
                    `Pourcentage: ${pourcentage}%`
                );

                // Mettre à jour la liste locale et sélectionner la nouvelle assurance
                setTypeAssurances([...typeAssurances, newAssurance]);
                setNomNewAssurance(newAssurance.nom);
                gerrerSelectAssurance(newAssurance); // Mettre à jour le pourcentage automatiquement
                setTypeAssurance("");
                setPourcentage("");
                setAlertObj({ type: "success", show: true, text: "Assurance ajoutée avec succès et sélectionnée." });
            } else {
                setAlertObj({ type: "error", show: true, text: "Veuillez fournir un nom d'assurance valide et unique." });
                return;
            }
        }
        handleClose();
    };

    return (
        <>


            <div className={checkPrivilege("act02", privs) && theActeAssuranceFacture ? "col-xl-6 bg-white  detail-center-page" : "col-xl-9 bg-white  detail-center-page"} style={{boxShadow:"-6px 0 8px 0 "+themes[themeNumber].shadowViolet, minHeight: 'calc(100vh - 80px)', height:"100%", overflowY:"auto"}}>
                {/* Bouton Ajouter au-dessus du tableau */}
                {(checkPrivilege("act02", privs) ||
                    checkPrivilege("pos01", privs) ||
                    checkPrivilege("oso01", privs)) && (
                    <div style={{ padding: '20px 20px 10px 20px', display: 'flex', justifyContent: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
                        {checkPrivilege("act02", privs) && (
                        <button
                            type="button"
                            onClick={() => setShowModalAjoutActe(true)}
                            style={{
                                backgroundColor: themes[themeNumber].primary,
                                color: themes[themeNumber].secondary,
                                border: 'none',
                                borderRadius: '8px',
                                padding: '12px 24px',
                                fontSize: '14px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                                transition: 'all 0.2s ease',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
                            }}
                        >
                            <span style={{ fontSize: '18px' }}>+</span>
                            Ajouter un acte
                        </button>
                        )}
                        {showOrdonnancePosologieButton && (
                        <button
                            type="button"
                            onClick={() => setShowModalPosologie(true)}
                            style={{
                                backgroundColor: themes[themeNumber].primary,
                                color: themes[themeNumber].secondary,
                                border: 'none',
                                borderRadius: '8px',
                                padding: '12px 24px',
                                fontSize: '14px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                                transition: 'all 0.2s ease',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
                            }}
                        >
                            <span style={{ fontSize: '18px' }}>💊</span>
                            Ordonnance / Posologie
                        </button>
                        )}
                    </div>
                )}
                
                <div className=" detail-center-top-page m-2" >
                    {checkPrivilege("act02", privs) || checkPrivilege("act01", privs) ?
                        <Tables
                            order="desc"
                            tableContent={tableContent}
                            onRowClick={(row) => showDetails(row.fullData)}
                            setLimit={setlimit}
                            itmsPerPage={6}
                            exportFileName="actes_assurances_factures_materiels"
                            privs={privs}
                            isDocteur={userId === tabId}
                            getRowStyle={(item) => {
                                const fd = (item as any)?.fullData;
                                const aid = fd?.acte?.id != null ? String(fd.acte.id) : "";
                                const bg = aid && posologieActeColors[aid];
                                if (!bg) return undefined;
                                return { backgroundColor: bg };
                            }}
                            onImportExcel={async (rows) => {
                                if (!checkPrivilege("act02", privs)) {
                                    setAlertObj({ type: "error", show: true, text: "Vous n'avez pas les droits pour importer des actes." });
                                    return;
                                }
                                const get = (row: Record<string, any>, col: string) => String(row[col] ?? "").trim();
                                let imported = 0;
                                for (const row of rows) {
                                    const nomActe = get(row, "Nom Acte");
                                    const prixStr = get(row, "Prix Acte") || get(row, "Prix acte");
                                    const montantPayeStr = get(row, "Montant Payé") || get(row, "Montant payé");
                                    const dateStr = get(row, "Date de l'acte") || get(row, "Date acte");
                                    const description = get(row, "Description");
                                    const assuranceNom = get(row, "Assurance (nom)") || "non-assuré";
                                    const pourcentageStr = (get(row, "Pourcentage de l'Assurance") || get(row, "Pourcentage")).replace(/\s*%\s*/g, "") || "0";
                                    const materielsStr = get(row, "Matériels utilisés");
                                    if (!nomActe || !prixStr || !montantPayeStr) continue;
                                    const prix = Number(prixStr) || 0;
                                    const montantPaye = Number(montantPayeStr) || 0;
                                    const pourcentage = Number(pourcentageStr) || 0;
                                    let dateActe = "";
                                    try {
                                        dateActe = dateStr ? parse(dateStr, "d MMMM yyyy", new Date(), { locale: fr }).toISOString().slice(0, 19).replace("T", " ") : new Date().toISOString().slice(0, 19).replace("T", " ");
                                    } catch {
                                        dateActe = new Date().toISOString().slice(0, 19).replace("T", " ");
                                    }
                                    const materiels: Array<{ id: string; nom: string; quantite: number; prix_defaut?: number; quantite_defaut?: number }> = [];
                                    if (materielsStr) {
                                        for (const part of materielsStr.split(/[;]/).map(s => s.trim())) {
                                            const [nom, qtyStr] = part.split(/[:]/).map(s => s.trim());
                                            if (nom) {
                                                const m = allNomMateriels.find((x: NomMateriel) => (x.nom || "").trim().toLowerCase() === nom.toLowerCase());
                                                materiels.push({
                                                    id: m?.id?.toString() || "",
                                                    nom: nom,
                                                    quantite: Math.max(0, parseInt(qtyStr || "0", 10) || 0),
                                                    prix_defaut: m?.prixDefaut ?? m?.prix_defaut ?? 0,
                                                    quantite_defaut: m?.quantiteDefaut ?? m?.quantite_defaut ?? 0
                                                });
                                            }
                                        }
                                    }
                                    const newFullActe = {
                                        tabId: tabId,
                                        acte: {
                                            id: Date.now() + imported,
                                            nom: nomActe,
                                            prix: prix,
                                            argentRecu: montantPaye,
                                            argentRestant: prix - montantPaye,
                                            date: dateActe,
                                            description: description,
                                            isDone: false,
                                            dateCreation: new Date(),
                                            loggId: patientId
                                        },
                                        assurance: {
                                            id: Date.now() + imported,
                                            nom: assuranceNom,
                                            pourcentage: pourcentage,
                                            dateCreation: new Date(),
                                            loggId: patientId
                                        },
                                        facture: {
                                            id: Date.now() + imported,
                                            prixActe: prix,
                                            argentRecuActe: montantPaye,
                                            argentRestantActe: ((prix * pourcentage) / 100) - montantPaye,
                                            argentAssurance: (prix * pourcentage) / 100,
                                            acteId: 0,
                                            dateCreation: new Date(),
                                            loggId: patientId
                                        },
                                        materiels
                                    };
                                    try {
                                        await PagePatientDetailController(pays).ajouterUnActe(mode, newFullActe, modeFileName);
                                        imported++;
                                    } catch (err) {
                                        console.error("Erreur import acte:", err);
                                    }
                                }
                                if (imported > 0) {
                                    setReloadActe(true);
                                    setAlertObj({ type: "success", show: true, text: `${imported} acte(s) importé(s) (acte + assurance + facture + matériels).` });
                                } else {
                                    setAlertObj({ type: "warning", show: true, text: "Aucun acte importé. Vérifiez le format CSV (colonnes: Date de l'acte, Nom Acte, Prix Acte, Montant Payé, etc.)." });
                                }
                            }}
                        /> :

                        <div className="alert alert-danger text-center" >
                            Vous n'avez pas les droits pour voir le contenu du tableau. Veuillez demander les autorisations à votre Docteur.
                        </div>

                    }
                </div>


                {/* Formulaire masqué - remplacé par le modal */}
                <div className="row bg-white detail-center-bottom-page" style={{ display: 'none' }}>
                    <form action="/patient-detail">
                        <div className="row m-5">
                            <div style={!checkPrivilege("act02", privs) ? { display: "block" } : { display: "none" }}>

                                <div className="alert alert-danger text-center" >
                                    Vous n'avez pas les droits pour ajouter un acte à un patient. Veuillez demander les autorisations à votre Docteur."
                                </div>

                            </div>
                            <div className="mb-3">
                                <label htmlFor="txtSelectionActe" className="form-label">Sélectionnez un Acte</label>
                                <select id="txtSelectionActe" className="logg-input" style={{border:"2px solid "+themes[themeNumber].primary}} name="txtSelectionActe" onChange={handleChange} value={selectionActe}>
                                    <option value={"non-definie"}>sélectionnez un acte</option>
                                    <option value={"Nouveau"} style={{ color: themes[themeNumber].danger }}>{'Créer Nouveau'}</option>
                                    {typeActes && typeActes.map((na) => (
                                        <option key={na.id} value={na.nom} style={{ color:themes[themeNumber].primary }}>{na.nom}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="mb-3">
                                <label htmlFor="txtPrixActe" className="form-label">Prix de l'Acte:</label>
                                <input type="number" min="0" step="1000" className="logg-input" style={{border:"2px solid "+themes[themeNumber].primary}} id="txtPrixActe" name="txtPrixActe" value={prixActe} onChange={(e) => setPrixActe(e.target.value)} />
                            </div>
                            <div className="mb-3">
                                <label htmlFor="txtMontantPayeActe" className="form-label">Montant payé:</label>
                                <input
                                    placeholder={
                                        thePatient?.avoir_annuelle < 0 ?
                                            `avoir actuelle du patient: ${valeurNonNegative(thePatient?.avoir_annuelle)} FCFA` :
                                            (thePatient?.avoir_annuelle > 0 ? `le patient vous doit : ${valeurNonNegative(thePatient?.avoir_annuelle)} FCFA` :
                                                `avoir actuelle du patient: 0 FCFA`)

                                    }
                                    type="number"
                                    min="0"
                                    step="1000"
                                    className="logg-input" style={{border:"2px solid "+themes[themeNumber].primary}}
                                    id="txtMontantPayeActe"
                                    name="txtMontantPayeActe"
                                    value={montantPayeActe === "" ? String(new Date()) : montantPayeActe}
                                    onChange={(e) => setMontantPayeActe(e.target.value)}
                                />
                            </div>

                            <div className="mb-3">
                                <label htmlFor="txtDateActe" className="form-label">Date de l'acte:</label>
                                <input type="datetime-local" className="logg-input" style={{border:"2px solid "+themes[themeNumber].primary}} id="txtDateActe" name="txtDateActe" value={dateActe} onChange={(e) => setDateActe(e.target.value)} />
                            </div>
                            <div className="mb-3">
                                <label htmlFor="txtDescriptionActe" className="form-label">Description de l'acte:</label>
                                <textarea className="logg-input" style={{border:"2px solid "+themes[themeNumber].primary}} id="txtDescriptionActe" name="txtDescriptionActe" placeholder="Décrivez ici l'acte posé sur le patient" rows={5} value={descriptionActe} onChange={(e) => setDescriptionActe(e.target.value)}></textarea>
                            </div>

                            {/* Section Upload de Radios */}
                            <div className="mb-3">
                                <label className="form-label" style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                                    📸 Radios (Images radiographiques)
                                    {radios.length > 0 && (
                                        <span style={{ 
                                            fontSize: "12px", 
                                            color: themes[themeNumber].secondary,
                                            backgroundColor: themes[themeNumber].primary,
                                            padding: "4px 10px",
                                            borderRadius: "15px",
                                            fontWeight: "bold"
                                        }}>
                                            ✓ {radios.length} sélectionnée(s)
                                        </span>
                                    )}
                                </label>
                                <label 
                                    htmlFor="txtRadios"
                                    style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        border: `2px dashed ${themes[themeNumber].primary}`,
                                        borderRadius: "8px",
                                        padding: "20px 15px",
                                        backgroundColor: "#f8f9fa",
                                        cursor: "pointer",
                                        transition: "all 0.2s ease",
                                        textAlign: "center"
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = themes[themeNumber].secondary + "15";
                                        e.currentTarget.style.borderColor = themes[themeNumber].secondary;
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = "#f8f9fa";
                                        e.currentTarget.style.borderColor = themes[themeNumber].primary;
                                    }}
                                >
                                    <div style={{ 
                                        fontSize: "36px", 
                                        marginBottom: "8px",
                                        color: themes[themeNumber].primary
                                    }}>
                                        📸
                                    </div>
                                    <div style={{ 
                                        fontSize: "14px", 
                                        fontWeight: "600",
                                        color: themes[themeNumber].primary,
                                        marginBottom: "4px"
                                    }}>
                                        Cliquez pour ajouter des radios
                                    </div>
                                    <div style={{ 
                                        fontSize: "11px", 
                                        color: "#7f8c8d"
                                    }}>
                                        Max 3 radios • 10MB par radio
                                    </div>
                                </label>
                                <input 
                                    type="file" 
                                    id="txtRadios"
                                    accept="image/*"
                                    multiple
                                    onChange={handleRadioUpload}
                                    style={{ display: "none" }}
                                />
                            </div>

                            <div className="mb-3">
                                <label htmlFor="txtSelectionAssurance" className="form-label">Sélectionnez une Assurance</label>
                                <select
                                    id="txtSelectionAssurance"
                                    className="logg-input" style={{border:"2px solid "+themes[themeNumber].primary}}
                                    name="txtSelectionAssurance"
                                    onChange={handleChangeAssurance}
                                    value={nomNewAssurance}
                                >
                                    <option value={"Nouveau"} style={{ color: themes[themeNumber].danger }}>{'Créer Nouveau'}</option>
                                    <option value={"non-assuré"} style={{ color: themes[themeNumber].primary }}>{'non-assuré'}</option>
                                    {typeAssurances && typeAssurances.map((nas) => (
                                        <option key={nas.id} value={nas.nom} style={{ color: themes[themeNumber].primary }}>{nas.nom}</option>
                                    ))}
                                </select>
                            </div>
                            {nomNewAssurance && nomNewAssurance !== "non-assuré" && (
                                <div className="mb-3">
                                    <label htmlFor="txtPourentageAssurance" className="form-label">Pourcentage de l'Assurance:</label>
                                    <input type="number" min="0" max="100"
                                        className="logg-input" style={{border:"2px solid "+themes[themeNumber].primary}} id="txtPourentageAssurance" name="txtPourentageAssurance" value={pourcentageNewAssurance} onChange={(e) => setPourcentageNewAssurance(e.target.value)} />
                                </div>
                            )}

                        </div>
                        <div className="row">
                            <ButtonAjouter onClick={(e: any) => submitNewActe(e)} visibility={"block"} />
                        </div>
                    </form>
                </div>
            </div>
            {checkPrivilege("act02", privs) && theActeAssuranceFacture && (
            <div className="col-xl-3  detail-right-page" style={{ color: themes[themeNumber].primary, boxShadow:"-6px 0 8px 0 "+themes[themeNumber].shadowViolet, minHeight: 'calc(100vh - 80px)', height:"100%", overflowY:"auto"}}>
                <PayementDetail
                    theActeAssuranceFacture={theActeAssuranceFacture}
                    allTypeActes={allTypeActes}
                    privs={privs}
                    setTheActeAssuranceFacture={setTheActeAssuranceFacture}
                    pays={pays}
                    patientId={patientId}
                    thePatient={thePatient}
                    actesPatientOptions={actesOptionsPosologie}
                />
            </div>
            )}
            <>
                <div className="row fist-div">
                    {show && (
                        <ModalGlobal
                            show={show}
                            onClose={() => setShow(false)}
                            title={`Ajouter ${nomDuParametre === "typeActe" ? "un type d'acte" : "un type d'assurance"}`}
                            zIndex={showModalAjoutActe ? 10100 : 10000}
                            maxWidth="600px"
                        >
                            {nomDuParametre === "typeActe" ? (
                                <div>
                                    {checkPrivilege("nma02", privs) ? (
                                        <ModalSection>
                                            <ModalGrid columns={2}>
                                                <ModalField
                                                    id="txtTypeActe"
                                                    label="Type d'acte"
                                                    value={typeActe}
                                                    onChange={(e) => setTypeActe(e.target.value)}
                                                    placeholder="Ex: Consultation"
                                                    style={{borderColor: themes[themeNumber].primary}}
                                                />
                                                <ModalField
                                                    id="txtPrixActe"
                                                    label="Prix par défaut (FCFA)"
                                                    type="number"
                                                    value={prixActe}
                                                    onChange={(e) => setPrixActe(e.target.value)}
                                                    placeholder="0"
                                                    min="0"
                                                    style={{borderColor: themes[themeNumber].primary}}
                                                />
                                            </ModalGrid>
                                            <ModalActions>
                                                <ButtonAjouter onClick={handleSubmit} />
                                            </ModalActions>
                                        </ModalSection>
                                    ) : (
                                        <div className="alert alert-danger text-center">
                                            Vous n'avez pas les droits pour ajouter un acte. Veuillez demander les autorisations à votre Docteur.
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div>
                                    {checkPrivilege("asr02", privs) ? (
                                        <ModalSection>
                                            <ModalGrid columns={2}>
                                                <ModalField
                                                    id="txtTypeAssurance"
                                                    label="Type d'assurance"
                                                    value={typeAssurance}
                                                    onChange={(e) => setTypeAssurance(e.target.value)}
                                                    placeholder="Ex: CNAMGS"
                                                    style={{borderColor: themes[themeNumber].primary}}
                                                />
                                                <ModalField
                                                    id="txtPourcentageAssurance"
                                                    label="Pourcentage (%)"
                                                    type="number"
                                                    value={pourcentage}
                                                    onChange={(e) => setPourcentage(e.target.value)}
                                                    placeholder="0-100"
                                                    min="0"
                                                    max="100"
                                                    style={{borderColor: themes[themeNumber].primary}}
                                                />
                                            </ModalGrid>
                                            <ModalActions>
                                                <ButtonAjouter onClick={handleSubmit} />
                                            </ModalActions>
                                        </ModalSection>
                                    ) : (
                                        <div className="alert alert-danger text-center">
                                            Vous n'avez pas les droits pour ajouter une assurance. Veuillez demander les autorisations à votre Docteur.
                                        </div>
                                    )}
                                </div>
                            )}
                        </ModalGlobal>
                    )}
                </div>
            </>

            {/* Modal pour afficher les radios */}
            {showModalRadios && selectedActeForRadios && (
                <ModalRadios
                    acteId={selectedActeForRadios.acte.id.toString()}
                    acteName={selectedActeForRadios.acte.nom}
                    tabId={tabId ?? ""}
                    pays={pays ?? ""}
                    onClose={() => {
                        setShowModalRadios(false);
                        setSelectedActeForRadios(null);
                    }}
                />
            )}

            {patientId && tabId && (
                <ModalPosologie
                    show={showModalPosologie}
                    onClose={() => setShowModalPosologie(false)}
                    patientId={patientId}
                    cabinetTabId={tabId}
                    pays={pays ?? ""}
                    patientLabel={patientLabelPosologie}
                    patientForEtat={thePatient}
                    actesOptions={actesOptionsPosologie}
                    allowPosologie={allowPosologieModal}
                    allowOrdonnance={allowOrdonnanceModal}
                    theme={{
                        primary: themes[themeNumber].primary,
                        secondary: themes[themeNumber].secondary,
                        shadowViolet: themes[themeNumber].shadowViolet,
                    }}
                />
            )}

            {/* Modal pour ajouter un acte */}
            {showModalAjoutActe && (
                <ModalGlobal
                    show={showModalAjoutActe}
                    onClose={handleCloseModalAjoutActe}
                    title={`Ajouter un nouvel acte au patient ${thePatient?.nom || ''} ${thePatient?.prenom || ''}`}
                    maxWidth="800px"
                >
                    <ModalSection title="Informations de l'acte">
                        <ModalField
                            id="modalSelectionActe"
                            label="Sélectionnez un Acte"
                            value={selectionActe}
                            onChange={handleChange}
                            style={{borderColor: themes[themeNumber].primary}}
                            fullWidth
                            options={[
                                { value: "non-definie", label: "Sélectionnez un acte" },
                                { value: "Nouveau", label: "+ Créer Nouveau" },
                                ...typeActes.map((na: any) => ({ value: na.nom, label: na.nom }))
                            ]}
                        />
                        
                        <ModalGrid columns={2}>
                            <ModalField
                                id="modalPrixActe"
                                label="Prix de l'acte (FCFA)"
                                type="number"
                                value={prixActe}
                                onChange={(e) => setPrixActe(e.target.value)}
                                placeholder="0"
                                min="0"
                                step="1000"
                                style={{borderColor: themes[themeNumber].primary}}
                            />
                            <ModalField
                                id="modalMontantPayeActe"
                                label="Montant payé (FCFA)"
                                type="number"
                                value={montantPayeActe}
                                onChange={(e) => setMontantPayeActe(e.target.value)}
                                placeholder={
                                    thePatient?.avoir_annuelle < 0 ?
                                        `Avoir: ${valeurNonNegative(thePatient?.avoir_annuelle)} FCFA` :
                                        (thePatient?.avoir_annuelle > 0 ? `Dette: ${valeurNonNegative(thePatient?.avoir_annuelle)} FCFA` :
                                            `Avoir: 0 FCFA`)
                                }
                                min="0"
                                step="1000"
                                style={{borderColor: themes[themeNumber].primary}}
                            />
                        </ModalGrid>

                        <ModalField
                            id="modalDateActe"
                            label="Date de l'acte"
                            type="datetime-local"
                            value={dateActe}
                            onChange={(e) => setDateActe(e.target.value)}
                            style={{borderColor: themes[themeNumber].primary}}
                            fullWidth
                        />

                        <ModalField
                            id="modalDescriptionActe"
                            label="Description de l'acte"
                            value={descriptionActe}
                            onChange={(e) => setDescriptionActe(e.target.value)}
                            placeholder="Décrivez ici l'acte posé sur le patient"
                            rows={3}
                            style={{borderColor: themes[themeNumber].primary}}
                            fullWidth
                        />
                    </ModalSection>

                    <div className="modal-section">
                        <h5 className="modal-section-title">Radios (Optionnel)</h5>
                        <div style={{ marginBottom: '15px' }}>
                            {radios.length > 0 && (
                                <div style={{ 
                                    fontSize: "13px", 
                                    color: themes[themeNumber].primary,
                                    backgroundColor: themes[themeNumber].secondary + "20",
                                    padding: "8px 12px",
                                    borderRadius: "6px",
                                    marginBottom: "12px",
                                    fontWeight: "600"
                                }}>
                                    ✓ {radios.length} radio(s) sélectionnée(s)
                        </div>
                    )}
                            <label 
                                htmlFor="modalRadios"
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    border: `2px dashed ${themes[themeNumber].primary}`,
                                    borderRadius: "8px",
                                    padding: "20px 15px",
                                    backgroundColor: "#f8f9fa",
                                    cursor: "pointer",
                                    transition: "all 0.2s ease",
                                    textAlign: "center"
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = themes[themeNumber].secondary + "15";
                                    e.currentTarget.style.borderColor = themes[themeNumber].secondary;
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = "#f8f9fa";
                                    e.currentTarget.style.borderColor = themes[themeNumber].primary;
                                }}
                            >
                                <div style={{ fontSize: "32px", marginBottom: "8px", color: themes[themeNumber].primary }}>
                                    📸
                                </div>
                                <div style={{ fontSize: "14px", fontWeight: "600", color: themes[themeNumber].primary, marginBottom: "4px" }}>
                                    Ajouter des radios
                </div>
                                <div style={{ fontSize: "11px", color: "#7f8c8d" }}>
                                    Max 3 radios • 10MB par radio
                            </div>
                            </label>
                            <input 
                                type="file" 
                                id="modalRadios"
                                accept="image/*"
                                multiple
                                onChange={handleRadioUpload}
                                style={{ display: "none" }}
                            />
                            </div>
                        </div>

                    {afficherSectionMaterielsAjoutActe && (
                    <ModalSection title="Matériels médicaux utilisés (Optionnel)">
                        <div style={{ marginBottom: '15px' }}>
                            {allowMaterielsVoirActeExact && !allowMaterielsGererActeExact && (
                                <div
                                    className="alert alert-info"
                                    style={{ fontSize: "12px", marginBottom: "12px", lineHeight: 1.45 }}
                                >
                                    Consultation seule : pour attribuer des matériels à l&apos;acte, le droit « gérer les matériels »
                                    (mat02) est requis.
                                </div>
                            )}
                            <div style={{ 
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '12px'
                            }}>
                                <div style={{ 
                                    fontSize: '13px', 
                                    color: themes[themeNumber].primary,
                                    fontWeight: '600'
                                }}>
                                    Sélectionnez les matériels utilisés pour cet acte :
                                </div>
                                {checkPrivilege("nma02", privs) && (
                                    <button
                                        type="button"
                                        onClick={() => setShowModalNouveauMateriel(true)}
                                        style={{
                                            backgroundColor: themes[themeNumber].primary,
                                            color: themes[themeNumber].secondary,
                                            border: 'none',
                                            borderRadius: '6px',
                                            padding: '6px 12px',
                                            fontSize: '12px',
                                            fontWeight: '600',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            transition: 'all 0.2s ease'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = themes[themeNumber].secondary;
                                            e.currentTarget.style.color = themes[themeNumber].primary;
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = themes[themeNumber].primary;
                                            e.currentTarget.style.color = themes[themeNumber].secondary;
                                        }}
                                    >
                                        ➕ Nouveau matériel
                                    </button>
                                )}
                            </div>
                            
                            {allNomMateriels.length === 0 ? (
                                <div style={{ 
                                    padding: '12px',
                                    backgroundColor: themes[themeNumber].secondary + '20',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    color: themes[themeNumber].primary,
                                    textAlign: 'center'
                                }}>
                                    Aucun matériel disponible. Créez-en d'abord dans les paramètres ou utilisez le bouton "Nouveau matériel".
                                </div>
                            ) : (
                                <div style={{ 
                                    maxHeight: '300px', 
                                    overflowY: 'auto', 
                                    border: `1px solid ${themes[themeNumber].primary}30`, 
                                    borderRadius: '6px', 
                                    padding: '10px'
                                }}>
                                    <Tables
                                        setLimit={() => {}}
                                        onRowClick={() => {}}
                                        tableContent={{
                                            columns: ["Matériel", "Stock", "Prix unitaire", "Quantité utilisée"],
                                            data: allNomMateriels.map((materiel: NomMateriel) => {
                                                const existingIndex = selectedMateriels.findIndex(m => m.id === materiel.id?.toString());
                                                const quantite = existingIndex >= 0 ? selectedMateriels[existingIndex].quantite : 0;
                                                
                                                return {
                                                    "Matériel": materiel.nom || "",
                                                    "Stock": (materiel.quantiteDefaut || materiel.quantite_defaut || 0).toString(),
                                                    "Prix unitaire": `${(materiel.prixDefaut || materiel.prix_defaut || 0).toLocaleString('fr-FR')} FCFA`,
                                                    "Quantité utilisée": (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const newMateriels = [...selectedMateriels];
                                                                    const index = newMateriels.findIndex(m => m.id === materiel.id?.toString());
                                                                    const newQuantite = Math.max(0, quantite - 1);
                                                                    if (index >= 0) {
                                                                        newMateriels[index].quantite = newQuantite;
                                                                    } else {
                                                                        newMateriels.push({
                                                                            id: materiel.id?.toString() || '',
                                                                            nom: materiel.nom || '',
                                                                            quantite: newQuantite,
                                                                            prix_defaut: materiel.prixDefaut || materiel.prix_defaut || 0,
                                                                            quantite_defaut: materiel.quantiteDefaut || materiel.quantite_defaut || 0
                                                                        });
                                                                    }
                                                                    setSelectedMateriels(newMateriels);
                                                                }}
                                                                style={{
                                                                    width: '28px',
                                                                    height: '28px',
                                                                    borderRadius: '4px',
                                                                    border: `1px solid ${themes[themeNumber].primary}`,
                                                                    backgroundColor: '#fff',
                                                                    color: themes[themeNumber].primary,
                                                                    cursor: 'pointer',
                                                                    fontSize: '16px',
                                                                    fontWeight: 'bold',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center'
                                                                }}
                                                                disabled={!allowMaterielsGererActeExact || quantite === 0}
                                                            >
                                                                -
                                                            </button>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max={materiel.quantiteDefaut || materiel.quantite_defaut || 0}
                                                                value={quantite}
                                                                readOnly={!allowMaterielsGererActeExact}
                                                                onChange={(e) => {
                                                                    const newQuantite = parseInt(e.target.value) || 0;
                                                                    const maxStock = materiel.quantiteDefaut || materiel.quantite_defaut || 0;
                                                                    const finalQuantite = Math.min(Math.max(0, newQuantite), maxStock);
                                                                    const newMateriels = [...selectedMateriels];
                                                                    const index = newMateriels.findIndex(m => m.id === materiel.id?.toString());
                                                                    
                                                                    if (index >= 0) {
                                                                        newMateriels[index].quantite = finalQuantite;
                                                                    } else {
                                                                        newMateriels.push({
                                                                            id: materiel.id?.toString() || '',
                                                                            nom: materiel.nom || '',
                                                                            quantite: finalQuantite,
                                                                            prix_defaut: materiel.prixDefaut || materiel.prix_defaut || 0,
                                                                            quantite_defaut: materiel.quantiteDefaut || materiel.quantite_defaut || 0
                                                                        });
                                                                    }
                                                                    setSelectedMateriels(newMateriels);
                                                                }}
                                                                style={{
                                                                    width: '60px',
                                                                    padding: '4px 8px',
                                                                    borderRadius: '4px',
                                                                    border: `1px solid ${themes[themeNumber].primary}`,
                                                                    textAlign: 'center',
                                                                    fontSize: '13px',
                                                                    color: themes[themeNumber].secondary
                                                                }}
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const newMateriels = [...selectedMateriels];
                                                                    const index = newMateriels.findIndex(m => m.id === materiel.id?.toString());
                                                                    const maxStock = materiel.quantiteDefaut || materiel.quantite_defaut || 0;
                                                                    const newQuantite = Math.min(quantite + 1, maxStock);
                                                                    
                                                                    if (index >= 0) {
                                                                        newMateriels[index].quantite = newQuantite;
                                                                    } else {
                                                                        newMateriels.push({
                                                                            id: materiel.id?.toString() || '',
                                                                            nom: materiel.nom || '',
                                                                            quantite: newQuantite,
                                                                            prix_defaut: materiel.prixDefaut || materiel.prix_defaut || 0,
                                                                            quantite_defaut: materiel.quantiteDefaut || materiel.quantite_defaut || 0
                                                                        });
                                                                    }
                                                                    setSelectedMateriels(newMateriels);
                                                                }}
                                                                disabled={
                                                                    !allowMaterielsGererActeExact ||
                                                                    (materiel.quantiteDefaut || materiel.quantite_defaut || 0) === 0 ||
                                                                    quantite >= (materiel.quantiteDefaut || materiel.quantite_defaut || 0)
                                                                }
                                                                style={{
                                                                    width: '28px',
                                                                    height: '28px',
                                                                    borderRadius: '4px',
                                                                    border: `1px solid ${themes[themeNumber].primary}`,
                                                                    backgroundColor: themes[themeNumber].primary,
                                                                    color: themes[themeNumber].secondary,
                                                                    cursor: 'pointer',
                                                                    fontSize: '16px',
                                                                    fontWeight: 'bold',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    opacity: ((materiel.quantiteDefaut || materiel.quantite_defaut || 0) === 0 || quantite >= (materiel.quantiteDefaut || materiel.quantite_defaut || 0)) ? 0.5 : 1
                                                                }}
                                                            >
                                                                +
                                                            </button>
                                                        </div>
                                                    ),
                                                    fullData: materiel
                                                };
                                            })
                                        }}
                                        reverseColors={false}
                                        itmsPerPage={10}
                                        exportFileName="materiels"
                                        privs={privs}
                                        isDocteur={userId === tabId}
                                        onImportExcel={(rows) => {
                                            if (!allowMaterielsGererActeExact) {
                                                setAlertObj({
                                                    type: "warning",
                                                    show: true,
                                                    text: "L’import des quantités matériels nécessite le privilège mat02.",
                                                });
                                                return;
                                            }
                                            const newMateriels = [...selectedMateriels];
                                            for (const row of rows) {
                                                const nom = String(row["Matériel"] ?? "").trim();
                                                if (!nom) continue;
                                                const m = allNomMateriels.find((x: NomMateriel) => (x.nom || "").trim() === nom);
                                                if (m) {
                                                    const qty = Math.max(0, parseInt(String(row["Quantité utilisée"] ?? 0), 10) || 0);
                                                    const idx = newMateriels.findIndex(x => x.id === m.id?.toString());
                                                    if (idx >= 0) {
                                                        newMateriels[idx].quantite = qty;
                                                    } else {
                                                        newMateriels.push({
                                                            id: m.id?.toString() || '',
                                                            nom: m.nom || '',
                                                            quantite: qty,
                                                            prix_defaut: m.prixDefaut || m.prix_defaut || 0,
                                                            quantite_defaut: m.quantiteDefaut || m.quantite_defaut || 0
                                                        });
                                                    }
                                                }
                                            }
                                            setSelectedMateriels(newMateriels);
                                            setAlertObj({ type: "success", show: true, text: `${rows.length} ligne(s) importée(s).` });
                                        }}
                                    />
                                </div>
                            )}
                            
                            {selectedMateriels.length > 0 && (
                                <div style={{ 
                                    marginTop: '12px',
                                    padding: '10px',
                                    backgroundColor: themes[themeNumber].secondary + '20',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    color: themes[themeNumber].primary,
                                    fontWeight: '600'
                                }}>
                                    ✓ {selectedMateriels.reduce((sum, m) => sum + m.quantite, 0)} matériel(s) sélectionné(s)
                                </div>
                            )}
                        </div>
                    </ModalSection>
                    )}

                    <ModalSection title="Assurance">
                        <ModalGrid columns={nomNewAssurance && nomNewAssurance !== "non-assuré" ? 2 : 1}>
                            <ModalField
                                id="modalSelectionAssurance"
                                label="Sélectionnez une Assurance"
                                value={nomNewAssurance}
                                onChange={handleChangeAssurance}
                                style={{borderColor: themes[themeNumber].primary}}
                                fullWidth={!nomNewAssurance || nomNewAssurance === "non-assuré"}
                                options={[
                                    { value: "Nouveau", label: "+ Créer Nouveau" },
                                    { value: "non-assuré", label: "Non assuré" },
                                    ...typeAssurances.map((nas: any) => ({ value: nas.nom, label: nas.nom }))
                                ]}
                            />
                            
                            {nomNewAssurance && nomNewAssurance !== "non-assuré" && (
                                <ModalField
                                    id="modalPourcentageAssurance"
                                    label="Pourcentage (%)"
                                    type="number"
                                    value={pourcentageNewAssurance}
                                    onChange={(e) => setPourcentageNewAssurance(e.target.value)}
                                    placeholder="0-100"
                                    min="0"
                                    max="100"
                                    style={{borderColor: themes[themeNumber].primary}}
                                />
                            )}
                        </ModalGrid>
                    </ModalSection>

                    <ModalActions>
                        <button type="button" className="btn btn-outline-secondary" onClick={handleCloseModalAjoutActe}>
                            Annuler
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={async () => {
                                const success = await submitNewActe();
                                if (success) handleCloseModalAjoutActe();
                            }}
                        >
                            Enregistrer l&apos;acte
                        </button>
                    </ModalActions>
                </ModalGlobal>
            )}

            {/* Modal pour créer un nouveau matériel */}
            {showModalNouveauMateriel && (
                <ModalGlobal
                    show={showModalNouveauMateriel}
                    onClose={() => {
                        setShowModalNouveauMateriel(false);
                        setNouveauMaterielNom("");
                        setNouveauMaterielPrix(0);
                        setNouveauMaterielQuantite(0);
                    }}
                    title="Créer un nouveau matériel médical"
                    maxWidth="500px"
                    zIndex={showModalAjoutActe ? 10200 : 10100}
                >
                    <ModalSection>
                        <ModalField
                            id="modalNomMateriel"
                            label="Nom du matériel"
                            type="text"
                            value={nouveauMaterielNom}
                            onChange={(e) => setNouveauMaterielNom(e.target.value)}
                            placeholder="Ex: Gants stériles"
                            style={{borderColor: themes[themeNumber].primary}}
                            fullWidth
                        />
                        <ModalGrid columns={2}>
                            <ModalField
                                id="modalPrixMateriel"
                                label="Prix par défaut (FCFA)"
                                type="number"
                                value={nouveauMaterielPrix}
                                onChange={(e) => setNouveauMaterielPrix(Number(e.target.value))}
                                placeholder="0"
                                min="0"
                                step="100"
                                style={{borderColor: themes[themeNumber].primary}}
                            />
                            <ModalField
                                id="modalQuantiteMateriel"
                                label="Stock initial"
                                type="number"
                                value={nouveauMaterielQuantite}
                                onChange={(e) => setNouveauMaterielQuantite(Number(e.target.value))}
                                placeholder="0"
                                min="0"
                                step="1"
                                style={{borderColor: themes[themeNumber].primary}}
                            />
                        </ModalGrid>
                    </ModalSection>
                    <ModalActions>
                        <button
                            type="button"
                            className="btn btn-outline-secondary"
                            onClick={() => {
                                setShowModalNouveauMateriel(false);
                                setNouveauMaterielNom("");
                                setNouveauMaterielPrix(0);
                                setNouveauMaterielQuantite(0);
                            }}
                        >
                            Annuler
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={async () => {
                                if (!nouveauMaterielNom.trim()) {
                                    setAlertObj({ type: "error", show: true, text: "Veuillez saisir un nom de matériel." });
                                    return;
                                }
                                
                                try {
                                    const newMateriel = {
                                        id: new Date().getTime(),
                                        nom: nouveauMaterielNom,
                                        prixDefaut: nouveauMaterielPrix,
                                        quantiteDefaut: nouveauMaterielQuantite,
                                        loggId: tabId,
                                        dateCreation: new Date()
                                    };
                                    
                                    const created = await PagePatientDetailController(pays).ajouterUnNomMateriel(mode, newMateriel, tabId ?? undefined, modeFileName);
                                    
                                    // Ajouter la trace
                                    await creerTrace(
                                        'create',
                                        'nomMateriel',
                                        nouveauMaterielNom,
                                        (created?.id ?? newMateriel.id).toString(),
                                        userId ?? "",
                                        nomUtilisateur || "Utilisateur",
                                        "docteur",
                                        tabId ?? "",
                                        tabId ?? "",
                                        pays,
                                        `Prix: ${nouveauMaterielPrix} FCFA - Stock: ${nouveauMaterielQuantite}`
                                    );
                                    
                                    // Recharger la liste des matériels pour que le nouveau apparaisse dans le tableau
                                    const materiels = await PagePatientDetailController(pays).listerLesNomMateriels(mode, tabId, 1000, modeFileName);
                                    if (Array.isArray(materiels)) {
                                        setAllNomMateriels(materiels);
                                        // Utiliser l'ID retourné par le backend pour que le matériel apparaisse correctement
                                        const createdId = created?.id ?? materiels.find((m: any) => m.nom === nouveauMaterielNom)?.id ?? newMateriel.id;
                                        setSelectedMateriels([...selectedMateriels, {
                                            id: String(createdId),
                                            nom: nouveauMaterielNom,
                                            quantite: Math.max(0, nouveauMaterielQuantite),
                                            prix_defaut: nouveauMaterielPrix,
                                            quantite_defaut: nouveauMaterielQuantite
                                        }]);
                                    }
                                    
                                    setAlertObj({ type: "success", show: true, text: `Matériel "${nouveauMaterielNom}" créé avec succès et ajouté à la sélection.` });
                                    
                                    setShowModalNouveauMateriel(false);
                                    setNouveauMaterielNom("");
                                    setNouveauMaterielPrix(0);
                                    setNouveauMaterielQuantite(0);
                                } catch (error) {
                                    console.error("Erreur lors de la création du matériel:", error);
                                    setAlertObj({ type: "error", show: true, text: "Erreur lors de la création du matériel. Veuillez réessayer." });
                                }
                            }}
                        >
                            Créer et ajouter
                        </button>
                    </ModalActions>
                </ModalGlobal>
            )}
        </>

    );
}

function valeurNonNegative(valeur: any) {
    if (valeur) {
        const numValue = typeof valeur === 'string' ? Number(valeur) : valeur;
        if (isNaN(numValue)) {
            throw new Error('La valeur' + numValue + ' fournie n\'est pas un nombre valide');
        }
        return Math.abs(numValue);
    }
}

