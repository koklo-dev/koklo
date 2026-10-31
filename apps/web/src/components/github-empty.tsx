import { Card, CardDescription, CardHeader, CardTitle } from "@koklo/ui";

/** Aucune installation : le bouton d'installation (unique) reste celui de l'en-tête. */
export function GithubEmpty() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Aucune application GitHub installée</CardTitle>
        <CardDescription>
          Installez l'application pour que Koklo puisse créer le dépôt de spécification de vos
          projets. Vous choisirez le compte et les dépôts concernés sur GitHub.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
