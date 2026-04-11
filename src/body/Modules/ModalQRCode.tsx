import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faQrcode } from "@fortawesome/free-solid-svg-icons";
import { PagePatientController } from "../controllers/PagePatientController.js";
import { PageProfilController } from "../controllers/PageProfilController.js";
import { useAlert } from "../context/SearchContext.js";
import { checkPrivilege } from "../helpers/helpers.js";
import { useTheme } from '../context/ThemeContext.js';
import { Modal as ModalGlobal } from '../../items/Modal.tsx';

type QrCodeRole = "patient" | "docteur" | "assistant" | "comptable" | "secretaire" | "collaborateur";

const convertBase64ToImageURL = async (base64Data: string, filename: string): Promise<string | null> => {
    try {
        const prefix = 'base64,';
        const start = base64Data.indexOf(prefix) + prefix.length;
        if (start === -1) throw new Error("Invalid image format");
        const base64Image = base64Data.substring(start);
        const byteCharacters = atob(base64Image);
        const byteArrays: BlobPart[] = [];
        for (let offset = 0; offset < byteCharacters.length; offset += 512) {
            const slice = byteCharacters.slice(offset, offset + 512);
            const byteNumbers = slice.split('').map(char => char.charCodeAt(0));
            const byteArray = new Uint8Array(byteNumbers);
            byteArrays.push(byteArray);
        }
        const blob = new Blob(byteArrays, { type: `image/${filename.split('.').pop()}` });
        return URL.createObjectURL(blob);
    } catch (error) {
        console.error("Failed to convert base64 to image URL:", error);
        return null;
    }
};

export const ModalQRCode = ({ id, tabId, privs, pays, role = "patient", collaborateurTypeNom }: { id: string; tabId: string; privs: string[]; pays: string; role?: QrCodeRole; collaborateurTypeNom?: string }) => {
    const [show, setShow] = useState(false);
    const [modalContent, setModalContent] = useState(<div />);
    const [modalTitle, setModalTitle] = useState("");
    const [imageUrl, setImageUrl] = useState("");
    const { setAlertObj } = useAlert();
    const { themeNumber } = useTheme();

    const handleClose = () => setShow(false);

    const handleShow = async () => {
        if (!checkPrivilege("qrc01", privs)) {
            return setAlertObj({ type: "error", show: true, text: "Vous n'avez pas les droits pour voir le QR code, veuillez demander les autorisations à votre Docteur." });
        }
        try {
            setAlertObj({ type: "warning", show: true, text: "Chargement..." });
            let base64Data = "";
            if (role === "patient") {
                const qRCode = await PagePatientController(pays).voirQrCode(id, tabId);
                base64Data = qRCode.part1 + qRCode.part2 + qRCode.part3 + qRCode.part4 + qRCode.part5 + qRCode.part6 + qRCode.part7 + qRCode.part8 + qRCode.part9 + qRCode.part10;
            } else {
                const profilCtrl = PageProfilController(pays);
                let data: { base64?: string };
                if (role === "docteur") {
                    data = await profilCtrl.voirQRCodeDocteur(id, tabId);
                } else if (role === "assistant") {
                    data = await profilCtrl.voirQRCodeAssistant(id, tabId);
                } else if (role === "comptable") {
                    data = await profilCtrl.voirQRCodeComptable(id, tabId);
                } else if (role === "secretaire") {
                    data = await profilCtrl.voirQRCodeSecretaire(id, tabId);
                } else if (role === "collaborateur") {
                    data = await profilCtrl.voirQRCodeCollaborateur(id, tabId, collaborateurTypeNom ?? "collaborateur");
                } else {
                    data = {};
                }
                base64Data = data?.base64 ?? "";
            }
            const imageUrl = await convertBase64ToImageURL(base64Data, `${new Date().getTime()}`) ?? "";
            setImageUrl(imageUrl);
            setModalTitle("QR-code:");
            setModalContent(
                <div style={{ justifyContent: "center", alignItems: "center", margin: "10px" }}>
                    <center>
                        <img src={imageUrl} alt="QR Code" style={{ maxWidth: "300px", maxHeight: "300px", width: "100%", height: "auto" }} />
                    </center>
                </div>
            );
        } catch (error) {
            console.error("Erreur lors de la récupération de la photo:", error);
            setImageUrl("");
            setModalContent(
                <div className="d-flex justify-content-center">
                    <div className="spinner-border" role="status">
                        <span className="visually-hidden">Loading...</span>
                    </div>
                </div>
            );
        }
        setShow(true);
    };

    return (
        <>
            <div className="row fist-div" style={{ margin: 0 }}>
                {checkPrivilege("qrc01", privs) ? (
                    <div className="m-2" style={{ fontSize: "30px", cursor: "pointer", display: "inline-block", color: "inherit" }} onClick={handleShow}>
                        <FontAwesomeIcon icon={faQrcode} style={{ color: "inherit" }} />
                    </div>
                ) : (
                    <div className="alert alert-danger text-center" >
                        Vous n'avez pas les privilèges nécessaires pour voir ce QR code. Veuillez demander l'autorisation à votre Docteur.
                    </div>
                )}
                <ModalGlobal
                    show={show}
                    onClose={handleClose}
                    title={modalTitle}
                    width="auto"
                    maxWidth="600px"
                    maxHeight="90vh"
                >
                    {imageUrl ? (
                        modalContent
                    ) : (
                        <div className="d-flex justify-content-center">
                            <div className="spinner-border" role="status">
                                <span className="visually-hidden">Loading...</span>
                            </div>
                        </div>
                    )}
                </ModalGlobal>
            </div>
        </>
    );
}

export default ModalQRCode;
