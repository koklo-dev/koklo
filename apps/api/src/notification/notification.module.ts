import { Module } from "@nestjs/common";
import { NotificationEmitter } from "./notification-emitter.ts";

/** Squelette du Red (TK-55c). */
@Module({ providers: [NotificationEmitter], exports: [NotificationEmitter] })
export class NotificationModule {}
