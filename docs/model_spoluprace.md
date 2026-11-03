# Návrh dátového modelu spolupráce

Tento dokument je návrh pre fázu A. Je podkladom na zapracovanie do `db/schema.sql` v B1; existujúca databázová schéma sa týmto dokumentom sama nemení.

## Vlastníctvo a členstvo

`projects.user_id` zostáva jediným autoritatívnym údajom o vlastníkovi. Vlastník sa pri čítaní členov projektu vracia odvodený z tohto stĺpca a nemá duplicitný riadok v `project_members`. Tabuľka členov obsahuje iba ostatných aktívnych členov. Vlastníka nemožno odobrať ako člena; prevod vlastníctva transakčne zmení `projects.user_id` a podľa požadovanej roly vytvorí alebo aktualizuje členstvo predchádzajúceho vlastníka.

## Navrhované tabuľky

Nasledujúci návrh uvádza polia a obmedzenia, nie hotovú migráciu. Všetky ID odkazujú na existujúce `users`, `projects`, `tasks` a `comments`.

### `project_members`

| Stĺpec | Typ / pravidlo | Význam |
| --- | --- | --- |
| `project_id`, `user_id` | `BIGINT UNSIGNED`, zložený PK, FK s `ON DELETE CASCADE` | Projekt a člen |
| `role` | ENUM `viewer`, `commenter`, `editor` | Projektová rola; vlastníka určuje výhradne `projects.user_id` |
| `task_permission` | ENUM `read`, `manage` | Samostatné oprávnenie k úlohám; rola môže výsledné právo iba zúžiť |
| `can_manage_members` | BOOLEAN, default false | Výslovné oprávnenie spravovať členov a pozvánky |
| `created_at`, `updated_at` | UTC timestampy | Vznik a posledná zmena členstva |

Rola `viewer` zostáva iba na čítanie bez ohľadu na `task_permission`; `commenter` povoľuje komentáre/reakcie len pri Premium, ale nie úpravy úloh; `editor` povoľuje úpravy iba pri `task_permission=manage`. Členstvo vznikne až prijatím pozvánky. Unikátnosť `(project_id,user_id)` zabraňuje duplicitnému členstvu.

### `project_invitations`

Polia: `id`, `project_id`, `inviter_id`, nullable `invitee_user_id`, nullable `invitee_email`, `role`, `task_permission`, `can_manage_members`, `token_hash`, `status`, `expires_at`, `accepted_at`, `declined_at`, `revoked_at`, `created_at`, `updated_at`. Presne jedno z `invitee_user_id` a `invitee_email` musí byť vyplnené. Pozvánka pre účet sa pri prijatí musí zhodovať s prihláseným účtom; e-mailová pozvánka sa môže prijať iba účtom s týmto normalizovaným e-mailom. Náhodný token s dostatočnou entropiou sa vydá iba v pozývacej URL a v databáze sa uloží výhradne jeho kryptografický hash. Indexy: `(project_id,status,expires_at)`, `(invitee_user_id,status)`, `(invitee_email,status)` a unikátny hash tokenu. Stav je `pending`, `accepted`, `declined`, `revoked` alebo `expired`; expirácia sa odvodzuje z `expires_at` a pri zmene stavu sa nemení história predchádzajúcej akcie.

### `task_shares`

Polia: `id`, `task_id`, `recipient_user_id`, `granted_by_user_id`, `role` (`viewer` alebo `editor`), `created_at`, nullable `revoked_at`. Unikátny kľúč na `(task_id,recipient_user_id)` zaisťuje jeden záznam prístupu na príjemcu a úlohu; opätovné udelenie obnoví záznam a čas. Aktívny záznam je ten, ktorý nemá `revoked_at`. Rola `owner` je odvodená od vlastníka projektu danej úlohy a nie je uložená ako príjemcovské zdieľanie. Samostatné zdieľanie nikdy nevytvára členstvo v projekte. Indexy pokrývajú príjemcu a úlohu.

### `audit_events`

Polia: `id`, `project_id`, nullable `actor_user_id`, `event_type`, nullable `target_type`, nullable `target_id`, `summary` (stručný bezpečný text), `changes_json` (iba povolené polia pred/po), `created_at`. Index `(project_id,created_at,id)` slúži na stránkovanie. Záznamy sú append-only; bežné API nemá update/delete. Nikdy sa neukladá heslo, hash hesla, pozývací token ani celý citlivý text komentára.

### `notifications`

Polia: `id`, `recipient_user_id`, nullable `project_id`, nullable `target_type`, nullable `target_id`, `type`, `summary`, nullable `created_by_user_id`, `created_at`, nullable `read_at`. Typy: `comment`, `change`, `reaction`, `task`, `invitation`. Index `(recipient_user_id,read_at,created_at,id)` a index `(project_id,created_at,id)`. Každý záznam patrí jednému príjemcovi; pri odobratí prístupu sa nesmie cez notifikáciu sprístupniť už nedostupný objekt.

### `reactions`

Polia: `id`, `comment_id`, `user_id`, `reaction` (pevný zoznam emoji/kódov), `created_at`. Unikátny kľúč `(comment_id,user_id,reaction)` bráni duplicitnej reakcii toho istého používateľa; index na `comment_id` umožní načítanie s komentárom. Reakcia podlieha rovnakému prístupu k úlohe a obmedzeniu Premium pri zápise ako komentár.

## Transakcie a mazanie

Prijatie pozvánky atomicky overí token, účet, stav a platnosť, vloží členstvo a zmení stav pozvánky. Prevod vlastníctva uzamkne projekt a dotknuté členstvá a v jednej transakcii zmení vlastníka aj rolu predchádzajúceho vlastníka. Odobratie člena alebo zdieľania a súvisiace auditné/notifikačné záznamy sa zapíšu v jednej transakcii. Odstránenie projektu odstráni jeho členstvá, pozvánky, audit a notifikácie s projektom; odstránenie úlohy odstráni zdieľania. Historické záznamy auditu zachovávajú bezpečný súhrn aj vtedy, keď aktér alebo cieľový objekt už neexistuje.

Konkrétne FK, typy ENUM a mazacie pravidlá sa pri B1 zosúladia s existujúcou schémou a podporovanou verziou MySQL. Obmedzenia, ktoré MySQL nevie vynútiť deklaratívne (napríklad presne jeden cieľ pozvánky), musia byť transakčne validované serverom.
