export const meta = {
  name: 'koklo-ticket',
  description: 'Un ticket de la refonte en koklo-delivery condensé, agents Sonnet, décisions autonomes, économe en jetons',
  phases: [
    { title: 'Analyse et design', model: 'sonnet' },
    { title: 'Réalisation', model: 'sonnet' },
    { title: 'Revue', detail: 'code : sonnet ; visuel : opus' },
    { title: 'Correction', model: 'sonnet' },
  ],
}

// args : { tk, branch, sprint, date, sensitive, ui, notes, recoverLots? } — date du jour AAAA-MM-JJ, sprint = « sprint-NNN.md »
// Lancement : Workflow({ name: "koklo-ticket", args: {...} }). Mode d emploi : docs/refonte/passation.md
// Réglages d'économie (2026-11-07) : fiche unique produite par l'analyse, sorties de tests tronquées,
// 1 à 2 lots, une revue code+sécurité fusionnée, revue visuelle échantillonnée, un seul tour de
// correction qui ne relance que les revues refusées, effort moyen sur les lots mécaniques.
const A = args
// Garde : une chaîne (« TK-90 ») ou un objet incomplet ferait travailler sur develop sans revue visuelle.
if (!A || typeof A !== 'object' || !A.tk || !A.branch || !A.sprint || !A.date || typeof A.ui !== 'boolean') {
  throw new Error('args attendu : { tk, branch, sprint, date, sensitive, ui (booléen), notes } — voir docs/refonte/passation.md')
}
const WT = '/home/devops/perso/projets/koklo-new/koklo'
const VAULT = '/home/devops/perso/projets/MyVault/koklo-v2'
const ART = `${WT}/.workflow/${A.tk}`
const FICHE = `${ART}/00-fiche.md`
const M = 'sonnet'

// Règles courtes, communes à tous les agents.
const BASE = `
Règles (strictes) :
- Espace de travail principal ${WT}, branche ${A.branch} déjà active. Ne change pas de branche, pas de worktree, ne touche pas à .project/ ni au fichier de sprint du vault. AUCUN commit, push ni PR.
- Brice a délégué les décisions : une question ouverte ne bloque pas. Choisis la lecture la plus prudente et conforme aux passations, applique-la, consigne-la dans docs/refonte/questions.md (« Décidée en autonomie le ${A.date} : … »). NEEDS-HUMAN seulement pour une action impossible à un agent (secret réel, compte externe, paiement).
- Rien d'inventé au-delà des passations ; aucune donnée réelle ni secret. Tout en français ; jamais le nom du fournisseur d'IA dans l'interface.
- WCAG 2.2 AA, 375 px, axe sans violation, jetons uniquement. Droits vérifiés côté serveur.
- Écrans : la maquette citée sur la ligne « Maquette : » du ticket FAIT FOI (structure, textes, variantes, tailles, espacements, états) ; DESIGN.md donne le cadre. Un élément de maquette sans équivalent dans packages/ui, ou une variante absente (ex. teinte de pastille), s'ajoute à packages/ui (variante d'une famille existante de préférence, sinon composant) avec tests, galerie /dev/ui et ligne dans DESIGN.md. Jamais de style local qui imite la maquette dans apps/web.
- Économie de jetons : lis seulement ce qui sert ; pas de relecture de fichiers déjà lus. Toute commande de test, lint, typecheck ou build se lance avec « 2>&1 | tail -40 » ; n'ouvre le détail (grep ciblé) qu'en cas d'échec. Ne regarde une capture d'écran que si elle sert une vérification.
- Machine partagée : jamais « pnpm test » complet à la racine. Tests ciblés (pnpm --filter <paquet> exec vitest run <fichiers> --maxWorkers=4), turbo --concurrency=2, Playwright à 1 worker. Arrête les serveurs lancés.
- Artefacts : ${ART}/ (ignoré par git).
`

const STATUS = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['PASS', 'NEEDS-HUMAN', 'FAIL'] },
    artifact: { type: 'string' },
    summary: { type: 'string', description: 'résumé en français, 8 lignes max' },
    decisions: { type: 'array', items: { type: 'string' }, description: 'décisions prises en autonomie' },
    lots: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, scope: { type: 'string' } }, required: ['key', 'scope'] } },
  },
  required: ['status', 'artifact', 'summary'],
}
const blocked = (r) => !r || r.status === 'FAIL' || r.status === 'NEEDS-HUMAN'

