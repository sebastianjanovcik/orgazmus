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
Odpoveď úlohy obsahuje aj odvodené boolean práva `can_edit`, `can_delete`,
`can_complete`, `can_view_comments`, `can_add_comments` a `can_add_attachments`;
posledné je pravdivé iba ak používateľ spĺňa obe podmienky na nahratie príloh.

```json
{"id":100,"project_id":10,"title":"Pripraviť návrh","description":"Prvá verzia","priority":2,"due_date":"2026-10-30","is_done":false,"completed_at":null}
```

Komentár (`comment`) obsahuje `id`, `task_id`, `parent_id` (ID alebo `null`),
`depth` (0–4), `body`, `author` (`id`, `name`), `created_at` a `can_delete`.
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
| `GET /api/me/plan` | Áno, iba demo režim | — | `200`, `data: {plan}` | `404 not_found` mimo demo režimu |
| `PATCH /api/me/plan` | Áno, iba demo režim | `plan` (`standard` alebo `premium`) | `200`, `data: user` | `404 not_found` mimo demo režimu, `422 validation_failed` |
| `GET /api/projects` | Áno | — | `200`, `data: project[]` | `401 unauthenticated` |
| `POST /api/projects` | Áno | `name`, `description`, `icon` | `201`, `data: project` | `403 plan_limit`, `409 name_taken`, `422 validation_failed` |
| `GET /api/projects/{id}` | Áno, vlastník | — | `200`, `data: project` | `404 not_found` |
| `PATCH /api/projects/{id}` | Áno, vlastník | Aspoň jedno z `name`, `description`, `icon` | `200`, `data: project` | `404 not_found`, `409 name_taken`, `422 validation_failed` |
| `DELETE /api/projects/{id}` | Áno, vlastník | — | `204` bez tela | `404 not_found`, `409 last_project` |
| `GET /api/tasks` | Áno | Query: `project_id`, `date`, `from`, `to`, `done`, `visibility`, `limit` a kurzor | `200`, zoznam `data: task[]` alebo stránkovaná odpoveď | `400 bad_request` |
| `POST /api/tasks` | Áno | `title`, `description`, `project_id`, `priority`, `due_date` | `201`, `data: task` | `404 not_found`, `422 validation_failed` |
| `GET /api/tasks/{id}` | Áno, vlastník | — | `200`, `data: task` | `404 not_found` |
| `PATCH /api/tasks/{id}` | Áno, vlastník | Zmeniteľné polia úlohy; bez `is_done` | `200`, `data: task` | `404 not_found`, `422 validation_failed` |
| `DELETE /api/tasks/{id}` | Áno, vlastník | — | `204` bez tela | `404 not_found` |
| `POST /api/tasks/{id}/complete` | Áno, vlastník | Bez tela | `200`, `data: task` | `404 not_found` |
| `POST /api/tasks/{id}/uncomplete` | Áno, vlastník | Bez tela | `200`, `data: task` | `404 not_found` |
| `DELETE /api/tasks/completed` | Áno | — | `200`, `data: {deleted}` | `401 unauthenticated` |
| `GET /api/tasks/{id}/comments` | Áno, prístup k úlohe | — | `200`, `data: {items: comment[], reactions: reaction[]}` | `403 forbidden`, `404 not_found` |
| `POST /api/tasks/{id}/comments` | Áno, Premium | `body`, `parent_id` (voliteľné/null) | `201`, `data: comment` | `403 premium_required`, `404 not_found`, `422 validation_failed` alebo `comment_too_deep` |
| `DELETE /api/comments/{id}` | Áno, Premium autor | — | `204` bez tela | `403 premium_required` / `forbidden`, `404 not_found` |

Pri `GET /api/tasks` možno použiť filtre samostatne alebo kombinovať: `project_id` je ID projektu, `date` vyberie presný deň a má prednosť pred rozsahom, `from` a `to` tvoria rozsah vrátane hraníc, `done` prijíma `0` alebo `1` a `visibility` vyberá `all`, `mine` alebo `shared`.

