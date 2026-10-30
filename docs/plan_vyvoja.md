# Plán vývoja aplikácie Tasko

Tento plán vychádza z dokumentu `To-do_list_postup_vyvoja_krokzakrokomv4.docx`, zadania a prototypu `To-do wireframe.html`. Práca je rozdelená na frontend nad Postman mock serverom (F1–F14) a následne na skutočný backend (B1–B12). Každý krok nadväzuje na predchádzajúci a jeho výsledok treba skontrolovať skôr, než sa začne ďalší.

## Cieľ a technické rozhodnutia

Výsledkom bude responzívna aplikácia na správu úloh, projektov, kalendára a používateľského profilu. Používateľské rozhranie bude v slovenčine alebo češtine. Frontend použije HTML, Bootstrap 5, CSS a jQuery. Backend bude procedurálny PHP 8.5, ktorý poskytne REST API s JSON odpoveďami a bude bezpečne čítať a zapisovať údaje v MySQL.

Prehliadač nebude komunikovať priamo s MySQL. Také spojenie by vystavilo prihlasovacie údaje databázy každému návštevníkovi. Namiesto toho jQuery odošle HTTP požiadavku na PHP API; PHP overí používateľa a vstup, vykoná parametrizovaný SQL dotaz a vráti JSON. Postman mock bude dočasná náhrada API pri tvorbe frontendu. Dátový kontrakt medzi mockom a PHP serverom bude opísaný v `docs/api.md`.

Prototyp obsahuje viac obrazoviek a možností než stručný prompt: projekty, prioritu, profil, tmavý režim, komentáre a štatistiky. Plán tieto prvky preberá podľa vývojového dokumentu. Predmetom nie je dopĺňať platobnú bránu ani reset hesla; predplatné Standard/Premium slúži na ukážku obmedzení. Vývojový dokument menuje FullCalendar ako knižnicu pre kalendár; hoci ho prompt nespomína, jeho lokálne použitie je súčasťou podkladového plánu.

## Ako sa plánom pracovať

- Dokončuj kroky v uvedenom poradí. Ak krok nefunguje podľa kritérií dokončenia v podkladovom dokumente, začni ďalší.
- Na konci každého kroku skontroluj zmenu v prehliadači alebo API, potom skontroluj `git status` a diff. Podľa projektových pravidiel patrí každý ukončený krok do samostatného commitu a pushu.
- Do repozitára neukladaj heslá, Postman kľúče ani `config/config.php`. Aplikácia používa knižnice z `public/assets/vendor/`; pôvodné varianty v `trash/assets/` sú archív a nové vendor súbory pridávaj iba vtedy, ak to konkrétny krok vyžaduje.
- Komentáre k novému zložitému kódu píš po slovensky a vysvetli nimi zámer alebo obmedzenie.

# Fáza 1 – Frontend s Postman mock serverom

**Cieľ fázy:** Dokončiť klikateľné rozhranie a jeho používateľské toky skôr než vznikne databázový backend. Mock vracia dohodnuté ukážkové odpovede, ale neukladá zmeny medzi požiadavkami.

## F1 – Príprava repozitára

**Čo sa urobí:** Usporiada sa štruktúra pre verejný frontend, API, konfiguráciu, dokumentáciu a databázu. Pridá sa `.gitignore`, stručný README, lokálne knižnice jQuery, Bootstrap a FullCalendar a záznam ich verzií. Overia sa dostupné verzie PHP, MySQL a Git.

**Výstupy:** Základná adresárová štruktúra, `.gitignore`, `README.md`, `VERSIONS.md`, prázdna vstupná stránka a lokálne knižnice; stránka sa otvorí cez lokálny PHP server.

**Pre juniora:** Toto je bezpečný základ projektu. `.gitignore` chráni tajné a dočasné súbory pred Gitom. Lokálne knižnice znamenajú, že stránka sa nespolieha na CDN ani internet pri každom otvorení.

## F2 – Kontrakt REST API a Postman mock

**Čo sa urobí:** V `docs/api.md` sa presne popíšu URL, HTTP metódy, vstupné JSON objekty, stavové kódy, úspešné a chybové odpovede. Zadefinujú sa objekty používateľ, projekt, úloha a komentár a pravidlá plánov. Z kontraktu sa vytvorí Postman kolekcia s ukážkami odpovedí a mock server.

**Výstupy:** `docs/api.md`, Postman kolekcia v JSON a dostupný mock server s adresou zdokumentovanou v kontrakte.

**Pre juniora:** Kontrakt je dohoda medzi stránkou a serverom. Keď frontend aj backend dodržiavajú rovnaké tvary dát, dajú sa vyvíjať oddelene a neskôr sa mock vymení za skutočné API.

## F3 – HTML kostra a vizuál

**Čo sa urobí:** Vytvorí sa prístupná HTML štruktúra podľa wireframe: horná lišta, menu, hlavný obsah, formulárové výsuvné panely a plávajúce tlačidlo. Štýly sa zlúčia do jedného `app.css`, s Bootstrapom ako základom a úpravami pre sklenený vzhľad, svetlý/tmavý režim a mobilné rozloženie.

**Výstupy:** Statická stránka s ukážkovým obsahom, použiteľná na šírkach mobilu aj desktopu; sémantické ovládacie prvky, popisky polí a viditeľný fokus.

**Pre juniora:** Najprv tvoríme kostru, aby bolo jasné, kam neskôr vložíme dáta. CSS premenné umožnia meniť tému bez prepisovania každého komponentu. Bootstrap zrýchli rozloženie, vlastné CSS zachová podobu prototypu.

## F4 – JavaScript jadro a pripojenie mocku

