# Couvertures EPUB

Le lecteur préserve les couleurs, polices et positions originales de `titlepage.xhtml`, des pages avec `<meta name="calibre:cover" content="true"/>` et des pages contenant `.literae-cover`. Les réglages typographiques s’appliquent aux autres pages.

Le lecteur donne au `html` et au `body` de la couverture une hauteur explicite en pixels égale à la zone de lecture. Ne pas utiliser `100vh` pour estimer la hauteur de l’application : dans un EPUB, cette unité désigne le viewport de l’iframe, dont EPUB.js calcule lui-même la taille. Utiliser `height: 100%` dans cette page dont la hauteur est fixée par le lecteur.

Pour une couverture avec texte superposé, placer aussi le texte dans le SVG. Le `viewBox` utilise les dimensions originales de l’image et conserve ensemble les proportions de l’image et des titres, même sur un téléphone très allongé. Des titres HTML positionnés par rapport à la page entière peuvent tomber dans les bandes vides autour de l’image.

Exemple pour l’image des Confessions (1568 × 2000) :

```html
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>Couverture</title>
  <style>
    html, body { margin: 0; padding: 0; height: 100%; }
    .literae-cover { height: 100%; }
    .literae-cover svg { display: block; width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div class="literae-cover">
    <svg xmlns="http://www.w3.org/2000/svg"
         xmlns:xlink="http://www.w3.org/1999/xlink"
         width="100%" height="100%" viewBox="0 0 1568 2000"
         preserveAspectRatio="xMidYMid meet">
      <image width="1568" height="2000"
             xlink:href="../EPUB/Saint-Augustin_Confessions.jpg"/>
      <text x="784" y="160" text-anchor="middle"
            font-family="serif" font-size="80" fill="white">Saint Augustin</text>
      <text x="784" y="1580" text-anchor="middle"
            font-family="serif" font-size="100" fill="white">Confessions</text>
    </svg>
  </div>
</body>
</html>
```

Adapter le chemin de l’image et le `viewBox` pour chaque ouvrage. Le ratio reste conservé : la couverture tient dans la largeur et la hauteur disponibles, sans déformation. Le nom `titlepage.xhtml` suffit pour l’exception ; la classe est utile si la page porte un autre nom.

Sur mobile, le lecteur utilise `svh` afin que sa hauteur ne change pas à chaque mouvement de la barre d’adresse. Les changements effectifs de dimensions (rotation, plein écran, largeur disponible) restent pris en compte. Le plein écran masque les outils et conserve le texte et la navigation inférieure ; on le quitte avec les commandes natives du navigateur (Échap sur ordinateur, retour sur Android).
