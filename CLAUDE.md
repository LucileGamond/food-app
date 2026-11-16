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

## Après un push sur `main` : proposer de repartir à zéro

Une fois le push sur `main` fait, propose à Lucile de vider le contexte (il grossit à chaque tour et c'est ce qui coûte le plus cher). Si elle valide :

1. écris un résumé de reprise de **3 lignes** (branche, où on en est, prochaine étape) dans `.claude/reprise.md` ;
2. affiche-le aussi dans la réponse, pour qu'elle puisse le recoller ;
3. vide le contexte avec `clear_session` sur `self` — et si l'app refuse (session en Remote Control, par exemple), dis-le et demande-lui de taper `/clear` elle-même ;
4. à la reprise, repars de `.claude/reprise.md`.

## Base locale et ports partagés

Le dossier et la base Supabase locale sont partagés avec d'autres sessions Claude. Avant de lancer `test:all`, `db:reset`, pgTAP ou Playwright (ports 4173 / 5173 / 5180), assure-toi que la base est libre, et préviens quand tu as fini.
