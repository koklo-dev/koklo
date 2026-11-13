"use client";

import {
  IconButton,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsNav,
  TabsTrigger,
  YesNoCell,
} from "@koklo/ui";
import { DevUiFrame, DevUiNote, DevUiSection } from "./dev-ui-frame.tsx";
import { MATRIX, MATRIX_ROLES, MEMBERS, NAV_TABS, STATE_TABS } from "./dev-ui-tables-data.ts";

function StateTabs({ label, size }: { label: string; size?: "sm" }) {
  return (
    <Tabs defaultValue="open" variant="underline" size={size}>
      <div className="border-b">
        <TabsList aria-label={label}>
          {STATE_TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              count={"count" in tab ? tab.count : undefined}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {STATE_TABS.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="text-meta text-muted-foreground">
          {`Contenu de l'onglet « ${tab.label} »`}
        </TabsContent>
      ))}
    </Tabs>
  );
}

function TabsFrame() {
  return (
    <DevUiFrame title="Tabs underline">
      <DevUiNote>
        36 de haut, écart 20, actif 600 et trait 2 --primary, défilement horizontal
      </DevUiNote>
      <div className="border-b">
        <TabsNav label="Sections de la page (démonstration)" tabs={NAV_TABS} />
      </div>
      <StateTabs label="États des demandes (démonstration)" />
      <StateTabs label="États dans un tiroir (démonstration)" size="sm" />
      <Tabs defaultValue="list">
        <TabsList aria-label="Affichage (démonstration)">
          <TabsTrigger value="list">Liste</TabsTrigger>
          <TabsTrigger value="board">Tableau</TabsTrigger>
        </TabsList>
        <TabsContent value="list" className="text-meta text-muted-foreground">
          Affichage en liste
        </TabsContent>
        <TabsContent value="board" className="text-meta text-muted-foreground">
          Affichage en tableau
        </TabsContent>
      </Tabs>
    </DevUiFrame>
  );
}

function MembersFrame() {
  return (
    <DevUiFrame title="Table framed">
      <DevUiNote>
        cadre --border rayon 12, en-tête --surface 12/500, défilement dans le cadre
      </DevUiNote>
      <Table>
        <TableCaption className="sr-only">Membres sans cadre (démonstration)</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Membre</TableHead>
            <TableHead scope="col">Rôle</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Camille Durand</TableCell>
            <TableCell>Propriétaire</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <Table framed>
        <TableCaption className="sr-only">Membres de l'organisation</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Membre</TableHead>
            <TableHead scope="col">Rôle</TableHead>
            <TableHead scope="col">Projets</TableHead>
            <TableHead scope="col">Dernière activité</TableHead>
            <TableHead scope="col">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MEMBERS.map((member) => (
            <TableRow key={member.email}>
              <TableHead scope="row" className="text-foreground">
                <span className="block font-semibold">{member.name}</span>
                <span className="block font-normal text-muted-foreground">{member.email}</span>
              </TableHead>
              <TableCell>{member.role}</TableCell>
              <TableCell>{member.projects}</TableCell>
              <TableCell>{member.last}</TableCell>
              <TableCell className="text-right">
                <IconButton icon="edit" size="sm" aria-label={`Modifier ${member.name}`} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DevUiFrame>
  );
}

function CompactFrame() {
  return (
    <DevUiFrame title="Table compact (fiche)">
      <DevUiNote>
        12 px, cellules 6 × 10, cadre de rayon 10 (champs d'une table, maquette 11)
      </DevUiNote>
      <Table framed compact aria-label="Champs de la table (démonstration)">
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Champ</TableHead>
            <TableHead scope="col">Type</TableHead>
            <TableHead scope="col">Contraintes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="font-mono">id</TableCell>
            <TableCell className="font-mono text-muted-foreground">uuid</TableCell>
            <TableCell>Clé primaire</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-mono">client</TableCell>
            <TableCell className="font-mono text-muted-foreground">→ T-client</TableCell>
            <TableCell>—</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </DevUiFrame>
  );
}

function MatrixFrame() {
  return (
    <DevUiFrame title="Table dense, stickyHeader et YesNoCell">
      <DevUiNote>
        12 px, en-tête collant, coche --status-validated-fg, tiret --border-strong
      </DevUiNote>
      <div>
        <Table framed dense stickyHeader frameClassName="max-h-60">
          <TableCaption className="sr-only">Ce que chaque rôle peut faire</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Action</TableHead>
              {MATRIX_ROLES.map((role) => (
                <TableHead key={role} scope="col" className="text-center">
                  {role}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {MATRIX.map((row) => (
              <TableRow key={row.action}>
                <TableCell>{row.action}</TableCell>
                {row.allowed.map((value, index) => (
                  <YesNoCell key={MATRIX_ROLES[index]} value={value} />
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </DevUiFrame>
  );
}

export function DevUiSurfacesC() {
  return (
    <DevUiSection
      id="dev-ui-surf-c"
      title="Onglets et tableaux · C : Tabs underline, Table et YesNoCell"
    >
      <TabsFrame />
      <MembersFrame />
      <MatrixFrame />
      <CompactFrame />
    </DevUiSection>
  );
}
