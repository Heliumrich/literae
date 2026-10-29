# Comparateur installable et hors ligne

Le comparateur reste l’unique îlot Svelte du site. La version installée utilise ce même composant, ses styles, le sélecteur de passages et ses préférences. Il n’y a pas d’application Android/iOS à maintenir en parallèle.

## Utilisation

Le bouton **Emporter le comparateur**, représenté par une disquette dans les contrôles du passage, ouvre une fenêtre en surimpression. Son icône mesure 22 px et sa cible mesure au moins 44 × 44 px. La fenêtre se ferme avec son bouton, Échap ou un clic sur le fond ; le téléchargement peut continuer si elle est fermée. Elle regroupe **1. Télécharger la copie locale**, puis **2. Installer le comparateur**, avec les deux boutons. Le bloc d’invitation séparé a été supprimé. Sur Android compatible, le second bouton ouvre l’invitation native ; sinon il affiche les instructions du navigateur. Il reste possible d’installer d’abord et de télécharger ensuite directement dans la PWA.

Sur iPhone/iPad, le panneau explique l’ajout depuis Safari : **Partager → Sur l’écran d’accueil**. iOS ne fournit pas l’événement `beforeinstallprompt` d’Android. Le bouton d’installation affiche ces instructions. Selon la version d’iOS, l’application installée peut avoir un stockage distinct de Safari : si la copie n’est pas reprise après installation, le téléchargement fonctionne directement depuis la PWA. Il n’est jamais nécessaire de repasser par le navigateur pour débloquer un téléchargement.

Dans **Emporter le comparateur**, **Télécharger la Bible** conserve toutes les traductions sur l’appareil. La taille exacte est affichée avant le téléchargement (environ 51 Mo pour la version 2.1.1). Le lecteur, les polices et ses autres ressources locales sont également conservés. Un passage jamais consulté reste disponible après fermeture et réouverture sans réseau. La galerie et les autres pages éditoriales ne font pas partie du mode hors ligne. En mode installé, le header ne contient que le logo et le nom Literae, sans lien. L’introduction et la navigation du site disparaissent ; le footer se limite à « Literae · Tolle, lege ». Le site classique conserve son habillage complet sur ordinateur et mobile. Il lit les versets sur le serveur lorsque celui-ci est accessible, même si la PWA a téléchargé une autre version. Hors ligne, il utilise la copie téléchargée dans ce navigateur, sans installation obligatoire ; tous les livres et traductions restent disponibles. Une requête réseau échouée déclenche aussi la lecture locale lorsque `navigator.onLine` reste à `true`. Le retour du réseau rétablit la lecture serveur dans le navigateur classique.

Le téléchargement affiche sa progression, permet l’annulation pendant le transfert et vérifie la taille et le SHA-256 du transfert avant enregistrement. Une copie complète remplace l’ancienne dans une transaction IndexedDB ; une mise à jour interrompue conserve l’ancienne base. **Supprimer la copie locale** libère le stockage de la Bible sans désinstaller l’application.

## Mises à jour de la Bible

Dans la PWA installée uniquement, une petite requête vers `/api/bible/verses?pwa=latest` vérifie la dernière release stable GitHub à chaque ouverture, retour au premier plan ou retour du réseau. Le serveur contacte l’API publique `Heliumrich/French-Bibles` et mutualise les métadonnées pendant cinq minutes pour limiter les appels GitHub. Les vérifications simultanées sont regroupées ; il n’y a ni polling périodique ni téléchargement automatique de la base. Une vérification manuelle reste disponible dans **Emporter le comparateur**.

La version de release (par exemple `2.1.1`) est affichée. Le SHA-256 de l’asset `bible.db` identifie le contenu : un simple changement d’étiquette sans changement du fichier ne déclenche aucun téléchargement. La taille exacte vient des métadonnées de l’asset GitHub. Les dernières métadonnées vérifiées et leur date sont conservées localement ; les erreurs réseau ou limites de l’API publique ne suppriment jamais la Bible locale.

Si une ancienne version du lecteur avait enregistré une mauvaise étiquette (notamment `1.1.0`), la vérification corrige les métadonnées locales lorsque le SHA-256 et la taille correspondent à la release. Cette correction est conservée dans IndexedDB sans retélécharger la base. Une empreinte différente conserve le mécanisme habituel de mise à jour proposée à l’utilisateur.

