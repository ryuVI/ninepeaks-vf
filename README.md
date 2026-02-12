# Nine Peaks VF

Site statique de lecture manga (GitHub Pages).

## Liens locaux

- `http://localhost:5500/index.html`
- `http://localhost:5500/login.html`
- `http://localhost:5500/admin.html`

## Fonctionnalites principales

- Lecture en mode defilement ou image par image
- Zoom lecteur
- Bookmarks par utilisateur
- Connexion / inscription locale
- Panel admin (compte `pcatv`)
- Upload direct des images chapitre depuis le panel admin (Chrome/Edge)
- Gestion des chapitres 100% via interface (ajout / edition / suppression)
- Menu chapitres avec acces rapide depuis l'accueil

## Upload direct depuis le panel admin

1. Ouvre `admin.html` avec ton compte admin.
2. Dans **Upload rapide des images**, clique `Choisir dossier projet`.
3. Selectionne le dossier racine du projet (`webtst`).
4. Renseigne:
   - numero chapitre
   - titre
   - date
   - images `.jpg/.jpeg`
5. Clique `Uploader chapitre`.

Le panel va:
- creer/mettre a jour `mangas/nine-peaks/chapter-XX/01.jpg`, `02.jpg`, ...
- creer/mettre a jour `cover.jpg` avec la premiere image
- mettre a jour `data/chapters.json` automatiquement

Tu n'as plus besoin d'editer `chapters.json` a la main:
- ajoute/modifie/supprime les chapitres depuis le panel admin
- les donnees sont sauvegardees automatiquement pour le site

## Lancer en local

```powershell
cd c:\webtst\webtst
py -m http.server 5500
```
