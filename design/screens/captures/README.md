# Captures d'écrans

Générées par les tests e2e de `apps/web` (`pnpm --filter @koklo/web e2e`) : `<S-id>/<état>-<thème>.png`
(`light` ou `dark`). Écrasées à chaque exécution ; jointes à la PR et référencées par les fiches `design/screens/<S-id>.md`.
États de S-projects : `loading`, `empty`, `data`, `error`. S-login : `default`. S-accept-invitation : `ready`, `member`, `wrong`, `invalid` (`apps/web/e2e/accept-invitation.spec.ts`, faux API).
S-ai-settings (v2, TK-98, `apps/web/e2e/ai-settings.spec.ts`) : `providers-`, `add-` (OpenRouter choisi), `models-open-` en `light`, `dark` et `mobile` (375 px), puis `empty-light` et `test-failed-light` ; `shell-*` vient de `app-shell.spec.ts`.
S-settings (rattrapage B130, `apps/web/e2e/settings-captures.spec.ts`) : `<section>-<rôle>-<light|dark|mobile>.png` pour general-owner, members-owner, members-dev, account-owner, account-dev, account-client.