Pri `limit` sa vracia najviac požadovaný počet záznamov. Stránkovanie otvorených úloh používa zoradenie podľa termínu vzostupne, priority zostupne a ID vzostupne; pokračovanie použije trojicu `after_due_date`, `after_priority`, `after_id`. Odpoveď obsahuje `items`, `next_cursor` a súhrn `summary` s počtami všetkých dostupných úloh, otvorených, hotových a po termíne. Počty sa neobmedzujú na vrátenú stranu. Pri `done=1` zostáva kurzor `before_id`.

Pri neplatnom formáte filtra sa vráti `400 bad_request`; neplatný filter sa nikdy potichu neignoruje. Nestránkovaný výsledok je zoradený podľa stavu, termínu, priority zostupne a ID.

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
- Registrácia vytvorí účet s plánom `standard`, jeho predvolený projekt
  `Osobné` a prihlásenú session. Verejná odpoveď nikdy neobsahuje hash hesla.
- Prepínač plánu je dostupný len ak lokálny `config.php` obsahuje
  `demo_mode => true`; predvolený stav bez tejto voľby je vypnutý a endpoint
  vráti `404`. V bežnej prevádzke sa plán mení priamo v databáze.
- `premium` nemá limit projektov a môže komentovať. Koreň komentára má hĺbku
  0; najhlbšia povolená odpoveď má hĺbku 4. Odpoveď, ktorá by limit
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
| `413` | `file_too_large`, `task_attachment_limit`, `payload_too_large` | Súbor, súčet príloh úlohy alebo telo požiadavky prekračuje limit. |
| `415` | `unsupported_media_type` | Chýba alebo je nesprávny typ obsahu požiadavky. |
| `422` | `validation_failed`, `comment_too_deep`, `upload_required`, `invalid_file_type` | Vstup nespĺňa pravidlá alebo súbor chýba či nemá povolený typ. |
| `500` | `storage_error`, `server_error` | Súkromné úložisko, kontrola typu alebo zápis metadát nie je dostupný. |

Príklad chyby validácie:

```json
{"error":{"code":"validation_failed","message":"Skontroluj zadané údaje.","fields":{"email":"Zadaj platnú e-mailovú adresu."}}}
```

## Spolupráca na projektoch – fáza A

Nasledujúce endpointy rozširujú existujúci kontrakt. Vlastník projektu je vždy `projects.user_id`; členstvo vlastníka sa neukladá druhýkrát. Odpovede a požiadavky na správu rolí nikdy neprijímajú vlastníka, rolu ani oprávnenie ako dôkaz oprávnenia volajúceho. Pri nedostupnom cudzom objekte sa vracia `404`; pri prihlásenom používateľovi bez potrebnej roly `403 forbidden`.

### Roly a prístup

Projektová rola je `viewer`, `commenter` alebo `editor`. Oprávnenie `task_permission` je `read` alebo `manage`; výsledné právo je prienikom roly a tohto oprávnenia. `viewer` iba číta. `commenter` môže čítať a pri Premium účte pridávať komentáre/reakcie, ale neupravuje úlohy. `editor` upravuje projektové údaje a úlohy iba pri `manage`; pri `read` ich iba číta. Samostatný príznak `can_manage_members` udeľuje spravovanie členov/pozvánok. Vlastník má plné oprávnenia. Zdieľanie úlohy používa roly `viewer` a `editor`; správca zdieľania je vlastník projektu úlohy. Aktívny prístup k úlohe je najvyššie oprávnenie z projektového členstva alebo samostatného zdieľania. Odobratie jedného prístupu neruší druhý.

### Objekty spolupráce

`member`: `{user:{id,email,name,plan}, role, task_permission, can_manage_members, created_at, updated_at}`. Vlastník je zahrnutý vo výpise s `role:"owner"`, plnými oprávneniami a časmi projektu, ale je odvodený z `projects.user_id`.

`invitation`: `{id,project_id,invitee_email,role,task_permission,can_manage_members,status,expires_at,created_at,accepted_at,declined_at,revoked_at}`. Nikdy neobsahuje surový token ani jeho hash. `invitee_email` môže byť `null`, ak je pozvánka viazaná priamo na účet.

`audit_event`: `{id,project_id,actor:{id,name}|null,event_type,target:{type,id}|null,summary,changes,created_at}`. `changes` obsahuje iba bezpečné polia pred/po.

