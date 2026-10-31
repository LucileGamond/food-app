# Food — planning des repas et recettes

Application web installable (PWA) pour Lucile et Eric : planning partagé des repas de la semaine et carnet de recettes.

- **Front** : React + Vite + TypeScript, Tailwind CSS + shadcn/ui, glisser-déposer `@dnd-kit`, PWA (`vite-plugin-pwa`)
- **Données** : Supabase (PostgreSQL, Auth, Realtime, Storage)
- **Hébergement** : Azure Static Web Apps

## Fonctionnalités

- **Connexion** e-mail / mot de passe, sans inscription (2 comptes créés à la main).
- **Planning** : 7 jours glissants, créneaux Midi / Soir, plusieurs repas par créneau, pour Lucile et/ou Eric.
  Ajout, modification, suppression (avec confirmation), déplacement et duplication (glisser-déposer ou menu « … »).
  Synchronisation en direct entre les deux comptes.
- **À planifier** (panneau du planning) : liste partagée de liens, recettes enregistrées et idées à répartir ensuite.
  Ajout depuis le panneau, depuis la fiche d'une recette (« À planifier »), ou par le menu **Partager** d'Android
  (l'app installée apparaît comme cible de partage ; le titre de la page est récupéré automatiquement).
  Un élément se planifie par glisser-déposer sur un créneau ou avec le bouton calendrier (jour, créneau, personnes),
  puis disparaît de la liste. Un lien déjà enregistré comme recette devient cette recette.
- **Courses** : listes partagées en direct, articles avec quantité, unité (même liste que les recettes) et rayon
  (deviné à partir du nom, modifiable), rangés dans l'ordre du magasin ; un article déjà présent voit sa quantité
  additionnée (g/kg, ml/cl/l convertis) ; les articles cochés passent « dans le caddie » et se retirent d'un clic.
  **Notifications** (Web Push) : l'autre personne est prévenue sur son téléphone, une seule fois par série de
  modifications (quelques minutes après la dernière) ; activation par appareil (cloche de l'application).
  **Depuis le planning** (bouton « Liste de courses ») : choix des repas de la semaine, puis aperçu modifiable avant de
  créer une liste ou d'en compléter une. L'application calcule les quantités (adaptées au nombre de personnes,
  additionnées, arrondies à la pièce) ; les ingrédients des recettes ponctuelles avec lien sont lus par `import-recipe`.
  L'Edge Function `tidy-shopping` demande ensuite à Claude Haiku d'unifier les noms, de corriger les rayons et de
  repérer les basiques du placard (décochés par défaut), sans jamais toucher aux quantités ; en cas d'échec, l'aperçu
  reste utilisable sans ce regroupement. Ce qui n'a pas pu être repris est listé pour être complété à la main.
  **Idées de repas** (bouton « Idées » du planning) : l'Edge Function `suggest-meals` demande à Claude Haiku 8 plats
  complets (protéine, légumes, féculent), plutôt de saison ; le code en garde 5, les plus variés (protéines, féculents et
  légumes différents), dont 2 ou 3 végés quand c'est possible. Haiku pioche dans les recettes
  enregistrées (sauf celles mangées ou prévues sur les 15 derniers et 7 prochains jours) et cherche des recettes sur
  internet avec l'outil de recherche web d'Anthropic (4 recherches au plus). Une adresse est gardée seulement si elle
  figure dans les résultats de recherche. Les idées cochées vont dans « À planifier ». Nécessite d'activer la recherche
  web dans la console Anthropic (paramètres de l'organisation) ; `WEB_SEARCH_TOOL` (secret facultatif) change la
  variante de l'outil.
- **Recettes** :
  - *ponctuelles* : titre, texte libre, lien — saisies directement dans le planning ;
  - *sauvegardées* : ingrédients détaillés, étapes, tags, photos — listées dans l'écran Recettes.
  Une recette ponctuelle peut être sauvegardée depuis le planning (« Sauvegarder la recette »).
  Une recette sauvegardée utilisée dans le planning ne peut pas être supprimée.
  **Préremplissage depuis un lien** (nouvelle recette, ou sauvegarde d'une recette ponctuelle) : l'Edge Function
  `import-recipe` télécharge la page, la réduit au strict nécessaire (données schema.org/Recipe si le site en publie,
  sinon le texte du contenu principal, sans menus, scripts, pubs ni commentaires : quelques centaines de tokens),
  puis demande à Claude Haiku d'en extraire titre, portions, ingrédients, étapes et tags. La photo de la page est ajoutée.
  Réservé aux utilisateurs connectés ; les adresses locales ou privées sont refusées.
  **Préremplissage depuis une photo** (page de livre, magazine, scan ; 2 pages au plus) : les photos sont réduites dans
  le navigateur (1568 px, JPEG), puis `import-recipe` (mode `photos`) demande à Claude Haiku de lire la recette, avec le
  même outil et la même validation que pour un lien. La photo n'est pas gardée comme photo de la recette.
  Depuis la galerie du téléphone, « Partager » → Food ouvre directement une nouvelle recette et lit les photos.
  Après un import, un panneau « À vérifier » liste ce qui paraît douteux (signalé par le modèle, ou repéré par l'app :
  quantité absente, renvoi « voir p. … », portions ou étapes manquantes) ; chaque point mène au champ et disparaît une fois
  corrigé. La photo lue reste visible (en grand sur demande) pendant la vérification, sans être enregistrée.
  Une recette peut avoir un livre et une page (deux champs), des temps (préparation, repos, cuisson), des valeurs
  nutritionnelles (calories, glucides, protéines, lipides, par portion, pour la recette ou pour 100 g, reprises si la
  recette les indique) et des sous-parties d'ingrédients (« Pour le streusel ») ; un titre déjà utilisé par une autre
  recette est signalé.
  **Import en série** (Recettes → « Importer en série ») : un dossier d'images (ordinateur) ou plusieurs photos
  (téléphone), une image par page. Le livre est saisi une fois ; chaque image est lue par `import-recipe` (2 à la fois)
  et la recette enregistrée directement, avec la page lue sur l'image, sans points à vérifier ni recettes liées.
  Une page peut contenir plusieurs recettes : chacune est enregistrée (même page) ; depuis le formulaire, l'app demande
  laquelle préremplir. Les pages sans recette sont ignorées, les titres déjà enregistrés sautés ; pause, reprise et
  réessai des erreurs (ce qui avait abouti n'est pas refait).
- **Poids** :
  - une pesée par personne et par jour (20 à 300 kg, une décimale, pas de date future) ;
  - synthèse par personne : dernière pesée, écart avec la précédente et sur la période, min/max ;
  - graphique des deux courbes (3 mois, 6 mois, 1 an, tout), avec info-bulle à la souris, au doigt ou au clavier ;
  - clic (ou Entrée) sur un point du graphique pour modifier ou supprimer la pesée ;
  - rappel si une personne ne s'est pas pesée depuis plus de 20 jours.
- **Plan** (suivi du plan alimentaire, repris de FoodTracker) :
  - un *plan* par personne : aliments rangés par moment (petit-déjeuner, déjeuner, collation, apéritif, dîner,
    pool alimentaire, sport) et par catégorie, chacun avec un nombre de fois autorisé par période ;
  - des *périodes* (dates incluses, sans chevauchement) qui figent une copie du plan à leur création :
    modifier le plan ne touche que les périodes suivantes ;
  - pour le jour choisi, + / − sur chaque aliment ; pastilles du quota sur la période ;
    au-delà du quota, les consommations les plus récentes sont « hors plan » (en rouge) ;
  - recherche d'aliment, moments repliables, changement de période et de personne ;
  - rappels : fin de période dans 2 jours ou moins, aucune période en cours, rien de noté aujourd'hui (le soir).

## Développement local

Prérequis : Node 24, Docker Desktop.

```bash
npm install
npm run db:start          # Supabase local (Docker)
cp .env.example .env.local  # puis coller la clé anon affichée par `npx supabase status`
npm run dev
```

Comptes de test locaux (créés par `supabase/seed.sql`) : `lucile@food.test` et `eric@food.test`, mot de passe `motdepasse-test`.

Après une modification du schéma (`supabase/migrations`) : `npm run db:reset` puis `npm run db:types`.

Import de recettes en local : copier `supabase/functions/.env.example` en `supabase/functions/.env`, y mettre une clé
API Anthropic, puis `docker restart supabase_edge_runtime_food-app`. Sans clé, l'import répond « service mal configuré »
(les tests automatisés n'appellent jamais le modèle).

## Tests

| Commande | Contenu |
|---|---|
| `npm run test:coverage` | Unitaires + composants (Vitest, Testing Library), seuil de couverture 85 % |
| `npm run test:db` | Règles de la base (pgTAP) : contraintes, triggers, sécurité |
| `npm run test:integration` | Couche `src/api` contre la Supabase locale, seuil 85 % |
| `npm run test:e2e` | Parcours complets (Playwright), desktop + mobile, accessibilité (axe) |
| `npm run test:all` | Tout, avec lint et typage |

Les tests d'intégration et E2E vident les données de la Supabase **locale** avant chaque test.

## Mise en production (à faire une fois)

1. **Supabase** : créer le projet `food-app-prod` (offre gratuite).
   - *Authentication → Sign In / Providers* : désactiver **Allow new users to sign up**.
   - *Authentication → Users → Add user* : créer les 2 comptes (cocher *Auto Confirm User*).
   - Appliquer le schéma : `npx supabase link --project-ref <ref>` puis `npx supabase db push`
     (ou laisser la CI le faire au premier push sur `main`).
   - Renommer les profils (créés automatiquement avec le début de l'e-mail) dans *SQL Editor* :
     ```sql
     update profiles set display_name = 'Lucile' where id = (select id from auth.users where email = '...');
     update profiles set display_name = 'Eric'   where id = (select id from auth.users where email = '...');
     ```
2. **Azure** : créer une *Static Web App* (offre Free), source « Other », et récupérer son jeton de déploiement.
3. **GitHub** : pousser le dépôt, créer l'environnement `production` et ces secrets :

| Secret | Où le trouver |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_PROJECT_REF` | Identifiant du projet (dans l'URL du dashboard) |
| `SUPABASE_ACCESS_TOKEN` | supabase.com → Account → Access Tokens |
| `SUPABASE_DB_PASSWORD` | Mot de passe de la base choisi à la création du projet |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | Azure → Static Web App → Manage deployment token |

4. **Reprendre l'historique des pesées** de l'ancienne application (une seule fois) :
   ```bash
   node scripts/weights-to-sql.mjs chemin/vers/weight.json > weights.sql
   ```
   puis coller le contenu de `weights.sql` dans *Supabase → SQL Editor* et l'exécuter.
   La requête de vérification à la fin doit trouver 1 profil par personne. Relancer le script ne crée pas de doublons.

5. **Reprendre le plan et la période en cours** de FoodTracker (une seule fois) :
   ```bash
   node scripts/food-to-sql.mjs --person Lucile chemin/vers/Plan.json chemin/vers/Consumption-2026-10-19-2026-11-02.json > food.sql
   ```
   puis exécuter `food.sql` dans *Supabase → SQL Editor*. Le plan de la personne est remplacé ; chaque fichier
   Consumption devient une période (remplacée si elle existe déjà aux mêmes dates). Relancer le script ne crée pas de doublons.

6. **Clé API pour l'import de recettes et le regroupement des courses** (une seule fois) : créer une clé sur console.anthropic.com, puis
   ```bash
   npx supabase secrets set ANTHROPIC_API_KEY=<ta clé> --project-ref <SUPABASE_PROJECT_REF>
   ```
   Facultatif : `ANTHROPIC_MODEL` pour changer de modèle (Claude Haiku par défaut).

7. **Notifications des listes de courses** (une seule fois) :
   - clés VAPID et secret partagé : `supabase/functions/.env.notify` (généré en local, ignoré par git ; la clé publique
     est dans `.env`, commitée) ;
   - `npx supabase secrets set --env-file supabase/functions/.env.notify --project-ref <SUPABASE_PROJECT_REF>` ;
   - dans *SQL Editor* (même valeur que `NOTIFY_SECRET`) :
     ```sql
     select vault.create_secret('https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/notify-shopping', 'notify_shopping_url');
     select vault.create_secret('<NOTIFY_SECRET>', 'notify_shopping_secret');
     ```
   La tâche `pg_cron` appelle la fonction toutes les 3 minutes, seulement s'il y a des modifications en attente.

Ensuite, chaque push sur `main` lance tous les tests, puis — s'ils passent — applique les migrations et déploie.
Le workflow `keep-alive` interroge Supabase tous les 3 jours pour éviter la mise en pause du projet gratuit.

Sur Android : ouvrir l'URL de la Static Web App dans Chrome → menu → **Ajouter à l'écran d'accueil**.
