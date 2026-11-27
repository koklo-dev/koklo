"use client";

import {
  Button,
  ComparisonTable,
  EntityChip,
  EnvironmentTable,
  FilterChip,
  ListFooter,
  NfrCard,
  NfrCategory,
  OperationFicheTitle,
  OperationFieldsTable,
  OperationRow,
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

/** Zones, lignes d'opération (courante, proposée) et pied de liste (TK-116). */
function OperationSamples() {
  return (
    <div className="flex max-w-[560px] flex-col gap-2.5">
      {/* biome-ignore lint/a11y/useSemanticElements: groupe de filtres, pas un jeu de champs */}
      <div role="group" aria-label="Filtrer par zone" className="flex flex-wrap gap-1.5">
        <FilterChip variant="zone" pressed>
          Toutes · 132
        </FilterChip>
        <FilterChip variant="zone" pressed={false}>
          Personnel · 16
        </FilterChip>
      </div>
      <div className="overflow-hidden rounded-xl border border-border">
        <div>
          <OperationRow
            name="reservation.cancel"
            summary="Annule une réservation depuis le lien du SMS."
            permission="reservation.modifier"
            type="write"
            current
            onSelect={noop}
          />
          <OperationRow
            name="creneau.listAvailable"
            summary="Créneaux libres d'un service."
            permission="public"
            type="read"
            proposed
            onSelect={noop}
          />
          <OperationRow
            name="rappel.send"
            summary="Envoie le SMS de rappel."
            permission="interne"
            type="internal"
            onSelect={noop}
          />
        </div>
        <ListFooter state="more" pageSize={50} noun={{ one: "opération", other: "opérations" }} />
      </div>
    </div>
  );
}

/** Titre de fiche, tables et puces d'une opération. */
function OperationFicheSample() {
  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <OperationFicheTitle>reservation.cancel</OperationFicheTitle>
      <OperationFieldsTable
        title="Erreurs"
        columns={["Code", "Règle", "Quand"]}
        rows={[["DELAI_DEPASSE", "R-002", "moins de 2 h avant le rendez-vous"]]}
      />
      <div className="flex flex-wrap gap-1.5">
        <EntityChip kind="permission" id="PM-reservation.modifier" title="Client (les siennes)" />
        <EntityChip kind="permission" id="" title="Accueil" />
        <EntityChip kind="rule" icon="rule" id="R-002" />
        <EntityChip kind="feature" id="F-002" />
        <EntityChip kind="limit" id="limite" title="20 par minute et par IP" />
      </div>
    </div>
  );
}

/** Catégorie et cartes : sans couverture, couverte, à couvrir et à revoir. */
function NfrSamples() {
  return (
    <NfrCategory label="Performance" icon="speed" count={2}>
      <NfrCard
        id="NFR-002"
        title="Rapidité du portail sur mobile"
        target="LCP < 2,5 s en 4G"
        statement="Le portail affiche les créneaux en moins de 2,5 s."
        verification="Mesure en CI"
        coverage="covered"
        onEdit={noop}
      />
      <NfrCard
        id="NFR-003"
        title="Temps de réponse de l'API"
        target="p95 < 300 ms"
        statement="Les opérations de réservation répondent vite."
        verification="À définir"
        coverage="uncovered"
        stale
      />
    </NfrCategory>
  );
}

/** Galerie du cahier technique (DESIGN.md §5.26 et §5.27, maquette 14) : données de la planche, sans écriture. */
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
      <OperationSamples />
      <OperationFicheSample />
      <NfrSamples />
    </section>
  );
}
