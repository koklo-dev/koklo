/** Lit la session Better Auth côté serveur en relayant les cookies de la requête. */
export async function hasSession(apiUrl: string, cookie: string | null): Promise<boolean> {
  try {
    const response = await fetch(new URL("/api/auth/get-session", apiUrl), {
      headers: cookie ? { cookie } : {},
      cache: "no-store",
    });
    if (!response.ok) return false;
    return (await response.json()) !== null;
  } catch {
    return false;
  }
}