Dans la PWA connectée, une nouvelle version ouvre cette même fenêtre avec un avis qui présente la version disponible, la taille en Mo, **Mettre à jour la Bible** et **Plus tard**. Il s’adapte aux orientations portrait et paysage. Reporter n’efface pas la mise à jour : le bouton reste dans le menu et l’avis revient à la prochaine ouverture ou au retour au premier plan tant que la copie n’a pas été mise à jour. Aucun changelog n’est affiché et aucune permission de notification système n’est demandée.

Le téléphone télécharge depuis `/api/bible/verses?pwa=download&asset=<id>`, sur le même domaine que Literae. Node vérifie que l’asset est bien `bible.db` dans le dépôt attendu, puis suit les redirections GitHub côté serveur et relaie le flux sans charger le fichier entier en RAM. Le téléchargement ne dépend donc plus des autorisations CORS ou des redirections inter-domaines du navigateur. Aucun jeton GitHub n’est nécessaire. L’annulation du téléphone annule aussi le transfert amont ; elle ne bloque pas un téléchargement ultérieur. Les anciennes métadonnées enregistrées avec une URL GitHub sont automatiquement converties vers le relais local. La taille et le SHA-256 du téléchargement sont vérifiés avant de remplacer la copie précédente. Les données et le schéma, testés avant publication dans French-Bibles, ne sont pas retestés par Literae. Les requêtes SQL du lecteur sont limitées à la lecture par `PRAGMA query_only = ON`. Les identifiants des traductions sont retrouvés par leur code stable.

Cette vérification est indépendante de la version de la base déployée sur le VPS. Elle permet de mettre à jour la PWA à partir de French-Bibles sans redéployer le site. Au premier téléchargement, si les métadonnées GitHub ne peuvent pas être récupérées, la copie statique incluse dans le site reste disponible.

## Stockage et limites

Il n’y a pas de seuil PWA universel à 50 ou 100 Mo. L’application utilise IndexedDB pour conserver `bible.db` et demande le stockage persistant lorsque l’API du navigateur le permet. Elle contrôle l’espace disponible avant un téléchargement, traite les refus de stockage et n’impose aucun plafond fixe à la taille du fichier.

Le moteur SQLite WebAssembly (`sql.js`) s’exécute dans un worker pour préserver la réactivité de l’interface. Il charge la base en mémoire : prévoir davantage de RAM que la seule taille du fichier, particulièrement pendant une mise à jour. Les capacités réelles dépendent du téléphone et du navigateur. Un test sur appareils physiques reste nécessaire avant de promettre un support matériel précis.

Le stockage persistant reste une décision du navigateur. Le système peut effacer les données, notamment si le téléphone manque de place, et l’utilisateur peut les supprimer dans ses réglages. Le mode privé peut refuser le stockage. L’installation et le téléchargement se font donc explicitement ; le site en ligne reste utilisable sans eux.

## Build et déploiement VPS

Le déploiement conserve les commandes habituelles :

```bash
npm ci
npm run check
npm run build
npm start
```

Le build ajoute à `dist/client` :

- `/scriptorium/manifest.webmanifest`, les icônes et `/scriptorium/sw.js` ;
- `/scriptorium/bible-worker-<hash>.js` et le moteur WASM dans `/_astro` ;
- `/scriptorium/donnees/<sha256>.db`, copie statique de l’unique snapshot French-Bibles sélectionné au build. Le fichier historique `data/bible.db` et les replis sont supprimés. La version affichée vient du tag Git réel ; les URLs et caches utilisent le SHA-256 du fichier, sans version figée dans le code. Voir [synchronisation serveur](../data/README.md).

La base source ne change pas. Son contenu devient téléchargeable publiquement pour permettre le mode hors ligne. La seule route serveur reste `/api/bible/verses` : les paramètres `pwa=latest` et `pwa=download&asset=<id>` sélectionnent le relais, isolé dans les modules PWA. Les requêtes de versets gardent leur comportement habituel. Aucun nouveau chemin n’est à ajouter au reverse proxy existant, et aucun service permanent ou appel Directus n’est ajouté.

Le domaine doit être servi en HTTPS (localhost est accepté pour les tests). Le reverse proxy doit servir les fichiers statiques de `dist/client`, dont les nouveaux chemins ci-dessus, comme les ressources existantes. Ne pas appliquer de cache immuable à `sw.js`, au manifest ou à la page HTML ; les fichiers contenant leur empreinte dans le nom peuvent être mis en cache longtemps. Le worker est enregistré avec `updateViaCache: 'none'`. Servir le WASM avec `application/wasm`, le manifest avec `application/manifest+json` et le service worker comme JavaScript. Aucune configuration COOP/COEP n’est requise.