**Čo sa urobí:** Vytvorí sa základ `app.js`: konfigurácia API, slovník textov, stav aplikácie, hash navigácia, opakovane použiteľné zobrazenia a obsluha okien. Pripravia sa pomocné funkcie pre lokálne dátumy a používateľské rozhranie. API požiadavky pôjdu cez jQuery na Postman mock.

**Výstupy:** Prepínanie obrazoviek cez URL hash, spoločná funkcia pre API volania a viditeľná ukážková odpoveď z mock servera.

**Pre juniora:** Rozdelenie zodpovedností uľahčuje hľadanie chýb. Hash router mení obrazovku bez načítania celej stránky. Poradové číslo načítania bráni tomu, aby oneskorená staršia odpoveď prepísala novší obsah.

## F5 – Registrácia, prihlásenie a odhlásenie

**Čo sa urobí:** Doplnia sa obrazovky prihlásenia a registrácie, validácia mena, e-mailu a hesla, hlásenia chýb a ochrana obrazoviek pre neprihláseného používateľa. Reset hesla nie je súčasťou rozsahu.

**Výstupy:** Funkčné rozhranie prihlasovania a registrácie napojené na mock; prihlásenie sa predvedie cez mock odpoveď; mock však session ani zmeny neuchová, trvalé prihlásenie sa overí až pri B10.

**Pre juniora:** Klientská validácia dá rýchlu spätnú väzbu, ale v produkcii bude tie isté pravidlá kontrolovať aj server. Rovnaká všeobecná chyba pri nesprávnom e-maile alebo hesle nezradí, či účet existuje.

## F6 – Profil a avatar

**Čo sa urobí:** Horný avatar zobrazí iniciály a pri pláne Premium korunu. Profil umožní zmeniť meno a heslo, ukáže pravidlá plánov a ponúkne odhlásenie. Prepnutie plánu bude dostupné len ako demo funkcia.

**Výstupy:** Profilový panel, živá aktualizácia iniciál a označenie Premium.

**Pre juniora:** Iniciály odvodzujeme z mena, takže netreba ukladať profilový obrázok. Demo prepínač pomáha ukázať oba varianty; skutočný nárok na plán musí vždy rozhodovať server.

## F7 – Komponent úlohy a hlavný zoznam

**Čo sa urobí:** Vytvorí sa jeden komponent úlohy, ktorý zobrazuje názov, projekt, prioritu, termín, krátky popis a stav. Hlavná obrazovka načíta úlohy, oddeľuje hotové a otvorené a zobrazuje načítavanie či prázdny stav.

**Výstupy:** Hlavný zoznam úloh podľa prototypu vrátane stavov načítania a prázdneho zoznamu.

**Pre juniora:** Opakovane použiteľný komponent zaručí rovnaký vzhľad úlohy v rôznych obrazovkách. Text získaný od používateľa sa vkladá bezpečným textovým spôsobom, aby sa nespustil ako HTML alebo JavaScript.

## F8 – Vytvorenie, úprava a zmazanie úlohy

**Čo sa urobí:** Jeden formulár bude slúžiť na novú aj existujúcu úlohu. Obsahuje názov, prioritu, projekt, termín a formátovaný popis. Pridá sa validácia, potvrdenie mazania, čistenie HTML a obnova zoznamu po uložení.

**Výstupy:** Kompletný tok vytvoriť/upraviť/zmazať, zrozumiteľné chyby pri poliach a editor použiteľný aj klávesnicou.

**Pre juniora:** Spoločný formulár znižuje duplicitný kód. Obsah editora je nedôveryhodný; povolené značky sa preto obmedzia v prehliadači aj neskôr na serveri. Mock medzi požiadavkami nič trvalo neukladá; tento krok preto overuje frontendový tok, nie pretrvanie dát.

## F9 – Označenie úlohy ako hotovej

**Čo sa urobí:** Zaškrtnutie okamžite zmení vzhľad a odošle osobitné volanie na dokončenie alebo opätovné otvorenie úlohy. Pri chybe sa zobrazenie vráti do pôvodného stavu.

**Výstupy:** Rýchla interakcia s možnosťou vrátenia pri chybe a aktualizáciou počtov.

**Pre juniora:** Používateľ nemusí čakať na server pri každom kliknutí. Keď server akciu odmietne, rozhranie musí obnoviť pravdivý stav. Samostatné endpointy jasne vyjadrujú požadovanú akciu.

## F10 – Projekty a limit plánu

**Čo sa urobí:** Doplnia sa zoznam projektov, detail projektu, úprava a zmazanie. Nový projekt dostane ikonu a automatickú farbu. Plán Standard zobrazí a vynucuje limit troch projektov v rozhraní.

**Výstupy:** Projektové obrazovky, formulár projektu, počty a vizuálne vysvetlenie limitu.

**Pre juniora:** UI limit pomáha používateľovi pochopiť pravidlo, no nie je bezpečnostná kontrola. Neskôr server overí limit znova, pretože požiadavku možno poslať aj bez kliknutia v aplikácii.

## F11 – Komentáre a odpovede

**Čo sa urobí:** Do detailu úlohy sa pridajú komentáre a odpovede s maximálnou hĺbkou piatich úrovní. Používateľ Standard uvidí uzamknutú Premium funkciu. Autor môže odstrániť svoj komentár.

**Výstupy:** Vlákna komentárov, formulár odpovede a stav zamknutia podľa plánu.

**Pre juniora:** Server bude posielať plochý zoznam s identifikátorom rodiča, ktorý sa poskladá do stromu v rozhraní. Hĺbku musí vypočítať a vynútiť server, nie veriť číslu z prehliadača.

## F12 – Kalendár, hotové úlohy a štatistiky

**Čo sa urobí:** Vytvorí sa kalendár s farebnými udalosťami, obrazovka hotových úloh a základné štatistiky. Dátumy sa zobrazia bez nechceného posunu časovým pásmom.

