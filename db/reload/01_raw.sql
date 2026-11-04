-- 01_raw.sql — bulk load the consolidated CSV into market.deals_raw (nothing in the app reads this table directly).
-- CSV header: _file,رقم الصفقة,التصنيف,النوع,سعر الصفقة (ريال),المساحة (متر مربع),سعر المتر المربع (ريال),تاريخ الصفقة,المنطقة,المدينة,الحي,المخطط,القطعة,الملاحظات,مصدر البيانات,النوع - ذكاء عقارساس
-- :datadir is the data folder as the database server sees it (/data, mounted read-only by infra/docker-compose*.yml).
\set raw_csv :datadir '/consolidated/all_deals.csv'

BEGIN;
TRUNCATE market.deals_raw;
COPY market.deals_raw (source_file, deal_id, category, type_raw, price, area, ppm_source, deal_date,
                       region, city, district, plan_raw, plot_raw, notes, source, type_ai)
FROM :'raw_csv'
WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');
COMMIT;

ANALYZE market.deals_raw;
SELECT count(*) AS raw_rows, count(DISTINCT deal_id) AS distinct_ids, min(source_file), max(source_file) FROM market.deals_raw;
