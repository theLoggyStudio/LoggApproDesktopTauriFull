/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly REACT_APP_EMAIL_JS_SERVICE_ID?: string;
  readonly REACT_APP_EMAIL_JS_TEMPLATE_ID?: string;
  readonly REACT_APP_EMAIL_JS_PUBLIC_KEY?: string;
  readonly REACT_APP_EMAIL_JS_PRIVATE_KEY?: string;
  readonly REACT_APP_EMAIL_JS_ME_NAME?: string;
  readonly REACT_APP_BACK_URL?: string;
  readonly REACT_APP_FRONT_URL?: string;
  readonly REACT_APP_BACK_PORT?: string;
  readonly REACT_APP_CRIPT_KEY?: string;
  readonly REACT_APP_CRIPT_KEY_FRONT?: string;
  readonly REACT_APP_CRIPT_KEY_URL?: string;
  readonly REACT_APP_ADMIN?: string;
}

// Dans un fichier de déclarations, par exemple custom.d.ts
declare module '*.png' {
  const content: string;
  export default content;
}


declare module '*.jpg' {
  const content: string;
  export default content;
}

declare module '*.jpeg' {
  const content: string;
  export default content;
}

declare module 'crypto-browserify' {
  import { Hash, Hmac, Cipher, Decipher } from 'crypto';
  export function createHash(algorithm: string): Hash;
  export function createHmac(algorithm: string, key: string | Buffer | DataView): Hmac;
  export function createCipher(algorithm: string, password: string | Buffer | DataView): Cipher;
  export function createDecipher(algorithm: string, password: string | Buffer | DataView): Decipher;
  // Add any other crypto methods you are using here
}

declare global {
  interface Window {
    __TAURI__?: unknown;
    onInsertVariablesTable?: (params: {
      category: string;
      items: any[];
      htmlTable: string;
      insertCallback: (params: any) => void;
    }) => void;
  }
}

export {};
