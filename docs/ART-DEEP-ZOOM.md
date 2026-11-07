# Galerie Deep Zoom

Astro construit les fiches et les catalogues à partir de Directus. La visionneuse charge OpenSeadragon à l’ouverture et affiche un aperçu pendant le chargement. Les tuiles du niveau et de la zone visibles arrivent ensuite par `/art-media/`. La galerie et ses aperçus sur les deux accueils utilisent cette même filière. Les EPUB et leurs couvertures suivent la filière Directus existante.

## Directus

Ajouter à `artworks` le champ **`deep_zoom_key`**, de type **String**, interface **Input**, facultatif et sans valeur par défaut. Le rôle Public doit avoir le droit de lire ce champ avec les autres métadonnées des œuvres publiées. Libellé suggéré **Image Deep Zoom**. Une clé a la forme `uuid-de-l-oeuvre/empreinte-hexadecimale-sur-24-caracteres`. Elle identifie une version d’image et survit à un changement de titre ou de slug.

Coller la clé affichée par `publish` après le transfert. Pour remplacer une image, préparer et publier la nouvelle version, puis modifier le champ et reconstruire le site. Les anciennes versions restent disponibles pour les pages déjà en cache. Une œuvre publiée sans clé reste dans Directus, mais sort du catalogue, des listes d’artistes et des fiches générées sur cette branche. Vérifier l’inventaire avant la bascule en production.

Pour un pilote local, définir `ART_MEDIA_PILOT_MANIFEST` sur le chemin absolu d’un JSON qui associe les **UUID Directus** aux clés Deep Zoom. Le build utilise les mêmes métadonnées publiques et prend la clé dans ce manifeste. Retirer cette variable en production pour lire `deep_zoom_key`.

## Préparation et transfert depuis le PC

Pour publier une œuvre, créer sa fiche dans Directus, copier son UUID et lancer cette commande depuis `literae-web` dans PowerShell. Elle demande l’UUID et le chemin de l’original si aucun argument n’est fourni.

```powershell
.\scripts\publish-artwork.ps1
```

La commande utilise libvips et les identifiants Ceph de `G:\literae-art\login-bucket-object-storage.txt`. Elle contrôle la pyramide, compare les empreintes des objets présents et écrit le descripteur en dernier. Si le transfert est interrompu, relancer la même commande avec le même original. Copier la dernière ligne de sortie dans le champ `deep_zoom_key` de la fiche, puis lancer `deploy` pour publier la modification.

Utiliser libvips avec Little CMS et WebP. Sous Windows, `ART_VIPS` peut pointer sur `vips.exe`. Choisir le disque `G:` pour la sortie. Le script y place aussi les temporaires libvips, qui peuvent occuper plusieurs Gio pour un grand TIFF. Une opération prépare une version immuable composée de `image.dzi`, `image_files/`, `thumb.webp` (480 px) et `preview.webp` (1 600 px). Les dimensions source sont conservées après correction d’orientation. Les tuiles sont en sRGB, WebP Q88, 512 px et 1 px de recouvrement. `ART_TILE_QUALITY` permet de produire une autre version pour comparaison.

```powershell
$env:ART_VIPS = 'G:\literae-art\tools\libvips-windows-x64-8.18\bin\vips.exe'
node scripts/art-deep-zoom.mjs prepare <uuid-directus> '<fichier-original>' 'G:\literae-art\workdir\deepzoom'
node scripts/art-deep-zoom.mjs publish '<dossier-de-version-affiché-par-prepare>'
```

Pour `publish`, renseigner `ART_S3_ENDPOINT`, `ART_S3_REGION`, `ART_S3_BUCKET`, `ART_S3_KEY` et `ART_S3_SECRET` dans l’environnement de la session. Utiliser le bucket privé `literae-gallery` sur `https://s3.gva2.infomaniak.cloud` avec la région `gva2`. Les envois se font par groupes de quatre, avec une pause entre les groupes et un délai croissant en cas d’échec temporaire. Le transfert reprend les objets déjà présents de même taille dans la version et publie `image.dzi` à la fin. Le champ Directus peut alors être renseigné. Les fichiers d’origine restent sur le PC. Le lien de téléchargement ouvre le guide de l’extension Dezoomify. Les très grandes recompositions peuvent nécessiter l’application de bureau.