**Výstupy:** Tri dátové pohľady, navigácia v kalendári a výber úloh podľa dňa.

**Pre juniora:** FullCalendar rieši zložitú navigáciu a prístupnosť kalendára. Dátum bez času je bezpečnejšie uchovať ako `YYYY-MM-DD`, aby sa pri konverzii časového pásma nezmenil deň.

## F13 – Notifikácie, nastavenia a jazyk

**Čo sa urobí:** Zvonček zobrazí upozornenia, nastavenia ponúknu vzhľad a prepínač slovenčina/čeština. Texty budú napojené na slovník podľa kľúčov.

**Zmena poradia:** Na žiadosť používateľa sa výber témy (automatická, svetlá a tmavá) implementuje už pred F7 spolu s úpravami farieb komponentov. V F13 sa táto voľba znovu neimplementuje; zostáva ju zahrnúť do kontroly oboch tém spolu s ostatnými nastaveniami.

**Výstupy:** Funkčné nastavenia jazyka a témy a zobrazenie notifikácií.

**Pre juniora:** Slovníky s kľúčmi sú stabilnejšie než hľadanie a nahrádzanie hotových viet. Jazyk a vzhľad sú osobné nastavenia prehliadača, preto sa môžu uložiť lokálne.

## F14 – Kontrola frontend ukážky

**Čo sa urobí:** Prejde sa všetok frontend podľa kontrolného zoznamu: mobil, klávesnica, svetlá/tmavá téma, formuláre, chybové odpovede a konzola. Opravia sa zistené chyby a označí sa ukážková verzia.

**Výstupy:** Odovzdateľná verzia frontendu `v0.1.0-frontend` a zaznamenané známe obmedzenia mock servera.

**Pre juniora:** Pred backendom sa overí, či rozhranie zodpovedá očakávaniam. Opraviť problém v tejto chvíli je jednoduchšie než po napojení databázy.

# Fáza 2 – PHP REST API a MySQL

## Zaznamenaná požiadavka pre backend

- Zoznam úloh na hlavnej obrazovke treba po napojení PHP API radiť podľa priority (najvyššia prvá) alebo podľa zostávajúceho času do termínu. Rozhodnutie o predvolenom radení a prípadnom prepínači treba premietnuť do backendového endpointu zoznamu úloh a kontraktu v `docs/api.md`. Táto úprava zatiaľ nie je implementovaná vo fronte ani backende podľa aktuálneho zadania.

**Cieľ fázy:** Nahradiť mock bezpečným a trvalým backendom. Až po overení kontraktu sa frontend prepne zmenou `apiBase`.

## B1 – Databáza a ukážkové údaje

**Čo sa urobí:** Vytvorí sa MySQL schéma pre používateľov, projekty, úlohy a komentáre, indexy, cudzie kľúče a testovacie údaje. Pripraví sa vzor konfigurácie bez tajných údajov.

**Výstupy:** SQL schéma, seed skript a `config.example.php` alebo ekvivalentný vzor.

**Pre juniora:** Schéma určuje, ako sa údaje ukladajú a prepájajú. Seed umožní každému vývojárovi vytvoriť rovnaké lokálne dáta. Heslá sa ukladajú iba ako bezpečný hash.

## B2 – Spoločné PHP pomocné funkcie

**Čo sa urobí:** Pripravia sa procedurálne funkcie pre databázové spojenie, JSON odpovede, validáciu, escapovanie HTML, čistenie povoleného popisu a pravidlá plánov.

**Výstupy:** Opakovane použiteľné súbory PHP pre databázu, HTTP, validáciu a bezpečnostné pravidlá.

**Pre juniora:** Spoločná funkcia na odpoveď zabezpečí rovnaký formát chýb na každej adrese. Parametrizované SQL oddeľuje príkaz od údajov, čím bráni SQL injection.

## B3 – API router a relácie

**Čo sa urobí:** Vytvorí sa vstupný bod API, jednoduché smerovanie podľa metódy a cesty, spracovanie JSON, HTTP hlavičiek a relácie.

**Výstupy:** Fungujúci front controller a prvý endpoint na zistenie aktuálneho používateľa.

**Pre juniora:** Jeden vstupný bod uľahčuje spoločné spracovanie chýb a bezpečnostných hlavičiek. Relácia umožní serveru rozpoznať prihlásenie pri ďalšej požiadavke.

## B4 – Účty a profil na serveri

**Čo sa urobí:** Implementuje sa registrácia, prihlásenie, odhlásenie, načítanie a úprava profilu a zmena hesla. Heslá sa hashujú; relácia sa obnoví po prihlásení.

**Výstupy:** Reálne autentifikačné endpointy a profil uložený v MySQL.

**Pre juniora:** Heslo nikdy neukladáme v čitateľnej podobe. Server musí overovať každú požiadavku; skryté tlačidlo v UI používateľa pred volaním API neochráni.

## B5 – Projekty na serveri

**Čo sa urobí:** Doplnia sa operácie čítať/vytvoriť/upraviť/zmazať projekt, kontrola vlastníctva, minimálne jedného projektu a limitu Standard.

**Výstupy:** Projektové endpointy s databázovým ukladaním a štruktúrovanými chybami.

**Pre juniora:** Každý projekt musí patriť prihlásenému používateľovi. Limit sa kontroluje na serveri aj pri súbežných požiadavkách, aby sa nedal prekročiť dvoma klikmi naraz.

## B6 – Čítanie úloh a filtre

**Čo sa urobí:** Implementuje sa načítanie úloh a detailu s filtrami podľa projektu, dátumu, rozsahu a stavu. Každý dotaz obmedzí výsledky na vlastníka.

**Výstupy:** GET endpointy pre zoznam a detail úloh.

