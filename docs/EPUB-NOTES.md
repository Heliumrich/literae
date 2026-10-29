# Notes EPUB, ponctuation et téléchargements

Le lecteur traite les appels de notes de **tous les ouvrages**, sans dépendre du
tag `Sainte Bible`. La lecture web et le téléchargement utilisent deux fichiers
associés à la même édition.

## Organisation Directus

- `books/ebooks` : fichiers adaptés au lecteur web, associés à `books.ebook_files`.
- `books/dl_ebooks` : fichiers pour liseuses, associés à `books.ebook_download_files`.
- `books/images` : images de couverture uniquement.

L’ordre par défaut de la bibliothèque suit le champ système `books.sort`, repris
au build dans le catalogue statique. Les tris explicites par titre, auteur et
étiquettes restent disponibles et sont conservés dans l’URL. Les notices
d’auteurs reprennent également l’ordre Directus pour leurs ouvrages.

Les deux relations de fichiers ont le **même nombre d’éléments et le même ordre**.
`book-editions.ts` utilise `sort` lorsqu’il existe, sinon l’identifiant de la ligne
intermédiaire, qui donne l’ordre de création. Les relations actuelles n’ont pas de
champ `sort` ; un réordonnancement par glisser-déposer nécessiterait de le configurer
sur les deux collections intermédiaires dans Directus.

Chaque fichier de téléchargement conserve dans `directus_files.metadata` le champ
`literae_reader_file_id`. Réciproquement, le fichier web contient
`literae_download_file_id`. Ce sont des UUID complets : la correspondance ne dépend
pas du nom du fichier, de sa taille ou d’un préfixe partagé entre deux traductions.
Le build échoue si l’ordre ou les associations sont incompatibles. Pour des fichiers
ajoutés manuellement sans ces métadonnées, les libellés des traductions doivent
correspondre à chaque position lorsqu’il existe plusieurs éditions.

Le bouton « Télécharger l’EPUB » utilise `downloadUrl`, distinct de l’URL ouverte
par EPUB.js. Son adresse est actualisée dès le changement d’édition. Le navigateur
ne charge que la version web choisie ; le fichier pour liseuse reste un téléchargement
explicite. Les signets continuent à dépendre de l’UUID du fichier web.

## Préparation

```bash
python scripts/prepare-reader-epub.py original.epub lecture-web.epub \
  --download liseuse.epub --report rapport.json
```

L’outil requiert Python et `lxml`, travaille sur des copies et n’accède pas au CMS.
`--download-source autre-original.epub` permet de conserver un original historique
pour liseuse lorsque la couverture de la version web a déjà été personnalisée.

Les espaces ordinaires précédant `: ; ? !` deviennent un espace insécable Unicode
U+00A0 dans les **deux versions**. L’opération parcourt les nœuds texte, y compris
les limites entre éléments en ligne ; les attributs, liens, scripts et styles ne
sont pas remplacés comme du texte brut. Elle n’ajoute pas un espace là où il n’en
existait pas. L’Unicode est valide en XHTML sans déclaration d’entité `&nbsp;`.

La version pour liseuse conserve la disposition normale des notes et son sommaire.
La seule réparation structurelle nécessaire dans l’ancien original des Confessions
est la renumérotation continue des `playOrder` du NCX ; son texte et sa couverture
sont conservés.

La version web :

1. reconnaît `epub:type="footnote"`/`endnote`, les rôles correspondants et les notes
   Wikisource `cite_note`, y compris les marqueurs placés dans un `span` ;
2. résout chaque lien vers sa note, même lorsque celle-ci est dans un gros fichier
   final, et regroupe les notes selon la **partie qui les appelle** ;
3. conserve le contenu riche, les identifiants nécessaires et les notes citées par
   une autre note ; si une note sert à plusieurs parties, chaque partie dispose
   de la copie locale nécessaire ;
4. crée de petits XHTML dans `literae-notes/`, inscrits au manifeste et dans le spine
   avec `linear="no"`, et déclare leurs liens dans le `head` de la partie ;
5. retire les anciens chapitres de notes devenus vides du spine, du sommaire EPUB 3
   et du NCX ; aucune note ne reste dans les documents de lecture linéaire ;
6. marque les appels par `role="doc-noteref"`, `epub:type="noteref"` et
   `.literae-noteref`. Le CSS du lecteur les affiche en exposant, avec un petit
   espacement, sans doubler l’exposant lorsqu’un `sup` existe déjà.

