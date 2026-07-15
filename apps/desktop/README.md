# @koklo/desktop

Tauri 2 desktop shell wrapping the Koklo frontend (React + Vite).

## Lancer la fenêtre desktop (dev)

Depuis ce dossier (`apps/desktop/`) :

```bash
pnpm desktop
```

Ou depuis la racine du repo :

```bash
pnpm --filter @koklo/desktop desktop
```

Ça ouvre la **fenêtre native** (WebKitGTK sous Linux), lance Vite sur
`http://localhost:5173` (= `devUrl` dans `src-tauri/tauri.conf.json`) et active le
HMR — tes modifications React se rechargent à chaud tant que la fenêtre est
ouverte.

Pour arrêter : ferme la fenêtre ou `Ctrl+C` dans le terminal (fermer la fenêtre
met fin à `tauri dev`).

> Repartir propre si le port 5173 est déjà pris ou si une fenêtre traîne :
>
> ```bash
> pkill -f 'koklo-desktop|vite'
> ```

## Autres commandes

```bash
pnpm dev          # frontend seul dans le navigateur (pas de fenêtre native, invoke() KO)
pnpm tauri build  # build de production de l'app desktop
pnpm typecheck    # vérification TypeScript
pnpm test         # tests (vitest)
```

## E2E natif Tauri

Le repo contient maintenant un harness séparé `@koklo/desktop-native-e2e` pour
tester la vraie app native via WebdriverIO + `@wdio/tauri-service`.

Depuis la racine :

```bash
pnpm test:desktop-native
```

Ce chemin ne passe pas par le navigateur Vite: il build puis lance la vraie
binaire `koklo-desktop` avec un `KOKLO_HOME` temporaire isolé.

## Pré-requis système (Linux)

Si le premier build Rust échoue, installe les libs WebKitGTK :

```bash
libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev build-essential libssl-dev
```
