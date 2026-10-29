# Tasko

Tasko je prototyp aplikácie na správu úloh. Aktuálny návrh rozhrania je v súbore
`To-do wireframe.html`.

## Spustenie

Vyžaduje sa PHP 8.5. V koreňovom priečinku projektu spusti:

```powershell
php -S localhost:8000 -t public
```

Potom otvor `http://localhost:8000`. Webový server sprístupňuje iba priečinok
`public/`; konfiguračné a databázové súbory zostávajú mimo verejného koreňa.

V tomto kroku je vstupná stránka iba minimálna kostra. API, databáza a
interaktívne funkcie budú doplnené v ďalších krokoch plánu.

## Štruktúra

- `public/` – súbory dostupné prehliadaču vrátane vstupného bodu a API ciest.
- `includes/` – opakovane použiteľný aplikačný PHP kód.
- `config/` – lokálna konfigurácia; skutočné tajomstvá sa neukladajú do Gitu.
- `db/` – databázová schéma a vývojové SQL skripty.
- `docs/` – plán a technická dokumentácia.
- `assets/` – lokálne dodané knižnice; ich pôvodné súbory sa nemenia.

Verzie nástrojov a knižníc sú uvedené v [VERSIONS.md](VERSIONS.md).
