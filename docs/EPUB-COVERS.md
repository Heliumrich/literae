# Couvertures et avis d’édition EPUB

## Règle éditoriale

La couverture reste une composition classique : auteur, titre, date de composition
ou de première publication, traduction le cas échéant, maison d’édition et date
de l’édition utilisée. Aucun texte de présentation du site ou du lecteur.

Un avis ajouté par nos outils se limite aux renseignements bibliographiques.
Les préfaces et avertissements historiques font partie de l’ouvrage et restent
intacts. Les attributions et licences des transcriptions restent dans les
métadonnées et les crédits de fin de volume. Une date ou un éditeur inconnu n’est
pas inventé ; les datations anciennes incertaines restent approximatives.

Sacy est une exception : son avis explique brièvement l’origine composite du
texte. Les versions courtes de 1855 d’Esther et Daniel sont supprimées ; les
versions catholiques Furne de 1841, en 16 et 14 chapitres, les remplacent entièrement.
Les 46 livres de l’Ancien Testament et les 27 du Nouveau sont présentés sans doublon.

## Format de couverture commun aux lecteurs

La couverture est une **image JPEG baseline de 1 200 × 1 680 pixels**. Le texte,
le cadre et l’ornement sont dessinés dans l’image ; aucun rendu SVG, police intégrée,
positionnement de texte HTML ou bordure CSS n’est nécessaire sur une liseuse.
Le JPEG est déclaré comme `cover-image` dans le manifeste EPUB 3 et par la
métadonnée `cover` pour les lecteurs utilisant la convention EPUB 2.

La page de lecture contient un seul `img`, dans `.literae-cover`, sans texte de
couverture en double. Le chemin de la page existante est conservé. Exemple :

```html
<html xmlns="http://www.w3.org/1999/xhtml" lang="fr">
<head>
  <title>Confessions</title>
  <meta name="calibre:cover" content="true"/>
  <style>
    html, body { margin: 0; padding: 0; height: 100%; background: #f7f1e5; }
    .literae-cover { height: 100%; text-align: center; }
    img {
      display: block; height: 100%; width: auto;
      max-width: 100%; max-height: 100%; object-fit: contain; margin: 0 auto;
    }
  </style>
</head>
<body>
  <div class="literae-cover">
    <img src="cover-classic.jpg" alt="Aurelius Augustinus – Confessions"
         style="height:100%;width:auto;max-width:100%;margin:0 auto"/>
  </div>
</body>
</html>
```

Une seule dimension est imposée à 100 %. Crosspoint traite les deux dimensions
à 100 % comme le ratio de la fenêtre, ce qui déformerait l’image. Avec `height`
et `width:auto`, il conserve le ratio intrinsèque et limite l’image à la place
réellement disponible. Le cadre reste visible car il fait partie des pixels.
Les proportions des écrans peuvent laisser des marges autour de la composition.

Dans le lecteur web, `client.ts` reconnaît `.literae-cover` ou la métadonnée de
couverture et fixe la hauteur du document à celle du lecteur. `object-fit: contain`
conserve l’image entière en portrait et paysage. Les réglages typographiques
restent réservés aux autres pages. Ne pas utiliser `100vh` dans un EPUB : cette
unité désigne la hauteur de l’iframe, calculée par EPUB.js.

## Préparation des prochaines éditions

[prepare-epub-frontmatter.py](../scripts/prepare-epub-frontmatter.py) est une étape
finale commune, à exécuter sur les deux versions après préparation du contenu
et des notes. Son catalogue bibliographique est
[epub-frontmatter.json](../scripts/catalogs/epub-frontmatter.json).
Un nouvel ouvrage doit y recevoir une entrée vérifiée avant publication.
L’outil ne se connecte pas à Directus et n’écrase pas son entrée.

Dépendances : Python, `lxml`, `Pillow`, police Noto Serif Regular disponible au
chemin indiqué dans le script, ou fournie avec `--font`. La police sert uniquement
à produire l’image, elle n’est pas intégrée à l’EPUB.