Une note sans appel provoque un arrêt : il faut examiner la source avant publication.
Les fichiers déjà préparés avec `literae-notes/` sont refusés comme entrée ; repartir
de la version pour liseuse. Le rapport comprend les empreintes, les nombres de notes,
les liens de préchargement et les parties utilisables pour les tests.

## Préchargement et dialogue

### Aperçu à la souris

`note-preview.ts` affiche un panneau non modal au survol des appels de notes et
des références bibliques dans le texte. Il demande un vrai pointeur souris et
la capacité de survol du navigateur ; le tactile conserve uniquement le clic.
Un délai de 250 ms évite d’ouvrir chaque note traversée. Les appels disposent
d’une marge de survol de 4 pixels ; le panneau chevauche légèrement leur bord
et un délai de sortie de 220 ms permet de franchir la limite de l’iframe.

Le panneau s’aligne près de l’appel, choisit le dessus ou le dessous selon la
place et reste dans les limites horizontales de la fenêtre. Son contenu est
défilable, sans suppression de mots ni de versets, sans en-tête « Note », bouton
de fermeture ou commande de chapitre entier. Il reste ouvert quand la souris
est dedans et disparaît à la sortie, au défilement du livre, à Échap ou au clic
extérieur. Il fonctionne aussi dans le lecteur en plein écran. Les navigateurs
sans l’API Popover conservent l’ouverture habituelle au clic.

Le dialogue et l’aperçu partagent la copie de notes filtrée et le cache des XHTML.
Leurs requêtes bibliques ont des cycles d’annulation distincts. Une note commentée
ne charge aucun verset avant un clic sur une référence, y compris dans l’aperçu.
Cliquer l’appel original ouvre toujours le dialogue complet. L’aperçu ne prend
pas le focus et son défilement ne déplace pas le livre ni son signet.

### Documents voisins

`EpubNotes` enregistre les liens déclarés par les documents qu’EPUB.js rencontre,
mais ne décompresse pas automatiquement leurs notes. Le lecteur lui transmet la
partie courante et ses voisines précédente et suivante. Seules leurs notes sont
préchargées ; un petit cache conserve ces documents et quelques documents récents.
Un chapitre lointain rendu par anticipation ne déclenche pas un chargement global.

Les notes viennent de l’archive déjà téléchargée : leur ouverture ne nécessite
aucune requête HTTP. Le dialogue suit les thèmes du site, fonctionne en plein écran
et ne réécrit pas le signet pendant son ouverture. Le contenu est copié à travers
une liste de balises autorisées ; scripts, gestionnaires et liens de retour sont
écartés. Fermer, Échap et un clic sur le fond ferment le dialogue.

Le conteneur EPUB utilise `overflow-anchor: none` : EPUB.js compense déjà lui-même
les ajouts/retraits de vues. Cette règle empêche le navigateur d’ajuster une seconde
fois le défilement et de faire sauter un chapitre devenu court après retrait des notes.

Événements DOM pour les contrôles et intégrations, sans interface de débogage ni
transmission réseau : `reader:notes-load`, `reader:notes-context` et
`reader:note-opened`. Ils exposent les chemins, l’état du cache et les durées de
préparation du contenu, sans reproduire le texte des notes.

## Citations bibliques dans les notes et le texte

Le dialogue normalise les références lors de l’affichage, dans tous les ouvrages.
Les EPUB web et les téléchargements Directus ne sont pas réécrits. Les signets
CFI, les appels de notes et leur préchargement restent indépendants de cet
enrichissement.

- `I Cor., VIII, 1.` devient `1 Cor. 8:1` ; les abréviations latines comme
  `Joan.` sont reconnues.
- `I Joan., II, 15, 16, 17.` devient `1 Jn 2:15–17`.
- `Apoc., XXII, 17 et 20.` devient `Ap 22:17, 20` : seuls 17 et 20 sont chargés.
- `Heb., XI, 35–38; XII, 1, 2.` donne deux passages, dans deux chapitres.

