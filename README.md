# Nine Peaks VF

Site statique de lecture manga compatible GitHub Pages.

## Fonctionnalites

- Lecture en deux modes:
  - `Defilement` (toutes les pages)
  - `Image par image`
- Zoom lecteur (`-`, `Reset`, `+`)
- Bookmarks propres par utilisateur (chapitre + page + mode)
- Authentification locale:
  - Connexion
  - Inscription
- Compte admin uniquement pour `pcatv`

## Structure

- `index.html` : accueil + chapitres + bookmarks
- `reader.html` : lecteur manga
- `login.html` : connexion / inscription
- `admin.html` : panel admin (reserve compte admin)
- `css/style.css` : styles
- `js/auth.js` : auth locale et roles
- `js/account.js` : logique page login/inscription
- `js/main.js` : rendu accueil + lecteur + bookmarks
- `js/admin.js` : panel admin
- `data/chapters.json` : donnees manga/chapitres

## Authentification

- Tous les utilisateurs peuvent s'inscrire puis se connecter.
- Le compte `pcatv` est reconnu admin.
- Les sessions et comptes sont stockes en `localStorage` (navigateur).

Important: sans backend, ce n'est pas une securite serveur forte.

## Ajouter un chapitre

1. Dossier: `mangas/nine-peaks/chapter-28/`
2. Couverture chapitre: `cover.jpg`
3. Pages: `01.jpg`, `02.jpg`, etc.
4. Ajouter dans `data/chapters.json`:

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

## Test local

```powershell
cd c:\webtst\webtst
py -m http.server 5500
```

Puis ouvrir:

- `http://localhost:5500/index.html`
- `http://localhost:5500/login.html`
- `http://localhost:5500/reader.html?chapter=25`
