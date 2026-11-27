import { EmitError } from "./errors.ts";

/** Refus d'émission d'un fichier `security/` : `path` est le pointeur de la valeur, jamais recopiée. */
export class EmitSecurityError extends EmitError {
  static readonly fallback = "fichier de sécurité invalide";
  constructor(message: string, path: string) {
    super("EmitSecurityError", message, path);
  }
}
