import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EMAILED_TYPES,
  NOTIFICATION_SUBJECT_KINDS,
  NOTIFICATION_TYPES,
  type NotificationSubjectKind,
  type NotificationType,
} from "../notification/types.ts";
import { MailDeliveryError } from "./mail-errors.ts";
import {
  buildNotificationLink,
  buildNotificationMessage,
  isValidSubjectRef,
  NOTIFICATION_COPY,
  type NotificationMessageInput,
  SUBJECT_REF_PATTERNS,
} from "./notification-message.ts";

/**
 * TK-58b : gabarits d'e-mail de notification. Fonctions pures. Dictionnaire FIGÉ par type : le message
 * n'interpole que le nom de l'organisation et la clé du sujet (SG-3, TK-45...). Jamais de titre, de
 * texte libre, de nom d'auteur ou de destinataire, de contenu de spec ni de jeton. Lien = base
 * configurée + segments encodés, authentifié par la session (sans jeton).
 */
const PROJECT_ID = "01900000-0000-7000-8000-0000000000aa";
const NOTIFICATION_ID = "01900000-0000-7000-8000-0000000000bb";
const BASE = "https://app.koklo.dev";
const REFS: Record<NotificationSubjectKind, string> = {
  suggestion: "SG-3",
  review: "01900000-0000-7000-8000-0000000000cc",
  baseline: "baseline-0",
  ticket: "TK-45",
};

function input(over: Partial<NotificationMessageInput> = {}): NotificationMessageInput {
  return {
    notificationId: NOTIFICATION_ID,
    to: "alice@example.test",
    type: "baseline.proposed",
    organizationName: "Cabinet Martin",
    projectId: PROJECT_ID,
    subjectKind: "baseline",
    subjectRef: "baseline-0",
    webBaseUrl: BASE,
    ...over,
  };
}

function failureOf(fn: () => unknown): MailDeliveryError | undefined {
  try {
    fn();
  } catch (error) {
    return error as MailDeliveryError;
  }
  return undefined;
}

describe("types de notification : parité avec la base", () => {
  it("la liste du worker est exactement celle du CHECK de la migration notifications", () => {
    const sql = readFileSync(
      resolve(
        import.meta.dirname,
        "../../../../packages/db/prisma/migrations/20261101120000_notifications/migration.sql",
      ),
      "utf8",
    );
    const listOf = (constraint: string) =>
      [
        ...(
          sql.match(new RegExp(`${constraint}" CHECK \\("[a-z_]+" IN \\(([^)]*)\\)`))?.[1] ?? ""
        ).matchAll(/'([^']+)'/g),
      ].map((m) => m[1]);
    expect([...NOTIFICATION_TYPES]).toEqual(listOf("notifications_type_check"));
    expect([...NOTIFICATION_SUBJECT_KINDS]).toEqual(listOf("notifications_subject_kind_check"));
  });

  it("seuls baseline.proposed, review.submitted et ticket.blocked envoient un e-mail (D2)", () => {
    expect([...EMAILED_TYPES].sort()).toEqual([
      "baseline.proposed",
      "review.submitted",
      "ticket.blocked",
    ]);
  });
});

