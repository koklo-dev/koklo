export interface ServerSession {
  hasSession: boolean;
  hasActiveOrganization: boolean;
}

const NO_SESSION: ServerSession = { hasSession: false, hasActiveOrganization: false };

/** Lit la session Better Auth côté serveur en relayant les cookies de la requête. */
export async function readSession(apiUrl: string, cookie: string | null): Promise<ServerSession> {
  try {
    const response = await fetch(new URL("/api/auth/get-session", apiUrl), {
      headers: cookie ? { cookie } : {},
      cache: "no-store",
    });
    if (!response.ok) return NO_SESSION;
    const body: unknown = await response.json();
    if (body === null || typeof body !== "object") return NO_SESSION;
    const session = Reflect.get(body, "session");
    const activeId =
      typeof session === "object" && session !== null
        ? Reflect.get(session, "activeOrganizationId")
        : undefined;
    return {
      hasSession: true,
      hasActiveOrganization: typeof activeId === "string" && activeId !== "",
    };
  } catch {
    return NO_SESSION;
  }
}

export async function hasSession(apiUrl: string, cookie: string | null): Promise<boolean> {
  return (await readSession(apiUrl, cookie)).hasSession;
}