Une note composée uniquement de références explicites affiche automatiquement
les passages à la place de son texte : la liste abrégée et le premier délimiteur
sont supprimés. Plusieurs passages restent séparés entre eux. Le nom complet,
les coordonnées et la traduction identifient chaque passage, même en cas
d’échec réseau. Dans le chapitre entier, « Aller au passage cité » permet de
retrouver les premiers versets cités sans réintroduire le texte de la note.
Dans une note accompagnée d’un commentaire, les
références deviennent des boutons soulignés ; chaque passage est chargé au clic.
Le texte autour des références et les emphases sont conservés. Le remplacement
accepte les références réparties entre plusieurs balises en ligne et les retours
à la ligne de mise en forme du XHTML, sans joindre deux paragraphes.

Les passages proviennent de l’API existante du comparateur :
`/api/bible/verses?translation=FIL&book=1CO&chapter=8&verse=1`.
Les Bibles de la bibliothèque utilisent leur propre traduction : `CRA`, `GLA`
ou `SAC`. Les autres ouvrages utilisent `FIL`. Ces codes sont stables, indépendants
des identifiants numériques SQLite. Si une traduction ou un passage manque dans
la version préférée, Fillion est essayé pour tout le passage (pas de mélange de
traductions entre les versets). La mention « traduction de secours » le signale.
Un échec réseau ne masque jamais la note elle-même. Les paramètres `t=<ID>` du comparateur continuent à fonctionner.
La base reste ouverte en lecture seule avec `immutable=1`.

Un état de chargement est affiché, suivi de l’extrait sans numéros de versets,
encadré par des guillemets français et des espaces insécables U+00A0.
Une plage sur plusieurs paragraphes forme une seule citation. « Lire le chapitre
entier » remplace le passage dans le même bloc et marque les versets cités.
Le chapitre entier retrouve ses numéros et n’a pas ces guillemets ajoutés ;
la barre verticale conserve le repérage des versets cités. Les références à un
chapitre sans sélection de versets utilisent également cet affichage numéroté.
Le bloc du passage porte le nom catholique complet du livre, distinct de la
référence abrégée cliquable conservée dans les notes commentées. Un sous-titre indique « Chapitre 8,
verset 12. », « Chapitre 8, versets 8 à 12. » ou les versets discontinus ; il
devient « Chapitre 8. » à l’ouverture du chapitre entier. Ces coordonnées sont
celles du texte affiché après concordance, y compris lorsqu’un psaume source
correspond à deux chapitres. `bible-heading.ts` rassemble les noms des 73 livres
et ce formatage. Le titre, les coordonnées et la traduction ont trois tailles
décroissantes et peuvent revenir à la ligne, dans les deux thèmes.
« Revenir au passage cité » restaure la sélection. Le défilement reste dans le
dialogue, y compris en plein écran et en orientation paysage sur mobile.
Dans une note commentée affichant le chapitre entier, cliquer sur la référence soulignée aligne le premier
verset cité en haut de la zone de lecture, sans rechargement ni réduction du
chapitre. Un espace final est ajouté uniquement si nécessaire pour permettre
cet alignement près de la fin du chapitre.

Un cache borné garde uniquement les passages demandés pendant la vie du lecteur.
Il partage les requêtes identiques simultanées et réutilise un chapitre déjà lu.
Les notes voisines préchargées depuis l’EPUB ne provoquent **aucune** requête
biblique. Fermer la note, ouvrir une autre note ou changer d’édition annule les
requêtes en attente ; leur résultat ne peut pas remplacer la nouvelle note.
Les erreurs réseau sont réessayables et ne sont pas mises en cache.
Cet enrichissement nécessite le réseau ; la note originale reste lisible si
le comparateur est indisponible.

### Citations dans le corps et conservation des signets

`inline-bible.ts` repère aussi les citations dans les pages de lecture :
`(Prov. IX, 8)`, `(Prov. VI, 26)`, `Ps. II, v. 10.`, `(Lc. 1,4)`, etc.
Elles ouvrent le même dialogue. Une ancienne balise `a` sans `href` n’empêche
pas l’enrichissement ; les liens existants ayant déjà une destination restent
prioritaires.

Des liens positionnés sont ajoutés dans un conteneur vide à la fin du body.
Ils suivent les rectangles des citations après chargement des polices,
redimensionnement et modification des réglages. Aucun texte original n’est
entouré, déplacé ou découpé en nouveaux nœuds. C’est nécessaire : le mapping
CFI automatique d’EPUB.js ne respecte pas systématiquement `ignoreClass`.
Les tests résolvent des CFI issus d’un DOM sans les liens dans le DOM enrichi.
Aucune requête biblique n’est faite avant un clic dans le texte.