**Pre juniora:** Filter sa skladá z bezpečných podmienok a parametrizovaných hodnôt. Kontrola vlastníctva chráni pred zobrazením cudzej úlohy.

## B7 – Zápis úloh

**Čo sa urobí:** Implementuje sa vytvorenie, úprava a zmazanie úloh vrátane validácie polí, kontroly projektu a sanitizácie popisu.

**Výstupy:** POST, PATCH a DELETE endpointy úloh s JSON chybami podľa kontraktu.

**Pre juniora:** Server nikdy nesmie predpokladať, že údaje z formulára sú správne. Rozlišujeme chybnú požiadavku od správne čitateľnej požiadavky s neplatnými hodnotami.

## B8 – Dokončenie úloh

**Čo sa urobí:** Doplnia sa samostatné endpointy na označenie hotovej/nevybavenej úlohy a hromadné zmazanie dokončených úloh.

**Výstupy:** Akčné endpointy a správne časové označenie dokončenia.

**Pre juniora:** Server nastavuje čas dokončenia, lebo hodiny v prehliadači môžu byť nesprávne. Opakované odoslanie rovnakej akcie nemá poškodiť dáta.

## B9 – Komentáre na serveri

**Čo sa urobí:** Implementuje sa čítanie, pridávanie a mazanie komentárov s kontrolou plánu, vlastníctva a hĺbky vlákna.

**Výstupy:** Komentárové endpointy s pravidlami Premium a maximálnou hĺbkou päť.

**Pre juniora:** Údaje od klienta sú nedôveryhodné, preto server zistí hĺbku z rodičovského komentára sám. Odstránenie rodiča musí vyriešiť aj jeho odpovede.

## B10 – Prepnutie na skutočné API

**Čo sa urobí:** Frontend sa pripojí k PHP serveru namiesto Postman mocku. Prejdú sa rovnaké úspešné aj chybové scenáre podľa API kontraktu.

**Výstupy:** Aplikácia používa trvalú databázu; zmena adresy API je sústredená v konfigurácii.

**Pre juniora:** Mock a skutočný server majú rovnaký kontrakt, preto sa nemení logika obrazoviek. Ak sa tvary odpovedí líšia, opraví sa server alebo kontrakt, nie obchádzka v UI.

## B11 – Záverečná kvalita a bezpečnosť

**Čo sa urobí:** Skontrolujú sa autorizácie, vlastníctvo zdrojov, validácie, SQL dotazy, escapovanie, relácie, chybové odpovede a mobilné správanie. Vykonajú sa primerané manuálne kontroly API a rozhrania.

**Výstupy:** Opravené chyby a kontrolný zoznam toho, čo bolo overené.

**Pre juniora:** Bezpečnostná chyba môže vzniknúť aj v jedinom zabudnutom endpointe. Kontrola preto prejde každý typ zdroja a overí, že jeden používateľ nemôže čítať ani meniť dáta druhého.

## B12 – Dokumentácia a odovzdanie

**Čo sa urobí:** README doplní požiadavky, inštaláciu, nastavenie databázy bez zdieľania tajomstiev, spustenie, ukážkové účty, API príklady a známe obmedzenia. Pripraví sa verzia `v1.0.0`.

**Výstupy:** Reprodukovateľný návod na spustenie, zdokumentovaný API kontrakt a označené vydanie.

**Pre juniora:** Projekt je dokončený až vtedy, keď ho vie spustiť aj ďalší človek. Návod zároveň odhalí chýbajúci krok, ktorý autor mohol mať iba vo svojej hlave.

## Záverečné kritérium dokončenia

Aplikácia je pripravená na odovzdanie, keď používateľ vie vytvoriť účet, prihlásiť sa, spravovať projekty a úlohy, označiť ich ako hotové, použiť kalendár a nastavenia a zobraziť slovenské aj české rozhranie; údaje sa po obnovení stránky zachovajú v MySQL. Backend overuje prístup a vstupy, citlivé údaje nie sú v Gite a dokumentácia umožňuje projekt spustiť na novom vývojárskom prostredí.



# Podrobný pracovný rozpis

V každom kroku najprv skontroluj, či výstupy predchádzajúceho kroku existujú a fungujú. „Dokončené“ znamená, že sú hotové položky v zozname nižšie, zmena sa dá predviesť a v Gite je iba táto fáza. Názvy priečinkov sú cieľová štruktúra z podkladového dokumentu; ak sa štruktúra projektu zmení, uprav aj README a tento plán.

## F1 – Príprava repozitára: podúlohy a kontrola

1. Skontrolovať aktuálny Git stav a zachovať existujúce súbory; porovnať pôvodné knižnice v `trash/assets/` s aktívnymi súbormi v `public/assets/vendor/`.
2. Navrhnúť cieľové priečinky `public/`, `public/api/`, `includes/`, `config/`, `db/` a `docs/`; zdokumentovať, čo bude verejne dostupné cez webserver.
3. Pripraviť `.gitignore` pre tajnú konfiguráciu, logy a IDE súbory a `README.md` s účelom projektu.
4. Založiť vstupnú stránku, aplikačné CSS/JS a logo; vybrať lokálne verzie Bootstrapu, jQuery a FullCalendar a zapísať pôvod/verziu.
5. Spustiť PHP server na verejnom priečinku a otvoriť stránku v prehliadači.

**Kontrola:** stránka sa načíta, konzola nemá chybu chýbajúceho súboru, `git status` neukazuje tajomstvá. Výstup je minimálna spustiteľná kostra.

## F2 – API kontrakt: podúlohy a kontrola

