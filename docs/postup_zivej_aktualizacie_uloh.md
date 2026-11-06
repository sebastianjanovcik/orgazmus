# Postup: automatická aktualizácia zoznamu úloh

Tento samostatný postup opisuje, ako po vytvorení novej úlohy automaticky zistiť zmenu a zobraziť ju v otvorenej stránke bez obnovenia prehliadača. Nevykonáva zmeny v ostatných postupoch. Návrh používa existujúce `GET /api/tasks` a nevyžaduje databázové zmeny ani novú službu.

## Rozhodnutie

Pre produkčnú prevádzku zvoliť Server-Sent Events (SSE): stránka potrebuje iba prijímať oznámenia o zmenách, preto obojsmerné WebSocket spojenie neprináša úžitok. SSE udržiava jedno pripojenie a server môže poslať udalosť pri vytvorení alebo zmene úlohy; klient potom načíta aktuálne dáta cez `GET /api/tasks`, aby zachoval filtre a oprávnenia. Dlhé spojenie však zaberá serverový worker. Vstavaný PHP server používaný lokálne je jednovláknový a počas blokujúcej požiadavky by obsluhu stránky zastavil, preto v lokálnom deme ponechať polling s dlhším intervalom (napríklad 30 sekúnd) alebo SSE skúšať iba na produkčnom serveri s vhodným spracovaním súbežných spojení. SSE musí využívať skutočné oznámenia o zmenách, nie v každom spojení často opakovať náročné SQL dotazy.

## Kroky implementácie

1. **Zmapovať súčasné načítanie.** Nájsť funkciu, ktorá načítava zoznam úloh, aktuálne filtre a miesto, kde sa výsledok vykresľuje. Zdieľať existujúcu API a renderovaciu logiku, aby polling vytváral rovnaký zoznam ako bežné načítanie.
2. **Zvoliť a sprístupniť kanál zmien.** V produkcii vytvoriť autentifikovaný SSE endpoint s hlavičkou `text/event-stream`; po prihlásení otvoriť jedno `EventSource` spojenie, po odhlásení ho zavrieť a pri skrytej karte ho zavrieť alebo pozastaviť a po návrate znovu otvoriť. Udalosť nech obsahuje iba informáciu, že sa dáta zmenili (prípadne verziu/ID zmeny), nie dôveryhodný zoznam úloh. Zmeny posielať pri vytvorení, úprave, dokončení alebo zmazaní; po udalosti načítať aktuálny filtrovaný zoznam cez API. WebSocket zvoliť až vtedy, keď bude potrebná aj obojsmerná komunikácia v reálnom čase. Na vstavanom PHP serveri nepoužívať otvorený SSE stream: blokujúca požiadavka zastaví jednovláknový server; lokálne zatiaľ ponechať polling s dlhším intervalom a bez kontroly na skrytej karte.
3. **Načítať aktuálne filtrované dáta.** Polling má volať `GET /api/tasks` s rovnakými filtrami projektu, stavu a rozsahu ako otvorený pohľad. Rešpektovať stránkovanie/kurzor a nesmie meniť zvolený pohľad používateľa.
4. **Bezpečne zlúčiť výsledok.** Porovnať úlohy podľa stabilného `id`. Nové úlohy pridať do správnej sekcie a zoradiť podľa aktuálneho pravidla; zmenené úlohy aktualizovať. Predísť duplicitám a zachovať otvorený detail, rozpracovaný formulár a lokálny stav ovládania. Pri úprave alebo ukladaní nevyradiť používateľove neuložené zmeny.
5. **Zvládnuť požiadavky v poradí.** Nedovoliť, aby pomalšia staršia odpoveď prepísala novšiu. Použiť existujúci poradový identifikátor načítania alebo povoliť iba jednu čakajúcu polling požiadavku. Po chybe ponechať aktuálny zoznam, nezobrazovať rušivú chybu pri každom intervale a pokračovať ďalšou kontrolou; opakované chyby možno tlmiť postupným predĺžením intervalu až na 30 sekúnd.
6. **Zobraziť nenápadnú spätnú väzbu.** Ak pribudli úlohy, obnoviť počty a relevantné súhrny. Ak je používateľ v inom pohľade, neprerušovať ho; dáta sa majú objaviť v príslušnom zozname po otvorení alebo ďalšej synchronizácii.
7. **Zachovať oprávnenia servera.** Klient nesmie považovať lokálne oznámenie o novej úlohe za dôkaz prístupu. Každé obnovenie používa autentifikované API; zoznam úloh musí zostať obmedzený serverovými pravidlami vlastníctva, členstva a zdieľania.

## Overenie dokončenia

- Otvoriť aplikáciu v dvoch samostatných reláciách s prístupom k rovnakému zoznamu.
- V prvej relácii vytvoriť úlohu; druhá ju zobrazí bez obnovenia stránky najneskôr po nasledujúcej úspešnej kontrole.
- Overiť, že opakované kontroly nevytvoria duplikáty a že filtre, radenie, počty, hotové úlohy a stránkovanie zostanú správne.
- Počas pomalej alebo neúspešnej odpovede overiť, že staré dáta neprepíšu novšie a stránka zostane použiteľná.
- Skontrolovať zastavenie po odhlásení, pozastavenie na skrytej karte a opätovné pokračovanie po návrate.
- V prehliadači skontrolovať konzolu a sieťové požiadavky; overiť aj chybovú odpoveď API.

## Poznámky a hranice

