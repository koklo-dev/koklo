import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../src/app.module.ts";
import { InvitationService } from "../../src/invitation/invitation.service.ts";
import { ProjectCreationQueue } from "../../src/queue/project-creation-queue.ts";
import { configFor } from "./app.ts";

/** File des créations de projet espionnée : aucun pg-boss au banc, le worker a ses propres tests. */
export class RecordingCreationQueue {
  jobs: { id: string; creationId: string }[] = [];
  failNext = false;

  async enqueue(creation: { id: string }): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("pg-boss indisponible");
    }
    this.jobs.push({ id: creation.id, creationId: creation.id });
  }
}

/** Invitations espionnées : la création du projet délègue à `InvitationService.create` (B303). */
export class RecordingInvitations {
  calls: { email: string; role: string; projectIds: string[] }[] = [];
  failNext = false;

  async create(_session: unknown, input: { email: string; role: string; projectIds?: string[] }) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("invitation indisponible");
    }
    this.calls.push({ email: input.email, role: input.role, projectIds: input.projectIds ?? [] });
    return { id: "invitation-test" };
  }
}

export interface CreationApp {
  app: INestApplication;
  queue: RecordingCreationQueue;
  invitations: RecordingInvitations;
}

/** Application réelle (base réelle) dont seules la file de création et l'invitation sont espionnées. */
export async function createCreationApp(databaseUrl: string): Promise<CreationApp> {
  const queue = new RecordingCreationQueue();
  const invitations = new RecordingInvitations();
  const app = (
    await Test.createTestingModule({ imports: [AppModule.forRoot(configFor({ databaseUrl }))] })
      .overrideProvider(ProjectCreationQueue)
      .useValue(queue)
      .overrideProvider(InvitationService)
      .useValue(invitations)
      .compile()
  ).createNestApplication();
  await app.init();
  return { app, queue, invitations };
}
