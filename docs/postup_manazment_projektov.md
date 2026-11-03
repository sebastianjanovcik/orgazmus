# Postup vývoja: správa projektov a členov

Tento dokument je jediným plánom práce na správe projektov, členstve, zdieľaní úloh, audite a notifikáciách. Jednotlivé kroky sa vykonávajú a aktualizujú tu. Pri tejto funkcionalite sa neupravujú ani nedopĺňajú iné Markdown súbory; potrebné dátové a API rozhodnutia sa zaznamenávajú v tomto dokumente a realizujú priamo v kóde.

## Cieľ

Vlastník projektu môže pozývať členov, nastavovať im roly a oprávnenia a previesť vlastníctvo. Úlohu možno zdieľať aj samostatne s konkrétnym používateľom bez sprístupnenia celého projektu. Pozvaný používateľ získa prístup až po prijatí pozvánky. Server vynucuje oprávnenia, zmeny sa zaznamenávajú do auditu a používateľ vidí svoje notifikácie v rozhraní.

## Pravidlá funkcionality

- **Vlastník projektu** má plnú správu projektu a jeho členov. Projekt má vždy práve jedného vlastníka. Prevod vlastníctva potvrdzuje súčasný vlastník; predchádzajúci vlastník dostane zvolenú rolu a oprávnenia.
- **Náhľad** povoľuje čítať projekt a jeho úlohy. **Komentár** povoľuje čítať a pridávať komentáre a reakcie, ak má konajúci používateľ Premium. **Editor** povoľuje úpravy v rozsahu samostatného oprávnenia k úlohám.
- Oprávnenie k úlohám je „Spravovať úlohy“ alebo „Iba náhľad úloh“. Nemôže rozšíriť projektovú rolu: Náhľad zostáva iba na čítanie a Komentár nedovoľuje upravovať úlohy. Vlastník má vždy plný prístup.
- Pozvánka v stave `pending` sama osebe nevytvára členstvo ani prístup. Prijatie vytvorí členstvo pre správny účet; odmietnutie, odvolanie alebo expirácia prístup neudeľujú.
- Samostatné zdieľanie udeľuje prístup iba ku konkrétnej úlohe a jej komentárom. **Divák** ich môže čítať; **Editor** môže upravovať úlohu a jej stav; **Vlastník** môže spravovať zdieľanie a má plnú kontrolu nad úlohou. Platný prístup člena projektu a samostatné zdieľanie sa vyhodnocujú spolu; odobratie jedného nezruší druhý.
- Premium sa kontroluje na serveri podľa účtu konajúceho používateľa pri každom zápise komentára alebo reakcie. Používatelia bez Premium ich môžu čítať, nie pridávať ani meniť.
- Používateľ vidí iba svoje notifikácie. Ako prečítané sa označia iba položky, ktoré panel skutočne načítal a zobrazil. Audit je append-only a nesmie obsahovať heslá, tokeny ani zbytočné citlivé údaje.
- Rozhranie je po slovensky, prístupné klávesnicou a použiteľné na mobile. Načítavacie stavy majú zodpovedať obsahu, nie iba zobrazovať všeobecný spinner. Každé zmazanie vyžaduje kliknutie na tlačidlo a jedno potvrdzovacie okno.

## Pracovný postup

Každý krok spája backend a frontend. Najprv sa v tomto dokumente spresní potrebné správanie a dátové rozhranie; následne sa v rámci toho istého kroku implementuje serverová časť, obrazovka alebo komponent a ich napojenie. Po každom kroku musí byť výsledok viditeľný na stránke a musí sa dať prejsť v prehliadači s dostupnými lokálnymi dátami. Ak ešte nie je pripravená trvalá databázová vrstva, použije sa existujúce vývojové prostredie projektu tak, aby bolo možné funkciu predviesť; oprávnenia sa však vždy pripravujú a vynucujú na serveri. Počas práce sa zaznamená stav kroku priamo tu, bez vytvárania alebo dopĺňania iných Markdown súborov.

## Krok 1 – Základ členstva a zobrazenie členov

**Backend spolu s frontendom:** Zistiť aktuálny stav projektu, používateľov, PHP API a databázy. V tomto súbore určiť polia a stavy potrebné pre členstvo a API odpovede pre zoznam členov. Zaviesť väzbu používateľa na projekt s rolou, oprávnením k úlohám a časom pridania; vlastník zostáva jednoznačný. Implementovať serverové čítanie členov s prístupovou kontrolou. V detaile projektu zobraziť zoznam členov, roly a oprávnenia, vrátane zrozumiteľného prázdneho a načítavacieho stavu.

**Viditeľný výsledok:** Otvorený projekt na stránke zobrazuje členov a ich oprávnenia získané zo servera.

**Dokončené, keď:** Zoznam zodpovedá uloženým dátam, používateľ bez prístupu nezíska členov cudzieho projektu a rozhranie funguje na mobile aj klávesnicou.

## Krok 2 – Pozvánky a správa rolí

