import type { IncidentContact, SecuritySummaryCard } from "@koklo/contract";
import { ExpectationBox, SummaryCard, SummaryGrid } from "@koklo/ui";
import type { ReactNode } from "react";
import {
  CARD_ICONS,
  CONTACT_MISSING,
  contactText,
  EXPECTATION_TITLE,
} from "../lib/security-labels.ts";

/** Les cartes du résumé, la dernière sur toute la largeur (maquette 15 l.208-209). */
export function SummaryCards({ cards }: { cards: readonly SecuritySummaryCard[] }) {
  return (
    <SummaryGrid>
      {cards.map((card, index) => (
        <SummaryCard
          key={card.key}
          icon={CARD_ICONS[card.key]}
          title={card.title}
          wide={index === cards.length - 1}
        >
          {card.text}
        </SummaryCard>
      ))}
    </SummaryGrid>
  );
}

/** « Ce que nous attendons de vous » : le contact en cas d'incident (maquette 15 l.211, 825-826). */
export function ContactExpectation({
  contact,
  action,
}: {
  contact: IncidentContact | undefined;
  action?: ReactNode;
}) {
  return (
    <ExpectationBox pending={!contact} title={EXPECTATION_TITLE} action={action}>
      {contact ? contactText(contact) : CONTACT_MISSING}
    </ExpectationBox>
  );
}
