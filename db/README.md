# Database

PostgreSQL 17 + pgvector, in Docker (`infra/docker-compose.yml`, container `ejadah-ai-postgres`, user `ejadah`, db `ejadah_ai`).
On Git Bash run the scripts with `bash db/...`; they set `MSYS_NO_PATHCONV` themselves.

| Folder | What | Runs |
|---|---|---|
| `migrations/NNN_*.sql` | Schema: schemas, tables, indexes, empty materialised views, constraints, and the small product data every environment needs (type mapping, plans on sale, adjustment rules, pricing parameters) | once each, in order, by `db/migrate.sh` |
| `functions/*.sql` | Repeatable definitions (`CREATE OR REPLACE`): the pricing engine `market.estimate_price` and its helpers | every `db/migrate.sh` run, after the migrations |
| `reload/` | Data: the 4.6M deals, cities/districts, geo files, the legal library, materialised-view refresh | `db/reload/run.sh`, when data is (re)loaded |
| `seed/dev.sql` | Test accounts and the test admin (`0500000001`–`0500000005`, admin `0500000000`) | only `db/migrate.sh --dev` |

## Fresh database

```bash
cd infra && docker compose up -d && cd ..
bash db/migrate.sh --dev        # production: without --dev
bash db/reload/run.sh           # ~6 min: raw load, transform, geo, legal, refresh
```

Production has no test admin: insert the first real one by hand,
`INSERT INTO identity.admins (phone, name) VALUES ('+9665XXXXXXXX', '...');`.

## Rules

- **Never edit a migration that has been applied anywhere.** `ops.schema_migrations` stores each file's checksum and
  `db/migrate.sh` refuses to run when an applied file changed. Make a new file with the next number instead.
- The pricing engine is edited in place in `functions/estimate_price.sql` (005, 010 and 011 are history). Its constants
  are data: `market.pricing_tiers` and `market.pricing_params` (020). Any change must keep the backtest
  (`tools/pricing/backtest_*.sql`) results or be a deliberate, measured change.
- Migrations create structure only; anything that reads a CSV or rebuilds data belongs in `reload/`.
- Ids are stable. Cities and districts are upserted on their natural keys and never deleted; `data/geo/*.csv` are keyed
  by region + city `name_norm` + district `name_norm`, not ids; legal articles are upserted on (law, seq). Saved
  valuations, cited articles and links keep pointing at the same rows after a reload.
- A reload is safe while the app runs: tables are swapped in one transaction (DELETE + INSERT), materialised views
  refresh `CONCURRENTLY`. `reload/refresh.sql` finds every materialised view in the catalog and orders them by
  dependency, so a new one needs no edit there (give it a unique index so it can refresh concurrently).

## Commands

```bash
bash db/migrate.sh --status                 # applied / pending / CHANGED per file
bash db/reload/run.sh geo refresh           # only some reload steps
bash db/migrate.sh --baseline [NNN]         # one time, on a database built before the runner: mark files as applied
PG_CONTAINER=other PGDATABASE=x bash db/migrate.sh      # another container / database
DATABASE_URL=postgres://... bash db/migrate.sh          # psql on this machine instead of docker exec
```