**Backend spolu s frontendom:** Implementovať vytvorenie, zobrazenie a odvolanie pozvánky, jej platnosť a stavy `pending`, prijatá, odmietnutá, odvolaná a expirovaná. Pozvánku možno priradiť existujúcemu účtu alebo e-mailu podľa možností autentifikácie v projekte; bezpečný token ukladať iba ako hash. Pridať prijatie a odmietnutie prihláseným určeným používateľom. Prijatie vytvorí členstvo atomicky. Doplniť zmenu roly a oprávnenia a odobratie člena. V detaile projektu vytvoriť formulár pozvania a ovládanie členov s jasným zobrazením čakajúceho stavu.

**Viditeľný výsledok:** Vlastník pozve člena z detailu projektu, príjemca pozvánku vidí a môže ju prijať alebo odmietnuť; po prijatí sa zobrazí ako člen.

**Dokončené, keď:** Pending pozvánka neudeľuje prístup, nemôže ju prijať nesprávny účet, duplicitné alebo neplatné pozvánky sa bezpečne odmietnu a nepovolený používateľ nemôže spravovať členov.

## Krok 3 – Oprávnenia v projekte a prevod vlastníctva

**Backend spolu s frontendom:** Vytvoriť spoločnú serverovú kontrolu členstva a oprávnení a uplatniť ju na čítanie aj zápis projektov a úloh. Rolu a oprávnenie vždy načítať zo serverových dát, nikdy im nedôverovať z požiadavky prehliadača. Implementovať transakčný prevod vlastníctva, potvrdenie súčasným vlastníkom a nastavenie role predchádzajúceho vlastníka. V rozhraní skryť alebo zakázať nedostupné akcie a zrozumiteľne zobraziť zamietnutie prístupu.

**Viditeľný výsledok:** Člen vidí a môže vykonať iba akcie povolené jeho rolou; vlastník môže previesť vlastníctvo cez detail projektu.

**Dokončené, keď:** Priame API volanie neobíde prístupové pravidlá, projekt má vždy práve jedného vlastníka a prevod správne zmení prístup oboch používateľov.

## Krok 4 – Samostatné zdieľanie úlohy a komentáre

**Backend spolu s frontendom:** Zaviesť prístupové záznamy pre konkrétnu úlohu, príjemcu a rolu Divák/Editor/Vlastník. Implementovať udelenie, zmenu a odobratie prístupu; kontrolu uplatniť na všetky endpointy úlohy a komentárov. Samostatné zdieľanie nesmie sprístupniť projekt ani susedné úlohy. V detaile úlohy pridať správu príjemcov a prispôsobiť ovládacie prvky role. Serverovo vynucovať Premium pri pridávaní a zmene komentárov či reakcií.

**Viditeľný výsledok:** Vlastník zdieľa úlohu s konkrétnym používateľom a príjemca vidí alebo upravuje iba túto úlohu podľa roly.

**Dokončené, keď:** Divák nemôže meniť úlohu, Editor ju môže meniť v povolenom rozsahu, odobratý príjemca stráca prístup a žiadna rola neobíde pravidlo Premium.

## Krok 5 – Notifikácie a audit zmien

**Backend spolu s frontendom:** Zaznamenávať významné udalosti vrátane pozvánok, členstva, prevodu vlastníctva a zmien zdieľaných úloh do append-only auditu. Vytvárať notifikácie určeným príjemcom pri relevantných udalostiach. Implementovať serverové stránkované načítanie vlastných notifikácií a auditu projektu a označenie iba zobrazených notifikácií ako prečítaných. Pridať zvonček/panel notifikácií a históriu zmien v rozhraní vrátane prázdneho, načítavacieho a chybového stavu.

**Viditeľný výsledok:** Používateľ vidí svoje nové oznámenia a člen projektu si môže pozrieť históriu zmien.

**Dokončené, keď:** Používateľ nedokáže čítať cudzie notifikácie ani audit bez prístupu; neskôr doručené alebo nezobrazené notifikácie zostávajú neprečítané a audit neposkytuje úpravu ani mazanie.

## Krok 6 – Integrované overenie a dokončenie

**Backend spolu s frontendom:** Prejsť celý tok od pozvania po používanie zdieľaného projektu a úlohy. Overiť prístupové kombinácie vlastníka, Editora, Komentára, Náhľadu a samostatného Diváka/Editora; prijaté, odmietnuté, odvolané a expirované pozvánky; prevod vlastníctva; Premium a účet bez Premium; notifikácie, audit a odobratie prístupu. Opraviť zistené chyby v API aj stránke, skontrolovať chybové a prázdne stavy, mobilné rozloženie a ovládanie klávesnicou. Do tohto dokumentu zapísať dokončenie a prípadné zostávajúce obmedzenia.

**Viditeľný výsledok:** Celá správa projektov a zdieľanie sa dá prejsť cez stránku bez použitia priamych databázových zásahov na predvádzanie bežných tokov.

**Dokončené, keď:** Prejdené scenáre zodpovedajú pravidlám tohto dokumentu, server odmieta nepovolené operácie a známe neoverené správanie je jasne označené.

## Záznam postupu

- Krok 1: čaká na realizáciu.
- Krok 2: čaká na realizáciu.
- Krok 3: čaká na realizáciu.
- Krok 4: čaká na realizáciu.
- Krok 5: čaká na realizáciu.
- Krok 6: čaká na realizáciu.
