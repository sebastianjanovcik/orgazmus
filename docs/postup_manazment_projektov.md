# Postup vývoja: správa projektov a členov

Tento dokument rozširuje hlavný [plán vývoja aplikácie](plan_vyvoja.md) o spoluprácu viacerých používateľov na jednom projekte. Postupuje v rovnakom poradí ako hlavný plán: najprv sa pripraví frontend nad Postman mockom, potom dátový model a PHP API. Rozhranie používa API kontrakt z hlavného plánu; backend ho následne potvrdí a implementuje. Pred začiatkom treba skontrolovať aktuálnu schému, API kontrakt a stav príslušných krokov F a B.

## Cieľ

Vlastník projektu môže pozvať používateľov, priradiť im projektovú rolu a samostatne určiť, či môžu spravovať úlohy. Jednotlivú úlohu možno zdieľať aj samostatne s používateľom, ktorý nemá prístup k celému projektu. Pozvaný používateľ musí pozvánku prijať. Členovia a príjemcovia zdieľania vidia obsah podľa svojich oprávnení, zmeny sa zaznamenávajú a notifikácie možno prečítať v spoločnom paneli.

## Pravidlá a pojmy

- **Vlastník** má plnú správu projektu, členov, pozvánok a nastavení. Vlastníctvo môže odovzdať inému existujúcemu používateľovi. Autor projektu, ktorý už vlastníctvo nemá, môže navrhnúť jeho zmenu iba vtedy, ak je stále členom s oprávnením na správu členov; potvrdenie vykoná súčasný vlastník. Po prevode sa nový vlastník stane vlastníkom a predchádzajúci vlastník dostane rolu a oprávnenia určené pri prevode.
- **Náhľad** povoľuje čítať projekt a jeho úlohy.
- **Komentár** povoľuje náhľad a pridávanie komentárov a reakcií, ak má používateľ Premium.
- **Editor** povoľuje náhľad a úpravy projektových údajov a úloh v rozsahu ďalšieho oprávnenia k úlohám.
- **Oprávnenie k úlohám** sa nastavuje každému členovi samostatne: „Spravovať úlohy“ povoľuje vytvárať, meniť a mazať úlohy; „Iba náhľad úloh“ povoľuje ich čítanie. Toto oprávnenie nemôže rozšíriť projektovú rolu: rola Náhľad zostáva iba na čítanie a Komentár neudeľuje úpravy úloh. Vlastník má vždy plné oprávnenia.
- **Samostatné zdieľanie úlohy** udeľuje prístup iba ku konkrétnej úlohe a jej komentárom; samo osebe nezakladá členstvo v projekte ani prístup k projektu, jeho ďalším úlohám či nastaveniam. Roly zdieľania sú nezávislé od projektových rolí: **Vlastník** spravuje zdieľanie a má plnú kontrolu nad úlohou, **Divák** môže zobraziť stav úlohy a komentáre a **Editor** môže upravovať úlohu, meniť jej stav vrátane odškrtnutia a pridávať komentáre. Komentovanie naďalej podlieha pravidlu Premium uvedenému nižšie. Vlastník projektu si zachováva prístup podľa svojej projektovej roly; zdieľanie konkrétnej úlohy nemení projektové oprávnenia.
- Príjemca samostatného zdieľania musí byť identifikovaný konkrétnym účtom a zdieľanie musí byť aktívne, aby mohol úlohu otvoriť. Vlastník úlohy môže prístup zmeniť alebo odobrať; odobratý príjemca už nesmie čítať úlohu ani komentáre. Pri kombinácii projektového členstva a samostatného zdieľania sa uplatní najvyššie oprávnenie, ktoré používateľ získava z platného prístupu; odobratie jedného prístupu nezruší druhý.
- **Premium sa kontroluje podľa účtu konajúceho používateľa**. Člen bez Premium môže prezerať komentáre a reakcie, ale nemôže ich pridávať ani meniť; túto kontrolu vynucuje server aj pri priamom volaní API. Rovnaké pravidlo platí pre vlastníka bez Premium po prevode projektu.
- Pozvánka má stav **pending**, kým ju príjemca neprijme alebo neodmietne. Samotné odoslanie pozvánky nepridáva príjemcu medzi členov a neudeľuje mu prístup k projektu. Prijatie vytvorí členstvo podľa pozvánky; odmietnutie alebo odvolanie pozvánky prístup nevytvorí.
- Pri načítaní panela notifikácií sa ako prečítané označia iba notifikácie, ktoré boli v danom otvorenom paneli skutočne zobrazené. Oznámenia doručené neskôr alebo mimo načítanej stránky zostanú neprečítané.
- Auditný záznam je append-only: členovia ho môžu čítať podľa prístupu k projektu, no bežné API neposkytuje jeho úpravu ani mazanie.