Pour un lot, `node scripts/art-deep-zoom.mjs batch <sources.json> <sortie>` prend un JSON de correspondances **UUID Directus → chemin absolu de l’original**. Il traite une œuvre à la fois et inscrit chaque transfert terminé dans `ready.json` à la racine de la sortie. Ce fichier sert aussi de manifeste pilote. Relancer le lot après une interruption reprend les transferts incomplets. Lancer un seul lot par dossier de sortie.

## Historique de la migration du catalogue

La commande de migration par lot ci-dessous cible le stockage Swift historique. Pour ajouter ou remplacer une image sur Ceph, utiliser `publish-artwork.ps1`.

Le dossier `G:\literae-art\workdir\migration` contient l’inventaire Directus, `correspondances.txt` (table tabulée des liaisons retenues), `a-verifier.txt` et `sans-correspondance.txt`. Les vignettes utilisées pour départager les fichiers servent uniquement de référence. La génération part du fichier local inscrit dans la liaison.

Depuis `literae-web`, dans PowerShell 7, prévisualiser puis lancer le lot.

```powershell
.\scripts\migrate-art-media.ps1 -PlanOnly -Limit 10
.\scripts\migrate-art-media.ps1
```

`-Limit 10` borne le nombre de nouvelles œuvres, et `-Manifest` permet de choisir un fichier tabulé ou un JSON UUID → chemin absolu. Par défaut, la commande lit `correspondances.txt` et prend les lignes `published` confirmées ou validées. Pour intégrer une vérification manuelle, ajouter une ligne complète avec l’UUID, le chemin de l’original et `validé` dans la colonne `état`. Les identifiants sont lus depuis le `login.txt` existant. Les fichiers de travail et le journal restent sur `G:`.

Le journal `G:\literae-art\workdir\deepzoom\journal\<UUID>.json` enregistre la fiche, la source, le bucket et la clé avant le premier envoi. La migration valide toutes les tuiles attendues par le DZI, utilise un contrôle MD5 à l’envoi et compare les empreintes S3 à la reprise. Elle publie le descripteur en dernier et renseigne `deep_zoom_key` uniquement si le champ est encore vide. Si l’exécution est interrompue, relancer la même commande avec le même dossier de sortie. Si les tuiles sont déjà complètes, la reprise termine la liaison sans renvoi. Conserver le dossier de sortie et les chemins sources jusqu’à la fin du lot. Le script s’arrête sur la première erreur pour permettre de la corriger avant la suite.

Reconstruire le site après un lot pour rendre visibles les nouvelles fiches liées. Pendant la migration, un seul processus doit écrire dans le dossier de sortie.

Après le transfert, `./scripts/migrate-art-media.ps1 -Audit` contrôle les liaisons Directus et les empreintes des objets S3 des œuvres journalisées en lecture seule. Le rapport se trouve dans `G:\literae-art\workdir\deepzoom\audit-migration.json`.

## Relais sur AlmaLinux

Le relais utilise le même Node.js que le site et écoute sur `127.0.0.1:4392`. Il accepte uniquement la lecture des descripteurs, tuiles et aperçus dont les chemins respectent le format de publication. Utiliser une clé dédiée limitée à `s3:GetObject` sur le nouveau bucket pour le VPS. Stocker les cinq variables `ART_S3_*` dans `/etc/literae/art-media.env`, lisible par root uniquement. Ne jamais utiliser de préfixe `PUBLIC_` pour ces variables.

Sur `literae-vps`, `literae-art-media.service` démarre automatiquement. Son code et ses dépendances sont installés sous `/opt/literae-art-media`, indépendamment des builds du site. La clé S3 provisoire est dans `/etc/literae/art-media.env` (mode `0600`, propriétaire `root`). Pour la remplacer, éditer `ART_S3_KEY` et `ART_S3_SECRET` avec `sudoedit`, puis exécuter `sudo systemctl restart literae-art-media`. Tester ensuite un descripteur directement sur `http://127.0.0.1:4392/art-media/<clé>/image.dzi`, car une réponse depuis le cache Nginx ne valide pas les nouveaux identifiants.

