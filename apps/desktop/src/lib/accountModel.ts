import { useCallback, useEffect, useState } from "react";
import type { AccountDto, AccountInput, KokloClient } from "@koklo/trpc-client";
import type { UserSetupValues } from "@koklo/ui";

/**
 * Account gating for the desktop shell.
 *
 * Koklo cannot be used without a local account. After the boot splash, the app
 * asks the backend for the saved account (`account.get`); when none exists it
 * shows the `UserSetupScreen` onboarding (vendored from `koklo-storybook`) and
 * the Shell stays unreachable until the user saves a profile. The same
 * `~/.koklo/account.toml` is shared with the CLI, so a CLI-created account skips
 * onboarding here, and vice-versa.
 *
 * The mapping logic is pure and injectable so it is unit-testable without a Tauri
 * runtime or a DOM; `useAccount` is the thin React wrapper.
 */

export type AccountPhase = "loading" | "needs-setup" | "ready";

export interface AccountState {
  phase: AccountPhase;
  account: AccountDto | null;
}

/** Phase implied by a loaded account: present → ready, absent → onboarding. */
export function accountPhase(account: AccountDto | null): AccountPhase {
  return account ? "ready" : "needs-setup";
}

/**
 * Map the onboarding screen's submit values to the IPC save input. The avatar is
 * captured in-UI only (not persisted in v1); a blank role becomes `null`.
 */
export function toAccountInput(values: UserSetupValues): AccountInput {
  const role = values.role.trim();
  return {
    name: values.name,
    email: values.email,
    role: role ? role : null,
  };
}

/** Identity for the Shell sidebar, with a safe fallback while no account is set. */
export function sidebarUser(account: AccountDto | null): { name: string; email: string } {
  return {
    name: account?.name ?? "Koklo User",
    email: account?.email ?? "",
  };
}

/**
 * Drives the account phase: loads the account once, exposes a `save` that
 * persists the onboarding submission and flips the app to `ready`.
 */
export function useAccount(client: KokloClient): {
  state: AccountState;
  save: (values: UserSetupValues) => Promise<void>;
} {
  const [state, setState] = useState<AccountState>({ phase: "loading", account: null });

  useEffect(() => {
    let cancelled = false;
    void client.account.get().then(
      (account) => {
        if (!cancelled) setState({ phase: accountPhase(account), account });
      },
      () => {
        // A failed load should not trap the user on a blank screen: fall through
        // to onboarding, where saving will surface any real backend error.
        if (!cancelled) setState({ phase: "needs-setup", account: null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [client]);

  const save = useCallback(
    async (values: UserSetupValues) => {
      const account = await client.account.save(toAccountInput(values));
      setState({ phase: "ready", account });
    },
    [client],
  );

  return { state, save };
}
