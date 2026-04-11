export const emailjs = {
  serviceId: import.meta.env.REACT_APP_EMAIL_JS_SERVICE_ID ?? "",
  templateId: import.meta.env.REACT_APP_EMAIL_JS_TEMPLATE_ID ?? "",
  publicKey: import.meta.env.REACT_APP_EMAIL_JS_PUBLIC_KEY ?? "",
  privateKey: import.meta.env.REACT_APP_EMAIL_JS_PRIVATE_KEY ?? "",
  me: {
    name: import.meta.env.REACT_APP_EMAIL_JS_ME_NAME ?? "",
  },
};