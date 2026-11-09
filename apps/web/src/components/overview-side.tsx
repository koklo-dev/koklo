import type { ProjectOverview } from "@koklo/contract";
import { ActivityFeed, Button, Card, PersonRow } from "@koklo/ui";
import { othersLabel, whenOf } from "../lib/overview-labels.ts";
import { activityPath } from "../lib/shell-routes.ts";
import { ageOf } from "../lib/spec-age.ts";
import { ShellLink } from "./shell-link.tsx";

/** Projection d'un événement du serveur pour `ActivityFeed` : la phrase est celle du serveur, la date est relative. */
export function feedItems(items: ProjectOverview["activity"]["items"], now = Date.now()) {
  return items.map((item) => ({
    actor: { kind: item.actor.kind, initials: item.actor.initials },
    text: item.text,
    when: (
      <time dateTime={item.at} title={new Date(item.at).toLocaleString("fr-FR")}>
        {whenOf(item.at, now, ageOf)}
      </time>
    ),
  }));
}

/** Colonne de droite (maquette 07 l.169-191) : Activité puis Personnes. */
export function OverviewSide({
  projectId,
  activity,
  people,
}: {
  projectId: string;
  activity: ProjectOverview["activity"];
  people: ProjectOverview["people"];
}) {
  return (
    <div className="flex max-w-[420px] min-w-0 flex-[1_1_320px] flex-col gap-6 max-lg:max-w-none">
      <Card asChild className="flex flex-col gap-3.5 px-5">
        <section aria-labelledby="overview-activity">
          <h2 id="overview-activity" className="text-section-title">
            Activité
          </h2>
          <ActivityFeed items={feedItems(activity.items)} />
          {activity.total > 0 ? (
            <Button asChild variant="outline" size="compact" className="self-start">
              <ShellLink href={activityPath(projectId)}>
                Voir toute l'activité
                <span className="text-caption font-normal text-muted-foreground">
                  · {activity.total}
                </span>
              </ShellLink>
            </Button>
          ) : null}
        </section>
      </Card>
      <Card asChild className="flex flex-col gap-3 px-5">
        <section aria-labelledby="overview-people">
          <h2 id="overview-people" className="text-section-title">
            Personnes
          </h2>
          {people.items.map((person) => (
            <PersonRow
              key={`${person.kind}-${person.name}`}
              name={person.name}
              initials={person.initials}
              roleLabel={person.role}
              kind={person.kind}
            />
          ))}
          {people.others > 0 ? (
            <p className="text-caption text-muted-foreground">{othersLabel(people.others)}</p>
          ) : null}
        </section>
      </Card>
    </div>
  );
}