`notification`: `{id,type,summary,target:{type,id}|null,project_id,created_at,read_at}`. Typ je `comment`, `change`, `reaction`, `task` alebo `invitation`.

`task_share`: `{id,task_id,recipient:{id,email,name},role,status,created_at,revoked_at}`. `status` je `active` alebo `revoked`; objekt neposkytuje `project_id` ani údaje o iných úlohách.

`reaction`: `{id,comment_id,user:{id,name},reaction,created_at}`. Povolené hodnoty `reaction` sú pevne definované serverom a server vynucuje unikátnu kombináciu komentára, používateľa a reakcie.

### Endpointy členov, pozvánok a prevodu vlastníctva

| Metóda a cesta | JSON vstup | Úspech | Osobitné chyby |
| --- | --- | --- | --- |
| `GET /api/projects/{id}/members` | — | `200`, `data: member[]` (vlastník plus členovia) | `403 forbidden`, `404 not_found` |
| `POST /api/projects/{id}/invitations` | `email` alebo `user_id` (presne jedno), `role`, `task_permission`, voliteľne `can_manage_members` | `201`, `data: invitation` a jednorazový `invitation_url` | `403 forbidden`, `404 not_found`, `409 membership_exists` / `invitation_pending`, `422 validation_failed` |
| `GET /api/invitations/{token}` | — | `200`, `data: invitation` bez tokenu | `404 not_found`, `410 invitation_expired` |
| `POST /api/invitations/{token}/accept` | Bez tela | `200`, `data: member` | `403 invitation_account_mismatch`, `404 not_found`, `409 invitation_not_pending`, `410 invitation_expired` |
| `POST /api/invitations/{token}/decline` | Bez tela | `200`, `data: invitation` | `403 invitation_account_mismatch`, `404 not_found`, `409 invitation_not_pending`, `410 invitation_expired` |
| `POST /api/projects/{id}/invitations/{invitation_id}/revoke` | Bez tela | `200`, `data: invitation` | `403 forbidden`, `404 not_found`, `409 invitation_not_pending` |
| `PATCH /api/projects/{id}/members/{user_id}` | `role`, `task_permission`, `can_manage_members` (aspoň jedno pole) | `200`, `data: member` | `403 forbidden`, `404 not_found`, `422 validation_failed` |
| `DELETE /api/projects/{id}/members/{user_id}` | — | `204` | `403 forbidden`, `404 not_found`, `409 owner_transfer_required` |
| `POST /api/projects/{id}/ownership-transfer` | `new_owner_id`, `previous_owner_role`, `previous_owner_task_permission`, `previous_owner_can_manage_members`, `confirm:true` | `200`, `data:{project_id,owner,previous_owner}` | `403 forbidden`, `404 not_found`, `409 transfer_conflict`, `422 validation_failed` |

Pozvanie e-mailom sa môže prijať iba po prihlásení účtu s rovnakým normalizovaným e-mailom; pozvanie na `user_id` prijme iba tento účet. Pozvánka sama členstvo ani prístup nevytvára. Platnosť je 7 dní od vytvorenia. Surový náhodný token sa zobrazuje iba pri vytvorení URL; uložený je len jeho hash. `GET` tokenovej cesty nesmie meniť stav. Prevody vlastníctva sú transakčné a pri súbehu môže uspieť iba jeden.

### Audit, notifikácie a reakcie

| Metóda a cesta | JSON vstup / query | Úspech | Osobitné chyby |
| --- | --- | --- | --- |
| `GET /api/projects/{id}/audit` | Query: `limit` (1–100, default 50), `before` (kurzor `created_at,id`) | `200`, `data:{items:audit_event[],next_cursor}` | `403 forbidden`, `404 not_found`, `400 bad_request` |
| `GET /api/notifications` | Query: `limit` (1–100, default 50), `before` (kurzor `created_at,id`), voliteľne `unread=1` | `200`, `data:{items:notification[],next_cursor}` | `400 bad_request` |
| `POST /api/notifications/read` | `ids` (zoznam ID skutočne zobrazených) | `200`, `data:{updated}` | `422 validation_failed` |
| `GET /api/tasks/{id}/comments` | — | `200`, `data:{items:comment[],reactions:reaction[]}` | `403 forbidden`, `404 not_found` |
| `POST /api/comments/{id}/reactions` | `reaction` | `201`, `data:reaction` | `403 forbidden` / `premium_required`, `404 not_found`, `409 reaction_exists`, `422 validation_failed` |
| `DELETE /api/comments/{id}/reactions/{reaction}` | — | `204` | `403 forbidden` / `premium_required`, `404 not_found` |

