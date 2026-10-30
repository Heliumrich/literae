# Noms et classement des auteurs EPUB

Correction du 30 octobre 2026, appliquée aux variantes web et liseuse :

| Ouvrage | Auteur affiché (`dc:creator`) | Classement EPUB 3 (`file-as`) |
| --- | --- | --- |
| Pensées | Blaise Pascal | Pascal, Blaise |
| Confessions | Aurelius Augustinus | Augustinus, Aurelius |
| La Cité de Dieu | Aurelius Augustinus | Augustinus, Aurelius |

Les Pensées portaient déjà `Blaise Pascal`, mais aucun nom de classement explicite.
Les deux ouvrages d’Augustin portaient `Saint Augustin` : la nouvelle préférence
remplace celle consignée dans le précédent rapport d’import Bloy/Bourget.

[set-epub-author.py](../scripts/set-epub-author.py) modifie uniquement les
métadonnées OPF. Il conserve les identifiants existants et ajoute un identifiant
au créateur si nécessaire pour y rattacher le classement EPUB 3. Les éventuels
anciens champs Calibre de classement sont harmonisés. L’outil refuse les ouvrages
à plusieurs créateurs, pour éviter une modification ambiguë.

```bash
python scripts/set-epub-author.py original.epub corrige.epub \
  --author 'Blaise Pascal' --sort-name 'Pascal, Blaise'
```

Les six EPUB sont vérifiés avec EPUBCheck 5.4.0 sans erreur ni avertissement ;
les ressources autres que l’OPF sont comparées octet pour octet. Le texte,
les couvertures, les sommaires et les notes ne changent pas. Les noms de fichiers,
UUID, dossiers et associations Directus restent les mêmes. Les noms des fiches
d’auteurs sur le site restent inchangés.

Les empreintes avant/après et les UUID sont consignés dans
[EPUB-AUTHOR-METADATA-2026-10.json](EPUB-AUTHOR-METADATA-2026-10.json).
Une liseuse ayant déjà indexé un fichier peut nécessiter le retrait de l’ancienne
copie puis l’import du fichier corrigé pour actualiser sa fiche.
