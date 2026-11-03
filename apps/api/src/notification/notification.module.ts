import { Module } from "@nestjs/common";
import { NotificationEmitter } from "./notification-emitter.ts";

/** Émetteur unique des notifications (TK-55c) : les modules métier l'appellent, jamais la table. */
@Module({ providers: [NotificationEmitter], exports: [NotificationEmitter] })
export class NotificationModule {}