describe("gabarit par type : exhaustivité", () => {
  it("le dictionnaire couvre exactement les 7 types, sans type en trop", () => {
    expect(Object.keys(NOTIFICATION_COPY).sort()).toEqual([...NOTIFICATION_TYPES].sort());
    expect(Object.keys(SUBJECT_REF_PATTERNS).sort()).toEqual(
      [...NOTIFICATION_SUBJECT_KINDS].sort(),
    );
  });

  it("deux types n'ont jamais le même sujet", () => {
    const subjects = NOTIFICATION_TYPES.map((type) => NOTIFICATION_COPY[type].subject);
    expect(new Set(subjects).size).toBe(NOTIFICATION_TYPES.length);
  });

  it.each(NOTIFICATION_TYPES)("%s : un message texte + HTML complet", (type) => {
    const message = buildNotificationMessage(input({ type }));
    const copy = NOTIFICATION_COPY[type as NotificationType];
    expect(message.to).toBe("alice@example.test");
    expect(message.subject).toBe(copy.subject);
    expect(message.subject.length).toBeGreaterThan(0);
    expect(message.subject.length).toBeLessThanOrEqual(120);
    expect(message.text).toContain(copy.lead);
    expect(message.html).toContain(copy.lead);
    expect(message.text).toContain("Cabinet Martin");
    expect(message.html).toContain("Cabinet Martin");
    expect(message.text).toContain("baseline-0");
    expect(message.html).toContain("baseline-0");
    expect(message.html).toMatch(/<a href="[^"]+">/);
  });

  it("le sujet est du dictionnaire seul : aucune interpolation (pas d'injection d'en-tête possible)", () => {
    const message = buildNotificationMessage(
      input({ organizationName: "Org\r\nBcc: x@example.test" }),
    );
    expect(message.subject).toBe(NOTIFICATION_COPY["baseline.proposed"].subject);
    expect(message.subject).not.toMatch(/[\r\n\0]/);
  });

  it("porte la clé d'idempotence notification:<id> et un en-tête de référence, jamais List-Unsubscribe", () => {
    const message = buildNotificationMessage(input());
    expect(message.idempotencyKey).toBe(`notification:${NOTIFICATION_ID}`);
    expect(message.headers).toEqual({ "X-Entity-Ref-ID": NOTIFICATION_ID });
    expect(JSON.stringify(message.headers).toLowerCase()).not.toContain("unsubscribe");
  });
});

describe("non-fuite : aucun contenu libre, nom, adresse d'autrui, spec ni jeton", () => {
  const SENTINELS = {
    title: "SENTINEL-TITLE-Refonte du paiement",
    body: "SENTINEL-BODY-texte de la suggestion",
    comment: "SENTINEL-COMMENT-commentaire de review",
    decisionNote: "SENTINEL-DECISION-note de décision",
    authorName: "SENTINEL-AUTHOR-Jeanne Auteur",
    authorEmail: "sentinel-author@example.test",
    recipientName: "SENTINEL-RECIPIENT-Alice Destinataire",
    projectName: "SENTINEL-PROJECT-Client Confidentiel",
    specContent: "SENTINEL-SPEC-feature: paiement",
    token: "SENTINEL-TOKEN-Zk9qWmV4",
  };

  it.each(NOTIFICATION_TYPES)(
    "%s : aucune valeur sentinelle, même passée en champ supplémentaire",
    (type) => {
      const message = buildNotificationMessage({ ...input({ type }), ...SENTINELS } as never);
      const all = `${message.subject}\n${message.text}\n${message.html}\n${JSON.stringify(message.headers)}`;
      for (const sentinel of Object.values(SENTINELS)) {
        expect(all, sentinel).not.toContain(sentinel);
      }
      expect(all).not.toContain("SENTINEL");
    },
  );

  it("l'adresse du destinataire n'apparaît que dans `to`", () => {
    const message = buildNotificationMessage(input());
    expect(`${message.subject}${message.text}${message.html}`).not.toContain("alice@example.test");
  });

  it("le seul contenu variable du corps est l'organisation, la clé et le lien", () => {
    const a = buildNotificationMessage(input());
    const b = buildNotificationMessage(
      input({ organizationName: "Autre Org", subjectRef: "baseline-7", projectId: null }),
    );
    const strip = (text: string, org: string, ref: string, link: string) =>
      text.replaceAll(link, "LINK").replaceAll(org, "ORG").replaceAll(ref, "REF");
    expect(strip(a.text, "Cabinet Martin", "baseline-0", buildNotificationLink(input()))).toBe(
      strip(
        b.text,
        "Autre Org",
        "baseline-7",
        buildNotificationLink(input({ projectId: null, subjectRef: "baseline-7" })),
      ),
    );
  });
});

