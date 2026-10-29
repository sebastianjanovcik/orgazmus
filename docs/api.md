# REST API Tasko

Tento dokument je kontrakt medzi frontendovou aplikáciou a serverom. Počas
F2 volá frontend lokálny Postman mock; pri B10 sa zmení iba `apiBase` a
rovnaké požiadavky sa pošlú na PHP API.

## Základné pravidlá

- Základná cesta je `/api`; mock pri lokálnom spustení počúva na
  `http://127.0.0.1:4500`.
- Telo požiadaviek so vstupom je JSON a používa `Content-Type:
  application/json`. Úspešná odpoveď s obsahom má tvar `{"data": ...}`.
- Odpoveď `204 No Content` zámerne nemá telo. Je to výnimka z JSON obálky:
  podľa HTTP sémantiky sa pri 204 neposiela obsah.
- Chyba má tvar `{"error":{"code":"...","message":"...","fields":{}}}`.
  `fields` je vždy objekt; pri chybe bez väzby na konkrétne pole je prázdny.
- Dátum bez času je ISO `YYYY-MM-DD`; časové značky sú ISO 8601 v UTC a
  končia na `Z`. JSON boolean je `true` alebo `false`.
- Cesty s `{id}` prijímajú kladné celočíselné ID. Záznam patriaci inému
  používateľovi sa správa ako neexistujúci a vracia `404`.
- Všetky endpointy okrem registrácie a prihlásenia vyžadujú prihlásenie.
  PHP API používa session cookie; konkrétne zabezpečenie zápisov proti
  CSRF/origin útoku sa dokončí v B3. Mock session neuchováva.

## Základné dátové objekty

Používateľ (`user`) nikdy neobsahuje heslo ani jeho hash. `id` je kladné
celé číslo, `email` a `name` sú reťazce a `plan` je `standard` alebo
`premium`:

```json
{"id":1,"email":"jana@example.sk","name":"Jana Nová","plan":"standard"}
```

Projekt (`project`) obsahuje kladné celé `id`, reťazce `name`, `description`,
`icon`, `color` a nezáporné celočíselné počty `task_count` a `done_count`.
Názov má 1–40 znakov, popis najviac 200 znakov a ikona musí byť z povolenej
ponuky. `color` vyberie server z palety ôsmich farieb podľa počtu projektov;
klient ju neposiela pri vytvorení.

```json
{"id":10,"name":"Práca","description":"Pracovné úlohy","icon":"briefcase","color":"#6558d3","task_count":2,"done_count":1}
```

Úloha (`task`) obsahuje kladné celočíselné `id` a `project_id`, reťazce
`title` (1–150 znakov) a `description` (najviac 2 000 znakov pred
sanitizáciou alebo `null`), `priority` (celé číslo 1–4), `due_date` (platný
ISO dátum), `is_done` (boolean) a `completed_at` (UTC značka alebo `null`).
Popis povoľuje iba značky `b`, `strong`, `i`, `em`, `ul`, `ol`, `li`, `br`
a `p`, bez atribútov; `<script>` a `<style>` aj s obsahom sa odstránia.
Prázdny popis sa uloží ako `null`. Úloha patrí jednému projektu.

```json
{"id":100,"project_id":10,"title":"Pripraviť návrh","description":"Prvá verzia","priority":2,"due_date":"2026-10-30","is_done":false,"completed_at":null}
```

Komentár (`comment`) obsahuje `id`, `task_id`, `parent_id` (ID alebo `null`),
`depth` (0–5), `body`, `author` (`id`, `name`), `created_at` a `can_delete`.
ID sú kladné celé čísla; `body` je čistý text s dĺžkou 1–1 000 znakov.
Hĺbka sa odvodzuje na serveri; klient ju neposiela. Zoznam sa zoradí podľa
`created_at` a ID vzostupne.

## Endpointy

