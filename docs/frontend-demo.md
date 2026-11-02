# Frontend demo F14

Stav kontroly k 2. novembru 2026. Demo sa spúšťa podľa `README.md`; frontend
volá lokálny mock na `http://127.0.0.1:4500`.

## Vykonané kontroly

- PHP webserver na `localhost:8000` vrátil vstupnú stránku a CSS/JS assety so
  stavom HTTP 200; `php -l public/index.php` skončilo bez syntaktickej chyby.
- Mock na `127.0.0.1:4500` vrátil `401` pre predvolený anonymný `/api/me`,
  ukážkový prihlásený profil po hlavičke `x-mock-response-name: authenticated`
  a dáta úloh so stavom 200.
- Priame požiadavky na mock vrátili očakávané chybové obálky pre 400 a 422.
- Chrome DevTools emulácia prešla šírky 320, 360 a 1440 px; úlohy, projekty,
  kalendár, hotové úlohy, štatistiky a nastavenia sa zmestili do viewportu v
  svetlej aj tmavej téme bez horizontálneho pretekania.
- Klávesnicou sa cez Tab zaostrilo menu, Enter ho otvoril a Escape zavrel;
  fokus sa po zatvorení vrátil na tlačidlo, ktoré menu otvorilo.
- Pri prechode šiestimi hlavnými obrazovkami nevznikli JavaScriptové výnimky,
  chyby ani varovania v konzole. Všetkých 11 zachytených XHR požiadaviek
  skončilo stavom HTTP 200.

## Známe obmedzenia a neoverené kontroly

- Mock je bezstavový a používa uložené príklady. Registrácia, zmeny profilu,
  úloh a projektov, komentáre, plán a odhlásenie sa medzi požiadavkami
  neuchovávajú. Po obnovení stránky sa stav môže vrátiť k ukážkovému.
- `apiBase` je verejné lokálne nastavenie v `public/assets/js/config.js`;
  pri zmene portu mock servera uprav túto hodnotu. Tajný Postman API kľúč
  nepatrí do verejného JavaScriptu.
- Kontrola prebehla v headless Chrome cez DevTools Protocol; skutočné zariadenie
  s dotykovým ovládaním, kontrast podľa WCAG, pomalé/offline pripojenie a úplné
  validačné scenáre každého formulára neboli súčasťou tejto kontroly.