## Fáza A – Frontend nad Postman mockom

Fázu A vykonávať po malých prírastkoch. Pri každom prírastku najprv doplniť iba jeho rozsah do príslušného frontendového kroku F v `docs/plan_vyvoja.md`, potom tento rozsah implementovať a overiť proti Postman mocku. Nepridávať všetky požiadavky fázy A do hlavného plánu naraz. Ďalší prírastok zapísať do plánu až po dokončení predchádzajúceho.

### A1 – Zoznam členov projektu

- **Rozšírenie plánu:** doplniť do F10 zobrazenie členov projektu, ich rolí, oprávnenia k úlohám a stavu členstva.
- **Práca:** vytvoriť sekciu členov v detaile projektu vrátane načítania, prázdneho a chybového stavu.
- **Dokončené, keď:** zoznam sa správne zobrazí z mock dát na mobile aj desktope a dá sa ovládať klávesnicou.

### A2 – Odoslanie a stav pozvánky

- **Rozšírenie plánu:** doplniť do F10 formulár pozvania s výberom účtu alebo e-mailu, roly a oprávnenia k úlohám; do F13 zobrazenie čakajúcej pozvánky.
- **Práca:** vytvoriť formulár a stav pozvánky nad mock odpoveďami. Vysvetliť, že členstvo vznikne až po prijatí.
- **Dokončené, keď:** pozvánku možno odoslať v UI a jej čakajúci stav je zrozumiteľný.

### A3 – Prijatie pozvánky a správa členov

- **Rozšírenie plánu:** doplniť do F13 prijatie a odmietnutie pozvánky z notifikácie; do F10 zmenu roly, oprávnenia a odobratie člena.
- **Práca:** implementovať iba tieto akcie a ich stavy nad mockom.
- **Dokončené, keď:** používateľ vidí výsledok prijatia/odmietnutia a oprávnené ovládacie prvky správy členov.

### A4 – Prevod vlastníctva

- **Rozšírenie plánu:** doplniť do F10 odovzdanie vlastníctva vrátane jasného zhrnutia dôsledkov a jedného potvrdenia.
- **Práca:** vytvoriť samostatný potvrdzovací tok nad mock odpoveďami.
- **Dokončené, keď:** pred potvrdením sú zobrazené dôsledky a po odpovedi mocku je zobrazený nový stav vlastníctva.

### A5 – Rozhranie podľa oprávnení

- **Rozšírenie plánu:** doplniť do relevantných krokov F7–F10, ako sa podľa roly a oprávnenia zobrazujú alebo zakazujú akcie pri projekte a úlohách.
- **Práca:** skryť alebo zakázať nepovolené ovládacie prvky a zobraziť zrozumiteľnú správu pri odpovedi `403`; rozhodnutie servera zostáva autoritatívne.
- **Dokončené, keď:** scenáre vlastníka, editora, komentujúceho a diváka majú konzistentné ovládanie vrátane chybovej odpovede.

### A6 – Notifikácie a história zmien

- **Rozšírenie plánu:** doplniť do F13 panel kategorizovaných notifikácií a označovanie iba skutočne zobrazených položiek; históriu zmien zaradiť do F10 alebo F13 podľa umiestnenia v rozhraní.
- **Práca:** vytvoriť panel a históriu s načítavaním, prázdnym stavom a stránkovaním podľa mock dát.
- **Dokončené, keď:** panel zobrazuje kategórie a stav prečítania bez označenia nenačítaných notifikácií.

### A7 – Samostatné zdieľanie úlohy

- **Rozšírenie plánu:** doplniť do F8 správu príjemcov samostatného zdieľania úlohy a správanie rolí Divák a Editor.
- **Práca:** pridať ovládanie zdieľania v detaile úlohy a varianty zobrazenia podľa roly.
- **Dokončené, keď:** divák nemá úpravy a editor vidí iba akcie povolené jeho rolou.

### A8 – Komentáre a Premium

- **Rozšírenie plánu:** doplniť do F11 čitateľnosť komentárov bez Premium a obmedzenie ich pridávania; uviesť, že rovnaké pravidlo platí pre komentovanie pri samostatne zdieľanej úlohe.
- **Práca:** zobraziť komentáre podľa oprávnenia a zrozumiteľné vysvetlenie obmedzenia pre účet bez Premium.
- **Dokončené, keď:** komentáre zostanú čitateľné a ovládanie pridania zodpovedá plánu účtu.

