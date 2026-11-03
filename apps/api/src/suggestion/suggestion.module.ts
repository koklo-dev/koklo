import { Module } from "@nestjs/common";
import { SuggestionController } from "./suggestion.controller.ts";

/** Squelette du Red (TK-55c) : non branché dans `AppModule` avant le Green. */
@Module({ controllers: [SuggestionController] })
export class SuggestionModule {}