Nginx réserve 2,5 Gio de cache aux descripteurs, vignettes, aperçus et tuiles jusqu’au niveau 12. Les niveaux supérieurs partagent les 1,5 Gio du cache dynamique. Les deux zones évacuent des entrées quand l’espace libre du système de fichiers descend sous 1,5 Gio.

La commande `deploy` redémarre le service Astro après un build réussi et lance `literae-art-cache-warm.service` en arrière-plan. Le script lit le catalogue publié et parcourt les niveaux des moins détaillés aux plus détaillés. Il s’arrête à 2,2 Gio estimés ou si le disque manque d’espace. Les tuiles restantes entrent dans le cache à la première consultation. Pour relancer le préchauffage, utiliser `sudo systemctl start --no-block literae-art-cache-warm.service`. Le journal indique le nombre d’objets traités et les éventuelles erreurs.

Configuration du service installé.

```ini
[Unit]
Description=Relais de tuiles Literae
After=network-online.target
Wants=network-online.target

[Service]
DynamicUser=yes
WorkingDirectory=/opt/literae-art-media
EnvironmentFile=/etc/literae/art-media.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /opt/literae-art-media/art-media-server.mjs
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
MemoryMax=256M

[Install]
WantedBy=multi-user.target
```

Nginx charge la zone de cache depuis `/etc/nginx/conf.d/00-literae-art-cache.conf`. Les deux hôtes HTTPS incluent `/etc/nginx/literae-art-media.inc` depuis `scriptorium.conf`. Le cache est partagé, avec éviction par le gestionnaire Nginx et une cible de **4 Gio**. `min_free` laisse 1 Gio de marge si le disque se remplit. Le répertoire utilise le contexte SELinux du cache Nginx. Valider toute modification avec `nginx -t` avant rechargement.

```nginx
# Contexte http
proxy_cache_path /var/cache/nginx/literae-art levels=1:2 keys_zone=literae_art:8m
                 max_size=4g min_free=1g inactive=30d use_temp_path=off;

# Dans chacun des deux server HTTPS
location ^~ /art-media/ {
    proxy_pass http://127.0.0.1:4392;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_pass_request_headers off;
    proxy_read_timeout 25s;
    proxy_cache literae_art;
    proxy_cache_key $uri;
    proxy_cache_lock on;
    proxy_cache_lock_age 25s;
    proxy_cache_lock_timeout 25s;
    proxy_cache_valid 200 365d;
    proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
    add_header X-Art-Cache $upstream_cache_status;
}
```

Le bucket reste privé et les requêtes du navigateur sont de même origine. Seules les ressources servies par le relais sont consultables publiquement. Vérifier un `GET` DZI et un `GET` WebP sur chaque domaine, puis `X-Art-Cache: HIT` à la deuxième lecture. Vérifier également qu’une URL S3 non signée est refusée. Aucun libvips ni original n’est requis sur le VPS.

## Aperçu local et bascule

1. Générer les pyramides pilotes sur `G:`, les publier et créer le manifeste local.
2. Lancer `node scripts/art-media-server.mjs` avec les variables du bucket et `astro dev --background` avec `ART_MEDIA_PILOT_MANIFEST`. Le serveur de développement relaie `/art-media/` sur le port 4392.
3. Vérifier liste, fiche et collection d’artiste, puis le zoom, la navigation et Épique. Pour les tests Playwright sur un build, `ART_MEDIA_TEST_PROXY=http://127.0.0.1:4392` fait passer les tests de zoom par le vrai bucket.
4. Associer les originaux restants aux UUID Directus. Générer, transférer, puis remplir les clés. Comparer le nombre de fiches tuilées avec les œuvres à publier avant de mettre cette branche en service. Garder l’ancien stockage et ses références disponibles jusqu’à validation de la bascule.
