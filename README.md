# Nine Peaks VF

Site statique de lecture manga compatible GitHub Pages.

## Structure

- `index.html` : page d'accueil avec infos manga et liste des chapitres
- `reader.html` : lecteur vertical avec navigation clavier et boutons
- `login.html` : connexion admin
- `admin.html` : panel admin (edition JSON locale)
- `css/style.css` : theme sombre moderne et responsive
- `js/main.js` : logique lecteur + rendu chapitres
- `js/auth.js` : authentification client
- `js/admin.js` : gestion login/panel admin
- `data/chapters.json` : donnees du manga et des chapitres
- `mangas/nine-peaks/chapter-XX/` : images (01.jpg, 02.jpg, ...)

## Connexion admin

- URL: `login.html`
- Identifiant: `pcatv`
- Mot de passe initial: `NinePeaks2026!`

Important: comme le site est 100% statique, cette protection est cote navigateur (pas un vrai backend securise).

## Ajouter un nouveau chapitre

1. Cree un dossier: `mangas/nine-peaks/chapter-28/`
2. Ajoute une couverture: `mangas/nine-peaks/chapter-28/cover.jpg`
3. Ajoute les pages nommees en 2 chiffres: `01.jpg`, `02.jpg`, etc.
4. Ouvre `data/chapters.json` et ajoute un objet dans `chapters`:

```json
{
  "number": 28,
  "title": "Titre du chapitre",
  "date": "2026-02-13",
  "pages": 39,
  "folder": "chapter-28",
  "cover": "mangas/nine-peaks/chapter-28/cover.jpg"
}
```

5. Verifie que `pages` correspond au nombre exact d'images.

## Modifier les infos du manga

Deux options:

1. Edition permanente: modifier `data/chapters.json` puis commit/push.
2. Edition rapide locale: `admin.html` -> modifier JSON -> sauvegarder (stockage local navigateur).

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
- Si le panel admin est vide, verifie que `data/chapters.json` est accessible via serveur HTTP local.
