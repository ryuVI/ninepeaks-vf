# Nine Peaks VF

Site statique de lecture manga compatible GitHub Pages.

## Structure

- `index.html` : page d'accueil avec infos manga et liste des chapitres
- `reader.html` : lecteur vertical avec navigation clavier et boutons
- `css/style.css` : theme sombre moderne et responsive
- `js/main.js` : logique de chargement JSON, rendu, navigation
- `data/chapters.json` : donnees du manga et des chapitres
- `mangas/nine-peaks/chapter-XX/` : dossiers d'images (01.jpg, 02.jpg, ...)

## Ajouter un nouveau chapitre

1. Cree un dossier: `mangas/nine-peaks/chapter-28/`
2. Ajoute les images nommees en 2 chiffres: `01.jpg`, `02.jpg`, etc.
3. Ouvre `data/chapters.json` et ajoute un objet dans `chapters`:

```json
{
  "number": 28,
  "title": "Titre du chapitre",
  "date": "2026-02-13",
  "pages": 39,
  "folder": "chapter-28"
}
```

4. Verifie que `pages` correspond au nombre exact d'images dans le dossier.

## Modifier les infos du manga

Edite la section `manga` dans `data/chapters.json`:

- `title`
- `cover` (ex: `mangas/nine-peaks/cover.jpg`)
- `synopsis`
- `genres` (tableau de tags)

## Deployer sur GitHub Pages

1. Push le projet sur GitHub.
2. Dans GitHub: `Settings` > `Pages`.
3. Source: `Deploy from a branch`.
4. Choisis `main` et dossier `/ (root)` puis `Save`.
5. Attends le build puis ouvre l'URL GitHub Pages.

## Debug rapide

- Ouvre la console navigateur pour les logs `[debug]`.
- Si un chapitre ne charge pas, verifie `reader.html?chapter=XX`.
- Si une image manque, un placeholder s'affiche automatiquement.
