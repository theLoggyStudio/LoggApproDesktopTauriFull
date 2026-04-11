import emailjs from "emailjs-com";
import { invoke } from "../../tauri-bridge";
import { emailjs as ej, criptKey } from "../../constants/index.ts";
import { encrypteRepositoryStructure, decrypteRepositoryStructure } from "../helpers/helpers.tsx";

export const PageOuvertureController = (pays: string) => {
  return {
    createUser: async (newUser: any) => {
      // POST /api/pageOuverture/docteur  -> create_docteur
      const payload = encrypteRepositoryStructure({ ...newUser, role: "docteur", pays }, criptKey, false);
      await invoke("create_docteur", { payload });
    },

    connection: async (loginOrTel: string, password: string) => {
      // POST /api/pageOuverture/connection -> auth_connection
      // pays n'est plus utilisé pour l'authentification (valeur par défaut côté backend)
      const payload = encrypteRepositoryStructure({ loginOrTel, password }, criptKey, false);

      try {
        const encryptedData = await invoke<any>("auth_connection", { payload });

        // IMPORTANT:
        // En HTTP tu dépendais de response.status (403 etc).
        // En Tauri, on doit représenter ces cas dans la réponse.
        //
        // Convention recommandée côté Rust:
        // - retourner Ok(encryptedData) si succès
        // - retourner Err("PAYMENT_EXPIRED:...") si paiement bloqué
        //
        // Mais comme on n’a pas encore le back, je garde un déchiffrement standard ici.
        return decrypteRepositoryStructure(encryptedData, criptKey);
      } catch (error: any) {
        // Si côté Rust tu renvoies une erreur structurée, on peut la gérer ici.
        // Exemple futur: error = "PAYMENT_EXPIRED:...."
        const msg = String(error?.message ?? error);

        // Si tu veux conserver la logique "403 abonnement", on peut la simuler par un préfixe d'erreur.
        if (msg.includes("PAYMENT_EXPIRED") || msg.includes("403")) {
          const e = new Error(
            "Votre abonnement a expiré depuis plus de 5 mois. Veuillez effectuer un paiement pour continuer à utiliser l'application."
          );
          throw e;
        }

        console.error("Erreur lors de la connexion :", error);
        throw error;
      }
    },

    createCabinet: async (newCabinet: any) => {
      // POST /api/pageOuverture/cabinet -> create_cabinet
      const payload = encrypteRepositoryStructure({ ...newCabinet, pays }, criptKey, false);
      await invoke("create_cabinet", { payload });
    },

    messageDAuthentification: async (loginOrTel: string, password: string) => {
      // POST /api/pageOuverture/auth -> auth_message
      const payload = encrypteRepositoryStructure({ loginOrTel, password, pays }, criptKey, false);

      try {
        const encryptedData = await invoke<any>("auth_message", { payload });
        return encryptedData; // ici ton code d’origine renvoyait response.json() (pas décrypté)
      } catch (error) {
        console.error("Erreur lors de l'authentification :", error);
        throw error;
      }
    },

    sendVerificationEmail: async (to: string, subject: string, htmlContent: string) => {
      try {
        emailjs.init(ej.publicKey);

        const templateParams = {
          to_email: to,
          subject,
          html_content: htmlContent,
          pays,
        };

        const response = await emailjs.send(
          ej.serviceId,
          ej.templateId,
          templateParams,
          ej.publicKey
        );

        console.log("Email envoyé avec succès:", response.status, response.text);
        return { success: true };
      } catch (error) {
        console.error("Erreur lors de l'envoi de l'email:", error);
        return { success: false, error };
      }
    },
  };
};

export default PageOuvertureController;