1. Zoznam všetkých endpointov z podkladového dokumentu: autentifikácia, profil, projekty, úlohy, dokončenie a komentáre.
2. Pre každý endpoint zapísať metódu, cestu, vyžadované prihlásenie, JSON vstup, úspešný stav/odpoveď a chyby.
3. Ustáliť spoločnú obálku `data` a `error`, typy a formát dátumov; zapísať limity Standard/Premium.
4. Vytvoriť Postman kolekciu s úspešnými aj chybovými príkladmi a mock server. Mock URL a prípadný kľúč nastaviť tak, aby tajný kľúč nebol v Gite.
5. Poslať vzorový dopyt z Postmanu a overiť, že odpoveď sa zhoduje s dokumentáciou.

**Kontrola:** iný vývojár vie z `docs/api.md` zostaviť jednu požiadavku bez ústneho vysvetľovania. Výstup je zmluva, na ktorej sa budú zakladať F4–F13 a B3–B9.

## F3 – HTML a vzhľad: podúlohy a kontrola

1. Z prototypu vybrať finálne prvky: horná lišta, navigačné menu, obsah, FAB, panel úlohy/projektu/profilu, toast a prihlasovacie obrazovky.
2. Vytvoriť sémantické HTML kontajnery a stabilné selektory pre JS; texty označiť prekladovými kľúčmi.
3. Presunúť a zlúčiť štýly do `app.css`; odstrániť duplicitné definície prototypu, zachovať svetlú/tmavú tému.
4. Načítať Bootstrap pred vlastným CSS. Použiť Bootstrap pre mriežku/formuláre a vlastné štýly pre vzhľad wireframe.
5. Pridať popisky formulárov, prístupné názvy ikonových tlačidiel, fokusové štýly a dostatočné dotykové plochy.
6. Skontrolovať rozloženie pri 320, 360, 768 a desktopovej šírke; porovnať so wireframe.

**Kontrola:** bez horizontálneho posuvu na malom mobile, všetky ovládacie prvky majú viditeľný fokus a významné prvky sú prístupné bez myši. Výstup je statický, ale vizuálne ucelený frontend.

## F4 – JavaScript jadro a mock: podúlohy a kontrola

1. Vytvoriť `config.js` s `apiBase` a oddeliť ho od `app.js`, aby sa mock dal neskôr vymeniť za PHP API.
2. V `app.js` pripraviť moduly pre API, stav, navigáciu, i18n, UI a pohľady; neprepĺňať HTML inline skriptmi.
3. Implementovať spoločnú funkciu API volania: JSON hlavičky/telo, úspešná odpoveď, normalizácia chyby a mock hlavička.
4. Implementovať hash navigáciu, ochranu proti zastaranej odpovedi, toast a otváranie/zatváranie panelov vrátane Escape.
5. Pripraviť dátumové pomocné funkcie používajúce lokálny dátum, nie UTC prevod, ktorý môže posunúť deň.
6. Vyskúšať úspešnú aj 401 odpoveď z Postmanu a zmenu obrazovky cez hash.

**Kontrola:** mock je dostupný z lokálneho webu bez CORS chyby; chyba API sa zobrazí kontrolovane a nevymaže aplikáciu. Výstup je funkčné technické jadro.

## F5 – Prihlásenie a registrácia: podúlohy a kontrola

1. Vytvoriť obrazovky `#login` a `#register` s prístupnými labelmi, správnymi typmi polí a odkazmi medzi obrazovkami.
2. Validovať e-mail, meno 1–60 znakov, heslo aspoň 8 znakov a zhodu potvrdenia; pri chybe označiť príslušné pole.
3. Napájať odoslanie na auth endpointy; tlačidlo počas požiadavky deaktivovať a zobraziť stav odosielania.
4. Pri štarte načítať aktuálneho používateľa; neprihláseného presmerovať na login a prihláseného do aplikácie.
5. Ošetriť odhlásenie, duplicitný e-mail, neplatné údaje a všeobecnú chybu zlých prihlasovacích údajov.
6. Jasne uviesť, že reset hesla nie je k dispozícii.

**Kontrola:** vyskúšať platné/neplatné údaje, duplicitný e-mail, obnovenie stránky a odhlásenie. Výstup je kompletný prihlasovací tok nad mockom.

## F6 – Profil a avatar: podúlohy a kontrola

1. Odvodiť iniciály z mena vrátane diakritiky a jednoslovného mena; zobraziť ich v prístupne pomenovanom avatare.
2. Zobraziť korunu a textový údaj Premium iba pri pláne premium.
3. V profilovom paneli doplniť úpravu mena, zmenu hesla a zobrazenie pravidiel plánu.
4. Odosielať aktualizácie na príslušné API endpointy; chyby viazať na konkrétne polia a po úspechu aktualizovať avatar.
5. Demo prepnutie plánu sprístupniť len pri mock/demo konfigurácii.

**Kontrola:** overiť iniciály pre viac mien, Premium/Standard stav, nesprávne aktuálne heslo a prázdne polia zmeny hesla. Výstup je profil bez potreby profilových fotografií.

## F7 – Zoznam úloh: podúlohy a kontrola

1. Vytvoriť znovupoužiteľné vykreslenie úlohy s názvom, popisom, projektom, termínom, prioritou a checkboxom.
2. Prioritu komunikovať farbou aj textom/aria-label; po termíne zobraziť zrozumiteľné upozornenie.
3. Načítať úlohy z API, rozdeliť otvorené a hotové a zobraziť počet hotových.
4. Pripraviť spinner, prázdny stav, chybu načítania a opakovanie načítania.
5. Vkladať používateľské názvy ako text; náhľad popisu previesť na čistý text.
6. Pripraviť otvorenie detailu úlohy z kliknutia na jej obsah bez zachytenia kliknutia checkboxu.

**Kontrola:** ukážkové úlohy majú správnu prioritu, hotové sú odlíšené a názov obsahujúci `<b>` sa zobrazí doslova. Výstup je hlavný zoznam.

## F8 – Formulár úlohy: podúlohy a kontrola

