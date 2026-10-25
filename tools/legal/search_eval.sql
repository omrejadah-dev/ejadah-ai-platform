-- Search quality check: does the right article (or law) come up in the top 3? Run after any change to legal.search.
--   docker exec -i ejadah-ai-postgres psql -U ejadah -d ejadah_ai < tools/legal/search_eval.sql
WITH cases(q, law, label) AS (VALUES
  ('كم عمولة الوسيط العقاري',                 'نظام الوساطة العقارية', 'المادة الرابعة عشرة'),
  ('متى يستحق الوسيط العمولة',                'نظام الوساطة العقارية', 'المادة الخامسة عشرة'),
  ('هل يجب أن يكون عقد الوساطة مكتوبا',        'نظام الوساطة العقارية', 'المادة السابعة'),
  ('هل يجوز لغير السعودي تملك عقار',           'نظام تملك غير السعوديين للعقار', 'المادة الثانية'),
  ('كم نسبة ضريبة التصرفات العقارية',          'نظام ضريبة التصرفات العقارية', 'المادة الثانية'),
  ('رسوم الأراضي البيضاء داخل النطاق العمراني', 'نظام رسوم الأراضي البيضاء والعقارات الشاغرة', NULL),
  ('بيع وحدات عقارية على الخارطة قبل اكتمالها', 'نظام بيع وتأجير مشروعات عقارية على الخارطة', NULL),
  ('هل ينتهي عقد الإيجار بموت المستأجر',        'نظام المعاملات المدنية', NULL)
)
SELECT c.q,
       CASE WHEN EXISTS (SELECT 1 FROM legal.search(c.q, 3) s WHERE s.title = c.law AND (c.label IS NULL OR s.label = c.label))
            THEN 'hit' ELSE 'MISS' END AS top3,
       (SELECT s.title || ' / ' || s.label FROM legal.search(c.q, 1) s) AS first_result
FROM cases c;

-- off-topic questions must find nothing
SELECT q, (SELECT count(*) FROM legal.search(q, 6)) AS results
FROM (VALUES ('ما هي عقوبة تهريب المخدرات'), ('كيف أجدد رخصة القيادة'), ('ما شروط الحصول على تأشيرة عمل')) v(q);
