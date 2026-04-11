import React from "react";
import Form from "react-bootstrap/Form";
import type { FormControlProps } from "react-bootstrap/FormControl";

/**
 * Champ de saisie de base (Bootstrap). Étendre via props optionnelles plutôt que dupliquer.
 * Les formulaires métier peuvent importer ce composant depuis `src/items`.
 */
export const Input = React.forwardRef<HTMLInputElement, FormControlProps>(
  function Input(props, ref) {
    return <Form.Control ref={ref} {...props} />;
  }
);
Input.displayName = "Input";
