# Pokyny pre vývoj

## Účel projektu

Repozitár obsahuje prototyp jednoduchej to-do aplikácie. `To-do wireframe.html` je aktuálny interaktívny návrh rozhrania a `public/index.php` je zatiaľ iba minimálna PHP stránka. Verejný koreň webu je `public/`; pôvodná koreňová skúšobná stránka je odložená v `trash/legacy-root-index.php`. Pri implementácii zachovávaj funkcie a vizuálne správanie dohodnuté v prototype a v projektových podkladoch.

## Jazyk a komunikácia

- Používateľské rozhranie a texty určené používateľom píš po slovensky, ak zadanie neurčí inak.
- Vysvetlenia zmien a dokumentáciu píš po slovensky.
- V kóde používaj zrozumiteľné názvy; existujúcu konvenciu v upravovanom súbore zachovaj.

## Práca v repozitári

- Pred každou úlohou najprv používateľovi stručne oznám, čo ideš urobiť a ako budeš postupovať. Až potom začni kontrolovať alebo meniť súbory. Postup prispôsob konkrétnemu zadaniu, priebežne stručne oznamuj podstatné zistenia a na konci uveď výsledok aj overenie.
- Pred úpravou si prezri súvisiace súbory a zachovaj existujúce používateľské zmeny.
- Na začiatku implementácie projektu si prečítaj `To-do_list_postup_vyvoja_krokzakrokomv4.docx`, vytvor podľa neho konkrétny plán krokov a počas práce sa ním riaď. Pri každom kroku skontroluj jeho predpoklady a nadväznosti; odchýlku od plánu najprv vysvetli používateľovi a plán aktualizuj podľa nových zistení alebo jeho pokynov.
- Zmeny ukladaj do Gitu po rozumných, dokončených fázach. Po dokončení každého kroku plánu vytvor samostatný commit a bezprostredne ho pushni do nakonfigurovaného vzdialeného repozitára; jednotlivé kroky nespájaj do jedného neskoršieho commitu. Pred commitom skontroluj `git status` a diff, do commitu zahrň iba zmeny patriace k danému kroku a nikdy neprepisuj ani neodstraňuj cudzie či nesúvisiace zmeny. Ak commit alebo push zlyhá, zachovaj zmeny, zisti príčinu a oznám stav; nepokračuj tak, aby sa kroky potichu hromadili bez commitov.
- Rob malé, sústredené zmeny súvisiace so zadaním. Nepridávaj závislosti ani framework bez potreby a dohody.
- Súbory v `assets/` sú lokálne dodané knižnice Bootstrapu a jQuery. Neupravuj ich ako súčasť bežnej práce na aplikácii.
- `To-do wireframe.html` považuj za návrhový/prototypový podklad. Pred prenášaním jeho kódu do aplikácie skontroluj, či zadanie žiada zmenu prototypu alebo produkčnej stránky.
- Nezavádzaj databázovú schému, autentifikáciu ani externé služby bez opory v zadaní alebo projektových podkladoch.

## Kvalita a bezpečnosť

- Každý nový alebo podstatne upravený kód zdokumentuj priamo v kóde. Pri funkciách, triedach, netriviálnych blokoch a dôležitých HTML/CSS/JavaScript častiach vysvetli, prečo existujú a ako fungujú; komentár umiestni čo najbližšie k vysvetľovanému kódu.
- Komentáre píš po slovensky a udržiavaj ich v súlade s implementáciou. Neopisuj iba to, čo je z kódu zjavné; vysvetli zámer, rozhodnutia alebo dôležité obmedzenia. Pri drobnej zmene nepridávaj komentáre ku každému riadku, ak by iba opakovali samotný kód.
- Pri PHP zachovaj čitateľné odsadenie a oddeľ prezentačnú vrstvu od aplikačnej logiky, keď sa projekt začne rozširovať.
- Všetky hodnoty pochádzajúce od používateľa pri výstupe do HTML escapuj; pri SQL používaj parametrizované dotazy.
- Interaktívne prvky označ sémantickým HTML a zabezpeč použiteľnosť klávesnicou a na mobilných obrazovkách.
- Nezapisuj heslá, tokeny ani iné tajomstvá do repozitára.

## Overovanie zmien

- Overenie prispôsob rozsahu zmeny. Pri úprave PHP môžeš použiť `php -l <súbor>`; pri HTML/CSS/JS skontroluj zmenený tok a súvisiace správanie v prehliadači, ak je dostupný.
- V repozitári zatiaľ nie je definovaný testovací ani build príkaz. Nevymýšľaj ho; ak pridáš nástroje alebo testy, zdokumentuj ich použitie.
- V závere stručne uveď, čo sa zmenilo a čo bolo overené. Jasne označ neoverené správanie.
