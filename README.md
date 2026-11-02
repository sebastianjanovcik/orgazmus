# Tasko

Tasko je responzívna ukážková aplikácia na správu úloh, projektov, kalendára a
komentárov. Frontend v `public/` predvolene komunikuje s lokálnym Postman mock
serverom. PHP API obsahuje autentifikáciu a profil; trvalé účty a dáta vyžadujú
lokálne nakonfigurovanú MySQL databázu.

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

Frontend pri otvorení stránky zavolá `GET /api/me`; mock vráti `401` a zobrazí
prihlasovaciu obrazovku. Na lokálne prihlásenie použi účet
`jana@example.sk` s heslom `password`. Mock tieto údaje overí a po úspechu
zobrazí aplikáciu. Ide iba o ukážkový účet: registrácia, zmeny a prihlásenie sa
neukladajú medzi obnoveniami stránky. Pre trvalé účty nakonfiguruj MySQL podľa
[návodu k databáze](db/README.md).

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

## Spustenie s PHP API

Lokálne PHP API používa databázu nastavenú v ignorovanom `config/config.php`.
Na spustenie frontendu spolu s PHP API použi PHP 8.5 a router vstavaného servera:

```powershell
php -S localhost:8000 -t public public/router.php
```

Otvor `http://localhost:8000`. Pred spustením zmeň `apiBase` v
`public/assets/js/config.js` na `http://localhost:8000` a `demoMode` na `false`.
Požiadavky aj session cookie zostanú na rovnakom origine bez Postman mock servera.
Autentifikačné a profilové endpointy sú implementované; ostatné API časti sa
dopĺňajú podľa plánu.
