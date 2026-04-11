import { useState } from "react";
import type { Cabinet, Docteur } from "../Entities/entities.js";
import React from "react";
import ButtonAjouter from "./ButtonAjouter.js";
import { useNavigate } from "react-router-dom";
import PageOuvertureController from "../controllers/PageOuvertureController.js";
import { encrypteRepositoryStructure, formatConnectionError, upperLow } from "../helpers/helpers.js";
import { invoke } from "../../tauri-bridge.js";
import { useAlert, useMode } from "../context/SearchContext.js";
import { useSession } from "../context/SessionContext.js";
import { criptKey, checkAdminCredentials, themes, ActualthemeNumber } from "../../constants/index.ts";
import { Input } from "../../items/Input.tsx";
import { useTheme } from '../context/ThemeContext.js';
import { phoneOnChangeHandler } from "../helpers/phoneFormat.ts";

interface SecurityConnectionProps {
    /** Vue initiale : "connection" (connexion) ou "nouveauCompte" (création de compte) */
    initialView?: "connection" | "nouveauCompte";
    /** Si true, sur la page dédiée : le lien "Je souhaite me connecter" redirige vers /connection au lieu de basculer la vue */
    standalone?: boolean;
}

export function SecurityConnection({ initialView = "connection", standalone = false }: SecurityConnectionProps) {

    const [showNouveauCompte, setShowNouveauCompte] = useState<boolean>(initialView === "nouveauCompte");
    const [showConnection, setShowConnection] = useState<boolean>(initialView === "connection");
    const [newCabinet, setNewCabinet] = useState<Cabinet>({ id: "", adresse: "", limit: 100, pays: "" });
    const [loginOrTel, setLoginOrTel] = useState<string>("");
    const [password, setPassword] = useState<string>("");
    const [value, setValue] = useState<string>("");
    const { setAlertObj } = useAlert();
    // const [alert, setAlertObj] = useState<{ type: string, text: string } | null>(null); // State pour les alertes
    const options = [
      {value: "SN",label: "Sénégale"},
      {value: "TG",label: "Togo"}
    ]
    const navigate = useNavigate();
    const { setSession, setDbPassword } = useSession();
    const { setMode } = useMode();
    const [newDocteur, setNewDocteur] = useState<Docteur>({
        id: "",
        photo: "",
        nom: "",
        prenom: "",
        login: "",
        password: "",
        telephone: "",
        naissance: "",
        role: "",
        adresse: "",
        loggId: ""
    });

    const addDocteur = async (e) => {
        e.preventDefault();
        
        // Validation des champs obligatoires
        const champsManquants: string[] = [];
        if (!newDocteur.nom || newDocteur.nom.trim() === "") champsManquants.push("Nom");
        if (!newDocteur.prenom || newDocteur.prenom.trim() === "") champsManquants.push("Prénom");
        if (!newDocteur.login || newDocteur.login.trim() === "") champsManquants.push("Adresse e-mail");
        if (!newDocteur.naissance || newDocteur.naissance.trim() === "") champsManquants.push("Date de naissance");
        
        if (champsManquants.length > 0) {
            setAlertObj({ 
                type: "error", 
                show: true, 
                text: `Veuillez remplir les champs obligatoires suivants : ${champsManquants.join(", ")}` 
            });
            return;
        }
        
        if (newCabinet && newCabinet.nom !== "" && newDocteur && newDocteur.nom !== "" && newDocteur.login !== "" && newDocteur.telephone !== "" && newDocteur.password !== "") {
            try {
                const syncDateInSecond = new Date().getTime();
                const updatedDocteur = {
                    ...newDocteur,
                    id: syncDateInSecond.toString(),
                    dateCreation: new Date(),
                    role: "docteur",
                    loggId: syncDateInSecond.toString()
                  };
                  
                  const updatedCabinet = {
                    ...newCabinet,
                    id: syncDateInSecond.toString(),
                    dateCreation: new Date(),
                    tabId: "main"
                  };
                  
                  setAlertObj({ type: "warning", show: true, text: "Chargement..." });
                  
                  const paysToUse = value || newCabinet.pays || "TG";
                  await PageOuvertureController(paysToUse).createCabinet({ ...updatedCabinet, pays: paysToUse });
                  await PageOuvertureController(paysToUse).createUser({ ...updatedDocteur, pays: paysToUse, tabId: "main" });
                  


                setAlertObj({ type: "success", show: true, text: `Dr. ${newDocteur.nom} ${newDocteur.prenom} a été ajouté avec succès.` });
                setNewDocteur({
                    id: "",
                    photo: "",
                    nom: "",
                    prenom: "",
                    login: "",
                    password: "",
                    telephone: "",
                    naissance: "",
                    role: "",
                    adresse: "",
                    loggId: ""
                });
                setNewCabinet({ id: "", adresse: "", pays: "", nom: "", limit: 100 });
                setShowNouveauCompte(false);
                setShowConnection(true);

            } catch (error: any) {
                console.error("Erreur lors de l'ajout du docteur", error);
                const msg = error?.message ?? error?.toString?.() ?? String(error);
                setAlertObj({ type: "error", show: true, text: msg || "Erreur lors de l'ajout du docteur" });
            }
        } else {
            setAlertObj({ type: "error", show: true, text: "Veuillez remplir au minimum le nom (le votre et celui du cabinet),le prenom,l'email, le telephone , le mot de passe et le pays de votre cabinet" })
        }

    };

    const connection = async (e) => {
        e.preventDefault();

        try {
            if (loginOrTel && password) {
                // Vérifier d'abord si c'est une connexion admin
                if (checkAdminCredentials(loginOrTel, password)) {
                    try {
                        const payloadRm = encrypteRepositoryStructure({ pays: "sn", tabId: "main" }, criptKey);
                        await invoke("remove_demo_docteur_after_sadmin_login", { payload: payloadRm });
                    } catch {
                        /* non bloquant */
                    }
                    setMode("superAdmin");
                    setDbPassword(password);
                    setSession({
                        userId: "sadmin",
                        tabId: "main",
                        pays: "sn",
                        patientId: "",
                        role: "sadmin",
                    });
                    setAlertObj({ type: "success", text: "Connexion admin réussie.", show: true });
                    navigate("/profil");
                    return;
                }

                const userResponse = await PageOuvertureController("sn").connection(loginOrTel.toLowerCase(), password);
                if (userResponse && userResponse.id) {
                    setAlertObj({ type: "success", text: "Connexion réussie, bienvenue." });
                    const tabId = userResponse.role === "docteur" ? userResponse.id : (userResponse.logg_id ?? userResponse.loggId ?? userResponse.id);
                    const role = userResponse.role ?? "";
                    setDbPassword(password);
                    const demoEmailFlag =
                        !!userResponse.mustChangeDemoEmail ||
                        !!userResponse.must_change_demo_email;
                    setSession({
                        userId: userResponse.id,
                        tabId,
                        pays: "sn",
                        patientId: "",
                        mustChangePassword: !!userResponse.mustChangePassword,
                        mustChangeDemoEmail: demoEmailFlag,
                        role,
                    });
                    navigate("/patient-detail", { state: { userId: userResponse.id, tabId, pays: "sn", role } });
                } else {
                    setAlertObj({ type: "error", text: "Identifiants incorrects, veuillez réessayer.", show: true });
                }
            } else {
                setAlertObj({ type: "warning", text: "Veuillez remplir tous les champs.", show: true });
            }
        } catch (error) {
            console.error("Erreur lors de la connexion", error);
            setAlertObj({
                type: "error",
                text: formatConnectionError(error),
                show: true,
            });
        }
    };


    const { themeNumber } = useTheme();

    return (
        <>
            <span style={{ display: "none" }}>
                {/* Style global pour les placeholders */}
                <style>{`
                  input::placeholder, select::placeholder {
                    color: ${themes[themeNumber].primary};
                    opacity: 0.7;
                  }
                `}</style>
                <div
                    style={{
                        borderWidth: "5px",
                        borderStyle: "solid",
                        borderColor: themes[themeNumber].secondary,
                        maxWidth: "600px",
                        margin: "40px auto 0 auto",
                        padding: "32px 28px 18px 28px",
                        borderRadius: "16px",
                        background: themes[themeNumber].primary,
                        color: themes[themeNumber].secondary,
                        boxShadow: "0 4px 24px 0 rgba(0,0,0,0.08)",
                    }}
                >
                    <form autoComplete="off">
                        <center><h2 className="mb-4" style={{color: themes[themeNumber].secondary}}>Nouveau compte</h2></center>
                        <div className="row mb-4">
                            <div className="col-md-4 mb-3 mb-md-0">
                                <Input
                                    type="text"
                                    className="form-control"
                                    id="nomDocteur"
                                    placeholder="Nom"
                                    style={{background: '#fff', color: themes[themeNumber].primary, borderColor: themes[themeNumber].secondary}}
                                    value={newDocteur?.nom?.toUpperCase() ?? ""}
                                    onChange={(e) => setNewDocteur({ ...newDocteur, nom: e.target.value })}
                                />
                            </div>
                            <div className="col-md-4 mb-3 mb-md-0">
                                <Input
                                    type="text"
                                    className="form-control"
                                    id="prenomDocteur"
                                    placeholder="Prénom"
                                    style={{background: '#fff', color: themes[themeNumber].primary, borderColor: themes[themeNumber].secondary}}
                                    value={upperLow(newDocteur.prenom ?? "")}
                                    onChange={(e) => setNewDocteur({ ...newDocteur, prenom: e.target.value })}
                                />
                            </div>
                            <div className="col-md-4">
                                <Input
                                    type="email"
                                    className="form-control"
                                    id="emailDocteur"
                                    placeholder="Email"
                                    style={{background: '#fff', color: themes[themeNumber].primary, borderColor: themes[themeNumber].secondary}}
                                    value={newDocteur?.login ?? ""}
                                    onChange={(e) => setNewDocteur({ ...newDocteur, login: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="row mb-4">
                            <div className="col-md-4 mb-3 mb-md-0">
                                <Input
                                    type="password"
                                    className="form-control"
                                    id="pwdDocteur"
                                    placeholder="Mot de passe"
                                    style={{background: '#fff', color: themes[themeNumber].primary, borderColor: themes[themeNumber].secondary}}
                                    value={newDocteur?.password ?? ""}
                                    onChange={(e) => setNewDocteur({ ...newDocteur, password: e.target.value })}
                                />
                            </div>
                            <div className="col-md-4 mb-3 mb-md-0">
                                <Input
                                    type="text"
                                    className="form-control"
                                    id="telDocteur"
                                    style={{background: '#fff', color: themes[themeNumber].primary, borderColor: themes[themeNumber].secondary}}
                                    value={newDocteur?.telephone ?? ""}
                                    onChange={(e) => phoneOnChangeHandler(e, (v) => setNewDocteur({ ...newDocteur, telephone: v }))}
                                    placeholder="+221 …"
                                />
                            </div>
                            <div className="col-md-4">
                                <Input
                                    type="date"
                                    className="form-control"
                                    id="naissanceDocteur"
                                    placeholder="Date de naissance"
                                    style={{background: '#fff', color: themes[themeNumber].primary, borderColor: themes[themeNumber].secondary}}
                                    value={newDocteur?.naissance ?? ""}
                                    onChange={(e) => setNewDocteur({ ...newDocteur, naissance: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="row mb-4">
                            <div className="col-12">
                                <Input
                                    type="text"
                                    className="form-control"
                                    id="adresseDocteur"
                                    placeholder="Adresse"
                                    style={{background: '#fff', color: themes[themeNumber].primary, borderColor: themes[themeNumber].secondary}}
                                    value={newDocteur?.adresse ?? ""}
                                    onChange={(e) => setNewDocteur({ ...newDocteur, adresse: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="row mb-4">
                            <div className="col-md-4 mb-3 mb-md-0">
                                <Input
                                    type="text"
                                    className="form-control"
                                    id="nomCabinet"
                                    placeholder="Nom du cabinet"
                                    style={{background: '#fff', color: themes[themeNumber].primary, borderColor: themes[themeNumber].secondary}}
                                    value={newCabinet.nom ?? ""}
                                    onChange={(e) => setNewCabinet({ ...newCabinet, nom: upperLow(e.target.value) })}
                                />
                            </div>
                            <div className="col-md-4 mb-3 mb-md-0">
                                <Input
                                    type="text"
                                    className="form-control"
                                    id="adresseCabinet"
                                    placeholder="Adresse du cabinet"
                                    style={{background: '#fff', color: themes[themeNumber].primary, borderColor: themes[themeNumber].secondary}}
                                    value={newCabinet?.adresse ?? ""}
                                    onChange={(e) => setNewCabinet({ ...newCabinet, adresse: e.target.value })}
                                />
                            </div>
                            <div className="col-md-4">
                                <select
                                    id="paysCabinet"
                                    className="form-select"
                                    style={{background: '#fff', color: themes[themeNumber].primary, borderColor: themes[themeNumber].secondary}}
                                    value={value ?? ""}
                                    onChange={(e) => setValue(e.target.value)}
                                >
                                    <option value="">Pays</option>
                                    {options.map(option => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="d-grid gap-2 mb-2 mt-4">
                            <ButtonAjouter onClick={(e) => addDocteur(e)} />
                        </div>
                        <div className="text-center mt-3">
                            <button
                                style={{ background: "none", border: "none", color: themes[themeNumber].success, cursor: "pointer" }}
                                onClick={() => {
                                    if (standalone) {
                                        navigate("/connection");
                                    } else {
                                        setShowConnection(true);
                                        setShowNouveauCompte(false);
                                    }
                                }}
                            >
                                <small>Je souhaite me connecter</small>
                            </button>
                        </div>
                    </form>
                </div>
            </span>

            {/* Connexion Form */}
            <span style={{ display: showConnection ? "block" : "none" }}>
                {/* Style global pour les placeholders (déjà présent plus haut, mais on le garde ici pour s'assurer qu'il s'applique aussi à la connexion) */}
                <style>{`
                  input::placeholder, select::placeholder {
                    color: ${themes[themeNumber].primary};
                    opacity: 0.7;
                  }
                `}</style>
                <div
                    style={{
                        borderWidth: "5px",
                        borderStyle: "solid",
                        borderColor: themes[themeNumber].secondary,
                        maxWidth: "420px",
                        padding: "20px",
                        borderRadius: "10px",
                        background: themes[themeNumber].primary,
                        color: themes[themeNumber].secondary,
                        margin: "40px auto 0 auto"
                    }}
                >
                    <div className="row theInput m-3">
                        <div><center><h2>Connexion:</h2></center></div>
                        <div className="mb-3">
                            <label htmlFor="loginOrTelInput" className="form-label"></label>
                            <Input
                                type="text"
                                className="form-control"
                                id="loginOrTelInput"
                                value={loginOrTel ?? ""}
                                placeholder="Entrez Votre Email "
                                style={{background: '#fff', color: themes[themeNumber].primary, borderColor: themes[themeNumber].secondary}}
                                onChange={(e) => setLoginOrTel(e.target.value)}
                            />
                        </div>
                        <div className="mb-3">
                            <label htmlFor="passwordInput" className="form-label"></label>
                            <Input
                                type="password"
                                className="form-control"
                                id="passwordInput"
                                value={password ?? ""}
                                placeholder="Mot De Passe"
                                style={{background: '#fff', color: themes[themeNumber].primary, borderColor: themes[themeNumber].secondary}}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                        <div className="d-flex flex-column gap-2 mt-3 align-items-stretch">
                            <button
                                type="submit"
                                className="btn color-violet w-5 border-2 px-5 border-warning text-warning"
                                onClick={connection}
                            >
                                Se Connecter
                            </button>
                            
                        </div>
                        {/* Création de compte docteur retirée : seul le Sadmin peut créer des docteurs depuis le Profil */}
                    </div>
                </div>
            </span>
        </>
    );
}
