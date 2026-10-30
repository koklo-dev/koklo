import { z } from "zod";

const RepoSchema = z.strictObject({
  role: z.string().min(1),
  fournisseur: z.string().min(1),
  url: z.string().min(1),
});

export const ProjectManifestSchema = z.strictObject({
  projet: z.string().min(1),
  organisation: z.string().min(1),
  spec_version: z.literal(1),
  extends: z.array(z.string()).default([]),
  repos: z.array(RepoSchema).default([]),
});

export type ProjectManifest = z.output<typeof ProjectManifestSchema>;
