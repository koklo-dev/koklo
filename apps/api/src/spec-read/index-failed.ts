import { ORPCError } from "@orpc/server";

/** `SPEC_INDEX_FAILED` : la révision lue a un index en échec ; le contrat porte le code d'échec et le commit. */
export const indexFailed = (failure: { errorCode: string; commitSha: string }) =>
  new ORPCError("SPEC_INDEX_FAILED", {
    data: { errorCode: failure.errorCode, commitSha: failure.commitSha },
  });
