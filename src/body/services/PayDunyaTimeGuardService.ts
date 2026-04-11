/**
 * Service de garde-temps pour le module PayDunya uniquement.
 * Vérifie la validité de l'horloge avant d'autoriser les paiements.
 * N'affecte pas les autres modules de l'application.
 */

import { invoke } from "../../tauri-bridge";

export type PayDunyaStatus =
  | "ACTIVE"
  | "LIMITED"
  | "BLOCKED"
  | "OFFLINE_ALLOWED"
  | "SUSPICIOUS_CLOCK"
  | "ERROR";

export interface PayDunyaGuardResult {
  canUse: boolean;
  status: PayDunyaStatus;
  message?: string;
}

export interface PayDunyaStatusDetail {
  status: PayDunyaStatus;
  firstUseAt?: string;
  lastSeenAt?: string;
  lastServerAt?: string;
  anomalyCount?: number;
}

/**
 * Vérifie si PayDunya peut être utilisé.
 * Appelle le backend pour une vérification hybride (local + serveur).
 */
export async function canUsePayDunya(): Promise<PayDunyaGuardResult> {
  try {
    const result = await invoke<PayDunyaGuardResult>("paydunya_can_use");
    return result ?? { canUse: false, status: "ERROR", message: "Réponse invalide" };
  } catch (error) {
    console.warn("[PayDunyaTimeGuard] Erreur canUsePayDunya:", error);
    return {
      canUse: false,
      status: "ERROR",
      message: "Impossible de vérifier l'état PayDunya. Réessayez plus tard.",
    };
  }
}

/**
 * Récupère le statut détaillé du garde-temps PayDunya.
 */
export async function getPayDunyaStatus(): Promise<PayDunyaStatusDetail | null> {
  try {
    const result = await invoke<PayDunyaStatusDetail>("paydunya_get_status");
    return result;
  } catch (error) {
    console.warn("[PayDunyaTimeGuard] Erreur getPayDunyaStatus:", error);
    return null;
  }
}

/**
 * Enregistre une utilisation de PayDunya (appelé après un paiement réussi).
 * Le backend le fait déjà automatiquement, cette fonction est pour usage explicite si besoin.
 */
export async function registerPayDunyaUsage(): Promise<boolean> {
  try {
    await invoke("paydunya_register_usage");
    return true;
  } catch (error) {
    console.warn("[PayDunyaTimeGuard] Erreur registerPayDunyaUsage:", error);
    return false;
  }
}

/**
 * Synchronise l'heure serveur et met à jour l'état local.
 * Utile pour une vérification proactive avant d'afficher l'UI de paiement.
 */
export async function syncPayDunyaServerTime(): Promise<PayDunyaGuardResult> {
  try {
    const result = await invoke<{ success: boolean; canUse: boolean; status: string; message?: string }>(
      "paydunya_sync_time"
    );
    return {
      canUse: result?.canUse ?? false,
      status: (result?.status ?? "ERROR") as PayDunyaStatus,
      message: result?.message,
    };
  } catch (error) {
    console.warn("[PayDunyaTimeGuard] Erreur syncPayDunyaServerTime:", error);
    return {
      canUse: false,
      status: "ERROR",
      message: "Synchronisation impossible.",
    };
  }
}