phase('Analyse et design')
const ad = await agent(`${BASE}
Rôles : product-owner puis designer${A.sensitive ? ' et tech-lead (ticket sensitive : modèle de menace court)' : ''}. Étapes « Analyse » et « Design » de koklo-delivery (${VAULT}/workflows/definitions/koklo-delivery.md), réunies. Tu es le SEUL agent qui lit le corpus ; les suivants ne liront que ta fiche et le code.
Lis : le bloc ${A.tk} de ${VAULT}/sprints/${A.sprint}, les passations et maquettes qu'il cite (${WT}/docs/refonte/), docs/refonte/questions.md et ecarts.md, ${VAULT}/spec/engineering-standards.md (parties utiles), ${A.ui ? 'DESIGN.md et PRODUCT.md, ' : ''}puis le code concerné.
Rappels techniques à reporter dans la fiche quand ils s'appliquent : contrat (package.json + src/version.ts, openapi:generate, JSON formaté Biome, empreinte précédente figée, historique docs/api-contract.md ; additif = mineure, rupture = majeure) ; dépendance nouvelle (skill dependency-selection, context7, vulnérabilités, ADR docs/adr/) ; Prisma (migration avec down.sql, migrate diff vide, bornes des colonnes générées) ; client-write-matrix quand une procédure est ajoutée ; listes longues via le socle TK-94.
1. Écris ${FICHE}, la fiche de passation UNIQUE, 150 lignes au plus : périmètre, fichiers à toucher (chemins exacts), critères reformulés en cas testables avec leur niveau (unitaire, intégration avec base, e2e, axe), extraits utiles des passations et maquettes (recopiés brièvement, pas de renvoi vague), décisions prises, rappels techniques applicables, commandes de test exactes par paquet, et pour chaque lot la liste des paquets dont il doit lancer les tests (apps/worker si base ou contrat change, e2e racine e2e/tests si un écran change).
2. Découpe en 1 ou 2 lots (3 seulement si le ticket est vraiment gros), cohérents et testables seuls ; renvoie-les dans « lots » (key = A, B, C, scope précis).
3. ${A.ui ? `Maquette : pour chaque maquette de la ligne « Maquette : », lance « pnpm -s maquette <numéro> > ${ART}/maquette-<numéro>.md » (code lisible : gabarit et logique). Dans la fiche, une section « Maquette » : pour chaque écran ou état du ticket, les plages de lignes exactes de ${ART}/maquette-<numéro>.md à reproduire, et un inventaire des éléments (composant de packages/ui à utiliser, ou « À AJOUTER à packages/ui : <famille, variante> » avec les valeurs de la maquette : couleurs en variables, tailles, rayons, textes). Ne résume pas les valeurs visuelles : renvoie aux lignes.\nDesign : mets à jour DESIGN.md si besoin et les fiches design/screens/<S-id>.md (gabarit design/README.md, ligne d'historique ${A.tk}). Dans la fiche, une section « Design » : états (vide, chargement, erreur, droits), clavier, annonces, 375 px, et la liste de 4 à 6 états clés à comparer à la maquette (écran principal clair, sombre, 375 px, plus un état vide ou erreur).` : `Design : sans objet si aucun écran n'est touché (dis-le dans la fiche).`}
4. Ajoute UNE entrée datée dans ${VAULT}/agents/product-owner/memory.md (seule écriture de mémoire de tout le ticket).
${A.notes ? '\nNotes propres à ce ticket :\n' + A.notes : ''}`, { label: 'analyse-design', phase: 'Analyse et design', schema: STATUS, model: M })
if (blocked(ad) || !ad.lots || ad.lots.length === 0) return { stoppedAt: 'analyse-design', ad }

phase('Réalisation')
const lots = []
for (const lot of ad.lots) {
  const g = await agent(`${BASE}
Rôles : test-writer puis developer. Red, Green et Refactor du lot ${lot.key} de ${A.tk}. Ta seule entrée documentaire est ${FICHE}${lots.length ? ` (et ${ART}/03-lot-*.md des lots précédents)` : ''} ; ne relis pas les passations sauf si la fiche est muette sur un point bloquant. ${A.ui ? `Pour l'écran, lis les plages de ${ART}/maquette-*.md indiquées dans la section « Maquette » de la fiche, et reproduis-les fidèlement avec les composants de packages/ui (ajoute d'abord à packages/ui ce que l'inventaire marque « À AJOUTER »). Lis DESIGN.md seulement pour les jetons dont tu as besoin.` : ''}
Périmètre du lot : ${lot.scope}${(A.recoverLots || []).includes(lot.key) ? '\nREPRISE : une tentative précédente de ce lot a été coupée par une panne réseau. Des fichiers ont pu être modifiés (git -C ' + WT + ' status --short, git diff) : pars de cet état, garde ce qui est correct, complète le reste. Ne refais pas les lots précédents.' : ''}
1. Red : un test par cas du lot ; lance-les et recopie les lignes prouvant l'échec pour la bonne raison (tail).
2. Green : code minimal, sans affaiblir les tests.
3. Refactor sur les fichiers touchés : duplication, code mort, 50 lignes et complexité cognitive 15 par fonction ; biome format --write depuis le dossier du paquet.
4. Captures : si un critère d'acceptation exige des captures (par exemple « chaque section × rôle, clair, sombre, 375 px »), génère-les TOUTES dans design/screens/captures/<S-id>/ par un spec Playwright du dépôt ; ne les regarde pas (l'échantillon de 4 à 6 états est pour la revue visuelle seulement). Liste les fichiers produits dans ton journal.
5. Verrous du lot : tests des paquets listés par la fiche, « pnpm lint », « pnpm turbo run typecheck --concurrency=2 » et build des paquets touchés.
Écris ${ART}/03-lot-${lot.key}.md (court) : fichiers modifiés, lignes red, résultat de CHAQUE verrou (commande + dernières lignes), ce qui n'a pas pu être vérifié. Les relecteurs s'appuieront sur ce journal au lieu de tout relancer : il doit être exact.`, { label: `lot-${lot.key}`, phase: 'Réalisation', schema: STATUS, model: M, effort: 'medium' })
  if (!g || g.status === 'FAIL') return { stoppedAt: `lot-${lot.key}`, ad, lots, g }
  lots.push(g)
}

const REVIEW = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['APPROVE', 'CHANGES'] },
    criteria: { type: 'array', items: { type: 'object', properties: { criterion: { type: 'string' }, verified: { type: 'boolean' }, evidence: { type: 'string' } }, required: ['criterion', 'verified', 'evidence'] } },
    findings: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['verdict', 'criteria', 'findings', 'summary'],
}

const LIGHT_REVIEW = `Lis ${FICHE}, les journaux ${ART}/03-lot-*.md${'${extra}'} et le diff (git -C ${WT} diff origin/develop --stat, puis les fichiers utiles ; git -C ${WT} status --short pour les non suivis). Appuie-toi sur les journaux de verrous des lots ; ne relance que les tests ciblés d'un point qui te fait douter ou qui n'est pas couvert par un journal (tail). Ne modifie AUCUN fichier.`

const codeReview = (round, prev) => () => agent(`${BASE}
Rôle : qa-reviewer${A.sensitive ? ' et revue de sécurité (ticket sensitive)' : ''}, session neuve, lecture critique. Revue de ${A.tk} (tour ${round}). ${LIGHT_REVIEW.replace('${extra}', round > 1 ? ` et ${ART}/04-correction-1.md` : '')}
${prev ? `Tour de contrôle : vérifie seulement que ces points refusés au tour précédent sont corrigés, sans tout reprendre :\n${prev}\n` : `Pour CHAQUE critère d'acceptation de la fiche : vérifié ou non, avec une preuve (test et sa sortie, ou journal de verrou). Vérifie que les captures exigées par les critères existent toutes (ls), sans les ouvrir. Vérifie aussi : procédure de contrat, migration, droits côté serveur, textes en français, couleurs en dur, taille des fonctions.`}
${A.sensitive && !prev ? `Sécurité, un élément de criteria par risque : fuite de secret (logs, réponses, erreurs, tests), SSRF, injection (SQL brut, en-têtes, prompt), contournement de droits ou du cloisonnement d'organisation et de projet, chiffrement au repos, données personnelles envoyées à un tiers, dépendances vulnérables ; les tests couvrent-ils les cas d'abus ?` : ''}
APPROVE seulement si tous les critères sont vérifiés (ou acceptés comme partiels dans questions.md) et sans défaut bloquant.`, { label: `revue-code-${round}`, phase: 'Revue', schema: REVIEW, model: M })

const visualReview = (round, prev) => () => agent(`${BASE}
Rôle : designer en vérification visuelle stricte, session neuve. ${A.tk}, tour ${round}. Lis les sections « Maquette » et « Design » de ${FICHE}. La maquette fait foi.
${prev ? `Tour de contrôle : recompare SEULEMENT les états refusés au tour précédent :\n${prev}\n` : `1) Code contre code : pour chaque élément de l'inventaire « Maquette » de la fiche, compare les lignes de ${ART}/maquette-*.md au code livré (composant et variante, couleurs en variables, tailles, rayons, espacements, textes exacts, ordre des colonnes, icônes, états). 2) Image : compare à la maquette rendue les 4 à 6 états clés listés (même état, clair, sombre, 375 px).`}
Méthode : outillage Playwright du dépôt (apps/web/playwright.config.ts, faux API apps/web/e2e/support/, APP_ENV=test) ; rends la maquette HTML dans Playwright. Captures dans ${ART}/captures/. axe sur TOUS les écrans touchés (résultat texte, sans regarder d'image). Ne modifie aucun fichier de code ; arrête les serveurs.
Un élément de criteria par élément d'inventaire et par état comparé (verified = identique à la maquette ; evidence = lignes de la maquette et fichier:ligne du code). « Ressemble globalement » n'est PAS conforme. APPROVE seulement si chaque écart est corrigé ou consigné comme décision dans questions.md.`, { label: `revue-visuelle-${round}`, phase: 'Revue', schema: REVIEW, model: 'opus' })

const feedbackOf = (x) => `- ${x.summary}\n${x.findings.map((y) => '  * ' + y).join('\n')}\n${x.criteria.filter((c) => !c.verified).map((c) => '  * non vérifié : ' + c.criterion + ' — ' + c.evidence).join('\n')}`

const kinds = [{ key: 'code', make: codeReview }]
if (A.ui) kinds.push({ key: 'visuel', make: visualReview })

let results = (await parallel(kinds.map((k) => k.make(1, null)))).map((r, i) => ({ key: kinds[i].key, r }))
const bad1 = results.filter((x) => x.r && x.r.verdict !== 'APPROVE')
let rounds = 1
if (bad1.length > 0) {
  log(`Revue tour 1 : corrections demandées (${bad1.map((x) => x.key).join(', ')})`)
  phase('Correction')
  const fix = await agent(`${BASE}
Rôle : developer. Correction unique de ${A.tk}. Entrées : ${FICHE} et ce retour de revue :
${bad1.map((x) => feedbackOf(x.r)).join('\n')}
Corrige ce qui relève du ticket (Red si un critère est mal couvert) ; décide ce qui demande une décision (consigne-la dans questions.md). Relance les verrous des paquets touchés (tail). Écris ${ART}/04-correction-1.md : chaque point, ce qui a été fait, la preuve.`, { label: 'correction-1', phase: 'Correction', schema: STATUS, model: M, effort: 'medium' })
  if (!fix || fix.status === 'FAIL') return { stoppedAt: 'correction-1', fix, reviews: results.map((x) => x.r) }
  rounds = 2
  const again = await parallel(bad1.map((x) => kinds.find((k) => k.key === x.key).make(2, feedbackOf(x.r))))
  results = results.map((x) => {
    const i = bad1.findIndex((b) => b.key === x.key)
    return i < 0 ? x : { key: x.key, r: again[i] }
  })
}

const reviews = results.map((x) => x.r)
return { ad, lots, reviews, rounds, approved: reviews.every((x) => x && x.verdict === 'APPROVE') }