Notifikácie patria výlučne príjemcovi. Označenie prečítania ignoruje cudzie ID a aktualizuje iba ID patriace prihlásenému používateľovi; opakovanie je bezpečné. Klient odosiela iba položky skutočne zobrazené v otvorenom paneli. Audit je append-only a stránkovanie používa stabilný kurzor.

### Samostatné zdieľanie úlohy

Samostatný prístup povoľuje iba úlohu a jej komentáre. Neudeľuje prístup k projektu, členom, nastaveniam ani iným úlohám. Vlastník je vlastník projektu úlohy; nemôže sa zmeniť rolou zdieľania.

| Metóda a cesta | JSON vstup | Úspech | Osobitné chyby |
| --- | --- | --- | --- |
| `GET /api/tasks/{id}/shares` | — | `200`, `data:task_share[]` (iba vlastník) | `403 forbidden`, `404 not_found` |
| `POST /api/tasks/{id}/shares` | `recipient_user_id`, `role` (`viewer`/`editor`) | `201`, `data:task_share` | `403 forbidden`, `404 not_found`, `409 share_exists`, `422 validation_failed` |
| `PATCH /api/tasks/{id}/shares/{share_id}` | `role` | `200`, `data:task_share` | `403 forbidden`, `404 not_found`, `422 validation_failed` |
| `DELETE /api/tasks/{id}/shares/{share_id}` | — | `204` | `403 forbidden`, `404 not_found` |
| `GET /api/tasks/{id}` a `GET /api/tasks/{id}/comments` | — | `200`, dostupný stav úlohy/komentáre podľa efektívneho prístupu | `404 not_found` bez prístupu |
| `PATCH /api/tasks/{id}`, `POST .../complete`, `POST .../uncomplete` | Existujúci vstup úlohy/akcie | `200`, `data:task` pre editora; divák iba číta | `403 forbidden`, `404 not_found`, `422 validation_failed` |

Úloha sa zdieľa iba s konkrétnym existujúcim účtom. Editor smie upravovať a meniť stav; komentovanie a reakcie stále vyžadujú Premium účtu konajúceho používateľa. Divák smie iba čítať. Po odobratí zdieľania priamy API prístup okamžite zaniká, pokiaľ používateľ nemá iný platný prístup cez členstvo projektu.

K `403` pridávajú spoločné odpovede tieto kódy: `forbidden`, `invitation_account_mismatch`, `owner_transfer_required`; `409`: `membership_exists`, `invitation_pending`, `invitation_not_pending`, `transfer_conflict`, `reaction_exists`, `share_exists`; `410`: `invitation_expired`. Všetky validačné chyby používajú existujúci obal a `fields` objekt.

## Prílohy k úlohám

Objekt `attachment` obsahuje verejné ID, pôvodný názov iba na zobrazenie, MIME typ overený serverom, veľkosť v bajtoch, autora (`null`, ak účet autora už neexistuje) a čas vytvorenia. Nikdy neobsahuje interný kľúč ani cestu úložiska.

```json
{"id":501,"name":"navrh.pdf","mime_type":"application/pdf","size":245760,"author":{"id":1,"name":"Jana Nová"},"created_at":"2026-11-06T12:00:00Z"}
```

Povolené sú `.doc`, `.docx`, `.pdf`, `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.xls`, `.xlsx`, `.ppt` a `.pptx`; makrá, SVG, archívy a CSV sú zakázané. Server porovnáva príponu s typom zisteným z obsahu a bezpečne dekóduje obrázky do 8 000 × 8 000 pixelov a najviac 12 megapixelov. Súbor musí mať 1 bajt až 33 554 432 bajtov; súčet príloh úlohy neprekročí 1 073 741 824 bajtov.

