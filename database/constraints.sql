-- ============================================================
-- قيود student_levels — شرط مسبق لمُشغِّلات daily_records
-- ============================================================
-- كلٌّ من التطبيق ومُشغِّل «قفل الاختبار» يعرّف «المستوى الحالي» بأنه الأعلى
-- رقماً. لا شيء في القاعدة يضمن ذلك حالياً: level_number يقبل NULL، ولا يوجد
-- قيد يمنع تكرار الرقم لنفس الطالب. فالتعريف عُرف لا قاعدة.
--
-- أثر ذلك عملياً:
--   • صف بـ level_number = NULL يجعل التطبيق والمُشغِّل يختاران مستويين
--     مختلفين — الترتيب التنازلي في Postgres يضع NULL أولاً، والمُشغِّل
--     يستخدم nulls last.
--   • رقمان متكرران يجعلان اختيار limit 1 غير محسوم في التطبيق (لا يوجد
--     فاصل ترجيح ثانوي).
--
-- تُطبَّق قبل ملف triggers.sql.
--
-- الحالة: مُطبَّق على قاعدة البيانات — الأوامر الثلاثة نُفِّذت ونجحت.
-- ============================================================

-- 1) تعبئة أي صف بلا رقم (احتياطاً — التعبئة الأصلية جرت وقت إضافة العمود)
update student_levels sl
set level_number = sub.rn
from (
  select id, row_number() over (partition by student_id order by id) as rn
  from student_levels
) sub
where sl.id = sub.id
  and sl.level_number is null;

-- 2) منع القيمة الفارغة
alter table student_levels
  alter column level_number set not null;

-- 3) منع تكرار رقم المستوى لنفس الطالب
alter table student_levels
  add constraint student_levels_student_number_unique
  unique (student_id, level_number);

-- بعد هذين القيدين يصبح «الأعلى رقماً = المستوى الحالي» حقيقة تفرضها
-- القاعدة، فيتطابق التطبيق والمُشغِّل حتماً.
