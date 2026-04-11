import React, { useCallback, useState } from "react";
import {
  openShareLoggApproLinkByEmail,
  openShareOuvertureUrlByEmail,
} from "../../tauri-bridge.ts";

export interface BoutonEmailProps {
  /**
   * Ancien usage (NavTop, patient, assistance) : ouvre un mailto vers cette adresse.
   * Si renseigné (non vide), ce mode est prioritaire sur shareUrl / modeOuverture.
   */
  email?: string | null;
  /** Libellé du bouton en mode mailto (ex. « Contacter LoggyStudio »). */
  theText?: string;
  body?: string;
  subject?: string;

  /** URL à inclure dans le message (modal QR, page scan). Ignoré si `email` est renseigné. */
  shareUrl?: string | null;
  /** Résout l’URL d’accès puis ouvre le mail (page d’ouverture, etc.). */
  modeOuverture?: boolean;
  disabled?: boolean;
  /** Libellé en mode partage de lien (défaut : « Envoyer le lien par email »). */
  label?: string;
  className?: string;
  style?: React.CSSProperties;
  backgroundColor?: string;
  textColor?: string;
  icon?: React.ReactNode;
  onError?: (message: string) => void;
  /**
   * E-mail du compte connecté à LoggAppro (ex. login du docteur).
   * Le standard `mailto:` ne permet pas d’imposer l’expéditeur : on ajoute ce rappel
   * en bas du corps pour que l’utilisateur choisisse le bon compte dans Outlook / Gmail / etc.
   */
  connectedUserEmail?: string | null;
}

/**
 * Bouton e-mail : mode classique `mailto:` (email / theText / subject / body)
 * ou partage de lien LoggAppro (shareUrl / modeOuverture via tauri-bridge).
 */
export default function BoutonEmail({
  email,
  theText,
  body = "",
  subject = "",
  shareUrl,
  modeOuverture = false,
  disabled = false,
  label = "Envoyer le lien par email",
  className,
  style,
  backgroundColor = "#5A28A5",
  textColor = "#fff",
  icon = <span style={{ fontSize: 18 }}>📤</span>,
  onError,
  connectedUserEmail,
}: BoutonEmailProps) {
  const [loading, setLoading] = useState(false);

  const emailTrim = String(email ?? "").trim();
  const isLegacyMailto = emailTrim.length > 0;
  const urlOk = Boolean(String(shareUrl ?? "").trim());

  const isDisabled =
    disabled ||
    loading ||
    (isLegacyMailto ? !emailTrim : !modeOuverture && !urlOk);

  const handleLegacyMailto = useCallback(() => {
    const hint = String(connectedUserEmail ?? "").trim();
    const bodyWithHint =
      hint.length > 0
        ? `${body}\n\n---\nCompte LoggAppro (sélectionnez ce compte comme expéditeur « De » si besoin) : ${hint}`
        : body;
    const mailtoUrl = `mailto:${emailTrim}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyWithHint)}`;
    window.location.href = mailtoUrl;
  }, [emailTrim, subject, body, connectedUserEmail]);

  const handleShareClick = useCallback(async () => {
    setLoading(true);
    try {
      if (modeOuverture) {
        const r = await openShareOuvertureUrlByEmail();
        if (!r.ok && r.error) {
          onError?.(r.error);
        }
        return;
      }
      const u = String(shareUrl ?? "").trim();
      if (!u) return;
      await openShareLoggApproLinkByEmail(u);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Impossible d'ouvrir l'e-mail.";
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }, [modeOuverture, shareUrl, onError]);

  const onClick = () => {
    if (isLegacyMailto) {
      handleLegacyMailto();
      return;
    }
    void handleShareClick();
  };

  const buttonLabel = isLegacyMailto
    ? theText || "Envoyer un e-mail"
    : loading
      ? "Préparation…"
      : label;

  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={onClick}
      className={className}
      title={
        isLegacyMailto
          ? "Ouvrir votre messagerie pour écrire à cette adresse"
          : "Ouvre votre messagerie avec le lien d’accès (ou Gmail en secours)"
      }
      style={{
        backgroundColor: isDisabled ? "#ccc" : backgroundColor,
        color: isDisabled ? "#555" : textColor,
        border: "none",
        borderRadius: 8,
        padding: "10px 20px",
        cursor: isDisabled ? "not-allowed" : "pointer",
        fontSize: 14,
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        opacity: isDisabled ? 0.6 : 1,
        ...style,
      }}
    >
      {!isLegacyMailto && icon}
      {buttonLabel}
    </button>
  );
}
