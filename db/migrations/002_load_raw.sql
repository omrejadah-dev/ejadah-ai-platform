-- 002_load_raw.sql — bulk load the consolidated CSV (mounted read-only at /data inside the container)
-- CSV header: _file,رقم الصفقة,التصنيف,النوع,سعر الصفقة (ريال),المساحة (متر مربع),سعر المتر المربع (ريال),تاريخ الصفقة,المنطقة,المدينة,الحي,المخطط,القطعة,الملاحظات,مصدر البيانات,النوع - ذكاء عقارساس

TRUNCATE market.deals_raw;

COPY market.deals_raw (source_file, deal_id, category, type_raw, price, area, ppm_source, deal_date,
                       region, city, district, plan_raw, plot_raw, notes, source, type_ai)
FROM '/data/consolidated/all_deals.csv'
WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');

ANALYZE market.deals_raw;
SELECT count(*) AS raw_rows, count(DISTINCT deal_id) AS distinct_ids, min(source_file), max(source_file) FROM market.deals_raw;
