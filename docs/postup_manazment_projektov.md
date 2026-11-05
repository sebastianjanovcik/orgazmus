# Postup vývoja: správa projektov a členov

Tento dokument je jediným plánom práce na správe projektov, členstve, zdieľaní úloh, audite a notifikáciách. Jednotlivé kroky sa vykonávajú a aktualizujú tu. Pri tejto funkcionalite sa neupravujú ani nedopĺňajú iné Markdown súbory; potrebné dátové a API rozhodnutia sa zaznamenávajú v tomto dokumente a realizujú priamo v kóde.

## Cieľ

Vlastník projektu môže pozývať členov, nastavovať im roly a oprávnenia a previesť vlastníctvo. Úlohu možno zdieľať aj samostatne s konkrétnym používateľom bez sprístupnenia celého projektu. Pozvaný používateľ získa prístup až po prijatí pozvánky. Server vynucuje oprávnenia, zmeny sa zaznamenávajú do auditu a používateľ vidí svoje notifikácie v rozhraní.

## Navrhovaná štruktúra rolí a oprávnení

Každý člen má vlastnú sadu oprávnení, ktorú nastavuje pozývajúci alebo člen s právom spravovať členov. Vlastník má vždy všetky práva; prevod vlastníctva je samostatná potvrdená akcia.

| Oblasť | Checkbox | Význam |
| --- | --- | --- |
| Projekt | Zobraziť projekt | Zobraziť projekt a jeho obsah. |
| Projekt | Spravovať projekt | Upraviť údaje a nastavenia projektu, prípadne projekt zmazať. |
| Projekt | Spravovať členov | Pozývať, meniť práva a odstraňovať členov. |
| Úlohy | Zobraziť úlohy | Zobraziť úlohy projektu. |
| Úlohy | Pridávať úlohy | Vytvárať úlohy v projekte. |
| Úlohy | Dokončiť úlohy ostatných | Označiť cudziu úlohu za hotovú alebo ju obnoviť. |
| Úlohy | Upraviť vlastné úlohy | Upraviť úlohy vytvorené daným členom. |
| Úlohy | Upraviť úlohy ostatných | Upraviť ľubovoľnú úlohu v projekte. |
| Úlohy | Zmazať vlastné úlohy | Zmazať úlohy vytvorené daným členom. |
| Úlohy | Zmazať úlohy ostatných | Zmazať ľubovoľnú úlohu v projekte. |
| Komentáre | Zobraziť komentáre | Čítať komentáre k dostupným úlohám. |
| Komentáre | Pridávať komentáre | Pridať komentár, ak to povoľuje plán účtu. |
| Komentáre | Upraviť vlastné komentáre | Upraviť komentáre vytvorené daným členom. |
| Komentáre | Upraviť komentáre ostatných | Upraviť ľubovoľný komentár k dostupnej úlohe. |
| Komentáre | Zmazať vlastné komentáre | Zmazať komentáre vytvorené daným členom. |
| Komentáre | Zmazať komentáre ostatných | Zmazať ľubovoľný komentár k dostupnej úlohe. |

Práva k vlastným záznamom sa kontrolujú podľa autora prihláseného používateľa. Úloha eviduje tvorcu v `created_by`, vykonávajúceho člena v `assignee_id` a kontrolného člena v `reviewer_id`. Tvorcu nastavuje server a klient ho nemôže zmeniť; vykonávajúceho a kontrolného člena možno priradiť iba z používateľov, ktorí majú k úlohe prístup. Komentáre majú `author_id`. Úprava a mazanie vlastných a cudzích záznamov sú samostatné práva. Zmazanie komentára odstráni aj jeho odpovede podľa existujúceho kaskádového pravidla.

Úlohu možno označiť za hotovú alebo ju obnoviť jej tvorcom, priradeným vykonávajúcim členom alebo členom s oprávnením dokončiť úlohy ostatných (`can_complete_tasks`). Kontrolný člen týmto priradením automaticky právo dokončovať úlohu nezíska; môže ju dokončiť iba vtedy, ak je zároveň tvorcom, vykonávajúcim členom alebo má uvedené oprávnenie.

### Pozvanie a správa oprávnení členov