- Lokálny polling používa 30-sekundový interval a beží iba na viditeľnej karte. Produkčné SSE znižuje počet opakovaných HTTP požiadaviek, no dlhé spojenia spotrebúvajú serverové workery; preto treba pred nasadením overiť kapacitu webservera a spôsob doručovania udalostí.
- WebSocket nie je potrebný, kým aplikácia neposiela aj okamžité správy z klienta na server. Pri nasadení SSE nahradí produkčný kanál lokálny polling; načítanie samotných úloh zostane cez autorizované `GET /api/tasks`.

---

# Postup: automatická aktualizace seznamu úkolů (česky)

Tento samostatný postup popisuje, jak po vytvoření nového úkolu automaticky zjistit změnu a zobrazit ji v otevřené stránce bez obnovení prohlížeče. Nemění ostatní postupy. Návrh používá existující `GET /api/tasks` a nevyžaduje změny databáze ani novou službu.

## Rozhodnutí

Pro produkční provoz zvolit Server-Sent Events (SSE): stránka potřebuje pouze přijímat oznámení o změnách, proto obousměrné spojení WebSocket nepřináší užitek. SSE udržuje jedno připojení a server může poslat událost při vytvoření nebo změně úkolu; klient potom načte aktuální data přes `GET /api/tasks`, aby zachoval filtry a oprávnění. Dlouhé spojení však zabírá serverový worker. Vestavěný PHP server používaný lokálně je jednovláknový a během blokujícího požadavku by obsluhu stránky zastavil, proto v lokálním demu ponechat polling s delším intervalem (například 30 sekund) nebo SSE zkoušet pouze na produkčním serveru s vhodným zpracováním souběžných spojení. SSE musí využívat skutečná oznámení o změnách, ne často opakovat náročné SQL dotazy pro každé spojení.

## Kroky implementace

1. **Zmapovat současné načítání.** Najít funkci, která načítá seznam úkolů, aktuální filtry a místo vykreslení výsledku. Sdílet existující API a vykreslovací logiku, aby polling vytvářel stejný seznam jako běžné načtení.
2. **Zvolit a zpřístupnit kanál změn.** V produkci vytvořit autentizovaný SSE endpoint s hlavičkou `text/event-stream`; po přihlášení otevřít jedno `EventSource` spojení, po odhlášení jej zavřít a při skryté kartě jej zavřít nebo pozastavit a po návratu znovu otevřít. Událost má obsahovat pouze informaci, že se data změnila (případně verzi/ID změny), ne důvěryhodný seznam úkolů. Změny posílat při vytvoření, úpravě, dokončení nebo smazání; po události načíst aktuální filtrovaný seznam přes API. WebSocket zvolit až tehdy, když bude potřeba také obousměrná komunikace v reálném čase. Na vestavěném PHP serveru nepoužívat otevřený SSE stream: blokující požadavek zastaví jednovláknový server; lokálně zatím ponechat polling s delším intervalem a bez kontrol na skryté kartě.
3. **Načíst aktuálně filtrovaná data.** Polling má volat `GET /api/tasks` se stejnými filtry projektu, stavu a rozsahu jako otevřený pohled. Respektovat stránkování/kurzor a neměnit zvolený pohled uživatele.
4. **Bezpečně sloučit výsledek.** Porovnat úkoly podle stabilního `id`. Nové úkoly přidat do správné sekce a seřadit podle aktuálního pravidla; změněné úkoly aktualizovat. Předcházet duplicitám a zachovat otevřený detail, rozepsaný formulář a místní stav ovládání. Při úpravě nebo ukládání neodstranit neuložené změny uživatele.
5. **Správně řadit požadavky.** Nedovolit, aby pomalejší starší odpověď přepsala novější. Použít existující pořadový identifikátor načítání nebo povolit jen jednu čekající polling požadavek. Po chybě ponechat aktuální seznam, nezobrazovat rušivou chybu při každém intervalu a pokračovat další kontrolou; opakované chyby lze tlumit postupným prodloužením intervalu až na 30 sekund.
6. **Zobrazit nenápadnou zpětnou vazbu.** Pokud přibyly úkoly, obnovit počty a relevantní souhrny. Pokud je uživatel v jiném pohledu, nepřerušovat ho; data se mají objevit v příslušném seznamu po jeho otevření nebo další synchronizaci.
7. **Zachovat oprávnění serveru.** Klient nesmí považovat místní oznámení o novém úkolu za důkaz přístupu. Každé obnovení používá autentizované API; seznam úkolů musí zůstat omezen pravidly serveru pro vlastnictví, členství a sdílení.

## Ověření dokončení

- Otevřít aplikaci ve dvou samostatných relacích se stejným přístupem k seznamu.
- V první relaci vytvořit úkol; druhá jej zobrazí bez obnovení stránky nejpozději po následující úspěšné kontrole.
- Ověřit, že opakované kontroly nevytvoří duplicity a že filtry, řazení, počty, dokončené úkoly a stránkování zůstanou správné.
- Během pomalé nebo neúspěšné odpovědi ověřit, že stará data nepřepíšou novější a stránka zůstane použitelná.
- Zkontrolovat zastavení po odhlášení, pozastavení na skryté kartě a pokračování po návratu.
- V prohlížeči zkontrolovat konzoli a síťové požadavky; ověřit také chybovou odpověď API.

## Poznámky a omezení

- Lokální polling používá 30sekundový interval a běží pouze na viditelné kartě. Produkční SSE snižuje počet opakovaných HTTP požadavků, ale dlouhá spojení spotřebovávají serverové workery; před nasazením je proto třeba ověřit kapacitu webserveru a způsob doručování událostí.
- WebSocket není potřeba, dokud aplikace neposílá také okamžité zprávy z klienta na server. Při nasazení SSE nahradí produkční kanál lokální polling; samotné načítání úkolů zůstane přes autorizované `GET /api/tasks`.
