import React, { useEffect, useState } from "react";
import { ImCogs } from "react-icons/im";
import { checkPrivilege } from "../helpers/helpers.tsx";
import { useAlert } from "../context/SearchContext.js";
import { Modal as ModalGlobal } from "../../items/Modal.tsx";
import { ModalField, ModalSection, ModalGrid, ModalActions } from './ModalFormComponents.tsx';
import { themes, ActualthemeNumber } from "../../constants/index.ts";
import { phoneOnChangeHandler } from "../helpers/phoneFormat.ts";

export default function Modal({ modal, thePatient, privs }) {
    const [show, setShow] = useState(false);
    const [modalContent, setModalContent] = useState(<div />);
    const [modalTitle, setModalTitle] = useState("");
    const [modalButton, setModalButton] = useState(<div />);

    const [nom, setNom] = useState("");
    const [prenom, setPrenom] = useState("");
    const [login, setLogin] = useState("");
    const [adresse, setAdresse] = useState("");
    const [telephone, setTelephone] = useState("");
    const [naissance, setNaissance] = useState("");
    const [nomDeJeuneFille, setNomDeJeuneFille] = useState("");
    const [profession, setProfession] = useState("");
    const [adresserPar, setAdresserPar] = useState("");
    const [observation, setObservation] = useState("");
    const { setAlertObj } = useAlert();

    useEffect(() => {
        if (thePatient) {
            setNom(thePatient.nom);
            setPrenom(thePatient.prenom);
            setLogin(thePatient.login);
            setAdresse(thePatient.adresse);
            setTelephone(thePatient.telephone);
            setNaissance(thePatient.naissance);
            setNomDeJeuneFille(thePatient.nomDeJeuneFille);
            setProfession(thePatient.profession);
            setAdresserPar(thePatient.adresserPar);
            setObservation(thePatient.observation);
        }
    }, [show]);

    const handleClose = () => {
        setShow(false);
    };

    const handleShow = () => {
        if (modal === "patientDetailPayement") {
            const privilegeAlert = checkPrivilege("aud01", privs);
            if (privilegeAlert) return privilegeAlert;
            setModalTitle("Modifier les informations sur le payement");
            setModalContent(
                <>
                    <div className="row">
                        <h1 className="my-5 mx-3">  Payement:
                            <input className=" logg-input form-check-input mx-5" type="checkbox" value="" id="flexCheckChecked" />
                        </h1>
                    </div>
                    <div className="row">
                        <h5 className="my-2 mx-3">  Prix de l'acte: <br /> <h4 className="mx-5">txt</h4></h5>
                    </div>
                    <div className="row mx-3">
                        <div className="logg-input input-group mb-3">
                            <select className="form-select" style={{ backgroundColor: "#fdda37", color: themes[ActualthemeNumber].primary, fontWeight: "bolt" }} id="mySelect">
                                <option value="Option 1">Option 1</option>
                                <option value="Option 2">Option 2</option>
                            </select>
                            <input type="text" className="logg-input form-control" id="myInput" />
                        </div>
                    </div>
                    <div className="row">
                        <h5 className="my-2 mx-3"> L'Assurance doit payer:<br />
                            <h4 className="mx-5">
                                <div className="row my-2">
                                    <div className="col-xl-8">
                                        <div className="mb-3">
                                            <input type="text" className="logg-input" id="exampleInputEmail1" aria-describedby="emailHelp" />
                                        </div>
                                    </div>
                                    <div className="col-xl-4">
                                        txt
                                    </div>
                                </div>
                            </h4>
                        </h5>
                    </div>
                    <div className="row">
                        <h5 className="my-2 mx-3"> Le patient doit payer au totale: <br /> <h4 className="mx-5">txt</h4></h5>
                    </div>
                    <div className="row">
                        <h5 className="my-2 mx-3"> Montant deja payer:<br />
                            <h4 className="mx-5">
                                <div className="row my-2">
                                    <div className="col-xl-8">
                                        <div className="mb-3">
                                            <input type="text" className="logg-input" id="exampleInputEmail1" aria-describedby="emailHelp" />
                                        </div>
                                    </div>
                                    <div className="col-xl-4">
                                        txt
                                    </div>
                                </div>
                            </h4>
                        </h5>
                    </div>
                    <div className="row">
                        <h5 className="my-2 mx-3"> Avoir:<br /> <h4 className="mx-5">txt</h4></h5>
                    </div>
                </>
            );
            setModalButton(<button type="button" className="btn btn-danger" onClick={handleClose}>Executer et Fermer</button>);
        } else if (modal === "patientDetailInfoPatient") {
            const privilegeAlert = checkPrivilege("pat01", privs);
            if (privilegeAlert) return privilegeAlert;
            setModalContent(
                <form action="/patient-detail">
                    <ModalSection title="Identité">
                        <ModalGrid columns={2}>
                            <ModalField
                                id="txtNomPatient"
                                label="Nom"
                                value={nom}
                                onChange={(e) => setNom(e.target.value.toUpperCase())}
                                placeholder="Nom du patient"
                            />
                            <ModalField
                                id="txtPrenomPatient"
                                label="Prénom"
                                value={prenom}
                                onChange={(e) => setPrenom(e.target.value.toLowerCase())}
                                placeholder="Prénom du patient"
                            />
                            <ModalField
                                id="txtNomDeJeuneFillePatient"
                                label="Nom de jeune fille"
                                value={nomDeJeuneFille}
                                onChange={(e) => setNomDeJeuneFille(e.target.value)}
                                placeholder="Optionnel"
                            />
                            <ModalField
                                id="txtNaissancePatient"
                                label="Date de naissance"
                                type="date"
                                value={naissance}
                                onChange={(e) => setNaissance(e.target.value)}
                            />
                        </ModalGrid>
                    </ModalSection>
                    
                    <ModalSection title="Coordonnées">
                        <ModalGrid columns={2}>
                            <ModalField
                                id="txtLoginPatient"
                                label="Email"
                                type="email"
                                value={login}
                                onChange={(e) => setLogin(e.target.value)}
                                placeholder="email@example.com"
                            />
                            <ModalField
                                id="txtTelephonePatient"
                                label="Téléphone"
                                value={telephone}
                                onChange={(e) => phoneOnChangeHandler(e, setTelephone)}
                                placeholder="+221 … (indicatif pays)"
                            />
                        </ModalGrid>
                        
                        <ModalField
                            id="txtAdressePatient"
                            label="Adresse"
                            value={adresse}
                            onChange={(e) => setAdresse(e.target.value)}
                            placeholder="Adresse complète"
                            fullWidth
                        />
                        <ModalField
                            id="txtProfessionPatient"
                            label="Profession"
                            value={profession}
                            onChange={(e) => setProfession(e.target.value)}
                            placeholder="Profession du patient"
                            fullWidth
                        />
                    </ModalSection>
                    
                    <ModalSection title="Informations complémentaires">
                        <ModalField
                            id="txtAdresserParPatient"
                            label="Adressé par"
                            value={adresserPar}
                            onChange={(e) => setAdresserPar(e.target.value)}
                            placeholder="Nom du référent"
                            fullWidth
                        />
                        <ModalField
                            id="txtObservationPatient"
                            label="Observations"
                            value={observation}
                            onChange={(e) => setObservation(e.target.value)}
                            placeholder="Notes supplémentaires sur le patient..."
                            rows={4}
                            fullWidth
                        />
                    </ModalSection>
                </form>
            );
            setModalButton(
                <ModalActions>
                    <button 
                        type="button" 
                        className="modal-btn modal-btn-primary" 
                        onClick={handleClose}
                        style={{backgroundColor: themes[ActualthemeNumber].primary, color: 'white'}}
                    >
                        Enregistrer
                    </button>
                </ModalActions>
            );
        }
        setShow(true);
    };

    return (
        <>
            <div className="row fist-div">
                {checkPrivilege("pat02", privs) ? (
                    <button type="button" className="btn btn-primary btn-lg mx-5" style={{ justifyContent: "center", alignItems: "center" }} onClick={handleShow}>
                        <ImCogs /> <span className="mx-3">Modifier</span> <ImCogs />
                    </button>
                ) : (
                    <div className="alert alert-danger text-center" >
                        Vous n'avez pas les privilèges nécessaires pour modifier ces informations. Veuillez demander l'autorisation à votre Docteur.
                    </div>
                )}
                <ModalGlobal
                    show={show}
                    onClose={handleClose}
                    title={modalTitle}
                    maxWidth="800px"
                >
                    {modalContent}
                    <div className="my-3">
                        {modalButton}
                    </div>
                </ModalGlobal>
            </div>
        </>
    );
}