Tabuľka checkboxov sa zobrazí ešte pred odoslaním pozvánky. Pozývajúci nastaví práva nového člena a až potom odošle pozvánku; pozvánka tieto práva uchová do prijatia. Rovnakú tabuľku možno otvoriť pri každom členovi na zmenu jeho oprávnení. Iba vlastník alebo člen s právom „Spravovať členov“ môže pozývať, meniť práva či odstraňovať členov. Vlastníctvo sa nemení cez checkboxy.

Odporúčané predvoľby, ktoré iba predvyplnia checkboxy: **Správca** má všetky práva vrátane správy členov; **Prispievateľ** môže zobrazovať, pridávať a dokončovať úlohy, upravovať a mazať vlastné úlohy a komentáre a pridávať komentáre; **Komentátor** môže zobrazovať obsah a pridávať komentáre; **Náhľad** môže iba zobrazovať obsah. Každú predvoľbu možno pred pozvaním upraviť.

### Sekcia Zdieľané a filtre

V pravom bočnom paneli bude sekcia **Zdieľané** so zoznamom projektov a samostatne zdieľaných úloh, ku ktorým má používateľ prístup. Výber položky otvorí príslušný obsah. Zoznam rešpektuje oprávnenia a po odobratí prístupu položku zneprístupní.

V každom príslušnom okne, najmä **Kalendár** a **Projekty**, bude filter **Všetky / Moje / Zdieľané**. „Moje“ znamená vlastné projekty alebo úlohy vytvorené používateľom; „Zdieľané“ znamená projekty a úlohy sprístupnené iným používateľom. „Všetky“ spojí dostupné vlastné a zdieľané položky bez duplicít. Filter nemení prístupové práva a nesmie zobraziť obsah bez oprávnenia.

### Všeobecné pravidlá

- Server kontroluje oprávnenia pri každom čítaní a zápise; skrytie ovládacieho prvku nestačí.
- Nedostupný objekt vracia `404`; prihlásený používateľ bez potrebného práva dostane `403 forbidden`.
- Pozvánka `pending` sama osebe prístup neudeľuje; vzniká až prijatím správnym účtom.
- Premium sa kontroluje pri každom zápise komentára alebo reakcie.
- Každé mazanie vyžaduje kliknutie na tlačidlo a jedno potvrdzovacie okno.
- Rozhranie je po slovensky, prístupné klávesnicou a použiteľné na mobile.

## Pracovný postup

Každý krok spája backend a frontend. Najprv sa v tomto dokumente spresní potrebné správanie a dátové rozhranie; následne sa v rámci toho istého kroku implementuje serverová časť, obrazovka alebo komponent a ich napojenie. Po každom kroku musí byť výsledok viditeľný na stránke a musí sa dať prejsť v prehliadači s dostupnými lokálnymi dátami. Ak ešte nie je pripravená trvalá databázová vrstva, použije sa existujúce vývojové prostredie projektu tak, aby bolo možné funkciu predviesť; oprávnenia sa však vždy pripravujú a vynucujú na serveri. Počas práce sa zaznamená stav kroku priamo tu, bez vytvárania alebo dopĺňania iných Markdown súborov.

## Krok 1 – Základ členstva a zobrazenie členov

**Backend spolu s frontendom:** Zistiť aktuálny stav projektu, používateľov, PHP API a databázy. Zaviesť väzbu používateľa na projekt s individuálnou sadou oprávnení a časom pridania; vlastník zostáva jednoznačný. Evidovať tvorcu úlohy, aby bolo možné rozlíšiť vlastné úlohy od cudzích. Implementovať serverové čítanie členov s prístupovou kontrolou. V detaile projektu zobraziť zoznam členov a pri každom člena jeho oprávnenia v tabuľke checkboxov.

**Viditeľný výsledok:** Otvorený projekt na stránke zobrazuje členov a ich oprávnenia získané zo servera.

**Dokončené, keď:** Zoznam zodpovedá uloženým dátam, používateľ bez prístupu nezíska členov cudzieho projektu a rozhranie funguje na mobile aj klávesnicou.

## Krok 2 – Pozvánky a správa rolí

