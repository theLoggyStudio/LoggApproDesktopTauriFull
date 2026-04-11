/**
 * Store d'authentification pour l'accès aux bases de données.
 * Chaque requête backend doit inclure userId et dbPassword.
 * Sadmin utilise le mot de passe du jour (706JJMMAAAA).
 */

let authGetter: (() => { userId: string; dbPassword: string }) | null = null;

export function setAuthGetter(getter: () => { userId: string; dbPassword: string }): void {
  authGetter = getter;
}

export function getAuth(): { userId: string; dbPassword: string } {
  if (!authGetter) return { userId: "", dbPassword: "" };
  return authGetter();
}