### Conventions, profils et concordance

La détection refuse les élisions françaises (`Si l’on`, `est l’époux`,
`mal, c’est`), un nom suivi d’une virgule et d’un numéro arabe seul
(`Jean, 2. – toutefois`), et les chapitres dépassant les limites
du livre. Les références complètes comme `Jean, II, 1` et les chapitres seuls
comme `Ps. XXI` restent reconnus. `Philip.` désigne les Philippiens.

Les responsabilités sont séparées :

- `bible-references.ts` : abréviations, nombres romains, listes, plages et chapitres ;
- `bible-profile.ts` : identité des trois Bibles et conventions de l’édition,
  indexées par l’UUID stable du livre, sans dépendre de son titre affiché ;
- `bible-concordance.ts` : conversion des références vers les coordonnées de SQLite ;
- `reference-dom.ts` : correspondance des offsets et des nœuds de texte ;
- `note-bible.ts` : affichage, choix de traduction, requêtes et cache.

`Eccl.` / `Eccles.` désigne normalement l’Ecclésiaste, `Eccli.`
l’Ecclésiastique. Les références impossibles dans l’Ecclésiaste (douze chapitres,
et dix-sept versets au chapitre huit) identifient l’Ecclésiastique : les notes
15 et 16 de l’Imitation ouvrent Qo 1:2 et 1:8 ; la note 34 ouvre Si 8:22.

La numérotation source des psaumes reste affichée avec « héb. » lorsqu’elle est
hébraïque ; le bloc du passage indique séparément sa correspondance dans le
comparateur. Exemples Crampon : Ps 104:6 → 103:6, Ps 16:10 → 15:10 ; les
psaumes 9/10, 114/115/116 et 147 demandent des fusions, séparations et offsets.
La concordance tient aussi compte des versets scindés/fusionnés du texte
Crampon réellement publié dans SQLite (notamment 11, 13, 44 et 56).
Joël 3/4 et Malachie 3:19–24 ont également une correspondance explicite.

Dans l’EPUB Crampon actuel, les notes de l’Ancien Testament utilisent par défaut
la numérotation hébraïque. À partir de `p053` (Matthieu), les notes du Nouveau
Testament emploient aussi la numérotation traditionnelle ; les indications
explicites « héb. », « Vulg. » ou une double numérotation comme `(67)` priment.
Ainsi, dans la note de Jean 2, Ps XVI (héb.) 10 est résolu en 15:10 tandis que
le renvoi non marqué à Ps XXI reste 21. Ces conventions sont propres à cette
édition et doivent être revues lors d’un changement de source ou de découpage.
Les quatre livres traditionnels des Rois sont distingués de Samuel/Rois modernes.

Les références sans verset ouvrent le chapitre complet. Une plage qui traverse
une séparation de psaume peut afficher deux chapitres, avec un numéro de chapitre
sur chaque verset. Les `Ib.` / `Ibid.` isolés et les expressions indéterminées
« et suivants » ne sont pas complétés arbitrairement. Une référence erronée dans
la source, comme `Joann., XXXV, 69.`, reste indisponible.

### Préfixes des notes et pagination imprimée

Le nettoyage est appliqué uniquement aux copies des notes affichées :

- Glaire : retrait du préfixe initial « Jean 2,19 : », qui identifie le verset
  commenté et n’est pas un nouveau renvoi. Le commentaire et ses vrais renvois
  (Matthieu, Marc, etc.) sont conservés ;
- Crampon : retrait des préfixes de verset commenté comme `51.`, `14-15.` ou
  `II. 2.`. Le numéro de note de l’EPUB reste un identifiant distinct ;
- Confessions : les 147 repères de pagination imprimée entre `(363)` et `(516)`,
  dont `(410)`, ont été supprimés dans les EPUB. Ce ne sont pas des appels de
  notes manquants. Le lecteur ne contient plus de masquage pour cet ouvrage.

Les préfixes Glaire et Crampon sont traités à l’affichage. La pagination est
corrigée dans les fichiers eux-mêmes, en conservant leurs associations d’éditions.

### Vérification du lot

