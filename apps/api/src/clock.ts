import { Global, Module } from "@nestjs/common";

export const CLOCK = Symbol("CLOCK");

/**
 * Horloge de l'api : seule source du temps pour toute décision (expiration d'un bail, horodatage).
 * L'instant est une chaîne ISO-8601 UTC à la milliseconde, comme le reçoit le domaine ; aucun
 * `Date.now()` ni `now()` SQL ne décide ailleurs, ce qui rend les tests d'expiration déterministes.
 */
export interface Clock {
  now(): string;
}

export const systemClock: Clock = { now: () => new Date().toISOString() };

/** Fournit l'horloge système à toute l'application ; les tests la remplacent via `overrideProvider(CLOCK)`. */
@Global()
@Module({
  providers: [{ provide: CLOCK, useValue: systemClock }],
  exports: [CLOCK],
})
export class ClockModule {}
