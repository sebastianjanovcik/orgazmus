# Lokálna databáza Tasko

Použi MySQL 8.0.16 alebo novší, prípadne kompatibilnú verziu MariaDB. Schéma
používa koláciu `utf8mb4_unicode_ci`, ktorú podporujú obe databázy, a obmedzenia
`CHECK` na validáciu dát.
Schéma vytvorí databázu `tasko` a tabuľky pre používateľov, projekty, úlohy a
komentáre:

```sh
mysql -u root -p < db/schema.sql
```

Skopíruj `config/config.example.php` na `config/config.php` a nastav lokálne
prihlasovacie údaje s právami na čítanie a zápis v databáze `tasko`. Súbor
`config.php` je ignorovaný Gitom. Potom naplň lokálnu databázu:

```sh
php db/seed.php
```

Pri existujúcej databáze spusti migráciu príloh:

```sh
mysql -u root -p tasko < db/migration_task_attachments.sql
```

Konfigurácia `attachments.directory` v `config/config.php` určuje súkromný
adresár na disku. Predvolená lokálna cesta je `var/attachments/`, mimo
`public/` a ignorovaná Gitom. V produkcii nastav adresár s minimálnymi
prístupovými právami, dostupným priestorom podľa prevádzkového limitu a
zálohovaním; PHP musí mať `upload_max_filesize=32M` a `post_max_size` aspoň
`34M`.

Pri zlyhaní fyzického mazania zostáva požiadavka v `task_attachment_cleanup`.
Naplánuj opakované spustenie `php db/cleanup_task_attachments.php` (napríklad
cron každých 15 minút); rovnaký worker sa spúšťa aj po API mazaní. Záznam sa
odstráni z frontu až po potvrdenom zmazaní súboru alebo ak súbor už neexistuje.

Seed možno spustiť opakovane: obnoví známe ukážkové záznamy bez zmazania
ostatných dát. Pri každom spustení obnoví aj heslá oboch demo účtov, preto si
nové náhodné heslá vypísané v termináli ulož mimo repozitára. Seed vkladá
ukážkové komentáre pre Premium účet; API musí naďalej kontrolovať plán a
vlastníctvo každej požiadavky.

## Spustenie cez phpMyAdmin

Najprv importuj `schema.sql` cez kartu **Import**. Potom vyber databazu `tasko`, otvor kartu **Import** a spusti `seed.sql`. Seed obnovi pevne ukazkove zaznamy. Demo ucty su `jana@example.sk` a `premium@example.sk`; heslo pre oba je `password`. Pouzivaj ich iba lokalne.