Une politique CSP personnalisée doit autoriser les workers de même origine et WebAssembly (`worker-src 'self'` et `script-src 'wasm-unsafe-eval'` dans les directives existantes). Le lecteur déjà téléchargé ne dépend d’aucun domaine externe. Le navigateur utilise uniquement son propre domaine, y compris pour les mises à jour. Le processus Node du VPS doit pouvoir joindre `api.github.com`, `github.com` et les hébergements d’assets GitHub en HTTPS. Aucune autorisation de connexion vers GitHub n’est nécessaire dans la CSP du navigateur.

Après un changement de code, le build génère un cache de ressources versionné. La nouvelle version s’installe entièrement avant de proposer **Actualiser l’application** dans le panneau **Emporter le comparateur** ; un point sur la disquette signale la mise à jour disponible. La mise à jour se fait sur action explicite pour éviter de remplacer le lecteur au milieu d’une lecture. L’actualisation recharge aussi les autres onglets ouverts du lecteur pour garder les ressources cohérentes. La copie biblique est conservée séparément des caches de l’interface. Une nouvelle release GitHub dont l’empreinte diffère de la copie locale propose **Mettre à jour la Bible**, sans imposer un nouveau téléchargement à chaque déploiement de l’interface. Les traductions sont retrouvées par leur code stable, même si les identifiants numériques d’une ancienne base diffèrent.

## Validation

```bash
npx playwright install chromium
npm run build
npm run test:pwa
npm run test:server
```

Le serveur de test utilise le build sur le port 4322. Un Chromium système peut être sélectionné avec `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/chemin/vers/chromium`.

Les tests vérifient la comparaison avec l’API Node, la réouverture hors ligne, des chapitres et traductions jamais lus, la navigation, la reprise après transfert interrompu, la conservation de l’ancienne base, la suppression et les interfaces d’installation. Les tests navigateur simulent les réponses du relais local avec de vraies bases SQLite, dont une avec des identifiants de traductions modifiés. Ils couvrent un premier téléchargement directement en mode installé, une annulation dans le navigateur suivie d’un téléchargement dans la PWA et l’ordre des étapes dans la fenêtre. Les tests de mise en page vérifient aussi la cible tactile, l’alignement dans les contrôles, l’absence de débordement et la fermeture au clavier. Les tests serveur utilisent de vraies réponses HTTP, des redirections et des flux sans en-tête CORS ; ils vérifient aussi l’annulation et les destinations autorisées. Ils vérifient les rappels après report, l’absence de trafic GitHub dans le navigateur classique, le mode compact, les polices à froid hors ligne et la conservation de la Bible pendant une mise à jour de l’interface. L’interface iPhone est simulée dans Chromium ; ce test ne remplace pas une validation Safari sur un iPhone réel.

Sur Android et sur iPhone, contrôler également l’installation depuis le site HTTPS, le téléchargement depuis l’application installée, la fermeture complète, puis la réouverture en mode avion. Tester les futures bases plus volumineuses sur les appareils ciblés, ainsi qu’un refus de stockage et une mise à jour avec une connexion interrompue.

## Organisation du code PWA

- `src/components/bible/ComparatorAppChrome.astro` : habillage réservé au mode installé ; les deux slots de `BaseLayout` restent vides ailleurs.
- `src/lib/offline/display-mode.ts` : détection du mode installé, sans le confondre avec une petite fenêtre ou le plein écran du navigateur.
- `src/lib/offline/passage.ts` : choix de la source de lecture ; copie locale prioritaire dans la PWA, serveur prioritaire dans le navigateur et copie locale si le réseau échoue.
- `src/lib/offline/releases.ts` : métadonnées du relais, validation, migration des anciennes URLs et conservation du dernier résultat.
- `src/lib/offline/releases-server.ts` et `releases-route.ts` : accès GitHub, métadonnées mutualisées et relais en flux via la branche PWA de l’API existante.
- `src/components/bible/OfflinePanel.svelte` : installation, état de la copie locale, avis et actions de l’utilisateur.
- `src/lib/offline/bible.worker.ts` et `storage.ts` : SQLite, téléchargement vérifié et remplacement atomique dans IndexedDB.
- `src/lib/offline/sw.js` et `scripts/comparator-pwa.mjs` : cache versionné de l’interface, des polices et des ressources locales. La base est stockée séparément et n’appartient jamais à ce cache.

Les quatre familles utilisées par le comparateur (Source Serif 4, Cormorant Garamond, Source Sans 3 et Cinzel), ainsi que les variantes locales, sont précachées depuis `public/fonts`. Les tests vérifient leur présence dans CacheStorage et leur chargement après réouverture sans réseau, avec le cache HTTP désactivé.
