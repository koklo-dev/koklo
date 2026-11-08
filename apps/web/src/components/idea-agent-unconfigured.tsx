import type { IdeaPageSummary } from "@koklo/contract";
import { InlineAlert } from "@koklo/ui";
import {
  AGENT_FIRST_MESSAGE,
  ASK_ADMIN,
  guideForSlug,
  NOT_CONFIGURED_TEXT,
} from "../lib/idea-agent-labels.ts";
import { settingsPath } from "../lib/shell-routes.ts";
import { ShellLink } from "./shell-link.tsx";

/** Agent sans clé d'IA (C4) : l'éditeur reste utilisable ; ici l'alerte, le guide statique et le premier message fixe. */
export function IdeaAgentUnconfigured({
  canConfigure,
  current,
}: {
  canConfigure: boolean;
  current: IdeaPageSummary | undefined;
}) {
  const guide = guideForSlug(current?.slug);
  return (
    <>
      <InlineAlert variant="neutral" icon="lock">
        <p>{NOT_CONFIGURED_TEXT}</p>
        {canConfigure ? (
          <ShellLink
            href={settingsPath("ai")}
            className="font-semibold underline underline-offset-2"
          >
            Configurer l'IA
          </ShellLink>
        ) : (
          <p>{ASK_ADMIN}</p>
        )}
      </InlineAlert>
      <section aria-label="Questions pour cette page" className="flex flex-col gap-2 text-meta">
        <span className="font-semibold">{AGENT_FIRST_MESSAGE}</span>
        {guide.length > 0 ? (
          <>
            <span className="text-muted-foreground">
              {`Pour « ${current?.title ?? "cette page"} », voici de quoi vous guider :`}
            </span>
            <ul className="flex list-disc flex-col gap-1.5 pl-[22px]">
              {guide.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    </>
  );
}