| Metóda a cesta | Prihlásenie | JSON vstup | Úspech | Osobitné chyby |
| --- | --- | --- | --- | --- |
| `POST /api/auth/register` | Nie | `name`, `email`, `password` | `201`, `data: user` | `409 email_taken`, `422 validation_failed` |
| `POST /api/auth/login` | Nie | `email`, `password` | `200`, `data: user` | `401 invalid_credentials` |
| `POST /api/auth/logout` | Áno | Bez tela | `204` bez tela | `401 unauthenticated` |
| `GET /api/me` | Áno | — | `200`, `data: user` | `401 unauthenticated` |
| `PATCH /api/me` | Áno | `name` | `200`, `data: user` | `422 validation_failed` |
| `PATCH /api/me/password` | Áno | `current_password`, `new_password` | `204` bez tela; obnoví ID session | `422 validation_failed` |
| `PATCH /api/me/plan` | Áno, iba demo režim | `plan` (`standard` alebo `premium`) | `200`, `data: user` | `403 forbidden`, `422 validation_failed` |
| `GET /api/projects` | Áno | — | `200`, `data: project[]` | `401 unauthenticated` |
| `POST /api/projects` | Áno | `name`, `description`, `icon` | `201`, `data: project` | `403 plan_limit`, `409 name_taken`, `422 validation_failed` |
| `GET /api/projects/{id}` | Áno, vlastník | — | `200`, `data: project` | `404 not_found` |
| `PATCH /api/projects/{id}` | Áno, vlastník | Aspoň jedno z `name`, `description`, `icon` | `200`, `data: project` | `404 not_found`, `409 name_taken`, `422 validation_failed` |
| `DELETE /api/projects/{id}` | Áno, vlastník | — | `204` bez tela | `404 not_found`, `409 last_project` |
| `GET /api/tasks` | Áno | Query: `project_id`, `date`, `from`, `to`, `done` | `200`, `data: task[]` | `400 bad_request` |
| `POST /api/tasks` | Áno | `title`, `description`, `project_id`, `priority`, `due_date` | `201`, `data: task` | `404 not_found`, `422 validation_failed` |
| `GET /api/tasks/{id}` | Áno, vlastník | — | `200`, `data: task` | `404 not_found` |
| `PATCH /api/tasks/{id}` | Áno, vlastník | Zmeniteľné polia úlohy; bez `is_done` | `200`, `data: task` | `404 not_found`, `422 validation_failed` |
| `DELETE /api/tasks/{id}` | Áno, vlastník | — | `204` bez tela | `404 not_found` |
| `POST /api/tasks/{id}/complete` | Áno, vlastník | Bez tela | `200`, `data: task` | `404 not_found` |
| `POST /api/tasks/{id}/uncomplete` | Áno, vlastník | Bez tela | `200`, `data: task` | `404 not_found` |
| `DELETE /api/tasks/completed` | Áno | — | `200`, `data: {deleted}` | `401 unauthenticated` |
| `GET /api/tasks/{id}/comments` | Áno, Premium | — | `200`, `data: comment[]` | `403 premium_required`, `404 not_found` |
| `POST /api/tasks/{id}/comments` | Áno, Premium | `body`, `parent_id` (voliteľné/null) | `201`, `data: comment` | `403 premium_required`, `404 not_found`, `422 validation_failed` alebo `comment_too_deep` |
| `DELETE /api/comments/{id}` | Áno, Premium autor | — | `204` bez tela | `403 premium_required`, `404 not_found` |

Pri `GET /api/tasks` možno použiť filtre samostatne alebo kombinovať:
`project_id` je ID projektu, `date` vyberie presný deň a má prednosť pred
rozsahom, `from` a `to` tvoria rozsah vrátane hraníc (každá hranica je
voliteľná) a `done` prijíma `0` alebo `1`. Pri neplatnom formáte filtra sa
vráti `400 bad_request`; neplatný filter sa nikdy potichu neignoruje.
Výsledky sa zoradia podľa stavu, termínu, priority zostupne a ID.

Zmena stavu úlohy prebieha iba cez `/complete` a `/uncomplete`; `PATCH`
`is_done` nepovoľuje. `DELETE /api/tasks/completed` zmaže len hotové úlohy
aktuálneho používateľa a vráti napríklad `{"data":{"deleted":3}}`.