L’audit des 37 EPUB web repère des références dans onze titres. Il confirme
notamment les nombreux renvois de l’Imitation, de la Cité de Dieu, du Sermon sur
la montagne, du Traité de la concupiscence et des Oraisons funèbres, ainsi que
les références mêlées à un commentaire dans les Pensées et les Bibles annotées.
Dans l’Imitation, 637 références explicites ont un livre identifié, dont 627
sont disponibles intégralement dans Fillion ; les autres comprennent des
erreurs présentes dans la source. Ce relevé ne résout pas les `Ibid.`.

Les tests `note-bible.test.mjs` couvrent les conventions, les refus ambigus et
la sélection de traduction par code. `note-bible.spec.ts` ouvre les vrais EPUB
publics de huit titres et interroge la vraie API locale du comparateur sur
ordinateur à 1920 × 1080 et mobile en portrait/paysage. Il vérifie aussi les
listes discontinues, plusieurs chapitres, les commentaires conservés, le
chargement différé, le chapitre entier, le cache, le réessai et la fermeture
pendant une requête. Les régressions des notes bibliques et de la navigation
du sommaire sont exécutées séparément.

Pour la première évolution : 32 scénarios navigateur réussis, 20 tests Node réussis,
contrôle TypeScript et build réussis. Les captures des deux thèmes et du plein
écran ont également été contrôlées.

## Contrôles

```bash
python -m unittest discover -s tests/epub -v
npm run test:server
npm run check
npm run build
CI=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
  npm run test:pwa
```

Avant remplacement CMS, `LITERAE_PREPARED_EPUB_DIR=/chemin/versions-web` permet au
test de substituer `<UUID>.epub` aux seuls fichiers web. Après publication, relancer
sans cette variable pour lire les vrais fichiers publics Directus avec le CORS réel.

Le lot d’octobre 2026 contient 27 ouvrages, dont 19 avec **27 158 notes**. Les deux
notes non balisées du commentaire de Matthieu sont incluses. Les 54 EPUB sont
validés avec EPUBCheck 5.4.0 sans erreur ni avertissement. Le contrôle des archives
vérifie chaque appel, l’existence de sa cible et de son lien de préchargement,
l’absence de notes dans le fil web, ainsi que la conservation du texte des
paragraphes et des notes. La ponctuation est vérifiée par une seconde passe
idempotente.

`all-books-notes.spec.ts` parcourt 136 parties sur ordinateur et mobile : toutes les
questions contenant des notes de la Somme, les 22 livres de la Cité de Dieu,
plusieurs passages des deux Testaments et des parties représentatives de tous les
autres ouvrages. Il vérifie le cache avant clic, l’ouverture rapide, les exposants,
la ponctuation, la progression, le plein écran et la séparation des téléchargements.
Les mesures sont jointes aux résultats sous `notes-performance.json`.

Sur les fichiers publics Directus, les 272 visites de parties ont contrôlé
236 ouvertures de notes, toutes déjà préchargées au moment du clic. La préparation
du contenu du dialogue a pris moins de 18 ms dans 95 % des cas, avec un maximum
mesuré de 99 ms. Ces mesures concernent le contenu du dialogue après préchargement,
et sont consignées dans les rapports de test.

La suite complète exécutée après publication CMS compte 142 scénarios navigateur
réussis, complétés par 14 tests Node et 5 tests Python réussis.

Les régressions `bible-citation-cases.spec.ts` couvrent les notes signalées de
l’Imitation, Crampon et Glaire, les citations dans les Confessions, les Oraisons
et le commentaire de Matthieu, sur ordinateur et mobile portrait/paysage.
Elles vérifient les vraies réponses du comparateur, les traductions CRA/GLA,
la correspondance 104→103 et 16→15, les chapitres seuls, le repli vers Fillion,
l’annulation pendant une requête et les CFI avant/après enrichissement.

Pour cette correction : 67 scénarios navigateur distincts réussis, dont les
20 cas ciblés rejoués sur le build final, 22 tests Node réussis, contrôle
TypeScript et build réussis sous Node 26.13.0. La concordance des psaumes a
également été confrontée à 2 306 correspondances textuelles uniques entre
l’EPUB Crampon public et la base SQLite, puis aux versets scindés ou fusionnés.
La Bible de Sacy n’a pas de notes dans son EPUB actuel ; son profil `SAC` est
couvert par le test des profils d’édition.