PHP nasadenie potrebuje rozšírenia `fileinfo`, `zip` a `gd` s podporou WebP. `upload_max_filesize` musí byť aspoň `32M`, `post_max_size` aspoň `34M` a limit tela webového servera musí presiahnuť `34M`.

| Metóda a cesta | Vstup | Úspech | Osobitné chyby |
| --- | --- | --- | --- |
| `GET /api/tasks/{id}/attachments` | — | `200`, `data:{items:attachment[]}` | `403 forbidden`, `404 not_found` |
| `POST /api/tasks/{id}/attachments` | `multipart/form-data`, presne jedno pole `file` | `201`, `data:attachment` | `403 forbidden`, `404 not_found`, `413 file_too_large` / `task_attachment_limit`, `415 unsupported_media_type`, `422 upload_required` / `invalid_file_type` / `validation_failed`, `500 storage_error` / `server_error` |
| `GET /api/tasks/{id}/attachments/{attachment_id}` | — | `200` binárny obsah s `Content-Disposition: attachment`, `Content-Length`, overeným `Content-Type` a `X-Content-Type-Options: nosniff` | `403 forbidden`, `404 not_found`, `500 storage_error` |
| `DELETE /api/tasks/{id}/attachments/{attachment_id}` | — | `204` bez tela | `403 forbidden`, `404 not_found`, `500 server_error` pri zlyhaní DB |

Každá cesta vyžaduje prihlásenie a nové overenie prístupu k úlohe. Zoznam a stiahnutie vyžadujú právo čítať úlohu. Nahratie vyžaduje súčasne projektové `can_add_tasks` a právo k úlohe `can_add_comments`; samostatné zdieľanie úlohy bez príslušného projektového členstva preto samo osebe nahratie nepovoľuje. Odstránenie vyžaduje právo odstrániť nadradenú úlohu; autor prílohy nemá osobitnú výnimku. Zápisy kontrolujú rovnaký pôvod (Origin) ako ostatné API zápisy.

Pri odstránení prílohy alebo nadradenej úlohy sa interný kľúč najskôr zapíše do transakčného outboxu. Fyzické mazanie sa opakuje po API operácii a cez `php db/cleanup_task_attachments.php`; pri dočasnej chybe disku zostáva položka vo fronte.

Nahratie odosiela vždy jeden súbor; klient môže zaradiť viac súborov do frontu a odoslať ich samostatne. Názov klienta sa normalizuje na zobrazovaný názov a nikdy sa nepoužije ako cesta. Binárny úspech sťahovania je jediná výnimka zo JSON obálky; chyby aj pri týchto endpointoch majú štandardný tvar `error`.

## Postman mock

Mock je statický: prehráva uložené príklady a neukladá zmeny ani session.
Lokálny mock z repozitára sa spúšťa cez Postman CLI bez prihlásenia a nie je
cloudovou adresou dostupnou z internetu.

Mock prehráva uložené príklady; pri `POST /api/auth/login` prijme iba lokálny
demo účet `jana@example.sk` s heslom `password`. Ostatné kombinácie vrátia
všeobecnú chybu `401 invalid_credentials`. Na vyžiadanie alternatívnej chybovej
ukážky pošli hlavičku `x-mock-response-code` s jej HTTP kódom, napríklad
`x-mock-response-code: 403`.

Frontend pri štarte volá `GET /api/me`. Lokálny mock pri tejto ceste predvolene
vracia `401 unauthenticated`, aby sa dala predviesť prihlasovacia obrazovka.
Pre ukážku už prihlásenej relácie pošli `x-mock-response-name: authenticated`;
mock si však stav prihlásenia po obnovení stránky neuchováva. Prihlásenie cez
demo účet platí iba v otvorenej stránke a nie je skutočnou serverovou session.

```powershell
postman mock run ./postman/mocks/tasko/config.yaml
```

Potom je `baseUrl` `http://127.0.0.1:4500`. Spúšťací príkaz a lokálna
adresa sa používajú aj v `postman/collections/Tasko API.postman_collection.json`.
Ak je port 4500 obsadený, spusti `postman mock run
./postman/mocks/tasko/config.yaml --port 4501` a zmeň premennú `baseUrl` na
`http://127.0.0.1:4501`.
