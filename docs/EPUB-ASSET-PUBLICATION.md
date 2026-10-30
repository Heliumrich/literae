# Publication des fichiers EPUB

Une modification du contenu EPUB reçoit un nouvel identifiant de fichier et une
nouvelle clé de stockage. Une copie identique vers un autre stockage conserve
l’identifiant ; voir [la migration locale](DIRECTUS-LOCAL-LIBRARY.md).

## Incident observé

Après les remplacements du 30 octobre 2026, certaines réponses `/assets/UUID`
annonçaient une taille différente de celle du corps effectivement reçu ; d’autres
renvoyaient encore une ancienne édition. Cela provoquait des archives ZIP
incomplètes, des erreurs de chargement ou l’affichage d’une ancienne couverture.
Ces échecs ont été reproduits dans des contextes Chromium vierges, sur ordinateur
et mobile. Un premier parcours des 180 scénarios sur les fichiers publics avait
25 échecs, alors que les fichiers locaux validés passaient ces mêmes contrôles.
Changer seulement la query string ou rafraîchir les métadonnées ne suffisait pas.
Le journal Directus et le code de `FilesService.uploadOne` ont ensuite permis
d’identifier un second mécanisme : un envoi interrompu peut déclencher tardivement
le nettoyage de son fichier. Des reprises sur le même UUID, avant la fin de
l’opération précédente, ont permis à ce nettoyage d’effacer un objet déjà réparé,
voire sa fiche et son association au livre. Vérifier les octets pendant qu’un
ancien envoi était encore actif ne suffisait donc pas. Les deux fichiers concernés
ont été restaurés avec de nouveaux identifiants, après fin effective de l’envoi.
La procédure précédente, qui écourtait l’attente et reprenait le même identifiant,
ne doit pas être réutilisée.

Source : [FilesService de Directus](https://github.com/directus/directus/blob/main/api/src/services/files.ts),
fonction `uploadOne`, gestion `cleanUp` des créations échouées.

Les journaux du serveur ont ensuite confirmé des réponses S3 Infomaniak
`503 ServiceUnavailable` avec le message `Please reduce your request rate`.
Les relances et tests parallèles avaient aggravé cette limitation. La taille des
fichiers n’explique pas à elle seule ces erreurs ; le trafic et les interruptions
de transfert ont contribué aux échecs observés.

Les EPUB ont été republiés après confirmation complète des envois, sans nouvelle
transformation de leur contenu. Une dernière vérification sur S3 donnait encore
169 succès sur 180. La solution retenue est de servir les 90 EPUB et les 45
couvertures actives depuis le volume local persistant de Directus, avec une
migration séquentielle et vérification des empreintes. S3 reste destiné à la
galerie. Le contrôle public après migration locale donne **180 réussites sur 180**,
avec les 135 empreintes vérifiées. Voir le
[rapport de migration locale](LIBRARY-LOCAL-STORAGE-2026-10.json).

## Procédure pour les prochains lots

1. Préparer et valider les deux fichiers localement.
2. Créer deux nouveaux fichiers Directus sur `local`, dans `books/ebooks` et
   `books/dl_ebooks`. Envoyer explicitement `storage=local` avant le fichier.
   Conserver titre, nom de téléchargement, description, crédits et tags utiles.
   Attendre une réponse de succès de l’envoi complet ; une lecture publique
   temporairement réussie ne remplace pas cette confirmation. En cas d’interruption
   ou de réponse indéterminée, ne pas réparer ni publier le même UUID : une nouvelle
   tentative doit utiliser un nouvel identifiant. Ne pas remplir manuellement
   `filesize` pour faire paraître terminé un transfert encore actif.
3. Vérifier les octets publics : taille reçue, taille annoncée et SHA-256 attendu.
   Une ligne de métadonnées créée ne garantit pas que l’objet de stockage existe.
4. Déclarer les correspondances `literae_download_file_id` côté web et
   `literae_reader_file_id` côté téléchargement dans les métadonnées des nouveaux
   fichiers. Conserver les autres métadonnées utiles.
5. Mettre à jour ensemble les deux relations du livre, en conservant les lignes
   de liaison, leur ordre et la correspondance des traductions.
6. Reconstruire le site pour publier les nouvelles URL ; tester les fichiers
   publics dans des sessions vierges.

Conserver les anciens fichiers tant que le VPS sert encore des pages construites
avec leurs URL. Leur suppression doit attendre le déploiement ; les pages déjà
ouvertes peuvent également continuer à les utiliser. Les fichiers de couverture
des cartes restent distincts des EPUB.

La correspondance des anciens et nouveaux identifiants, ainsi que les empreintes,
est consignée dans [EPUB-FRONTMATTER-2026-10.json](EPUB-FRONTMATTER-2026-10.json).
