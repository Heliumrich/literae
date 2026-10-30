# Stockage local de la bibliothèque

Directus 12.2 conserve deux stockages : `s3` pour la galerie, `local` pour les
fichiers actifs des livres. Le volume local existe déjà dans le compose fourni.
Les dossiers de File Library restent `books/ebooks`, `books/dl_ebooks` et
`books/images` ; ils ne constituent pas des répertoires physiques du stockage.

## Configuration du conteneur

Dans **le compose Directus existant**, conserver les autres réglages et définir :

```yaml
services:
  directus:
    environment:
      # Conserver ici les variables existantes de DB, Redis, S3, etc.
      STORAGE_LOCATIONS: "s3,local"
      STORAGE_LOCAL_DRIVER: local
      STORAGE_LOCAL_ROOT: /directus/uploads
    volumes:
      - ./uploads:/directus/uploads:Z
      - ./extensions:/directus/extensions
      - ./schema:/directus/schema
```

Ce bloc est un extrait à intégrer, pas un compose autonome. L’ordre `s3,local`
conserve S3 comme destination par défaut. Le suffixe `:Z` donne au conteneur
l’accès SELinux au répertoire des uploads sur AlmaLinux.

Depuis le dossier habituel du compose Directus :

```bash
docker compose up -d directus
docker compose exec --user root directus sh -c 'chown node:node /directus/uploads && chmod u+rwx /directus/uploads'
```

Les fichiers locaux survivent à la recréation du conteneur grâce au montage
`./uploads`. Inclure ce répertoire dans les sauvegardes du serveur.

## Copie des fichiers existants

Le champ `storage` est grisé dans l’interface. Une modification JSON de ce champ
ne copie pas les octets : elle repointe simplement la fiche. L’outil
[move-library-storage.py](../scripts/move-library-storage.py) envoie au contraire
le contenu validé vers `local` avec l’API de remplacement, en conservant le UUID
et `filename_disk`. Sur Directus 12.2, cette opération écrit le fichier temporaire
sur le stockage cible, le renomme, puis actualise les métadonnées calculées.
Les anciennes copies S3 ne sont pas supprimées par cet outil.

Le chemin physique est conservé, y compris son extension, pour éviter que
Directus ne tente de renommer un objet dans le stockage S3 d’origine. Le nom
visible, le titre, les descriptions, les étiquettes, le dossier et les métadonnées
de correspondance des éditions sont préservés. Les relations des livres ne sont
pas modifiées.

Un manifeste contient uniquement les fichiers sélectionnés de la bibliothèque :

```json
[
  {
    "id": "UUID_DU_FICHIER",
    "source": "prepared/livre.epub",
    "sha256": "EMPREINTE_ATTENDUE",
    "mime": "application/epub+zip",
    "storage": "s3",
    "filename_disk": "UUID_DU_FICHIER.epub"
  }
]
```

L’outil utilise seulement la bibliothèque standard Python. Fournir le jeton par
`DIRECTUS_TOKEN`, ou un fichier JSON privé avec `--token-file` ; ne pas le mettre
dans le manifeste ni dans le dépôt.

```bash
# Vérification de toutes les sources et des chemins ; aucun changement distant.
python scripts/move-library-storage.py manifeste.json \
  --source-root /chemin/des/sources --checkpoint migration.json

# Transfert séquentiel et contrôlé, après activation et test du stockage local.
python scripts/move-library-storage.py manifeste.json \
  --source-root /chemin/des/sources --checkpoint migration.json --execute
```

Chaque transfert attend sa réponse complète et contrôle la taille, le UUID,
le chemin de stockage et l’empreinte de la lecture publique. Le checkpoint garde
les métadonnées antérieures. Un transfert interrompu n’est jamais réenvoyé
aveuglément : l’outil refuse de reprendre tant que sa fin n’est pas établie.

Le lot du 31 octobre porte sur **135 fichiers actifs** : 90 EPUB et 45 couvertures,
associés aux 45 livres. Les fichiers de la galerie ne figurent pas dans le plan.
Les sources validées déjà présentes dans l’environnement sont envoyées
directement vers le volume local, sans lecture ni écriture des objets S3.

## Publications suivantes

Pour les nouveaux livres, transmettre explicitement le champ multipart
`storage=local` **avant** le fichier. Les dossiers File Library ne sélectionnent
pas automatiquement un stockage. Les uploads de la galerie conservent la
configuration S3 par défaut.

Une nouvelle version du contenu EPUB reçoit un nouveau UUID ; une copie
identique vers un autre stockage conserve le UUID. Les URL des EPUB utilisent
cet identifiant immuable. Les miniatures de couverture conservent leur révision
pour renouveler le cache lorsqu’une image change.

## Bilan et nettoyage

Les 135 fichiers ont été copiés et contrôlés sans modifier leurs UUID, chemins,
métadonnées éditoriales ni associations. Les 180 scénarios de lecture publics
passent sur local, avec les neuf tests de pagination et de canoniques. Le
[rapport](LIBRARY-LOCAL-STORAGE-2026-10.json) contient les identifiants et empreintes.

Les anciennes fiches de fichiers non référencées seront nettoyées seulement après
le rebuild du VPS et vérification des liens effectivement servis en production.
Une fiche devenue inutile dans le CMS peut encore être utilisée par une page
HTML construite avant la migration. Le nettoyage S3 doit rester séquentiel et
limité en débit.
