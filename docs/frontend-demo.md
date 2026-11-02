# Frontend demo F14

Stav kontroly k 2. novembru 2026. Demo sa spúšťa podľa `README.md`; frontend
volá lokálny mock na `http://127.0.0.1:4500`.

## Vykonané kontroly

- PHP webserver na `localhost:8000` vrátil vstupnú stránku a CSS/JS assety so
  stavom HTTP 200.
- Mock na `127.0.0.1:4500` vrátil `401` pre predvolený anonymný `/api/me`,
  ukážkový prihlásený profil po hlavičke `x-mock-response-name: authenticated`
  a dáta úloh so stavom 200.
- Priame požiadavky na mock vrátili očakávané chybové obálky pre 400 a 422.
- `php -l public/index.php` skončilo bez syntaktickej chyby.

## Známe obmedzenia a neoverené kontroly

- Mock je bezstavový a používa uložené príklady. Registrácia, zmeny profilu,
  úloh a projektov, komentáre, plán a odhlásenie sa medzi požiadavkami
  neuchovávajú. Po obnovení stránky sa stav môže vrátiť k ukážkovému.
- `apiBase` je verejné lokálne nastavenie v `public/assets/js/config.js`;
  pri zmene portu mock servera uprav túto hodnotu. Tajný Postman API kľúč
  nepatrí do verejného JavaScriptu.
- Vykonávacie prostredie nemá pripojený nástroj na interaktívnu kontrolu
  prehliadača. Vizuál na šírkach 320/360 px a desktope, klávesnicový tok,
  kontrast, konzola, pomalé pripojenie, prázdne stavy a úplné scenáre všetkých
  obrazoviek preto neboli manuálne potvrdené.
