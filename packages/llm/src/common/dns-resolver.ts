import { lookup } from "node:dns/promises";
import type { HostResolver } from "./ssrf.ts";

/** Résolveur de production : toutes les adresses du nom (le seul fichier qui touche au réseau DNS). */
export const systemHostResolver: HostResolver = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);
