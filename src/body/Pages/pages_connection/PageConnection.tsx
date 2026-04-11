import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./css/pagesConnection.css";
import { useTheme } from "../../context/ThemeContext.js";
import { useAlert, useMode } from "../../context/SearchContext.js";
import { useSession } from "../../context/SessionContext.js";
import PageOuvertureController from "../../controllers/PageOuvertureController.js";
import PageProfilController from "../../controllers/PageProfilController.js";
import AutorisationController from "../../controllers/AutorisationController.js";
import { openExternalUrl, invoke } from "../../../tauri-bridge.js";
import { encrypteRepositoryStructure, formatConnectionError } from "../../helpers/helpers.js";
import {
  themes,
  criptKey,
  checkAdminCredentials,
  getDefaultSadminPassword,
} from "../../../constants/index.ts";
import { Input } from "../../../items/Input.tsx";

export default function PageConnection() {
    const { themeNumber } = useTheme();
    const { setAlertObj } = useAlert();
    const { setSession, setDbPassword } = useSession();
    const { setMode } = useMode();
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    useEffect(() => {
        (async () => {
            try {
                const payload = encrypteRepositoryStructure({ pays: "sn", tabId: "main" }, criptKey);
                await invoke("ensure_default_demo_docteur", { payload });
            } catch {
                /* non bloquant */
            }
        })();
    }, []);

    const handleConnection = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (email && password) {
                if (checkAdminCredentials(email, password)) {
                    try {
                        const payloadRm = encrypteRepositoryStructure({ pays: "sn", tabId: "main" }, criptKey);
                        await invoke("remove_demo_docteur_after_sadmin_login", { payload: payloadRm });
                    } catch {
                        /* non bloquant */
                    }
                    setMode("superAdmin");
                    setDbPassword(password);
                    setSession({ userId: "sadmin", tabId: "main", pays: "sn", patientId: "", role: "sadmin" });
                    setAlertObj({ type: "success", text: "Connexion admin réussie.", show: true });
                    navigate("/profil");
                    return;
                }
                const userResponse = await PageOuvertureController("sn").connection(
                    email.toLowerCase().trim(),
                    password
                );
                if (userResponse && userResponse.id) {
                    const tabId = userResponse.role === "docteur" ? userResponse.id : (userResponse.logg_id ?? userResponse.id);
                    const pays = "sn";

                    // Si docteur et statut "bloque" (expiré > 5 mois) : redirection directe vers PayDunya
                    let alertPaiement = false;
                    if (userResponse.role === "docteur") {
                        try {
                            const statut = await AutorisationController(pays).verifierStatutPaiement(userResponse.id, tabId);
                            if (statut?.statut === "bloque") {
                                const privileges = await AutorisationController(pays).recupererPriviliegesDuUser(userResponse.id, tabId);
                                const docteur = {
                                    id: userResponse.id,
                                    nom: userResponse.nom ?? "",
                                    prenom: userResponse.prenom ?? "",
                                    email: userResponse.login ?? "",
                                    telephone: userResponse.telephone ?? "",
                                    role: userResponse.role ?? "docteur",
                                    loggId: userResponse.logg_id ?? userResponse.id,
                                };
                                const urlPay = await PageProfilController(pays).payerAvecPaydounia(docteur, privileges);
                                if (urlPay) {
                                    await openExternalUrl(urlPay);
                                    setAlertObj({ type: "warning", text: "Paiement requis. Une fenêtre PayDunya s'est ouverte. Effectuez le paiement puis actualisez la page.", show: true });
                                    alertPaiement = true;
                                }
                            }
                        } catch (err) {
                            console.warn("Vérification paiement ou redirection PayDunya:", err);
                        }
                    }

                    if (!alertPaiement) {
                        setAlertObj({ type: "success", text: "Connexion réussie, bienvenue.", show: true });
                    }
                    setDbPassword(password);
                    setSession({
                        userId: userResponse.id,
                        tabId,
                        pays,
                        patientId: "",
                        mustChangePassword:
                            !!userResponse.mustChangePassword || !!userResponse.must_change_password,
                        mustChangeDemoEmail:
                            !!userResponse.mustChangeDemoEmail ||
                            !!userResponse.must_change_demo_email,
                        role: userResponse.role ?? "",
                    });
                    navigate("/patient-detail");
                } else {
                    setAlertObj({ type: "error", text: "Identifiants incorrects, veuillez réessayer.", show: true });
                }
            } else {
                setAlertObj({ type: "warning", text: "Veuillez remplir tous les champs.", show: true });
            }
        } catch (error) {
            console.error("Erreur lors de la connexion", error);
            setAlertObj({ type: "error", text: formatConnectionError(error), show: true });
        }
    };


    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <div className="row flex-grow-1" style={{ flex: 1 }}>
                <div className="col-xl-6" />
                <div className="col-xl-6 color-violet" style={{ backgroundColor: themes[themeNumber].primary, color: themes[themeNumber].secondary }}>
                    <form onSubmit={handleConnection} className="m-3 text-center">
                        <center>
                            <h1 className="m-5">Connexion</h1>
                        </center>
                        <div className="mb-3">
                            <label htmlFor="Email" className="form-label">Email ou téléphone</label>
                            <Input
                                type="text"
                                className="logg-input form-control"
                                id="Email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Email, téléphone ou login admin (ex: sadmin)"
                            />
                        </div>
                        <div className="mb-3">
                            <label htmlFor="pwd" className="form-label">Mot de passe</label>
                            <Input
                                type="password"
                                className="logg-input form-control"
                                id="pwd"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Mot de passe"
                            />
                        </div>
                        <p className="small text-start px-2 opacity-90" style={{ maxWidth: "420px", margin: "0 auto" }}>
                            <strong>Sadmin (super-admin)</strong> : login <code>sadmin</code>, mot de passe ={" "}
                            <code>706</code> + <em>date du jour</em> au format jour + mois + année (8 chiffres),
                            ex. aujourd&apos;hui : <code>{getDefaultSadminPassword()}</code>. Ce code change chaque jour.
                            Si vous aviez modifié les identifiants dans le Profil, utilisez ceux-ci ou le mot de passe du jour.
                        </p>
                        <div>
                            <center>
                                <button className="btn btn-warning my-5 p-2 px-5" type="submit">
                                    Connexion
                                </button>
                            </center>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