## Validácia a pravidlá plánov

- Meno účtu má 1–60 znakov po orezaní. E-mail musí byť platný, pri uložení
  sa prevedie na malé písmená a je jedinečný bez ohľadu na veľkosť písmen.
  Heslo má najmenej 8 znakov a najviac 72 bajtov.
- Názov projektu má 1–40 znakov po orezaní; jeho popis má najviac 200 znakov.
- Názov úlohy má 1–150 znakov po orezaní. Priorita je 1 (nízka),
  2 (stredná), 3 (vysoká) alebo 4 (kritická). `due_date` je platný ISO dátum.
- Pri vytvorení úlohy je priorita predvolene 2; `project_id` musí patriť
  prihlásenému používateľovi. Neplatná alebo cudzia hodnota vráti
  `422 validation_failed` na poli `project_id`.
- `PATCH /api/tasks/{id}` prijíma iba poslané polia `title`, `description`,
  `project_id`, `priority` a `due_date`. `is_done` vráti `422` s pokynom
  použiť akciu `/complete` alebo `/uncomplete`.
- `standard` má najviac 3 projekty a nemá komentáre. Ďalší projekt vráti
  `403 plan_limit`; endpointy komentárov vrátia `403 premium_required`.
- `premium` nemá limit projektov a môže komentovať. Koreň komentára má hĺbku
  0; najhlbšia povolená odpoveď má hĺbku 5. Odpoveď, ktorá by limit
  prekročila, vráti `422 comment_too_deep`. Zmazanie komentára odstráni aj
  jeho odpovede.
- `PATCH /api/me/plan` je iba ukážkový prepínač pre demo; mimo demo režimu
  ho reálne API nesmie povoliť.

## Spoločné chybové odpovede

| HTTP | Kód | Význam |
| --- | --- | --- |
| `400` | `bad_request` | Neplatný JSON alebo filter. |
| `401` | `unauthenticated` / `invalid_credentials` | Chýba prihlásenie alebo prihlasovacie údaje nesedia. Pri chybe loginu sa nerozlišuje, či účet existuje. |
| `403` | `forbidden_origin`, `plan_limit`, `premium_required`, `forbidden` | Zakázaný pôvod, limit plánu, Premium funkcia alebo nepovolená demo akcia. |
| `404` | `not_found` | Zdroj neexistuje alebo ho používateľ nevlastní. |
| `405` | `method_not_allowed` | Metóda nie je na ceste podporovaná. |
| `409` | `email_taken`, `name_taken`, `last_project` | Duplicitná hodnota alebo pokus zmazať posledný projekt. |
| `415` | `unsupported_media_type` | Chýba alebo je nesprávny `Content-Type: application/json`. |
| `422` | `validation_failed`, `comment_too_deep` | Vstup nespĺňa pravidlá alebo odpoveď prekračuje hĺbku komentárov. |

Príklad chyby validácie:

```json
{"error":{"code":"validation_failed","message":"Skontroluj zadané údaje.","fields":{"email":"Zadaj platnú e-mailovú adresu."}}}
```

## Postman mock

Mock je statický: prehráva uložené príklady a neukladá zmeny ani session.
Postman CLI nie je v tomto prostredí prihlásený, preto sa mock spúšťa lokálne
bez účtu, nie ako cloudová adresa dostupná z internetu.

Mock prehráva prvý uložený úspešný príklad. Na vyžiadanie alternatívnej
chybovej ukážky pošli hlavičku `x-mock-response-code` s jej HTTP kódom,
napríklad `x-mock-response-code: 403`.

```powershell
postman mock run ./postman/mocks/tasko/config.yaml
```

Potom je `baseUrl` `http://127.0.0.1:4500`. Spúšťací príkaz a lokálna
adresa sa používajú aj v `postman/collections/Tasko API.postman_collection.json`.
Ak je port 4500 obsadený, spusti `postman mock run
./postman/mocks/tasko/config.yaml --port 4501` a zmeň premennú `baseUrl` na
`http://127.0.0.1:4501`.