L’évolution des titres complets a été vérifiée par 54 scénarios navigateur et
24 tests Node réussis, avec contrôle TypeScript et build réussis. La note 14 de
l’Imitation (Jn 8:12), une épître au titre long, une plage dans les Hébreux et
une liste discontinue dans l’Apocalypse sont contrôlées dans les deux thèmes,
sur ordinateur et mobile portrait/paysage, avant et après ouverture du chapitre.
Les captures en portrait à 320 pixels confirment le retour à la ligne des
titres longs sans débordement dans les deux thèmes.
Les 73 codes de livres de SQLite possèdent chacun un nom complet.

### Corrections éditoriales des Confessions (Moreau, 1864)

`scripts/fix-confessions-citations.py` corrige uniquement les espaces après une
parenthèse ouvrant un renvoi biblique identifié (208 occurrences), deux doubles
parenthèses précisément repérées dans le livre VII et le renvoi Exode 32:1–6
accidentellement partagé entre une fin de liste et le paragraphe suivant.
Le script ne recherche pas arbitrairement du contenu entre parenthèses : les
deux doublons et la coupure HTML ont des remplacements littéraux, avec contrôle
du nombre d’occurrences. Le texte de chaque document est comparé avant/après :
tous les mots et signes autres que ces deux parenthèses sont conservés dans le
même ordre. Le fichier de sortie est écrit seulement après ces contrôles.

Les versions web et téléchargement ont été remplacées dans Directus sous leurs
UUID existants, avec leurs noms, dossiers et associations conservés. Les deux
EPUB passent EPUBCheck sans erreur ni avertissement. Le défaut HTML n’est pas
compensé dans le lecteur. Le build renouvelle les URL des fichiers à partir de
leur date de modification et de leur taille, comme pour les autres éditions.
Validation de cette correction : 25 tests Node et six scénarios navigateur
réussis sur les EPUB publics, avec contrôle TypeScript et build réussis.

### Maistre, Augustin et Chrysostome : audit complémentaire

L’EPUB Wikisource original des Considérations contient déjà les appels doubles :
ils précèdent les scripts de préparation du site. La comparaison avec les pages
Wikisource actuelles des chapitres I à XI a permis de retirer huit appels
surnuméraires : II [3], IV [5], VI [2]/[5]/[7], VIII [10], X [2]/[7]. Les notes
elles-mêmes et leur premier appel sont conservés dans les deux versions.
Il ne faut pas dédupliquer globalement les numéros : une même note peut avoir
plusieurs appels légitimes dans un autre ouvrage.

L’audit du lot Augustin/Chrysostome et de Maistre couvre 24 ouvrages ; 20 ont
reçu une correction, soit 40 fichiers web/téléchargement. Les 1 583 repères de
pagination identifiés sont retirés. Les courts numéros de versets des commentaires
et les nombres ambigus sont conservés. Les repères sont supprimés réellement
dans les versions web comme dans les téléchargements, sans caractères de remplacement.
Les anciens signets peuvent donc changer de position. Aucune suppression générale du contenu
entre parenthèses n’est appliquée.
Les 7 714 caractères de remplacement initialement introduits dans 19 EPUB web
ont été retirés. Le lecteur ne contient plus de profil ni de routine de masquage
de la pagination. Les téléchargements étaient déjà nettoyés sans remplacement.

Dans le livre II du Sacerdoce, `II Timoth. XI, 25.` était un renvoi erroné :
la deuxième épître ne possède pas de chapitre XI. Le texte cité correspond
à 2 Timothée 2:25–26 ; le renvoi est corrigé dans les deux EPUB.

Les 40 fichiers passent EPUBCheck sans erreur ni avertissement. Le contrôle
des archives conserve les mots et la ponctuation hors corrections déclarées,
et vérifie explicitement la conservation des numéros entre parenthèses à la
fin des citations. Les UUID, noms, dossiers, relations et ordre des éditions
sont conservés. Les octets publiés ont été comparés par SHA-256 aux fichiers
validés ; le relevé est dans `EPUB-SOURCE-REPAIRS-2026-10.json`.

Validation du lot et du survol : 20 scénarios navigateur validés (aperçus clair
et sombre, transfert vers le panneau, note longue, tactile, plein écran,
corrections Maistre/Sacerdoce, conservation des versets et régressions de lecture),
25 tests Node réussis, contrôle TypeScript et build réussis. Les captures des
deux thèmes ont été examinées.
