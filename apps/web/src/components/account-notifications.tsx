"use client";

import type { MeNotificationsOutput, NotificationPreferenceKey, Role } from "@koklo/contract";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { NOTIFICATION_LABELS, OWNER_ONLY_KEYS } from "../lib/account-labels.ts";
import { GENERIC_ERROR } from "../lib/form-errors.ts";
import { orpc } from "../lib/orpc.ts";
import { ErrorNotice } from "./error-notice.tsx";
import { LoadingStatus } from "./loading-status.tsx";
import { SwitchRow } from "./switch-row.tsx";

function NotificationSwitch({
  preference,
  onFailed,
}: {
  preference: MeNotificationsOutput[number];
  onFailed: () => void;
}) {
  const update = useMutation(orpc.me.updateNotification.mutationOptions());
  const [enabled, setEnabled] = useState(preference.enabled);
  // Retour immédiat à l'action ; retour arrière si l'enregistrement échoue.
  function change(next: boolean): void {
    setEnabled(next);
    update.mutate(
      { key: preference.key, enabled: next },
      {
        onError: () => {
          setEnabled(!next);
          onFailed();
        },
      },
    );
  }
  return (
    <SwitchRow label={NOTIFICATION_LABELS[preference.key]} checked={enabled} onChange={change} />
  );
}

const visible = (key: NotificationPreferenceKey, role: Role): boolean =>
  role === "owner" || !OWNER_ONLY_KEYS.includes(key);

/** « Me prévenir par e-mail » : un interrupteur par clé que le serveur propose à ce rôle. */
export function AccountNotifications({ role }: { role: Role }) {
  const notifications = useQuery(orpc.me.getNotifications.queryOptions());
  const [failed, setFailed] = useState(false);
  if (notifications.isError && !notifications.isFetching) {
    return (
      <ErrorNotice
        title="Impossible de charger vos préférences"
        onRetry={() => void notifications.refetch()}
      >
        {GENERIC_ERROR}
      </ErrorNotice>
    );
  }
  if (!notifications.data) return <LoadingStatus label="Chargement de vos préférences…" rows={2} />;
  return (
    <fieldset className="m-0 flex min-w-0 max-w-xl flex-col gap-1 border-0 p-0">
      <legend className="mb-1 p-0 text-sm font-medium">Me prévenir par e-mail</legend>
      {failed ? <ErrorNotice title="Impossible d'enregistrer">{GENERIC_ERROR}</ErrorNotice> : null}
      {notifications.data
        .filter(({ key }) => visible(key, role))
        .map((preference) => (
          <NotificationSwitch
            key={preference.key}
            preference={preference}
            onFailed={() => setFailed(true)}
          />
        ))}
    </fieldset>
  );
}