**Backend spolu s frontendom:** Implementovať vytvorenie, zobrazenie a odvolanie pozvánky, jej platnosť a stavy `pending`, prijatá, odmietnutá, odvolaná a expirovaná. Pred odoslaním pozvánky zobraziť tabuľku checkboxov a uložiť vybrané oprávnenia do pozvánky; pri jej prijatí vytvoriť členstvo s týmito právami. V detaile projektu sprístupniť tú istú tabuľku pri každom členovi na zmenu jeho oprávnení. Iba vlastník alebo člen s právom spravovať členov môže pozývať, meniť práva či odstraňovať členov. Pozvánku možno priradiť existujúcemu účtu alebo e-mailu; bezpečný token ukladať iba ako hash.

**Viditeľný výsledok:** Vlastník pozve člena z detailu projektu, príjemca pozvánku vidí a môže ju prijať alebo odmietnuť; po prijatí sa zobrazí ako člen.

**Dokončené, keď:** Pending pozvánka neudeľuje prístup, nemôže ju prijať nesprávny účet, duplicitné alebo neplatné pozvánky sa bezpečne odmietnu a nepovolený používateľ nemôže spravovať členov.

## Krok 3 – Oprávnenia v projekte a prevod vlastníctva

**Backend spolu s frontendom:** Vytvoriť spoločnú serverovú kontrolu jednotlivých oprávnení pre čítanie a zápis projektov, úloh a komentárov. Rozlišovať vytvorenie, dokončenie, úpravu a zmazanie vlastných či cudzích úloh a komentárov. Server určuje autora a kontroluje ho pri každej operácii; checkboxy v rozhraní zodpovedajú tým istým serverovým právam. Implementovať transakčný prevod vlastníctva, potvrdenie súčasným vlastníkom a nastavenie práv predchádzajúceho vlastníka.

**Viditeľný výsledok:** Člen vidí a môže vykonať iba akcie povolené jeho rolou; vlastník môže previesť vlastníctvo cez detail projektu.

**Dokončené, keď:** Priame API volanie neobíde prístupové pravidlá, projekt má vždy práve jedného vlastníka a prevod správne zmení prístup oboch používateľov.

## Krok 4 – Samostatné zdieľanie úlohy a komentáre

**Backend spolu s frontendom:** Zaviesť prístupové záznamy pre konkrétnu úlohu a príjemcu. Samostatné zdieľanie nesmie sprístupniť projekt ani susedné úlohy a uplatňuje rovnaké pravidlá vlastných/cudzích záznamov. Pri úlohe umožniť nastaviť vykonávajúceho člena (`assignee_id`) a kontrolného člena (`reviewer_id`) spomedzi používateľov s prístupom k úlohe; prístup kontrolného člena sa riadi pridelenými právami zdieľania. V pravom bočnom paneli vytvoriť sekciu **Zdieľané** so zdieľanými projektmi a úlohami. V oknách **Kalendár** a **Projekty** pridať filtre **Všetky / Moje / Zdieľané** bez duplicít; filtre musia rešpektovať oprávnenia.

**Viditeľný výsledok:** Používateľ nájde zdieľané projekty a úlohy v bočnom paneli, filtruje položky v Kalendári a Projektoch a pri úlohe vidí priradeného vykonávajúceho aj kontrolného člena. Príjemca vidí alebo upravuje iba zdieľaný obsah podľa pridelených práv.

**Dokončené, keď:** Divák nemôže meniť úlohu, Editor ju môže meniť v povolenom rozsahu, odobratý príjemca stráca prístup a žiadna rola neobíde pravidlo Premium.

## Krok 5 – Notifikácie a audit zmien

**Backend spolu s frontendom:** Zaznamenávať významné udalosti vrátane pozvánok, členstva, prevodu vlastníctva a zmien zdieľaných úloh do append-only auditu. Vytvárať notifikácie určeným príjemcom pri relevantných udalostiach. Implementovať serverové stránkované načítanie vlastných notifikácií a auditu projektu a označenie iba zobrazených notifikácií ako prečítaných. Pridať zvonček/panel notifikácií a históriu zmien v rozhraní vrátane prázdneho, načítavacieho a chybového stavu.

**Viditeľný výsledok:** Používateľ vidí svoje nové oznámenia a člen projektu si môže pozrieť históriu zmien.

**Dokončené, keď:** Používateľ nedokáže čítať cudzie notifikácie ani audit bez prístupu; neskôr doručené alebo nezobrazené notifikácie zostávajú neprečítané a audit neposkytuje úpravu ani mazanie.

### Rozšírenie auditu na celú aplikáciu

