# Postup vývoja: správa projektov a členov

Tento dokument rozširuje hlavný [plán vývoja aplikácie](plan_vyvoja.md) o spoluprácu viacerých používateľov na jednom projekte. Jeho kroky sa majú zapracovať do existujúcich fáz frontendu a PHP API; nenahrádzajú ich. Pred začiatkom implementácie treba skontrolovať aktuálnu schému, API kontrakt a stav príslušných krokov F a B.

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

## Fáza A – Dátový model a API kontrakt

1. Rozšíriť `docs/api.md` o členstvo v projekte, pozvánky, roly, oprávnenie k úlohám, prevod vlastníctva, auditné udalosti, notifikácie a reakcie.
2. Navrhnúť väzobnú tabuľku členov projektu s používateľom, rolou, oprávnením k úlohám, stavom a časmi vytvorenia/aktualizácie. Vlastníka evidovať jednoznačne; nepridávať druhú nezávislú autoritatívnu informáciu o vlastníkovi.
3. Navrhnúť pozvánky s projektom, pozývajúcim, pozvaným používateľom alebo e-mailom, udelenou rolou a oprávnením, bezpečným náhodným tokenom, stavom, platnosťou a časmi prijatia/odmietnutia/odvolania. Token ukladať ako hash.
4. Navrhnúť auditné záznamy s projektom, aktérom, typom udalosti, cieľovým objektom, časom a bezpečným súhrnom zmien. Nezaznamenávať heslá, tokeny ani nepotrebný citlivý obsah.
5. Navrhnúť notifikácie viazané na príjemcu a voliteľne projekt/objekt, s typom, stručným obsahom, odkazom na cieľ a `read_at`. Typy pokryjú komentáre, zmeny, reakcie, úlohy a pozvánky.
6. Určiť databázové obmedzenia: unikátne členstvo používateľa v projekte, indexy pre čakajúce pozvánky, audit podľa projektu/času a notifikácie podľa príjemcu/stavu/času. Zmeny vlastníka a členstva vykonávať v transakcii.
7. Doplniť API cesty a odpovede pre zoznam členov, odoslanie/zmenu/odobratie člena, prijatie/odmietnutie/odvolanie pozvánky, prevod vlastníctva, načítanie auditu, načítanie notifikácií a označenie zobrazených notifikácií ako prečítaných.
8. Doplniť kontrakt zdieľania samostatnej úlohy: príjemca, rola Vlastník/Divák/Editor, stav a časy udelenia či odobratia. Určiť operácie na udelenie, zmenu a odobratie prístupu a odpovede na čítanie stavu, komentárov a úpravy úlohy; výslovne uviesť, že tento prístup neposkytuje prístup k projektu ani iným úlohám.

**Výstup:** Schéma a API kontrakt určujú jednoznačne, kto môže čo urobiť a aké stavy sa vracajú.

## Fáza B – Serverové oprávnenia a operácie

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

## Fáza C – Notifikácie a audit

1. Vytvárať notifikáciu pri pozvánke, prijatí/odmietnutí, priradení alebo zmene úlohy, komentári, reakcii a významnej zmene projektu.
2. Zabezpečiť, aby každý používateľ načítal iba svoje notifikácie. Vrátiť ich stránkovane, zoradené od najnovších, spolu s údajom o prečítaní.
3. Pri otvorení panela poslať identifikátory notifikácií, ktoré panel skutočne načítal a zobrazil. Server označí ako prečítané iba tieto záznamy patriace aktuálnemu používateľovi; opakované volanie je bezpečné.
4. Pripraviť stránkovaný výpis auditu projektu s aktérom, časom, typom udalosti a čitateľným súhrnom. Výpis rešpektuje členstvo a neukazuje citlivé údaje.

**Výstup:** Notifikácie majú spoľahlivý stav prečítania a projekt má dohľadateľnú históriu zmien.

## Fáza D – Používateľské rozhranie

1. V detaile projektu pridať sekciu „Členovia“ so zoznamom, rolou, oprávnením k úlohám a stavom pozvánky/členstva.
2. Pridať formulár pozvania s výberom používateľa alebo e-mailu, projektovej roly a oprávnenia k úlohám. Zobraziť jasne, že členstvo vznikne až po prijatí.
3. Pridať prijatie/odmietnutie pozvánky v notifikáciách a zrozumiteľný stav čakajúcej, prijatej, odmietnutej, odvolanej alebo expirovanej pozvánky.
4. Zobraziť a ovládať zmenu role, oprávnenia a odobratie člena iba používateľom s príslušným oprávnením. Odovzdanie vlastníctva musí mať jasné zhrnutie dôsledkov a jedno potvrdenie.
5. V úlohách skryť alebo zakázať akcie, ktoré používateľ nemôže vykonať; po odpovedi servera `403` zobraziť zrozumiteľné vysvetlenie. UI je pomôcka, nie náhrada serverovej kontroly.
6. Vytvoriť panel notifikácií s kategóriami komentáre, zmeny, reakcie, úlohy a pozvánky. Po otvorení označiť prečítané len načítané a zobrazené položky.
7. Pridať históriu zmien projektu s načítavacím skeletonom, prázdnym stavom a stránkovaním.
8. Pri účte bez Premium ponechať komentáre a reakcie čitateľné, ale vysvetliť, prečo nie je dostupné pridávanie.
9. V detaile úlohy umožniť vlastníkovi zdieľať ju s konkrétnym používateľom a nastaviť rolu Divák alebo Editor; zobraziť existujúcich príjemcov a umožniť zmenu či odobratie ich prístupu. Divákovi zobraziť stav a komentáre bez ovládacích prvkov na zmenu; Editorovi sprístupniť úpravy, odškrtnutie a komentovanie podľa jeho oprávnenia a pravidla Premium.

**Výstup:** Člen projektu vie zistiť svoje oprávnenia a vykonať dostupné akcie na desktope aj mobile a klávesnicou.

## Fáza E – Overenie a vydanie

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

Najprv dokončiť dátový model a API kontrakt (A), potom serverové kontroly a operácie (B). Notifikácie a audit na serveri (C) možno pripravovať súbežne s UI návrhom, ale UI musí vychádzať zo schváleného kontraktu. Rozhranie (D) napojiť až na stabilné endpointy. Overenie (E) vykonať po integrácii.

Tieto funkcie nadväzujú najmä na F10/B5 (projekty), F11/B9 (komentáre), F13 (notifikácie), B1 (databáza), B3 (relácie) a B6–B8 (úlohy). Pred implementáciou upraviť príslušné kroky v hlavnom pláne a API kontrakte tak, aby sa rovnaká funkcionalita neimplementovala dvakrát.
