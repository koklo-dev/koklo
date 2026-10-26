// Conventional Commits (vision §17.3). Le preset est installé par le workflow
// commitlint dans un répertoire temporaire dont le chemin arrive par l'environnement.
export default {
  extends: [process.env.COMMITLINT_PRESET ?? '@commitlint/config-conventional'],
};