**Rozsah:** Audit pokrýva každú podporovanú zmenu používateľských dát: účet a plán, projekty, úlohy, dokončenie úloh, komentáre, pozvánky, členstvo a vlastníctvo. Záznam obsahuje typ a ID zmeneného objektu, názov aktivity, presný zoznam zmenených polí s hodnotami pred a po zmene, aktéra (ak je prihlásený), čas UTC a IP adresu spojenia. Pri mazaní sa uloží snapshot odstránených polí. Tajomstvá, heslá, tokeny a celé telá požiadaviek sa do auditu nekopírujú.

**Oprávnenia a rozhranie:** Globálny `GET /api/audit` vráti používateľove vlastné udalosti a udalosti projektov, ku ktorým má stále prístup. Projektová história používa rovnaké záznamy a zachová kontrolu prístupu k projektu. Obrazovka **Audit** zobrazuje riadky vo formáte dátum a čas, kto, IP adresa, vykonaná aktivita; poskytuje textové vyhľadávanie, typ objektu/aktivity, časové obdobie a stránkovanie.

**Databáza a migrácia:** Append-only tabuľka má `project_id` (nullable), `entity_type`, `entity_id`, `actor_id`, `ip_address`, `event_type`, JSON `details` a `created_at`. Existujúca `project_audit_log` sa jednorazovo skopíruje do spoločnej tabuľky; staršie záznamy majú IP neznámu a zachovajú sa. Projektové udalosti sa po zmazaní projektu nesmú stratiť. Na existujúcej databáze sa najskôr spustí `db/migration_notifications_audit.sql`, ak ešte nemá notifikácie a projektový audit, potom `db/migration_global_audit.sql` (iba raz). Nové databázy vytvoria tabuľku z `db/schema.sql`.

**Kritériá dokončenia:** Každá úspešná zapisovacia API operácia v aktuálnom rozsahu vytvorí audit v tej istej transakcii, keď už operácia transakciu používa; neúspešná požiadavka audit nevytvorí. Filtrovanie a hľadanie bežia na serveri, dáta ostávajú izolované podľa prístupových práv a v UI existujú načítavací, prázdny a chybový stav. Všetky nové popisky sú v slovenčine aj češtine.

## Krok 6 – Integrované overenie a dokončenie

**Backend spolu s frontendom:** Prejsť celý tok od pozvania po používanie zdieľaného projektu a úlohy. Overiť kombinácie checkboxov vrátane vlastných a cudzích úloh/komentárov, správu členov, filtre **Všetky / Moje / Zdieľané**, sekciu **Zdieľané**, stavy pozvánok, prevod vlastníctva, Premium, notifikácie, audit a odobratie prístupu. Skontrolovať chybové a prázdne stavy, mobilné rozloženie a ovládanie klávesnicou; zapísať dokončenie a zostávajúce obmedzenia.

**Viditeľný výsledok:** Celá správa projektov a zdieľanie sa dá prejsť cez stránku bez použitia priamych databázových zásahov na predvádzanie bežných tokov.

**Dokončené, keď:** Prejdené scenáre zodpovedajú pravidlám tohto dokumentu, server odmieta nepovolené operácie a známe neoverené správanie je jasne označené.

## Záznam postupu