```bash
python scripts/prepare-epub-frontmatter.py source.epub final.epub \
  --book-id UUID_DU_LIVRE --kind web --report rapport.json
```

Utiliser `--kind download` pour la variante liseuse. Les couvertures des cartes
Directus reprennent la même image JPEG que les EPUB.

Après publication dans Directus, reconstruire le site. Un EPUB utilise directement
l’URL de son nouvel UUID : son contenu est immuable et cet identifiant constitue
sa version. Les couvertures des cartes conservent une révision issue de leur
identifiant, de `modified_on` et de `filesize`, car elles peuvent être remplacées
en place.

Pour reprendre l’ancien fichier composite Sacy, appliquer d’abord
[fix-sacy-duplicates.py](../scripts/fix-sacy-duplicates.py). Il retire physiquement
les 22 chapitres des versions courtes et l’ancienne page de séparation, réordonne
le spine et les deux sommaires, conserve chaque verset Furne et refuse tout lien
non résolu vers une version supprimée. Ne pas le réappliquer à un fichier déjà
corrigé : ses assertions exigent la structure source ancienne.

## Contrôles du lot de 45 livres

Les 90 fichiers passent EPUBCheck 5.4.0 sans erreur ni avertissement. L’audit
compare toutes les ressources conservées, les métadonnées bibliographiques,
les liens internes et les 3 038 documents de notes inchangés. Les différences
sont limitées aux couvertures, avis éditoriaux, navigation associée et à la
correction explicite de Sacy. Le doublon de page de titre ajouté à la Somme
est retiré. Les associations web/téléchargement et noms d’auteurs EPUB récemment
corrigés sont conservés. Après détection de réponses de stockage incohérentes,
les 90 EPUB ont été republiés sous de nouveaux UUID Directus. Les anciens fichiers
restent accessibles aux pages déjà chargées. Voir la
[procédure de publication](EPUB-ASSET-PUBLICATION.md) pour éviter de remplacer
en place un fichier déjà servi.

`epub-frontmatter.spec.ts` vérifie les 45 couvertures web sur ordinateur et
mobile portrait/paysage, ainsi que les 45 variantes liseuse dans le même lecteur :
180 scénarios réussis sur les fichiers préparés localement. Les derniers chapitres
d’Esther et Daniel sont également contrôlés.

Le parcours public sur S3 avait encore 11 erreurs sur 180, liées à des réponses
403 et délais ; les logs ont confirmé une limitation S3 `503 ServiceUnavailable`.
Après migration des fichiers actifs vers le volume local, les **180 scénarios
publics passent**, ainsi que les neuf tests de pagination, filtres, canoniques et
sitemaps. Les UUID et associations des éditions sont conservés par cette migration.
Voir le [rapport de stockage local](LIBRARY-LOCAL-STORAGE-2026-10.json).

Crosspoint a également été contrôlé avec son parseur C++ réel au commit
`d9764e2b7c18230fb3673439229dd7b122fed835` : 90 pages de couverture × 3 tailles
(480 × 800, 1 264 × 1 680, 800 × 480). Les 270 mises en page contiennent une seule
image, sans texte séparé ni débordement et avec les proportions conservées.
Le banc natif utilise les doubles matériels du projet Crosspoint : il teste
le parseur XML/CSS, la lecture d’en-tête JPEG et la géométrie, sans simuler l’écran
physique ni son décodage matériel.

Pour KOReader, la structure suit sa lecture des couvertures EPUB via CREngine :
JPEG standard, métadonnées de couverture et XHTML simple. Son code a été examiné ;
l’application KOReader et les liseuses physiques n’ont pas été exécutées ici.
Les sources consultées sont les dépôts
[Crosspoint](https://github.com/crosspoint-reader/crosspoint-reader) et
[KOReader](https://github.com/koreader/koreader).

Les empreintes et identifiants publiés sont consignés dans
[EPUB-FRONTMATTER-2026-10.json](EPUB-FRONTMATTER-2026-10.json).
