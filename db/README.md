# Lokálna databáza Tasko

Použi MySQL 8.0.16 alebo novší, aby databáza vynucovala aj obmedzenia `CHECK`.
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

Seed možno spustiť opakovane: obnoví známe ukážkové záznamy bez zmazania
ostatných dát. Pri každom spustení obnoví aj heslá oboch demo účtov, preto si
nové náhodné heslá vypísané v termináli ulož mimo repozitára. Seed vkladá
ukážkové komentáre pre Premium účet; API musí naďalej kontrolovať plán a
vlastníctvo každej požiadavky.