1. Navrhnúť jeden panel formulára pre create/edit; pri create predvyplniť dnešný dátum a predvolený projekt.
2. Pridať názov s limitom, štyri úrovne priority, projekt, termín a editor popisu s tučným/kurzívnym/zoznamom.
3. Pri paste vkladať čistý text; pred odoslaním povoliť v popise iba dohodnuté HTML značky a zrušiť atribúty.
4. Pri editácii predvyplniť hodnoty a ponúknuť zmazanie s potvrdením priamo v paneli.
5. Zobrazovať 422 chyby pri poliach; počas ukladania blokovať opakované odoslanie.
6. Po úspechu zavrieť panel, obnoviť relevantný pohľad a zobraziť toast; pri Escape obnoviť fokus na otvárajúci prvok.

**Kontrola:** create/edit/delete, prázdny názov, sanitizácia vloženého scriptu, návrat fokusu. Výstup je celý životný cyklus úlohy na fronte.

## F9 – Dokončenie úlohy: podúlohy a kontrola

1. Obsluhovať checkbox delegovanou udalosťou, aby rovnaké správanie platilo aj pre dynamicky vykreslené úlohy.
2. Okamžite upraviť vzhľad a poslať POST `/complete` alebo `/uncomplete` podľa nového stavu.
3. Pri chybe vrátiť checkbox aj dekoráciu do pôvodného stavu a oznámiť chybu.
4. Nedovoliť kliknutiu na checkbox otvoriť editor; po úspechu aktualizovať počty, ale nepresúvať položku nečakane.

**Kontrola:** v Network paneli vidieť správnu akciu; simulovaná chyba vráti stav späť. Výstup je spoľahlivé okamžité zaškrtnutie.

## F10 – Projekty: podúlohy a kontrola

1. Vytvoriť zoznam projektových kariet s ikonou, farbou, opisom, počtami a pokrokom.
2. Vytvoriť detail projektu s otvorenými a hotovými úlohami a cestou späť.
3. Vytvoriť formulár projektu (názov, popis, ikona), automatický výber farby a úpravu existujúceho projektu.
4. Pri mazani projektu ukázať počet ovplyvnených úloh a vyžadovať potvrdenie; posledný projekt nemožno zmazať.
5. Zobraziť limit 3 projektov pri Standard a demo upgrade tlačidlo len v mock režime.
6. Po každej zmene obnoviť počty a zoznamy, ktoré závisia od projektu.

**Kontrola:** create/edit/delete, zákaz zmazania posledného projektu, limit a zrozumiteľné hlášky. Výstup je správa projektov.

## F11 – Komentáre: podúlohy a kontrola

1. V detaile úlohy načítať komentáre ako plochý zoznam a vykresliť strom podľa parent ID.
2. Zobraziť autora, dátum, text a odpoveď; umožniť mazanie len tam, kde `can_delete` povoľuje.
3. Počítať odsadenie vizuálne a zastaviť odpoveď na maximálnej hĺbke päť.
4. Pri Standard zobraziť vysvetlenie a prémiový zámok; pri Premium umožniť pridanie komentára.
5. Pri mazaní rodiča oznámiť, že sa odstránia aj odpovede.

**Kontrola:** hlboké vlákno ostáva čitateľné na mobile, hĺbka 5 nepovolí ďalšiu odpoveď, Standard nevytvorí komentár. Výstup je komentárová funkcia vo fronte.

## F12 – Kalendár, hotové, štatistiky: podúlohy a kontrola

1. Pripojiť FullCalendar a nastaviť lokalizáciu, navigáciu a vzhľad pre svetlú/tmavú tému.
2. Načítať úlohy pre viditeľný rozsah; farbu udalosti odvodiť z projektu a zobraziť viac úloh jedného dňa čitateľne.
3. Po kliknutí na deň zobraziť jeho úlohy a umožniť otvoriť ich detail.
4. Vytvoriť pohľad hotových úloh vrátane hromadného mazania s potvrdením.
5. Vytvoriť štatistiky dokončených/otvorených úloh a priebehu projektov z dostupných dát.
6. Zachovať dátum ako ISO dátum bez náhodnej konverzie cez UTC.

**Kontrola:** zmena mesiaca, výber dňa, udalosť na správnom dátume, hotový stav a prázdny kalendár. Výstupom sú tri funkčné pohľady.

## F13 – Notifikácie, nastavenia, SK/CS: podúlohy a kontrola

1. Rozšíriť slovník o všetky texty aplikácie v slovenčine a češtine; pri chýbajúcom kľúči mať bezpečný fallback.
2. Prepínať jazyk bez obnovenia stránky a uložiť preferenciu lokálne.
3. Overiť prepnutie svetlej/tmavej/automatickej témy a uloženie voľby, ktoré bolo na žiadosť používateľa implementované pred F7.
4. Zobraziť zvonček s počtom upozornení a panelom úloh po termíne alebo na dnes.
5. Aktualizovať dnešný dátum a notifikácie po polnoci, ak aplikácia zostane otvorená.

**Kontrola:** prejsť hlavné obrazovky v oboch jazykoch a témach; skontrolovať, že nezostali nepreložené texty ani nečitateľné kontrasty. Výstupom sú dokončené osobné nastavenia.

## F14 – Kontrola a frontend demo: podúlohy a kontrola

1. Prejsť auth, úlohy, projekty, komentáre, kalendár, štatistiky, nastavenia a chybové stavy podľa scenárov.
2. Skontrolovať šírky 320/360 px a desktop; ovládanie klávesnicou, fokus, popisky a kontrast.
3. Skontrolovať konzolu, sieťové chyby, načítanie pomalého spojenia a stav bez dát.
4. Opraviť nájdené chyby; zapísať známe obmedzenia bezstavového mocku a nastavenie mock URL.
5. Skontrolovať staged diff, vytvoriť commit kroku a pushnúť ho; označiť demo verziu.

