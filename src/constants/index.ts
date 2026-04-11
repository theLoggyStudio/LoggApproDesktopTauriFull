/**
 * Point d’entrée des constantes applicatives (alignement `.cursorrules`).
 * Les modules historiques sous `body/constants` sont réexportés ici pour les nouveaux imports.
 */
export { codeCouleur } from "./codeCouleur.constant.ts";
export { themes, ActualthemeNumber } from "../body/constants/themes.constants.ts";
export * from "../body/constants/environement.constant.ts";
export * from "../body/constants/privileges.constants.ts";
export * from "../body/constants/emailjs.constants.ts";
export type { AdminConfig } from "../body/constants/adminConfig.ts";
export {
  getDefaultSadminPassword,
  getAdminConfig,
  setAdminConfig,
  checkAdminCredentials,
  clearAdminConfigFromStorage,
} from "../body/constants/adminConfig.ts";
