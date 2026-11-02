# Tasko

Tasko je responzívna ukážková aplikácia na správu úloh, projektov, kalendára a
komentárov. Frontend v `public/` komunikuje s lokálnym Postman mock serverom;
PHP API a databáza zatiaľ nie sú implementované.

## Požiadavky

- PHP 8.5
- Postman CLI 1.82 alebo kompatibilná novšia verzia

## Spustenie dema

V koreňovom priečinku projektu otvor dva samostatné terminály. V prvom spusti
PHP webserver a nechaj ho bežať:

```powershell
php -S localhost:8000 -t public
```

V druhom spusti Postman mock a tiež nechaj terminál otvorený:

```powershell
postman mock run ./postman/mocks/tasko/config.yaml
```

Otvor `http://localhost:8000`. Frontend predvolene používa mock na
`http://127.0.0.1:4500`, nastavený v `public/assets/js/config.js`. Ak je port
4500 obsadený, spusti mock na inom porte:

```powershell
postman mock run ./postman/mocks/tasko/config.yaml --port 4501
```

Potom v `config.js` zmeň `apiBase` na `http://127.0.0.1:4501`. Tento súbor
obsahuje iba verejné lokálne nastavenie; Postman API kľúč doň nevkladaj.

## Ukážka prihlásenia

Mock pri `GET /api/me` predvolene vráti `401`, takže sa zobrazí prihlásenie.
Na načítanie ukážkového Premium účtu dočasne nastav v `config.js`
`mockResponse: 'authenticated'`; frontend túto hodnotu odošle mocku v hlavičke
`x-mock-response-name`. Po ukážke ju vráť na `null` alebo nastavenie odstráň.

Mock prehráva statické odpovede a neuchováva registrácie, zmeny, session ani
prepnutý plán. Obnovenie stránky môže preto vrátiť pôvodné ukážkové údaje.
Alternatívne chybové odpovede možno vyžiadať cez hlavičku
`x-mock-response-code` pri priamom volaní API; detaily sú v [API kontrakte](docs/api.md).

## Obsah repozitára

- `public/` – frontend a jeho lokálne knižnice; toto je verejný koreň webservera.
- `postman/` – kolekcia a konfigurácia lokálneho mock servera.
- `docs/` – API kontrakt a plán vývoja.
- `config/`, `db/`, `includes/` – príprava pre budúce PHP API a databázu.
- `trash/` – odložené archívne súbory, ktoré aplikácia nenačítava.

Verzie nástrojov a knižníc sú uvedené v [VERSIONS.md](VERSIONS.md).
Záznam kontrol a neoverených scenárov F14 je v [docs/frontend-demo.md](docs/frontend-demo.md).
