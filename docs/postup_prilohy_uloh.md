# Postup: prílohy k úlohám

Tento dokument rozdeľuje zavedenie príloh na samostatné, overiteľné kroky. Súčasný kontrakt v `docs/api.md` ani implementácia zatiaľ prílohy nedefinujú. Pred implementáciou preto treba rozhodnutia nižšie zapracovať do kontraktu a následne nimi viesť databázu, API aj rozhranie.

## Cieľ a rozsah

Používateľ môže k úlohe nahrať jeden alebo viac súborov, zobraziť ich zoznam, stiahnuť ich a odstrániť v súlade s prístupom k danej úlohe. Súbory sa ukladajú súkromne na serveri; databáza obsahuje iba ich metadáta a interný identifikátor uloženia. Prílohy sa nesprístupnia cez verejnú URL ani cez odhadnuteľný názov súboru.

Prvá verzia podporuje dokumenty Word, PDF, obrázky, Excel a PowerPoint. Jeden súbor môže mať najviac **32 MB** a súčet príloh jednej úlohy najviac **1 GB**. Presný zoznam povolených prípon a zodpovedajúcich MIME typov treba uzavrieť v allowliste pred implementáciou. Neodvodzovať typ iba z názvu alebo hlavičky od klienta. Súčasťou rozsahu nie je antivírusové skenovanie, náhľady, verzovanie ani externé úložisko; ak ich hosting alebo produkt bude vyžadovať, doplnia sa ako samostatné rozhodnutia.

## Predpoklady

- Úlohy a API používajú existujúci model prihlásenia, vlastníctva a zdieľaného prístupu. Každá operácia s prílohou musí znovu overiť prístup k nadradenej úlohe.
- API dnes používa JSON; prenos binárneho súboru bude osobitná požiadavka `multipart/form-data`. Ostatné odpovede zachovajú existujúcu obálku `data` a tvar chýb.
- Schéma je spravovaná cez SQL v `db/`; nasadenie musí vedieť pripraviť súkromný zapisovateľný adresár a jeho limit úložiska.
- Zmazanie úlohy musí riešiť aj jej súbory, aby nevznikali osirelé dáta. Pri zmazaní súboru treba bezpečne spracovať zlyhanie odstránenia z disku.

## Kroky realizácie

### 1. Uzavrieť produktové a prevádzkové pravidlá

Platí limit 32 MB (33 554 432 bajtov) na súbor a 1 GB (1 073 741 824 bajtov) súhrnne na jednu úlohu; samostatný limit počtu súborov nie je stanovený. Allowlist povoľuje: `.doc` (`application/msword`), `.docx` (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`), `.pdf` (`application/pdf`), `.jpg`/`.jpeg` (`image/jpeg`), `.png` (`image/png`), `.gif` (`image/gif`), `.webp` (`image/webp`), `.xls` (`application/vnd.ms-excel`), `.xlsx` (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`), `.ppt` (`application/vnd.ms-powerpoint`) a `.pptx` (`application/vnd.openxmlformats-officedocument.presentationml.presentation`). Formáty s makrami, SVG, archívy a CSV nie sú povolené. Server kontroluje zhodu prípony s typom zisteným z obsahu; obrázky musí vedieť bezpečne dekódovať.

Zobraziť a stiahnuť môže používateľ s právom čítať úlohu. Pridať prílohu môže používateľ, ktorý má súčasne `can_add_tasks` v projekte aj `can_add_comments` k úlohe; pri zdieľanej úlohe sa práva vyhodnotia podľa členstva a zdieľania a musia byť splnené obe podmienky. Odstránenie vyžaduje rovnaké právo ako odstránenie nadradenej úlohy; autor prílohy nemá osobitnú výnimku.

Nasadenie musí nastaviť PHP `upload_max_filesize` aspoň na `32M`, `post_max_size` aspoň na `34M` a zapisovateľné súkromné úložisko mimo `public/`. Konkrétny limit diskovej kvóty a zálohovanie sa riadia hostingom a musia byť pred nasadením potvrdené; lokálne prostredie ich nevie zaručiť.

