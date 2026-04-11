import React, { useState } from "react";
import { Modal as ModalGlobal } from "../../items/Modal.tsx";
import { useSession } from "../context/SessionContext";
import { useAlert } from "../context/SearchContext";
import { useTheme } from "../context/ThemeContext";
import { themes } from "../../constants/index.ts";
import { PageProfilController } from "../controllers/PageProfilController";

export default function ModalChangementMotDePasse() {
    const { session, clearMustChangePassword } = useSession();
    const { setAlertObj } = useAlert();
    const { themeNumber } = useTheme();
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const show = !!session.mustChangePassword && !!session.userId;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword.length < 4) {
            setAlertObj({ type: "error", show: true, text: "Le mot de passe doit contenir au moins 4 caractères." });
            return;
        }
        if (newPassword === "1234" || newPassword === "0000") {
            setAlertObj({
                type: "error",
                show: true,
                text: "Choisissez un mot de passe autre que 1234 ou 0000.",
            });
            return;
        }
        if (newPassword !== confirmPassword) {
            setAlertObj({ type: "error", show: true, text: "Les mots de passe ne correspondent pas." });
            return;
        }
        setIsSubmitting(true);
        try {
            await PageProfilController(session.pays || "sn").changerMotDePasse(
                session.userId,
                newPassword,
                session.tabId || "main"
            );
            clearMustChangePassword();
            setNewPassword("");
            setConfirmPassword("");
            setAlertObj({ type: "success", show: true, text: "Votre mot de passe a été modifié avec succès." });
        } catch (error) {
            console.error("Erreur lors du changement de mot de passe:", error);
            setAlertObj({ type: "error", show: true, text: "Erreur lors du changement de mot de passe." });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!show) return null;

    return (
        <ModalGlobal
            show={show}
            onClose={() => {}}
            title="Changement de mot de passe obligatoire"
            showCloseButton={false}
            width="400px"
            maxWidth="95vw"
        >
            <div style={{ padding: "20px 0" }}>
                <p style={{ marginBottom: 20, color: themes[themeNumber].secondary }}>
                    Mot de passe trop basique, veuillez en créer un nouveau.
                </p>
                <form onSubmit={handleSubmit}>
                    <div className="mb-3">
                        <label className="form-label" style={{ color: themes[themeNumber].secondary }}>
                            Nouveau mot de passe
                        </label>
                        <input
                            type="password"
                            className="form-control"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Saisissez votre nouveau mot de passe"
                            required
                            minLength={4}
                            style={{ color: themes[themeNumber].primary, borderColor: themes[themeNumber].secondary }}
                        />
                    </div>
                    <div className="mb-4">
                        <label className="form-label" style={{ color: themes[themeNumber].secondary }}>
                            Confirmer le mot de passe
                        </label>
                        <input
                            type="password"
                            className="form-control"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Confirmez votre nouveau mot de passe"
                            required
                            minLength={4}
                            style={{ color: themes[themeNumber].primary, borderColor: themes[themeNumber].secondary }}
                        />
                    </div>
                    <button
                        type="submit"
                        className="btn w-100"
                        disabled={isSubmitting}
                        style={{
                            backgroundColor: themes[themeNumber].secondary,
                            color: themes[themeNumber].primary,
                            fontWeight: 600,
                        }}
                    >
                        {isSubmitting ? "Enregistrement..." : "Enregistrer le nouveau mot de passe"}
                    </button>
                </form>
            </div>
        </ModalGlobal>
    );
}