- Krok 1: implementovaný. Schéma `project_members` uchováva 16 individuálnych oprávnení a `added_at`; vlastník je zároveň členom a jeho práva sú pri čítaní vždy úplné. Úlohy uchovávajú serverom nastavené `created_by`. API `GET /api/projects/{id}/members` kontroluje prístup a detail projektu zobrazuje členov, dátum pridania a checkboxy oprávnení. Pri existujúcej databáze treba pred nasadením nového kódu jednorazovo spustiť `db/migration_project_members.sql`; migrácia spätne priradí úlohy súčasnému vlastníkovi. Nové databázy používajú `db/schema.sql`. Pozývanie členov a zmena oprávnení patria do kroku 2.
- Krok 2: implementovaný. Tabuľka `project_invitations` ukladá adresáta, voliteľné ID existujúceho účtu, 16 práv, SHA-256 hash jednorazového tokenu, stav a platnosť 7 dní. `POST /api/projects/{id}/invitations` vytvorí pozvánku a vráti token iba raz; `GET` na tej istej ceste zobrazí históriu manažérom. Príjemca po prihlásení otvorí odkaz `#invite-{id}-{token}` a cez `POST /api/invitations/{id}/accept|decline` prijme alebo odmietne pozvánku. Prijatie podlieha zhode e-mailu účtu; členstvo vzniká transakčne až prijatím. `DELETE /api/projects/{id}/invitations/{invitationId}` pozvánku odvolá. `PATCH/DELETE /api/projects/{id}/members` mení práva alebo odoberá člena; vlastníkove práva nemožno upraviť ani vlastníka odstrániť. Platnosť sa nastaví na 7 dní a expirácia sa materializuje pri načítaní pozvánok alebo pri jej spracovaní. Pred nasadením nad existujúcou DB spustiť `db/migration_project_invitations.sql`; nové DB používajú `db/schema.sql`. Aplikácia zatiaľ neposiela e-mail; odkaz treba skopírovať a doručiť pozvanému mimo aplikácie.
- Krok 3: implementovaný. API spoločnými kontrolami vynucuje čítanie a správu projektu, čítanie/pridávanie/dokončenie/úpravu/mazanie vlastných a cudzích úloh a čítanie/pridávanie/úpravu/mazanie komentárov. Autor úlohy aj komentára sa určuje na serveri; UI zobrazuje povolené akcie podľa odpovede API. Vlastník môže v detaile potvrdiť prevod vlastníctva na existujúceho člena; transakcia uzamkne projekt, zmení vlastníka a nastaví práva predchádzajúceho vlastníka z formulára. Samostatné rozbaľovacie menu umožňuje upraviť názov prenášaného projektu, aby sa predišlo kolízii unikátnych názvov, a API kontroluje kapacitu plánu nového vlastníka. Mazanie projektu povoľuje právo správy projektu, pričom posledný projekt vlastníka zostáva chránený. Overená je syntax PHP a kontrola diffu; JavaScript sa nepodarilo syntakticky skontrolovať, pretože v prostredí nie je dostupný príkaz `node`. Prehliadačový tok a databázové scenáre neboli v tomto kroku manuálne prejdené.
- Krok 4: implementovaný. Tabuľka `task_shares` udeľuje práva ku konkrétnej úlohe bez sprístupnenia projektu alebo susedných úloh; API umožňuje zdieľať ju s existujúcim účtom cez e-mail, upraviť jeho práva opätovným zdieľaním a odobrať prístup. Server vynucuje prístup pri zozname a detaile úloh, dokončení, úprave, mazaní a komentároch; komentáre zostávajú dostupné iba v Premium. Úloha uchováva `assignee_id` a `reviewer_id`, ktorých výber API obmedzí na používateľov s prístupom k úlohe. Bočný panel zobrazuje zdieľané projekty a samostatne zdieľané úlohy; Projekty a Kalendár majú filtre **Všetky / Moje / Zdieľané**. Nová databáza používa `db/schema.sql`; existujúca databáza potrebuje jednorazovo spustiť `db/migration_task_sharing.sql`. Overená syntax PHP a JavaScriptu a čistý diff. Prehliadač v prostredí nebol dostupný a migrácia nebola spustená, preto tok UI a databázové scenáre ostávajú neoverené.
- Krok 5: pôvodný audit/notifikácie projektu ostáva funkčný a je rozšírený spoločným `audit_log`. Záznamy pokrývajú vytvorenie a úpravy účtu, plán, projekty, úlohy, dokončenie a mazanie úloh, komentáre, pozvánky, členstvo a prevod vlastníctva; pri úpravách ukladajú rozdiely polí, pri mazaní snapshot a pri každom zázname aktéra, UTC čas a IP z priameho spojenia. Heslá a tokeny sa neukladajú. `GET /api/audit` vracia vlastné udalosti a udalosti dostupných projektov so serverovým vyhľadávaním, filtrom typu a dátumov a stránkovaním. Navigačná položka Audit zobrazuje dátum/čas, aktéra, IP adresu, aktivitu a zmenené hodnoty; detail projektu číta ten istý denník. Existujúca databáza potrebuje jednorazovo `db/migration_global_audit.sql` po pôvodnej migrácii auditu/notifikácií; migrácia prenesie staré udalosti a ponechá zdrojovú tabuľku. Overená syntax PHP a kontrola whitespace diffu; JavaScript parser ani prehliadač nie sú dostupné a databázová migrácia nebola spustená.
- Krok 6: čaká na realizáciu.
