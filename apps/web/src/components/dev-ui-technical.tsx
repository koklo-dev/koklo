"use client";

import {
  Button,
  ComparisonTable,
  EnvironmentTable,
  ProposalDetailSection,
  ProposalDetailText,
  SpecRowsPanel,
  StackChoiceCard,
  StackFicheTitle,
  StackLayer,
} from "@koklo/ui";

const noop = () => undefined;

/** Couche et cartes : choisie et ouverte, à revoir, proposée. */
function StackSamples() {
  return (
    <StackLayer label="Services externes" count={3}>
      <StackChoiceCard
        id="ST-sms"
        roleName="Fournisseur SMS"
        choice="À trancher"
        forText="Pour C-sms"
        status="open"
        icon="sms"
        selected
        onSelect={noop}
      />
      <StackChoiceCard
        id="ST-mail"
        roleName="Fournisseur e-mail"
        choice="Brevo"
        forText="Pour C-mail"
        status="chosen"
        icon="mail"
        stale
        onSelect={noop}
      />
      <StackChoiceCard
        id="ST-ci"
        roleName="Intégration et déploiement"
        choice="GitHub Actions"
        forText="Pour toute l'équipe"
        status="chosen"
        icon="rocket_launch"
        proposed
        onSelect={noop}
      />
    </StackLayer>
  );
}

/** Titre de fiche et tableau comparatif. */
function ComparisonSample() {
  return (
    <>
      <StackFicheTitle>PostgreSQL 17</StackFicheTitle>
      <ComparisonTable
        options={["Brevo", "Twilio", "OVHcloud SMS"]}
        criteria={[
          { label: "Prix estimé par SMS", values: ["≈ 0,045 €", "≈ 0,07 €", "≈ 0,04 €"] },
          { label: "Données en UE", values: ["Oui", "Non par défaut", "Oui"] },
        ]}
        highlight={{ option: "Brevo", tag: "Recommandé" }}
      />
    </>
  );
}

/** Tableau des environnements et son action. */
function EnvironmentSample() {
  return (
    <EnvironmentTable
      title="Environnements"
      columns={[
        { id: "dev", name: "Développement" },
        { id: "staging", name: "Recette" },
        { id: "production", name: "Production" },
      ]}
      rows={[
        {
          label: "Adresse",
          mono: true,
          values: ["localhost:3000", "recette.exemple.fr", "reservation.exemple.fr"],
        },
        { label: "SMS", values: ["Simulés", "Numéros de test", "Fournisseur à trancher"] },
      ]}
      action={
        <Button type="button" variant="outline" size="sm">
          Modifier
        </Button>
      }
    />
  );
}

/** Panneaux Variables et Intégrations. */
function PanelSamples() {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] gap-4">
      <SpecRowsPanel
        icon="key"
        title="Variables et secrets"
        note="Noms seulement : aucune valeur dans la spec"
        mono
        rows={[
          {
            name: "DATABASE_URL",
            usage: "Connexion à la base",
            pill: { label: "Coffre de l'hébergeur", tone: "outline" },
          },
        ]}
      />
      <SpecRowsPanel
        icon="cable"
        title="Intégrations externes"
        rows={[
          {
            name: "GitHub",
            usage: "Dépôt de code et CI",
            pill: { label: "Connecté", tone: "success" },
          },
        ]}
      />
    </div>
  );
}

/** Rubrique de relecture en capitales (`ProposalDetailSection variant="label"`, maquette 14 l.156). */
function RubricSample() {
  return (
    <ProposalDetailSection title="Texte proposé" variant="label">
      <ProposalDetailText variant="prose">
        Toute erreur de réservation déclenche une alerte en moins de 5 minutes.
      </ProposalDetailText>
    </ProposalDetailSection>
  );
}

/** Galerie du cahier technique (TK-115, DESIGN.md §5.26, maquette 14) : données de la planche, sans écriture. */
export function TechnicalGallery() {
  return (
    <section aria-labelledby="gallery-technical" className="flex min-w-0 flex-col gap-4">
      <h2 id="gallery-technical" className="text-section-title">
        Cahier technique
      </h2>
      <StackSamples />
      <ComparisonSample />
      <EnvironmentSample />
      <PanelSamples />
      <RubricSample />
    </section>
  );
}