**Kontrola:** nový používateľ vie ukážku otvoriť podľa README a prejsť hlavné toky. Výstupom je stabilný frontend pred backendom.

## B1 – MySQL schéma a seed: podúlohy a kontrola

1. Navrhnúť tabuľky používateľov, projektov, úloh a komentárov s väzbami, unikátnosťou a mazacími pravidlami.
2. Určiť typy, dĺžky, časové údaje, indexy a obmedzenia pre prioritu a stavy podľa API kontraktu.
3. Vytvoriť opakovateľný SQL súbor schémy a seed skript, ktorý vygeneruje heslá cez `password_hash`.
4. Pridať `config.example.php`; ignorovať skutočnú konfiguráciu a neskrývať heslo do SQL/README.
5. Vytvoriť databázu a vložiť ukážkové účty, projekty, úlohy a komentáre.

**Kontrola:** databázu možno vytvoriť od začiatku a seed spustiť; väzby a limity zodpovedajú kontraktu. Výstupom je lokálne opakovateľné dátové prostredie.

## B2 – PHP spoločné funkcie: podúlohy a kontrola

1. Pripraviť PDO spojenie s výnimkami a znakovou sadou `utf8mb4`.
2. Vytvoriť funkcie na JSON úspech/chybu, HTTP stavové kódy a čítanie/overenie JSON tela.
3. Vytvoriť validátory pre meno, e-mail, heslo, dátum, prioritu a identifikátory.
4. Pripraviť escapovanie pre HTML výstup a sanitizáciu povoleného formátovaného popisu.
5. Centralizovať kontrolu plánu a pravidiel; chyby logovať serverovo bez zobrazenia citlivých detailov klientovi.

**Kontrola:** pomocné funkcie vracajú konzistentné odpovede; SQL používa pripravené príkazy. Výstupom je základ, ktorý endpointy znovu používajú.

## B3 – Router a relácie: podúlohy a kontrola

1. Nastaviť webserver tak, aby verejný koreňom bol `public/`, nie celý repozitár.
2. Vytvoriť jediný API vstupný bod a routovanie podľa HTTP metódy/cesty bez frameworku.
3. Ošetriť OPTIONS/CORS podľa reálneho umiestnenia frontendu, JSON content type a nepodporované metódy.
4. Nastaviť bezpečné session cookie atribúty a ochranu zápisov proti CSRF/cudziemu originu podľa kontraktu.
5. Implementovať `GET /api/me`, 404, 405 a jednotné zachytenie chýb.

**Kontrola:** anonymné volanie dostane predvídateľný JSON a neexistujúca cesta správny stav; technická chyba neodhalí stack trace. Výstupom je API kostra.

## B4 – Autentifikácia a profil: podúlohy a kontrola

1. Implementovať registráciu s unikátnym e-mailom, validáciou, hashovaním hesla a vytvorením predvoleného projektu.
2. Implementovať prihlásenie cez `password_verify`, všeobecnú chybu pre neplatné údaje a regeneráciu session ID.
3. Implementovať odhlásenie a zneplatnenie session.
4. Implementovať načítanie a zmenu profilu; zmenu hesla vyžadujúcu súčasné heslo.
5. Nastaviť cookie relácie a CSRF/origin ochranu tak, aby sedela s frontend požiadavkami.

**Kontrola:** opakovaná registrácia sa odmietne, session po odhlásení neplatí, heslo nie je čitateľné v DB. Výstupom je serverová identita používateľa.

## B5 – Projekty API: podúlohy a kontrola

1. Implementovať zoznam projektov s počtom úloh a hotových úloh.
2. Implementovať detail, vytvorenie, úpravu a zmazanie projektu podľa kontraktu.
3. Pri každom dotaze obmedziť projekt na vlastníka aktuálnej session.
4. Vytvorenie štandardného plánu obmedziť na tri projekty; limit chrániť aj pri súbežných požiadavkách.
5. Zakázať zmazanie posledného projektu a riešiť zmazanie jeho úloh v transakcii.

**Kontrola:** používateľ A nemôže čítať/upravovať projekt B; limit a posledný projekt vracajú určené chyby. Výstupom sú bezpečné projektové endpointy.

## B6 – Čítanie úloh: podúlohy a kontrola

1. Implementovať zoznam úloh s filtrami project/date/from/to/done podľa API kontraktu.
2. Implementovať detail úlohy s detailmi projektu a vlastníctva.
3. Používať len parametrizované SQL; dynamické časti dotazu vyberať z pevného zoznamu povolených filtrov.
4. Overovať formát a rozsah dátumov a vracať jednotný 400/422 podľa kontraktu.
5. Zabezpečiť stránkovanie alebo rozumný limit výsledkov, ak ho kontrakt definuje.

**Kontrola:** kombinované filtre vracajú očakávané výsledky a cudzí záznam vyzerá ako nenájdený. Výstupom sú GET endpointy.

## B7 – Zápis úloh: podúlohy a kontrola

1. Implementovať vytvorenie úlohy a overiť, že cieľový projekt patrí používateľovi.
2. Implementovať čiastočnú aktualizáciu s povolenými poľami; stav dokončenia sa mení iba akčnými endpointmi.
3. Implementovať zmazanie úlohy vrátane správania súvisiacich komentárov.
4. Validovať dĺžku názvu/popisu, prioritu a ISO dátum; sanitizovať HTML popisu na serveri.
5. V transakcii zmeniť súvisiace dáta, ak je to potrebné; odpovedať presnými stavmi 201/200/204/422.

**Kontrola:** priame API volanie s chybnými dátami nič nezapíše; SQL injection text sa uloží ako obyčajný údaj. Výstupom sú trvalé operácie úloh.

