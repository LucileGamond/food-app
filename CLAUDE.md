# food-app — règles de travail

## Définition de « lot fini »

Un lot n'est fini que si **tout** ceci est vrai :

- les cas limites sont couverts par des tests — pour le tricot : avec et sans diagramme, avec et sans répétition, et vérifié sur **plusieurs patrons réels** (pas un seul exemple) ;
- la couverture est ≥ 85 % ;
- `npm run test:all` est vert (il enchaîne `lint`, `typecheck`, `check:functions`, `test:coverage`, `test:db`, `test:integration`, `test:e2e`).

Dis-le de toi-même avant de proposer le commit : Lucile ne doit pas avoir à demander « tu as bien testé tous les cas ? » ni « pense à la couverture ».

## Commit et push

- **Sur une branche** : quand le lot est fini et que `npm run test:all` est vert, commite et pousse **sans demander**.
- **Sur `main`** : demande l'accord de Lucile d'abord, toujours.

## Après chaque push : proposer de repartir à zéro

Après **tout** push — sur `main` comme sur une branche — propose à Lucile de vider le contexte. À chaque tour, toute la conversation est relue et refacturée : une session qui dure plusieurs jours finit par payer 800 k de contexte par tour au lieu de 200 k. Purger après un lot livré divise la facture par trois.

Si elle valide :

1. écris un résumé de reprise de **3 lignes** (branche, où on en est, prochaine étape) dans `.claude/reprise.md` ;
2. affiche-le aussi dans la réponse, pour qu'elle puisse le recoller ;
3. vide le contexte avec `clear_session` sur `self` — et si l'app refuse (session en Remote Control, par exemple), dis-le et demande-lui de taper `/clear` elle-même ;
4. à la reprise, repars de `.claude/reprise.md`.

## Choix du modèle

Une session de **finition visuelle** — ajuster un libellé, un espacement, une icône, un chevron, un ordre de blocs, sans décision d'architecture ni nouveau comportement — tourne en **Sonnet** : `/model sonnet`. Ces sessions font beaucoup de tours courts, c'est là que le modèle coûte le plus cher pour le moins de valeur.

Si tu es en Opus et que la conversation glisse vers ce genre de réglages, propose-lui de basculer. Reviens à Opus (`/model opus`) dès qu'il faut concevoir, débugger ou toucher aux données.

## Base locale et ports partagés

Les 9 copies de travail de food-app partagent une seule base Supabase locale et un seul port 4173. Le verrou s'en occupe : `npm run test:all`, `test:e2e`, `test:db`, `test:integration` et `db:reset` passent par `scripts/with-db-lock.mjs`, qui attend son tour tout seul et dit qui tient la base.

**N'envoie aucun message aux autres sessions pour demander si la base est libre, et n'en attends aucun.** Lance la commande : si c'est occupé, tu attends, c'est tout. Les variantes `:raw` contournent le verrou et sont bloquées par le hook — ne les appelle pas directement.
