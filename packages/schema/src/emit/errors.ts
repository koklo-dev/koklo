/** Erreur d'émission : `path` est le pointeur JSON de la valeur refusée (racine : chaîne vide). */
export class EmitError extends Error {
  readonly path: string;

  constructor(name: string, message: string, path: string) {
    super(`${message} (${path === "" ? "racine" : path})`);
    this.name = name;
    this.path = path;
  }
}