Pri každom A1–A8 najprv skontrolovať príslušné predpoklady v hlavnom pláne a mock kontrakte. Po dokončení prírastku overiť jeho používateľský tok, skontrolovať `git status` a diff a podľa projektových pravidiel samostatne commitnúť a pushnúť zmenu. Zvyšné prírastky fázy A neimplementovať ani nepridávať do hlavného plánu vopred.

**Výstup fázy:** Spolupráca sa dopĺňa do frontendu po overiteľných, samostatných prírastkoch; každý prírastok je zaznamenaný v hlavnom pláne a dokončený pred začiatkom ďalšieho.

## Fáza B – Backend: dátový model a API kontrakt

1. Rozšíriť `docs/api.md` o členstvo v projekte, pozvánky, roly, oprávnenie k úlohám, prevod vlastníctva, auditné udalosti, notifikácie a reakcie.
2. Navrhnúť väzobnú tabuľku členov projektu s používateľom, rolou, oprávnením k úlohám, stavom a časmi vytvorenia/aktualizácie. Vlastníka evidovať jednoznačne; nepridávať druhú nezávislú autoritatívnu informáciu o vlastníkovi.
3. Navrhnúť pozvánky s projektom, pozývajúcim, pozvaným používateľom alebo e-mailom, udelenou rolou a oprávnením, bezpečným náhodným tokenom, stavom, platnosťou a časmi prijatia/odmietnutia/odvolania. Token ukladať ako hash.
4. Navrhnúť auditné záznamy s projektom, aktérom, typom udalosti, cieľovým objektom, časom a bezpečným súhrnom zmien. Nezaznamenávať heslá, tokeny ani nepotrebný citlivý obsah.
5. Navrhnúť notifikácie viazané na príjemcu a voliteľne projekt/objekt, s typom, stručným obsahom, odkazom na cieľ a `read_at`. Typy pokryjú komentáre, zmeny, reakcie, úlohy a pozvánky.
6. Určiť databázové obmedzenia: unikátne členstvo používateľa v projekte, indexy pre čakajúce pozvánky, audit podľa projektu/času a notifikácie podľa príjemcu/stavu/času. Zmeny vlastníka a členstva vykonávať v transakcii.
7. Doplniť API cesty a odpovede pre zoznam členov, odoslanie/zmenu/odobratie člena, prijatie/odmietnutie/odvolanie pozvánky, prevod vlastníctva, načítanie auditu, načítanie notifikácií a označenie zobrazených notifikácií ako prečítaných.
8. Doplniť kontrakt zdieľania samostatnej úlohy: príjemca, rola Vlastník/Divák/Editor, stav a časy udelenia či odobratia. Určiť operácie na udelenie, zmenu a odobratie prístupu a odpovede na čítanie stavu, komentárov a úpravy úlohy; výslovne uviesť, že tento prístup neposkytuje prístup k projektu ani iným úlohám.

**Výstup:** Schéma a API kontrakt určujú jednoznačne, kto môže čo urobiť a aké stavy sa vracajú.

## Fáza C – Backend: serverové oprávnenia a operácie

1. Vytvoriť spoločnú serverovú kontrolu prístupu, ktorá pri každej operácii načíta členstvo a rolu z databázy. Nikdy nedôverovať role ani oprávneniu zaslanému prehliadačom.
2. Zaviesť pravidlá čítania projektu a úloh pre vlastníka, aktívnych členov a pozvaných čakajúcich používateľov. Používateľ s pending pozvánkou nemá prístup k obsahu projektu.
3. Implementovať vytvorenie a správu pozvánok. Povoliť ich len vlastníkovi alebo členovi s výslovným oprávnením spravovať členov; kontrolovať existujúce členstvo, duplicitné pozvánky, platnosť a odvolanie.
4. Implementovať prijatie a odmietnutie pozvánky prihláseným používateľom, ktorému patrí. Pri prijatí atomicky overiť stav a platnosť a vytvoriť členstvo. Zamedziť prijatiu pozvánky určenej inému účtu.
5. Implementovať zmenu roly a oprávnenia k úlohám a odobratie člena. Vlastníka nemožno odobrať bez dokončeného prevodu; projekt musí mať vždy práve jedného vlastníka.
6. Implementovať prevod vlastníctva s potvrdením súčasného vlastníka a transakčnou aktualizáciou vlastníka a členstiev. Zaznamenať prevod v audite a oznámiť ho obom stranám.
7. V každom endpoint-e úloh kontrolovať súčasne prístup k projektu, projektovú rolu a oprávnenie k úlohám. Pri zamietnutí vrátiť konzistentnú odpoveď `403` bez úniku cudzích údajov.
8. Pre komentáre a reakcie povoľovať čítanie členom s prístupom k úlohe; zápis povoliť len účtu Premium a podľa oprávnení projektu. Premium kontrolovať serverovo pri každej zmene.
9. Všetky významné akcie zapisovať do auditu: pozvanie a jeho stav, zmena člena/role/oprávnenia, odobratie člena, zmena úlohy, komentár/reakcia podľa bezpečne určeného rozsahu a prevod vlastníctva.
10. Vynucovať oprávnenia samostatného zdieľania pri každom endpoint-e úlohy aj komentárov: Divák smie iba čítať stav a komentáre; Editor smie upravovať zdieľanú úlohu, meniť jej stav a pridávať komentáre; vlastník môže zdieľanie spravovať. Overiť, že takýto prístup neumožní načítať projekt ani susedné úlohy a že zmena alebo odobratie zdieľania sa prejaví aj pri priamom volaní API.