describe("lien : base configurée + segments encodés, sans jeton", () => {
  it("projet connu : <base>/projects/<projet>/<genre>/<clé>", () => {
    expect(buildNotificationLink(input())).toBe(
      `${BASE}/projects/${PROJECT_ID}/baseline/baseline-0`,
    );
    expect(buildNotificationLink(input({ subjectKind: "ticket", subjectRef: "TK-45" }))).toBe(
      `${BASE}/projects/${PROJECT_ID}/ticket/TK-45`,
    );
  });

  it("sans projet : <base>/notifications", () => {
    expect(buildNotificationLink(input({ projectId: null }))).toBe(`${BASE}/notifications`);
  });

  it("texte et HTML portent exactement le même lien", () => {
    const message = buildNotificationMessage(input());
    const link = buildNotificationLink(input());
    expect(message.text).toContain(link);
    expect(message.html).toContain(`href="${link}"`);
  });

  it("aucun paramètre de requête, fragment ni jeton ; uniquement des caractères sûrs", () => {
    for (const kind of NOTIFICATION_SUBJECT_KINDS) {
      const link = buildNotificationLink(input({ subjectKind: kind, subjectRef: REFS[kind] }));
      expect(link).not.toMatch(/[?#]/);
      expect(link.toLowerCase()).not.toContain("token");
      expect(link.slice(BASE.length)).toMatch(/^[A-Za-z0-9._~/-]+$/);
    }
  });

  it("l'identifiant de projet doit être un UUID (sinon refus typé)", () => {
    for (const projectId of ["../admin", "p 1", `${PROJECT_ID}/x`, "javascript:alert(1)", ""]) {
      const error = failureOf(() => buildNotificationLink(input({ projectId })));
      expect(error, projectId).toBeInstanceOf(MailDeliveryError);
      expect(error?.code).toBe("invalid-message");
    }
  });
});

describe("clé du sujet : validée par regex avant tout usage", () => {
  it.each(Object.entries(REFS))("%s : %s accepté", (kind, ref) => {
    expect(isValidSubjectRef(kind as NotificationSubjectKind, ref)).toBe(true);
  });

  it.each([
    ["suggestion", 'SG-3"><script>alert(1)</script>'],
    ["suggestion", "javascript:alert(1)"],
    ["suggestion", "SG-0"],
    ["suggestion", "SG-03"],
    ["suggestion", "sg-3"],
    ["suggestion", "SG-3\n"],
    ["suggestion", "SG-3/../x"],
    ["suggestion", "TK-45"],
    ["ticket", "SG-3"],
    ["ticket", "TK-45 "],
    ["ticket", "TK-4%2e"],
    ["baseline", "baseline-01"],
    ["baseline", "baseline-"],
    ["baseline", "baseline--1"],
    ["review", "not-a-uuid"],
    ["review", "../01900000-0000-7000-8000-0000000000cc"],
    ["ticket", `TK-${"9".repeat(80)}`],
    ["ticket", ""],
  ] as const)("%s : %j refusé", (kind, ref) => {
    expect(isValidSubjectRef(kind, ref)).toBe(false);
    const error = failureOf(() =>
      buildNotificationMessage(input({ subjectKind: kind, subjectRef: ref })),
    );
    expect(error).toBeInstanceOf(MailDeliveryError);
    expect(error?.kind).toBe("permanent");
    expect(error?.code).toBe("invalid-message");
    expect(error?.message).not.toContain("script");
  });
});

describe("injection HTML et destinataire piégé", () => {
  it("échappe le nom de l'organisation dans le HTML (apostrophe comprise), le texte reste brut", () => {
    const org = `Cabinet <b onclick='x()'>"O'Brien" & Fils</b>`;
    const message = buildNotificationMessage(input({ organizationName: org }));
    expect(message.html).not.toContain("<b onclick");
    expect(message.html).toContain("&lt;b onclick=&#39;x()&#39;&gt;");
    expect(message.html).toContain("&quot;O&#39;Brien&quot; &amp; Fils");
    expect(message.text).toContain(org);
  });

  it("échappe aussi le lien dans l'attribut href", () => {
    const message = buildNotificationMessage(
      input({ webBaseUrl: `https://app.test" onmouseover='x'` }),
    );
    expect(message.html).not.toContain(`" onmouseover`);
    expect(message.html).not.toContain("onmouseover='x'");
  });

  it("refuse un destinataire contenant CR, LF ou NUL (garde appliquée dans le gabarit)", () => {
    for (const to of [
      "a@example.test\r\nBcc: x@example.test",
      "a@example.test\0",
      "not-an-address",
    ]) {
      const error = failureOf(() => buildNotificationMessage(input({ to })));
      expect(error, to).toBeInstanceOf(MailDeliveryError);
      expect(error?.message).not.toContain("example.test");
    }
  });
});