## B8 – Dokončenie úloh: podúlohy a kontrola

1. Implementovať `/complete` a `/uncomplete` ako idempotentné akcie s kontrolou vlastníctva.
2. Nechať server nastaviť/odstrániť `completed_at` podľa stavu.
3. Implementovať mazanie všetkých hotových úloh bezpečne pre daného používateľa.
4. Vrátiť počet zmazaných záznamov a zachovať správne HTTP kódy.

**Kontrola:** opakované volanie nemení výsledok nečakane; používateľ neovplyvní cudzie úlohy. Výstupom sú stavové akcie a hromadné mazanie.

## B9 – Komentáre API: podúlohy a kontrola

1. Načítať plochý zoznam komentárov iba k úlohe vlastnenému používateľom.
2. Pri vytvorení overiť Premium plán, text, rodiča a vzťah rodiča k tej istej úlohe.
3. Hĺbku odvodiť na serveri a odmietnuť odpoveď nad limitom; klientom dodané `depth` ignorovať.
4. Pri zmazaní overiť autora; odstrániť potomkov podľa dohodnutého FK/kaskády.
5. Vrátiť `can_delete`, autora a potrebné časové údaje podľa kontraktu.

**Kontrola:** Standard dostane 403, cudzí komentár sa neodhalí, hĺbka nad limitom sa odmietne. Výstupom je Premium API.

## B10 – Prepnutie mocku na PHP: podúlohy a kontrola

1. Nastaviť `apiBase` na lokálny PHP server bez zmeny view logiky.
2. Overiť prihlasovanie, profil, projekty, všetky operácie úloh, komentáre a filtre oproti rovnakým príkladom z F2.
3. Skontrolovať cookie/session pri AJAX požiadavkách, CORS a CSRF/origin hlavičky.
4. Otestovať obnovu stránky a overiť, že dáta prežijú, pretože sú v MySQL.
5. Zaznamenať každý rozdiel kontraktu a opraviť jeho správnu stranu.

**Kontrola:** aplikácia funguje s reálnym API a Postman už nie je potrebný na bežný chod. Výstupom je integrovaná verzia.

## B11 – Finálna kontrola: podúlohy a kontrola

1. Vytvoriť kontrolný zoznam pre anonymného, Standard a Premium používateľa.
2. Skúsiť prístup ku cudzím ID, chýbajúcu session, chybné JSON, SQL/XSS vstupy a hranice validácií.
3. Skontrolovať cookie, origin/CSRF, správne HTTP kódy, únik chýb a prázdne/veľké zoznamy.
4. Prejsť frontend na mobile a klávesnicou, oba jazyky a témy.
5. Opraviť chyby a zdokumentovať scenáre, ktoré boli reálne vykonané; neuvádzať neoverené veci ako otestované.

**Kontrola:** každý endpoint má pokrytý úspech, neprihlásený prístup a relevantnú chybu. Výstupom je záznam kvality a opravený produkt.

## B12 – Dokumentácia a vydanie: podúlohy a kontrola

1. Napísať čistý návod na požiadavky, klonovanie, konfiguráciu PHP/MySQL, import schémy a seed, spustenie.
2. Pridať bezpečné príklady API požiadaviek bez reálnych tajomstiev a uviesť demo účty len ak sú určené pre lokálne dáta.
3. Zdokumentovať jazyk, obmedzenia, reset hesla mimo rozsahu a demo plán.
4. Overiť návod v čerstvom pracovnom priečinku alebo podľa neho krok za krokom.
5. Skontrolovať stav a diff, vytvoriť commit, označiť `v1.0.0` a pushnúť tag.

**Kontrola:** nový vývojár vie spustiť aplikáciu bez súkromných pokynov. Výstupom je reprodukovateľné odovzdanie.

## Vzťahy medzi hlavnými výstupmi

| Výstup | Používa ho | Prečo je potrebný |
|---|---|---|
| `docs/api.md` | Frontend F4–F13, backend B3–B9 | Určuje rovnaký tvar požiadaviek a odpovedí |
| Postman kolekcia/mock | Frontend F4–F14 | Umožňuje vyvíjať a predvádzať UI pred backendom |
| `public/index.html`, CSS, JS | Fáza frontend, potom B10 | Používateľské rozhranie a jeho správanie |
| MySQL schéma a seed | B2–B9 | Trvalé dáta a opakovateľné lokálne prostredie |
| PHP API | B3–B10 | Bezpečná vrstva medzi prehliadačom a databázou |
| README | F1 a B12 | Umožní projekt nainštalovať a odovzdať |

## Slovník pre junior vývojára

- **REST API:** adresy na serveri, ktoré prijímajú HTTP požiadavky a vracajú dáta.
- **JSON:** textový formát na prenos objektov, napríklad úlohy, medzi JavaScriptom a PHP.
- **Endpoint:** konkrétna cesta a metóda API, napríklad `GET /api/tasks`.
- **Mock server:** náhradný server s pripravenými odpoveďami; v tomto projekte neukladá zmeny.
- **Validácia:** kontrola, či vstup spĺňa pravidlá (napríklad názov úlohy nie je prázdny).
- **Sanitizácia:** odstránenie nebezpečných častí vstupu pred jeho použitím alebo zobrazením.
- **Parametrizovaný SQL dotaz:** databázový príkaz, v ktorom sa používateľské hodnoty odovzdávajú oddelene od SQL textu.
- **Relácia (session):** serverový spôsob, ako si pamätať prihláseného používateľa medzi požiadavkami.
- **Optimistické rozhranie:** zmena UI sa ukáže hneď; ak server zlyhá, UI sa vráti späť.
- **Commit:** pomenovaný záznam dokončenej zmeny v Gite; pri tomto projekte sa každý plánový krok ukladá samostatne.