**Výstup:** API vynucuje prístupové pravidlá aj bez použitia webového rozhrania.

## Fáza D – Backend: notifikácie a audit

1. Vytvárať notifikáciu pri pozvánke, prijatí/odmietnutí, priradení alebo zmene úlohy, komentári, reakcii a významnej zmene projektu.
2. Zabezpečiť, aby každý používateľ načítal iba svoje notifikácie. Vrátiť ich stránkovane, zoradené od najnovších, spolu s údajom o prečítaní.
3. Pri otvorení panela poslať identifikátory notifikácií, ktoré panel skutočne načítal a zobrazil. Server označí ako prečítané iba tieto záznamy patriace aktuálnemu používateľovi; opakované volanie je bezpečné.
4. Pripraviť stránkovaný výpis auditu projektu s aktérom, časom, typom udalosti a čitateľným súhrnom. Výpis rešpektuje členstvo a neukazuje citlivé údaje.

**Výstup:** Notifikácie majú spoľahlivý stav prečítania a projekt má dohľadateľnú históriu zmien.

## Fáza E – Integrácia, overenie a vydanie

1. Skontrolovať prístupové matice pre vlastníka, editora, rolu Komentár a rolu Náhľad, vždy v kombinácii s oboma oprávneniami k úlohám.
2. Overiť pozvánku odoslanú, čakajúcu, prijatú, odmietnutú, odvolanú, expirovanú aj určenú inému účtu; skontrolovať, že pending používateľ nevidí projekt.
3. Overiť prevod vlastníctva vrátane oprávnení oboch strán, paralelných požiadaviek a zachovania jediného vlastníka.
4. Overiť účet Premium aj bez Premium: komentáre a reakcie sú čitateľné, ale používateľ bez Premium ich nevie vytvoriť ani cez priame API volanie, a to ani po prevode na vlastníka.
5. Overiť notifikácie rôznych typov, viac strán výsledkov a označenie len skutočne zobrazených položiek ako prečítaných.
6. Overiť úplnosť a prístup k auditným udalostiam, odolnosť voči podvrhnutiu ID projektu/člena a absenciu tajomstiev v odpovediach.
7. Skontrolovať mobilné rozloženie, klávesnicu, chybové stavy, skeletony a prázdne stavy. Zapísať, ktoré scenáre boli skutočne overené.
8. Overiť samostatné zdieľanie úlohy pre vlastníka, diváka a editora: čítanie stavu/komentárov, úpravy, odškrtnutie, pridávanie komentárov, zmenu a odobratie prístupu, ako aj zákaz prístupu k projektu a ostatným úlohám. Skontrolovať aj kombináciu s členstvom v projekte a obmedzenie Premium pri komentovaní.

**Výstup:** Spolupráca na projektoch je pripravená na vydanie a jej limity sú zdokumentované.

## Závislosti a poradie

Najprv dokončiť frontend (A) nad Postman mockom a kontraktom pripraveným v kroku F2 hlavného plánu. Potom pokračovať backendom: potvrdiť dátový model a API kontrakt (B), implementovať serverové oprávnenia a operácie (C) a následne notifikácie a audit (D). Po dokončení endpointov frontend integrovať s PHP API a vykonať spoločné overenie (E).

Tieto funkcie nadväzujú najmä na F10/B5 (projekty), F11/B9 (komentáre), F13 (notifikácie), B1 (databáza), B3 (relácie) a B6–B8 (úlohy). Pred implementáciou upraviť príslušné kroky v hlavnom pláne a API kontrakte tak, aby sa rovnaká funkcionalita neimplementovala dvakrát.
