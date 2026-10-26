# Literae

> *Tolle, lege — prends et lis.*

Literae est un atelier catholique francophone pour lire la Sainte Écriture, contempler l’art chrétien et prier avec les mots de l’Église.

- Site principal : [literae.ch](https://literae.ch)
- Galerie : [art.literae.ch](https://art.literae.ch)
- Données éditoriales : [api.literae.ch](https://api.literae.ch)
- Source de la base biblique : [French-Bibles](https://github.com/Heliumrich/French-Bibles)

## Ce que contient le projet

- un comparateur de traductions bibliques, présenté comme un pupitre en pages vis-à-vis ;
- une galerie d’œuvres chrétiennes reliées à leurs artistes et aux figures représentées ;
- un mémento de prières françaises et latines ;
- une collection musicale d’albums et d’artistes, avec leurs présentations, contributions et liens d’écoute ;
- une bibliothèque d’ouvrages EPUB avec lecteur, traductions et reprise de lecture locale ;
- deux thèmes de lecture : Parchemin et Nuit ;
- un espace réservé pour le calendrier liturgique.

## Architecture

Le site est conçu pour être statique partout où cela est possible.

| Partie | Exécution | Technologie |
|---|---|---|
| Pages, œuvres, personnalités, prières, musique et bibliothèque | Générées au build | Astro |
| Catalogues de filtrage | JSON statique généré au build | Astro + JavaScript natif |
| Thème, filtres et visionneuse | Dans le navigateur, sans framework | TypeScript |
| Lecteur EPUB | Chargé sur les fiches de livres | TypeScript natif + EPUB.js |
| Comparateur biblique | Unique îlot hydraté | Svelte |
| Lecture des versets et navigation | Unique route serveur | Node.js + SQLite |

Les métadonnées éditoriales de Directus sont lues pendant `npm run build`. Une modification de notice devient donc publique au prochain build, sans requête de métadonnées lors de la consultation des pages. Les images et les EPUB restent servis par Directus à la demande.

La page du comparateur est elle aussi prérendue. La liste des traductions et l’index des livres et chapitres sont extraits de SQLite au build et transmis à l’îlot Svelte. Le sélecteur de passage présente les livres par Testament, puis leurs chapitres, sans requête avant le choix du chapitre à lire. Seul `/api/bible/verses` ouvre `bible.db` à l’exécution.

Le script `npm run check:static` protège cette frontière : il échoue si une seconde route devient dynamique, si un autre îlot est hydraté ou si un catalogue JSON cesse d’être prérendu. Le détail est documenté dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Prérequis

- Node.js `22.12` ou plus récent ;
- npm et Git ;
- un accès à GitHub pour synchroniser automatiquement la base [French-Bibles](https://github.com/Heliumrich/French-Bibles) au build.

## Installation locale

```bash
git clone https://github.com/Heliumrich/Literae.git
cd Literae
npm ci
cp .env.example .env
npm run bible:sync
npm run dev
```

Le site est ensuite disponible sur l’adresse indiquée par Astro, généralement `http://localhost:4321`.

En développement, les liens entre le site principal et la galerie restent locaux. Pour tester un build de production sur un seul domaine, adaptez `PUBLIC_MAIN_SITE_URL` et `PUBLIC_ART_SITE_URL` dans `.env` avant le build.

## Commandes

| Commande | Usage |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run check` | TypeScript strict et contrôle de la frontière statique |
| `npm run check:static` | Contrôle architectural seul |
| `npm run build` | Synchronisation de French-Bibles, puis génération du site et du serveur minimal |
| `npm run bible:sync` | Préparation de la dernière base sans reconstruire le site |
| `npm run preview` | Prévisualisation du résultat de build |
| `npm start` | Démarrage de `dist/server/entry.mjs` |

## Variables d’environnement

Toutes les variables sont facultatives avec les accès publics actuels. Un jeton Directus ne devient nécessaire au build que si une collection cesse d’être lisible par le rôle public.

| Variable | Valeur par défaut | Description |
|---|---|---|
| `DIRECTUS_URL` | `https://api.literae.ch` | URL publique de Directus |
| `DIRECTUS_TOKEN` | — | Jeton de lecture facultatif du CMS au build ; jamais transmis au lecteur |
| `PUBLIC_MAIN_SITE_URL` | `https://literae.ch` | Origine publique du site principal |
| `PUBLIC_ART_SITE_URL` | `https://art.literae.ch` | Origine publique de la galerie |

Ne commitez jamais de fichier `.env` ni de jeton Directus.

## Données Directus

Les collections actuellement consommées sont :

- `artworks` pour les œuvres, leurs images, titres, datations, notices et relations ;
- `artists` pour les artistes, saints, souverains et écrivains ;
- `prayers` pour les titres, textes français et latins, descriptions et étiquettes.
- `albums` et `musical_artists` pour la collection musicale ; la relation `albums.artists` expose les participations et leurs `roles`.
- `books` pour les ouvrages, avec leur auteur (`artists`) et leurs éditions (`ebook_files.directus_files_id`). Cette collection utilise `archived`, sans champ `status`.

Les fiches musicales affichent les descriptions Markdown, les tags et les liens externes renseignés dans le CMS. Les types généraux des artistes sont distincts de leurs rôles sur chaque album. Seuls les albums et artistes `published` sont exposés, y compris dans les relations. Les filtres (recherche, tags, types et artiste associé) utilisent `/musique/albums.json` et `/musique/artistes.json`, générés au build. Aucun lecteur embarqué ou import de pistes n’est utilisé.

Pour les collections avec un statut, seuls les éléments `published` sont intégrés ; les ouvrages utilisent le champ `archived` et seuls les livres non archivés sont inclus. Les collections sont lues par pages de 100 éléments afin d’accompagner leur croissance. Les requêtes identiques sont mutualisées pendant le build.

Les images restent servies par Directus avec les transformations `thumbnail`, `medium`, `large` et `xlarge`. Le fichier original n’est demandé que depuis la visionneuse lorsque **Qualité originale** est activée.

Le catalogue des œuvres alterne les artistes dans l’ordre alphabétique de leur nom affiché (A à Z, tri français) : une œuvre de chacun, puis la suivante, jusqu’à épuisement de toutes les œuvres. Les œuvres d’un même artiste restent classées par ajout récent. Cet ordre est calculé au build et conservé dans le JSON statique ; les résultats filtrés sont également triés et alternés avant pagination. Les vignettes présentent l’œuvre entière dans un cadre carré.

La visionneuse navigable du catalogue et des collections d’une personnalité précharge uniquement l’image suivante dans la qualité sélectionnée. Depuis une fiche d’œuvre, elle utilise une vue épurée, sans légende ni navigation. Le bouton **Épique**, réservé aux œuvres attribuées à Gustave Doré, applique une courbe en S avec un filtre SVG côté navigateur ; les fichiers Directus et les téléchargements restent inchangés.

## Bibliothèque

Le catalogue `/scriptorium/bibliotheque` propose la recherche, les vues grille/liste, le tri par titre, auteur ou étiquettes et les mêmes filtres par tags que la galerie. L’accueil présente les quatre derniers ajouts et les personnalités présentent leurs ouvrages après leurs collections d’art.

Les notices des livres non archivés sont générées au build. En l’absence de champ `slug` dans `books`, l’URL combine le titre normalisé et les huit premiers caractères de l’UUID (`confessions-a758f0c9`). Changer le titre change l’URL de la fiche, mais conserve la progression des fichiers EPUB.

Le navigateur télécharge directement l’EPUB sélectionné depuis `/assets/<UUID>` sur Directus, en accès public et sans cookie ni jeton. Aucun EPUB n’est téléchargé ou copié pendant le build. Un paramètre de révision issu des métadonnées du fichier renouvelle le cache HTTP si l’asset est modifié. Le CMS doit autoriser l’origine exacte du site dans son CORS (`https://literae.ch` en production, avec `Vary: Origin`). En développement local, autorisez aussi l’origine locale utilisée. Les libellés utilisent le contenu entre parenthèses du titre du fichier dans Directus (ou du nom de téléchargement si le titre manque). Sans parenthèses, le nom complet sans extension est affiché.

Le lecteur EPUB.js utilise le défilement continu et le sommaire de l’ouvrage. Les XHTML voisin précédent et suivant sont préchargés ; les vues éloignées sont libérées par le gestionnaire continu. Les scripts contenus dans les EPUB restent désactivés. La police du corps, la taille, les marges, la justification et le fond sont réglables. Le fond automatique suit le thème du site ; Blanc, Crème, Nuit et Noir OLED fixent aussi une couleur de texte lisible. Les titres conservent leur police. Literata, Lora et Libre Baskerville sont auto-hébergées en WOFF2, avec variantes latines normale/italique et licences OFL ; leurs fichiers ne sont demandés qu’à la sélection, hors du précache du comparateur.

Les réglages et la progression restent dans le `localStorage` du navigateur. Chaque fichier EPUB a son propre signet CFI, identifié par l’UUID Directus complet (36 caractères, sans troncature ni dépendance au nom du fichier ou à l’URL). Une traduction jamais ouverte commence au début ; revenir sur une traduction reprend uniquement son propre signet. Le dernier choix d’édition est mémorisé séparément pour chaque livre. L’ancien signet commun est récupéré uniquement pour le fichier auquel il appartenait. Aucun compte ni synchronisation entre appareils n’est utilisé. Le lecteur signale si le navigateur refuse la sauvegarde. La bibliothèque n’est pas incluse dans le mode hors ligne de la PWA du comparateur.

`books-server.ts` lit les métadonnées du CMS pour les pages statiques ; `books-client.ts` gère le catalogue ; `src/lib/reader/` et `EpubReader.astro` isolent la lecture. Validation : `npm run test:server` et `npm run test:pwa` (avec un navigateur Playwright installé). Les tests du vrai EPUB servent le build local sous l’origine de production et téléchargent réellement l’asset public Directus : le navigateur vérifie le CORS et les tests contrôlent l’absence d’authentification. Deux petits EPUB de test vérifient séparément l’indépendance des signets entre traductions.

La préparation des pages de couverture et leur dimensionnement sont documentés dans [Couvertures EPUB](docs/EPUB-COVERS.md). Le lecteur préserve leurs styles et leur donne une hauteur égale à sa zone de lecture.

## Comparateur sur smartphone et hors ligne

Le comparateur est une PWA installable : invitation native sur Android lorsque le navigateur le permet, instructions Safari sur iPhone/iPad. Le panneau **Emporter le comparateur** permet de télécharger toutes les traductions (environ 51 Mo pour la version 2.1.1), suivre le transfert et supprimer la copie locale. Après téléchargement, le lecteur fonctionne sans connexion, y compris pour des passages jamais consultés.

Le seul panneau **Emporter le comparateur** regroupe le téléchargement puis l’installation. Le téléchargement fonctionne aussi directement dans l’application installée ; aucune étape préalable dans le navigateur n’est obligatoire.

La PWA vérifie les releases de [French-Bibles](https://github.com/Heliumrich/French-Bibles) à l’ouverture et propose les mises à jour avec leur taille, sans téléchargement automatique. Les transferts GitHub passent par le VPS via l’API existante, pour éviter les erreurs de téléchargement inter-domaines. L’interface et ses polices se mettent à jour séparément de la Bible. Le navigateur classique conserve sa navigation et utilise le serveur tant qu’il est accessible. Après téléchargement de la Bible, il utilise sa copie locale hors ligne, sur ordinateur comme sur mobile, sans installation obligatoire.

La version installée réutilise le même comparateur Svelte. Le stockage dépend des quotas et de l’espace de l’appareil ; il peut être libéré par le système. L’installation sur iOS doit être suivie du téléchargement depuis l’application ouverte sur l’écran d’accueil.

Voir [PWA : utilisation, déploiement et tests](docs/PWA.md).

## Base biblique

`npm run build` récupère automatiquement `bible.db` depuis la branche `main` de [French-Bibles](https://github.com/Heliumrich/French-Bibles) et prépare un snapshot versionné dans `data/french-bibles/`. Le tag réel fournit la version affichée ; le SHA-256 du fichier identifie son contenu et renouvelle les caches, sans constante à modifier à la main.

Le fichier historique `data/bible.db` et ses replis sont supprimés. Le site classique et la PWA utilisent exclusivement la base synchronisée dans `data/french-bibles/` ; le build en exporte une copie statique pour le téléchargement sur téléphone. Le serveur ouvre le chemin absolu choisi au build, en mode SQLite immutable, et l’indique dans ses logs. Son dossier de lancement n’affecte pas le choix de la base. Aucun `.env` n’est nécessaire pour la Bible. Voir [gestion de la base et déploiement VPS](data/README.md).

La PWA continue à proposer séparément les nouvelles releases à l’utilisateur. Une mise à jour du serveur ou de l’interface ne force jamais le téléchargement de la base sur le téléphone.

## Organisation du dépôt

```text
.
├── .github/workflows/       CI GitHub Actions
├── data/                    base SQLite et documentation associée
├── docs/                    choix d’architecture
├── public/                  icônes, textures et polices locales
├── scripts/                 garde-fous du dépôt
└── src/
    ├── components/          composants Astro et îlot Svelte
    ├── layouts/             structure HTML partagée
    ├── lib/                 Directus, Bible, catalogues et utilitaires
    ├── pages/               routes Astro et unique endpoint serveur
    └── styles/              tokens, thèmes et styles globaux
```

## Routes principales

| Route | Contenu |
|---|---|
| `/` | Accueil éditorial |
| `/scriptorium` | Présentation du pupitre de lecture |
| `/scriptorium/comparateur` | Comparateur biblique |
| `/scriptorium/bibliotheque` et `/scriptorium/bibliotheque/[slug]` | Catalogue des ouvrages et lecteur EPUB |
| `/art` | Accueil local de la galerie |
| `/oeuvres` et `/oeuvres/[slug]` | Catalogue et fiches d’œuvres |
| `/personalites` et `/personalites/[slug]` | Catalogue et notices biographiques |
| `/prieres` et `/prieres/[slug]` | Mémento et lectures bilingues |
| `/calendrier` | Calendrier liturgique, espace réservé |
| `/musique` | Accueil de la collection musicale |
| `/musique/albums` et `/musique/albums/[slug]` | Catalogue des albums et fiches avec crédits et liens d’écoute |
| `/musique/artistes` et `/musique/artistes/[slug]` | Catalogue des artistes musicaux et albums associés |
| `/a-propos` | Présentation et colophon |
| `/api/bible/verses` | Seule route exécutée côté serveur |

Les anciennes URLs sous `/art/oeuvres`, `/art/personalites`, `/art/artworks` et `/art/artists` sont conservées sous forme de redirections.

## Déploiement

Chaque build génère aussi `sitemap.xml` pour `literae.ch`, `sitemap-art.xml` pour `art.literae.ch` et `robots.txt` pour les annoncer aux moteurs de recherche. Les sitemaps suivent les URL canoniques des pages HTML effectivement générées, y compris les fiches Directus ; ils excluent les redirections, les catalogues JSON, l’API et la base biblique. Les domaines suivent `PUBLIC_MAIN_SITE_URL` et `PUBLIC_ART_SITE_URL`.

Les pages utilisent des URL sans slash final, sauf les racines des domaines (`/`). `trailingSlash: 'never'` dans Astro aligne le serveur sur les liens internes, les URL canoniques et les sitemaps. Le serveur Node redirige les pages terminées par `/` vers la version sans slash avec un statut 301, en conservant les paramètres. Le service worker applique la même règle au comparateur hors ligne.
La génération des sitemaps arrête le build si une URL canonique ne respecte pas la politique `trailingSlash` configurée.

Le build produit :

- `dist/client`, qui contient toutes les pages et ressources statiques ;
- `dist/server`, qui contient le serveur Node minimal nécessaire au seul endpoint SQLite.

```bash
git pull
npm ci
npm run build
# Sur le VPS actuel :
sudo systemctl restart scriptorium.service
```

Le build inclut le chemin absolu du snapshot SQLite utilisé pour générer le comparateur ; le serveur retrouve sa base quel que soit son dossier de lancement. Reconstruire puis redémarrer applique une nouvelle base. Si le projet est déplacé, reconstruire pour enregistrer son nouveau chemin. Un `git pull` seul ne déclenche pas le build. Après chaque changement dans Directus, reconstruisez puis redéployez le site.

La CI GitHub exécute automatiquement les contrôles TypeScript, la vérification de la frontière statique et le build sur les pushes vers `main` et les pull requests.