**Výstup:** uzavretá tabuľka limitov a oprávnení, bez neurčených bezpečnostných predvolených hodnôt.

### 2. Doplniť API kontrakt a mock

V `docs/api.md` opísať objekt `attachment` (identifikátor, názov zobrazenia, MIME typ overený serverom, veľkosť, autor a dátum vytvorenia) a endpointy:

- `GET /api/tasks/{id}/attachments` – zoznam príloh pri práve čítať úlohu;
- `POST /api/tasks/{id}/attachments` – jeden súbor ako `multipart/form-data`, pri práve upraviť úlohu;
- `GET /api/tasks/{id}/attachments/{attachment_id}` – bezpečné stiahnutie po overení väzby aj prístupu;
- `DELETE /api/tasks/{id}/attachments/{attachment_id}` – odstránenie po overení oprávnenia.

Zadefinovať stavové kódy a chyby pre neplatný typ, prekročenie 32 MB na súbor alebo 1 GB súhrnne na úlohu, chýbajúci súbor, nedostupnú úlohu/prílohu, nedostatočné oprávnenie a zlyhanie úložiska. Názov súboru z klienta je iba zobrazovaný údaj, nikdy cesta. Mock doplniť iba vtedy, ak frontendový tok ešte používa Postman mock.

**Výstup:** kontrakt, ktorý jednoznačne opisuje požiadavky aj odpovede a nevracia internú cestu k súboru.

### 3. Pridať schému a súkromné úložisko

Vytvoriť tabuľku `task_attachments` s cudzím kľúčom na úlohu, autorom, bezpečným náhodným identifikátorom úložiska, pôvodným názvom určeným na zobrazenie, overeným MIME typom, veľkosťou a časom vytvorenia. Pridať indexy potrebné na zoznam podľa úlohy. Cudzí kľúč nastavovať v súlade s existujúcim správaním zmazania úlohy; databázové zmazanie samo osebe neodstráni súbor z disku.

Úložisko umiestniť mimo verejného webového koreňa (alebo ho v hostingu zablokovať pravidlami servera). Na disk zapisovať pod náhodným interným kľúčom, nie pod používateľským názvom. Nastaviť minimálne potrebné oprávnenia k adresáru a zdokumentovať jeho konfiguráciu bez tajomstiev.

**Výstup:** opakovateľná zmena schémy a zdokumentované lokálne/nasadzovacie nastavenie úložiska.

### 4. Implementovať backendový tok nahratia

Pridať validáciu `multipart/form-data`: kontrolovať chybu uploadu, skutočnú veľkosť, povolený typ podľa obsahu (napr. `finfo`), príponu podľa allowlistu a bezpečné dekódovanie obrazových typov. Odmietnuť nezhodu typu/prípony, nulový súbor, súbor väčší než 32 MB, súčet príloh úlohy nad 1 GB a nečakané polia. Uplatniť existujúcu ochranu CSRF/origin a vyžadovať súčasne `can_add_tasks` pre projekt aj `can_add_comments` pre úlohu.

Zápis súboru a metadát spracovať tak, aby čiastočný neúspech nezanechal osirelý súbor ani neplatný riadok: pri chybe DB odstrániť už zapísaný súbor; pri chybe disku nevytvárať metadáta. Použiť parametrizované SQL a nevystavovať lokálnu cestu ani diagnostiku servera klientovi.

**Výstup:** bezpečne fungujúci zoznam a nahratie podľa kontraktu.

### 5. Implementovať stiahnutie, mazanie a upratovanie

Sťahovanie vykonáva PHP po kontrole session, prístupu k úlohe a zhody `attachment_id` s `task_id`. Vrátiť bezpečné hlavičky `Content-Type`, `Content-Length`, `X-Content-Type-Options: nosniff` a `Content-Disposition` s korektne zakódovaným názvom; aktívny obsah zobrazovať ako prílohu, nie vykonateľnú stránku. Pri sťahovaní neskladať cestu z parametrov požiadavky.

