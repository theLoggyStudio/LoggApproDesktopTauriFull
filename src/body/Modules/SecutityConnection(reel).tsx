import React, { useState } from 'react';
import ButtonAjouter from "./ButtonAjouter.js";
import { useNavigate } from "react-router-dom";
import { Modal, Button } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import PlayVideo from "./PlayVideo.js";
import { upperLow } from '../helpers/helpers.js';
import { PageOuvertureController } from '../controllers/PageOuvertureController.js';
import { useAlert } from '../context/SearchContext.js';
import { useSession } from '../context/SessionContext.js';
import { ActualthemeNumber, themes } from '../../constants/index.ts';
import { creerTrace } from '../controllers/TraceController.js';

export function SecurityConnection() {
  const { setAlertObj } = useAlert();
  const { setSession, setDbPassword } = useSession();
  const [showNouveauCompte, setShowNouveauCompte] = useState(false);
  const [showConnection, setShowConnection] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [codeVerification, setCodeVerification] = useState(["", "", "", "", ""]);
  const [generatedCode, setGeneratedCode] = useState("");
  const [newDocteur, setNewDocteur] = useState({
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
  const [newCabinet, setNewCabinet] = useState({ id: "", adresse: "", limit: 100, pays: "", nom: "" });
  const [loginOrTel, setLoginOrTel] = useState("");
  const [password, setPassword] = useState("");
  const [pays, setPays] = useState("");
  const options =  [
    {value: "SN",label: "Sénégal"},
    {value: "TG",label: "Togo"},
  ]
    
    

  const navigate = useNavigate();
  const globalsyncDateInSecond = new Date().getTime();

  const changeHandler = (selectedOption) => {
    setPays(selectedOption);
    // console.log("pays :::::::::" + selectedOption);
  };


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
          loggId: globalsyncDateInSecond.toString()
        };

        const updatedCabinet = {
          ...newCabinet,
          id: syncDateInSecond.toString(),
          dateCreation: new Date(),
          pays: pays
        };

        setNewDocteur(updatedDocteur);
        setNewCabinet(updatedCabinet);

        const loginOrTel = updatedDocteur.login.toLowerCase();
        const password = updatedDocteur.password;

        setAlertObj({ type: "warning", show: true, text: "Chargement..." });
        const response = await PageOuvertureController(pays).messageDAuthentification(loginOrTel, password);

        if (response.message === "Email n'appartient à aucun compte") {
          const verificationCode = generateVerificationCode();
          const emailHtml = `${verificationCode}`;

          const emailResult = await PageOuvertureController(pays).sendVerificationEmail(
            loginOrTel,
            "Votre code de vérification LoggAppro",
            emailHtml
          );

          if (!emailResult.success) {
            setAlertObj({ type: "error", show: true, text: "Erreur lors de l'envoi de l'email de vérification" });
          } else {
            setGeneratedCode(verificationCode);
            setShowModal(true);
          }
        } else {
          setAlertObj({ type: "error", show: true, text: response.message });
        }
      } catch (error) {
        console.error("Erreur lors de l'ajout du docteur", error);
        setAlertObj({ type: "error", show: true, text: "Erreur lors de l'ajout du docteur" });
      }
    } else {
      setAlertObj({ type: "error", show: true, text: "Veuillez remplir au minimum le nom (le votre et celui du cabinet),le prenom,l'email, le telephone , le mot de passe et le pays de votre cabinet" })
    }

  };

  const verifyCode = () => {
    if (codeVerification.join("") === generatedCode) {
      handleModalClose();
      saveDocteurAndCabinet();
    } else {
      setAlertObj({ type: "error", show: true, text: "Code incorrect. Un nouveau code a été envoyé." });
    }
  };

  const saveDocteurAndCabinet = async () => {
    try {
      setAlertObj({ type: "warning", show: true, text: "Chargement..." });

      await PageOuvertureController(pays).createCabinet(newCabinet);
      await PageOuvertureController(pays).createUser(newDocteur);


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
    } catch (error) {
      console.error("Erreur lors de l'ajout du docteur", error);
      setAlertObj({ type: "error", show: true, text: "Erreur lors de l'ajout du docteur" });
    }
  };

  const handleCodeChange = (index, value) => {
    const newCode = [...codeVerification];
    newCode[index] = value;
    setCodeVerification(newCode);
  };

  const connection = async (e) => {
    e.preventDefault();
    if (loginOrTel !== "" && password !== "" && pays !== "") {

      try {
        setAlertObj({ type: "warning", show: true, text: "Chargement..." });
        const userResponse = await PageOuvertureController(pays).connection(loginOrTel.toLowerCase(), password);
        // setTheUser(userResponse);

        if (userResponse.login && userResponse.password) {
          // Le statut de paiement est géré dans l'application (lecture seule ou bloqué)
          // On permet toujours la connexion pour voir les données, même sans paiement
          // Le mode lecture seule/bloqué sera appliqué via les composants qui désactivent les actions CRUD

          // Calculer le tabId (ID du cabinet/docteur)
          const tabId = userResponse.role === "docteur" ? userResponse.id : userResponse.loggId;
          
          // Enregistrer la trace de connexion
          await creerTrace(
            'login',
            'user',
            `${userResponse.nom || ''} ${userResponse.prenom || ''}`.trim() || userResponse.login,
            userResponse.id,
            userResponse.id,
            `${userResponse.nom || ''} ${userResponse.prenom || ''}`.trim() || userResponse.login,
            userResponse.role || 'user',
            tabId,
            tabId,
            pays,
            `Connexion réussie - Login: ${loginOrTel}`
          );
          
          // Stocker le statut de paiement dans sessionStorage pour l'utiliser dans l'application
          sessionStorage.setItem('statutPaiement', userResponse.statutPaiement || 'actif');
          
          setAlertObj({ type: "success", show: true, text: "Connexion réussie, bienvenue." });
          const tabIdSession =
            userResponse.role === "docteur"
              ? userResponse.id
              : (userResponse.logg_id ?? userResponse.loggId ?? userResponse.id);
          setDbPassword(password);
          setSession({
            userId: userResponse.id,
            tabId: tabIdSession,
            pays,
            patientId: "",
            role: userResponse.role ?? "",
          });
          navigate("/patient-detail");
        } else {
          setAlertObj({ type: "error", show: true, text: "Vous vous êtes probablement trompé, veuillez réessayer." });
        }
      } catch (error: any) {
        // Vérifier si c'est une erreur de paiement bloqué
        if (error?.response?.status === 403 || error?.message?.includes("abonnement")) {
          setAlertObj({ type: "error", show: true, text: error?.message || "Votre abonnement a expiré depuis plus de 5 mois. Veuillez effectuer un paiement pour continuer à utiliser l'application." });
        } else {
          setAlertObj({ type: "error", show: true, text: "Identifiants incorrects, veuillez réessayer." });
        }
        console.error(error);
      }
    } else {
      setAlertObj({ type: "error", show: true, text: "Veuillez remplir les informations manquantes" })
    }
  };

  const handleChange = (e) => {
    e.preventDefault()
    setShowConnection(false);
    setPays("");
    setShowNouveauCompte(true);
  };

  const handleModalClose = () => {

    setShowModal(false);
    setCodeVerification(["", "", "", "", ""]);
  };

  const generateVerificationCode = () => {
    let code = "";
    for (let i = 0; i < 5; i++) {
      code += Math.floor(Math.random() * 10).toString();
    }
    return code;
  };

  return (
    <>
      <center style={{ display: showNouveauCompte ? "block" : "none" }}>
        <div style={{
          borderWidth: "5px",
          borderStyle: "solid",
          borderColor:themes[ActualthemeNumber].secondary,
          maxWidth: "40%",
          padding: "20px",
          borderRadius: "10px"
        }}>
          <div style={{ width: "100%", display: "flex", justifyContent: "flex-end", alignItems: "flex-start" }}>
            <center>
              <PlayVideo color={"jaune"} />
            </center>
          </div>

          <form>
            <div className="row">
              <center><h2>Nouveau Compte: </h2></center>
              <div className="">
                <label htmlFor="nomDocteur" className="form-label">Nom:</label>
                <input type="text" className="form-control" id="nomDocteur" value={newDocteur.nom.toLocaleUpperCase()} onChange={(e) => setNewDocteur({ ...newDocteur, nom: e.target.value })} />
              </div>
              <div className="mb-3">
                <label htmlFor="prenomDocteur" className="form-label">Prenom:</label>
                <input type="text" className="form-control" id="prenomDocteur" value={upperLow(newDocteur.prenom)} onChange={(e) => setNewDocteur({ ...newDocteur, prenom: e.target.value })} />
              </div>
              <div className="mb-3">
                <label htmlFor="emailDocteur" className="form-label">Email:</label>
                <input type="email" className="form-control" id="emailDocteur" value={newDocteur.login} onChange={(e) => setNewDocteur({ ...newDocteur, login: e.target.value })} />
              </div>
              <div className="mb-3">
                <label htmlFor="pwdDocteur" className="form-label">Mot de passe:</label>
                <input type="password" className="form-control" id="pwdDocteur" value={newDocteur.password} onChange={(e) => setNewDocteur({ ...newDocteur, password: e.target.value })} />
              </div>
              <div className="">
                <label htmlFor="telDocteur" className="form-label">Téléphone: </label>
                <input type="text" className="form-control" id="telDocteur" value={newDocteur.telephone} onChange={(e) => setNewDocteur({ ...newDocteur, telephone: e.target.value.trim() })} />
              </div>
              <div className="mb-3">
                <label htmlFor="naissanceDocteur" className="form-label">Naissance:</label>
                <input type="date" className="form-control" id="naissanceDocteur" value={newDocteur.naissance} onChange={(e) => setNewDocteur({ ...newDocteur, naissance: e.target.value })} />
              </div>
              <div className="mb-3">
                <label htmlFor="adresseDocteur" className="form-label">Adresse:</label>
                <input type="text" className="form-control" id="adresseDocteur" value={newDocteur.adresse} onChange={(e) => setNewDocteur({ ...newDocteur, adresse: e.target.value })} />
              </div>
              <div className="mb-3">
                <label htmlFor="nomCabinet" className="form-label">Nom du Cabinet:</label>
                <input type="text" className="form-control" id="nomCabinet" value={newCabinet.nom} onChange={(e) => setNewCabinet({ ...newCabinet, nom: upperLow(e.target.value) })} />
              </div>
              <div className="mb-3">
                <label htmlFor="adresseCabinet" className="form-label">Adresse du Cabinet:</label>
                <input type="text" className="form-control" id="adresseCabinet" value={newCabinet.adresse} onChange={(e) => setNewCabinet({ ...newCabinet, adresse: e.target.value })} />
              </div>
              <div className="mb-3">
                <label htmlFor="paysCabinet" className="form-label">Pays du cabinet:</label>
                <select id="paysCabinet" className="form-select" value={pays} onChange={(e) => changeHandler(e.target.value)}>
                  <option value="">Entrer le pays du cabinet</option>
                  {options.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

              </div>
              <div>
                <ButtonAjouter onClick={addDocteur} />
              </div>
              <div style={{ marginTop: "50px" }}>
                <button style={{ background: "none", border: "none", color: "#8EFF30", cursor: "pointer" }} onClick={(e) => { e.preventDefault(); setShowConnection(true); setPays(""); setShowNouveauCompte(false); }}>
                  <small>Je souhaite me connecter</small>
                </button>
              </div>
            </div>
          </form>
        </div>
      </center>

      <center style={{ display: showConnection ? "block" : "none" }}>
        <div style={{
          borderWidth: "5px",
          borderStyle: "solid",
          borderColor: themes[ActualthemeNumber].secondary,
          maxWidth: "41%",
          padding: "20px",
          borderRadius: "10px"
        }}>
          <div style={{ width: "100%", display: "flex", justifyContent: "flex-end", alignItems: "flex-start" }}>
            <PlayVideo color={"jaune"} />
          </div>

          <div className="row">
            <div><center><h2>Connexion:</h2></center></div>
            <div className="mb-3">
              <label htmlFor="loginOrTelInput" className="form-label">Email:</label>
              <input type="text" className="form-control" id="loginOrTelInput" value={loginOrTel} onChange={(e) => setLoginOrTel(e.target.value)} />
            </div>
            <div className="mb-3">
              <label htmlFor="passwordInput" className="form-label">Mot de passe:</label>
              <input type="password" className="form-control" id="passwordInput" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="mb-3">
              <label htmlFor="pays" className="form-label">Pays du cabinet:</label>
              <select id="paysCabinet" className="form-select" value={pays} onChange={(e) => changeHandler(e.target.value)}>
                <option value="">Entrer le pays du cabinet</option>
                {options.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

            </div>
            <div>
              <button type="submit" className="btn color-violet w-5 border-2 px-5 border-warning text-warning" onClick={connection}>Se Connecter</button>
            </div>
            <div style={{ marginTop: "50px" }}>
              <button style={{ background: "none", border: "none", color: "#8EFF30", cursor: "pointer" }} onClick={(e) => handleChange(e)}>
                <small>Je souhaite créer un nouveau compte</small>
              </button>
            </div>
          </div>
        </div>
      </center>

      <Modal show={showModal} onHide={handleModalClose}>
        <Modal.Header closeButton>
          <Modal.Title>Vérification du code</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>Veuillez entrer les 5 chiffres envoyés par mail :</p>
          <small>(Si vous ne trouvez pas de nouveau mail, veuillez vérifier dans vos spams)</small>
          <div className="d-flex justify-content-between">
            {codeVerification.map((code, index) => (
              <input
                key={index}
                type="text"
                className="form-control"
                maxLength={1}
                value={code}
                onChange={(e) => handleCodeChange(index, e.target.value)}
                style={{ margin: "5px" }}
              />
            ))}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={verifyCode} disabled={codeVerification.includes("")}>
            Envoyer
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
