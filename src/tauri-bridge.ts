/**
 * Pont Tauri - fournit invoke() de manière sûre.
 * - En mode Tauri (fenêtre native) : utilise invoke() natif
 * - En mode navigateur (accès depuis un autre PC) : utilise le serveur HTTP sur le port 7062
 */

const TAURI_REQUIRED_MSG =
  "L'application doit être lancée avec Tauri pour utiliser le backend. " +
  "Utilisez 'npm run dev:tauri' et assurez-vous que le serveur HTTP backend (port 7062) est démarré.";

export function isTauriAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}

export function getHttpBackendUrl(): string {
  if (typeof window === "undefined") return "http://localhost:7062";
  const hostname = window.location.hostname;
  return `http://${hostname}:7062`;
}

/** Vérifie si le backend HTTP est accessible (mode web uniquement). */
export async function checkBackendHealth(): Promise<{ ok: boolean; error?: string }> {
  if (isTauriAvailable()) return { ok: true };
  try {
    const res = await fetch(`${getHttpBackendUrl()}/health`, { method: "GET" });
    return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: msg || "Impossible de joindre le backend. Lancez 'npm run dev:tauri' et assurez-vous que le pare-feu autorise le port 7062.",
    };
  }
}

// Utilise window.__TAURI__ (withGlobalTauri) pour éviter l'erreur "Failed to resolve module specifier"
// L'import dynamique @tauri-apps/api/core peut échouer selon l'environnement de bundling
async function invokeViaTauri<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const tauri = typeof window !== "undefined" ? (window as unknown as { __TAURI__?: { core?: { invoke: (c: string, a?: Record<string, unknown>) => Promise<T> } } }).__TAURI__ : undefined;
  const invoke = tauri?.core?.invoke;
  if (!invoke) throw new Error(TAURI_REQUIRED_MSG);
  return invoke(cmd, args) as Promise<T>;
}

async function invokeViaHttp<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const url = `${getHttpBackendUrl()}/invoke`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: cmd, payload: args?.payload ?? args ?? null }),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Backend inaccessible (${getHttpBackendUrl()}). ` +
        "Lancez 'npm run dev:tauri' et vérifiez que le pare-feu autorise le port 7062. " +
        `Détail: ${msg}`
    );
  }
  if (!res.ok) {
    const errText = await res.text();
    let detail = errText || res.statusText;
    try {
      const j = JSON.parse(errText) as { error?: string };
      if (typeof j?.error === "string" && j.error.length) {
        detail = j.error;
      }
    } catch {
      /* corps non-JSON */
    }
    let msg = `Backend HTTP (${res.status}): ${detail}`;
    // 500 « Body manquant » / parse : souvent clé front ≠ clé Rust (build sans REACT_APP_CRIPT_KEY)
    if (/body manquant|champ .body.|déchiff|dechiffr|decrypt|json invalide/i.test(detail)) {
      msg +=
        " — accès web : définir REACT_APP_CRIPT_KEY au même moment que `npm run build` que celle du backend Rust (.env.example, ACCES_WEB.md).";
    }
    throw new Error(msg);
  }
  const data = await res.json();
  return data as T;
}

export async function invoke<T = unknown>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  if (isTauriAvailable()) {
    return invokeViaTauri<T>(cmd, args ?? {});
  }
  return invokeViaHttp<T>(cmd, args);
}

/** Ouvre une URL dans le navigateur système (Tauri) ou un nouvel onglet (web). */
export async function openExternalUrl(url: string): Promise<boolean> {
  if (typeof url !== "string" || url.length < 6) return false;
  const lower = url.slice(0, 8).toLowerCase();
  const isHttp = lower.startsWith("http://") || lower.startsWith("https://");
  const isMailto = lower.startsWith("mailto:");
  if (!isHttp && !isMailto) return false;
  if (isTauriAvailable()) {
    try {
      // Commande native : sous Windows ouvre Microsoft Edge si possible, sinon navigateur par défaut.
      await invokeViaTauri<void>("open_external_url_prefer_edge", { url });
      return true;
    } catch {
      return false;
    }
  }
  const w = window.open(url, "_blank", "noopener,noreferrer");
  return w != null;
}

/**
 * Partage le lien d'accès (QR) par e-mail : sous Tauri, `window.open` / mailto sont souvent bloqués ;
 * on passe par le plugin opener. Sur le web, on tente Gmail puis redirection `mailto:` si popup bloquée.
 */
export async function openShareLoggApproLinkByEmail(qrUrl: string): Promise<void> {
  if (!qrUrl || typeof qrUrl !== "string") return;
  const subject = "Lien d'accès à l'application LoggAppro";
  const body = `Bonjour,\n\nVoici le lien pour accéder à l'application LoggAppro :\n\n${qrUrl}\n\nCordialement`;
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  if (isTauriAvailable()) {
    const mailOk = await openExternalUrl(mailtoUrl);
    if (!mailOk) {
      await openExternalUrl(gmailUrl);
    }
    return;
  }

  const w = window.open(gmailUrl, "_blank", "noopener,noreferrer");
  if (w == null) {
    window.location.href = mailtoUrl;
  }
}

const FRONT_DEV_PORT = "7061";

/**
 * URL du front (page d’ouverture) pour la partager : en Tauri, IP locale + port (commande `get_local_ip`) ;
 * en navigateur, origine courante (port 7061 par défaut).
 */
export async function getLoggApproOuvertureShareUrl(): Promise<{ url: string; error?: string }> {
  if (isTauriAvailable()) {
    try {
      const data = await invoke<{ success?: boolean; frontUrl?: string }>("get_local_ip", {});
      if (data?.success && typeof data.frontUrl === "string" && data.frontUrl.length > 0) {
        return { url: data.frontUrl };
      }
      return {
        url: "",
        error: "Impossible d'obtenir l'adresse réseau. Vérifiez votre connexion.",
      };
    } catch {
      return { url: "", error: "Impossible d'obtenir l'adresse réseau." };
    }
  }
  if (typeof window === "undefined") {
    return { url: `http://localhost:${FRONT_DEV_PORT}` };
  }
  const port = window.location.port || FRONT_DEV_PORT;
  return { url: `${window.location.protocol}//${window.location.hostname}:${port}` };
}

/** Ouvre le client mail (ou Gmail) avec le lien de la page d’ouverture / d’accès au front. */
export async function openShareOuvertureUrlByEmail(): Promise<{ ok: boolean; error?: string }> {
  const { url, error } = await getLoggApproOuvertureShareUrl();
  if (!url) {
    return { ok: false, error };
  }
  await openShareLoggApproLinkByEmail(url);
  return { ok: true };
}