Mazanie musí overiť právo pred zásahom a bezpečne koordinovať DB a disk. Zohľadniť aj hromadné zmazanie dokončených úloh a zmazanie projektu/úlohy, ak tieto cesty odstraňujú úlohy. Pridať opakovateľné upratanie osirelých súborov alebo transakčný/outbox postup, ak jednoduché mazanie pri požiadavke nezaručí konzistenciu.

**Výstup:** chránené stiahnutie a mazanie bez možnosti čítať či odstrániť cudzí súbor.

### 6. Doplniť používateľské rozhranie

Do detailu úlohy pridať viditeľnú drop zónu na pridávanie súborov metódou drag and drop. Zónu možno aktivovať aj kliknutím alebo klávesnicou; otvorí sa rovnaký systémový výber súborov, aby pridávanie fungovalo aj bez myši a na dotykových zariadeniach. Podporiť výber aj pretiahnutie viacerých súborov naraz: rozhranie ich zaradí do frontu a každý odošle samostatnou požiadavkou, keďže endpoint prijíma jeden súbor. Počas pretiahnutia nad zónou zobraziť jej aktívny stav; po výbere ukázať názvy súborov, priebeh a výsledok pri každom súbore, umožniť zrušiť ešte nezačaté nahrávanie a pri chybe zobraziť zrozumiteľnú príčinu. Zobraziť aj zoznam príloh s názvom/typom/veľkosťou a iba akcie zodpovedajúce oprávneniam API. Počas načítania zoznamu zobraziť zodpovedajúci skeleton. Nové viditeľné texty vrátane pokynov drop zóny dodať po slovensky aj česky.

**Výstup:** prístupný tok pridania, stiahnutia a odstránenia súboru v detaile úlohy.

### 7. Overiť bezpečnosť a celý tok

Overiť povolený súbor aj odmietnutie zakázaného typu, falšovanej prípony/MIME, prekročených limitov, prázdneho a poškodeného súboru. Overiť neprihlásený prístup, používateľa bez prístupu, cudziu úlohu, podvrhnuté ID prílohy z inej úlohy, názvy s cestou/Unicode/hlavičkovými znakmi, zlyhanie zápisu disku/DB a upratanie pri mazaní úloh. Skontrolovať CSRF ochranu a limity web servera/PHP. V prehliadači prejsť pridanie, zoznam, stiahnutie a odstránenie na mobile aj desktopovej šírke.

**Výstup:** zaznamenané výsledky kontrol, potvrdené limity prostredia a aktualizovaný `docs/api.md`/README s prevádzkovým nastavením.

## Kritériá dokončenia

- Príloha je dostupná iba po autorizovanom API toku; priama verejná URL neexistuje.
- Server kontroluje oprávnenie ku každej operácii aj väzbu prílohy na úlohu.
- Názvy a MIME typy od klienta sa považujú za nedôveryhodné; fyzické názvy sú náhodné.
- Limit 32 MB na súbor a 1 GB súhrnne na úlohu je vynútený na aplikačnej aj hostingovej vrstve a opísaný v kontrakte.
- Pridanie prílohy vyžaduje súčasne právo `can_add_tasks` aj `can_add_comments`.
- Zmazanie prílohy aj nadradenej úlohy nenecháva súbory bez metadát ani metadáta bez súborov bez zdokumentovaného mechanizmu obnovy.
- Pridávanie súborov funguje pretiahnutím aj cez prístupný výber súborov; rozhranie funguje klávesnicou a na mobilnom zobrazení a nové texty sú dostupné v slovenčine aj češtine.
- PHP syntax, API tok a používateľský tok sú overené podľa projektových pravidiel; neoverené správanie je výslovne zaznamenané.
