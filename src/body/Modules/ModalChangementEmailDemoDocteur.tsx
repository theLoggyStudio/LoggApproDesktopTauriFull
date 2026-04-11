import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal as ModalGlobal } from "../../items/Modal.tsx";
import { useSession } from "../context/SessionContext";
import { useAlert } from "../context/SearchContext";
import { useTheme } from "../context/ThemeContext";
import { themes } from "../../constants/index.ts";
import { PageProfilController } from "../controllers/PageProfilController";

const primary = (n: number) => themes[n].primary;

/**
 * Modal non fermable tant que la finalisation n’est pas faite (pas de ✕, pas de fond cliquable).
 * Crée un nouveau docteur (UUID), supprime le démo, puis redirige vers la page de connexion.
 */
export default function ModalChangementEmailDemoDocteur() {
    const navigate = useNavigate();
    const { session, clearSession } = useSession();
    const { setAlertObj } = useAlert();
    const { themeNumber } = useTheme();
    const [newEmail, setNewEmail] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const show =
        !!session.mustChangeDemoEmail &&
        !!session.userId &&
        !session.mustChangePassword;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = newEmail.trim().toLowerCase();
        if (!trimmed || !trimmed.includes("@") || trimmed.length < 5) {
            setAlertObj({
                type: "error",
                show: true,
                text: "Veuillez saisir une adresse e-mail valide.",
            });
            return;
        }
        if (newPassword.length < 4) {
            setAlertObj({
                type: "error",
                show: true,
                text: "Le mot de passe doit contenir au moins 4 caractères.",
            });
            return;
        }
        if (newPassword !== confirmPassword) {
            setAlertObj({
                type: "error",
                show: true,
                text: "Les deux mots de passe ne correspondent pas.",
            });
            return;
        }
        setIsSubmitting(true);
        try {
            const res = await PageProfilController(session.pays || "sn").finaliserEmailDemoDocteur(
                session.userId,
                trimmed,
                newPassword
            );
            const msg =
                (res && typeof res === "object" && "message" in res && typeof (res as { message?: string }).message === "string"
                    ? (res as { message: string }).message
                    : null) ??
                "Compte créé. Reconnectez-vous avec votre e-mail et votre mot de passe.";
            clearSession();
            setNewEmail("");
            setNewPassword("");
            setConfirmPassword("");
            setAlertObj({
                type: "success",
                show: true,
                text: msg,
            });
            navigate("/");
        } catch (error: unknown) {
            console.error("finalize_demo_docteur_email:", error);
            const msg =
                typeof error === "string"
                    ? error
                    : (error as { message?: string })?.message?.replace(/^[^:]+:\s*/, "") ??
                      "Impossible de mettre à jour l'e-mail.";
            setAlertObj({ type: "error", show: true, text: msg });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!show) return null;

    const textColor = primary(themeNumber);

    return (
        <ModalGlobal
            show={show}
            onClose={() => {}}
            title="Finaliser votre compte (remplacer la démo)"
            titleColor={textColor}
            showCloseButton={false}
            closeOnBackdropClick={false}
            width="460px"
            maxWidth="95vw"
        >
            <div style={{ padding: "20px 0" }}>
                <p
                    style={{
                        marginBottom: 16,
                        color: textColor,
                        fontWeight: 500,
                        lineHeight: 1.55,
                    }}
                >
                    Indiquez votre e-mail et un mot de passe définitif : un nouveau compte docteur sera créé,
                    vos données du démo (patients, actes) seront conservées, puis vous serez renvoyé à l’écran
                    de connexion pour vous identifier avec ce nouvel e-mail.
                </p>
                <form onSubmit={handleSubmit}>
                    <div className="mb-3">
                        <label className="form-label" style={{ color: textColor, fontWeight: 600 }}>
                            Nouvelle adresse e-mail
                        </label>
                        <input
                            type="email"
                            className="form-control"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            placeholder="exemple@domaine.com"
                            autoComplete="email"
                            style={{
                                color: textColor,
                                borderColor: themes[themeNumber].secondary,
                            }}
                        />
                    </div>
                    <div className="mb-3">
                        <label className="form-label" style={{ color: textColor, fontWeight: 600 }}>
                            Nouveau mot de passe
                        </label>
                        <input
                            type="password"
                            className="form-control"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Au moins 4 caractères"
                            autoComplete="new-password"
                            style={{
                                color: textColor,
                                borderColor: themes[themeNumber].secondary,
                            }}
                        />
                    </div>
                    <div className="mb-3">
                        <label className="form-label" style={{ color: textColor, fontWeight: 600 }}>
                            Confirmer le mot de passe
                        </label>
                        <input
                            type="password"
                            className="form-control"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Répétez le mot de passe"
                            autoComplete="new-password"
                            style={{
                                color: textColor,
                                borderColor: themes[themeNumber].secondary,
                            }}
                        />
                    </div>
                    <button
                        type="submit"
                        className="btn w-100"
                        disabled={isSubmitting}
                        style={{
                            backgroundColor: themes[themeNumber].secondary,
                            color: textColor,
                            fontWeight: 600,
                        }}
                    >
                        {isSubmitting ? "Création du compte…" : "Créer mon compte et me reconnecter"}
                    </button>
                </form>
            </div>
        </ModalGlobal>
    );
}
