-- ============================================================
-- حماية daily_records على مستوى قاعدة البيانات
-- ============================================================
-- منطق التطبيق (Server Actions) يفرض هذي القواعد أصلاً، لكنه يُتجاوَز
-- بالكتابة المباشرة على الجدول (لوحة Supabase، أو أي عميل يحمل مفتاحاً).
-- هذي المُشغِّلات تجعل القواعد البنيوية شرطاً في القاعدة نفسها.
--
-- تُطبَّق يدوياً عبر محرّر SQL في Supabase، بعد ملف constraints.sql.
--
-- الحالة: مُطبَّق على قاعدة البيانات، ومُتحقَّق منه بمحاولتَي إدخال مخالفتين
-- رُفضتا فعلاً:
--   • type = 'test'  ← رفضته validate_daily_record()
--   • type = 'جديد' لطالب بلا مستوى  ← رفضته block_new_memorization_after_exam()
--
-- ما لا تغطيه هذي المُشغِّلات (مقصود):
--   • بوابة تسليم السورة — منطق التغطية يبقى في التطبيق وحده تفادياً
--     لتنفيذين متوازيين يتباعدان.
--   • عمليات delete — تُغطَّى في rls-restrictive.sql.
--
-- تحديث لاحق: حدّ عدد آيات كل سورة أُضيف في trigger-ayah-bounds.sql،
-- وهو يستبدل جسم validate_daily_record() أدناه. فالنسخة النافذة اليوم
-- هي تلك، وهذي تبقى للسياق.
-- ============================================================


-- ------------------------------------------------------------
-- 1) التحقق البنيوي — النوع، وحدود السور والآيات، وقاعدة السرد التراكمي
-- ------------------------------------------------------------
create or replace function validate_daily_record()
returns trigger
language plpgsql
as $$
begin
  if new.type not in ('جديد', 'مراجعة') then
    raise exception 'نوع السجل غير مسموح: «%». المسموح: جديد أو مراجعة', new.type;
  end if;

  if new.start_surah < 1 or new.start_surah > 114
     or new.end_surah < 1 or new.end_surah > 114 then
    raise exception 'رقم السورة يجب أن يكون بين 1 و114 (المُرسل: % إلى %)',
      new.start_surah, new.end_surah;
  end if;

  if new.start_ayah < 1 or new.end_ayah < 1 then
    raise exception 'رقم الآية يجب أن يكون 1 فأكثر';
  end if;

  -- قاعدة السرد التراكمي تخصّ الجديد وحده. المراجعة نصيبها قد يمتد عبر
  -- عدة سور (مثلاً الأعلى:1 إلى الناس:6)، فلا تخضع لهذين الشرطين.
  if new.type = 'جديد' then
    if new.start_ayah <> 1 then
      raise exception 'السرد الجديد يبدأ من آية 1 دائماً (المُرسل: %)', new.start_ayah;
    end if;

    if new.start_surah <> new.end_surah then
      raise exception 'السرد الجديد لا يتجاوز سورة واحدة (من % إلى %)',
        new.start_surah, new.end_surah;
    end if;

    if new.end_ayah < new.start_ayah then
      raise exception 'آية النهاية يجب ألا تسبق آية البداية';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_daily_record on daily_records;

create trigger trg_validate_daily_record
  before insert or update on daily_records
  for each row execute function validate_daily_record();


-- ------------------------------------------------------------
-- 2) منع الحفظ الجديد بعد رصد اختبار المستوى
-- ------------------------------------------------------------
-- الطالب الذي اختُبر (نجح أو رسب) لا يُسجَّل له حفظ جديد: الناجح ينتظر
-- تعيين مستواه التالي، والراسب في تجهيز لإعادة الاختبار.
create or replace function block_new_memorization_after_exam()
returns trigger
language plpgsql
as $$
declare
  v_level_id int;
  v_exam_count int;
begin
  if new.type <> 'جديد' then
    return new;
  end if;

  -- المستوى الحالي = الأعلى رقماً. nulls last لأن صفوفاً قديمة قد تسبق
  -- إضافة عمود level_number.
  select id into v_level_id
  from student_levels
  where student_id = new.student_id
  order by level_number desc nulls last, id desc
  limit 1;

  if v_level_id is null then
    raise exception 'لا يُسجَّل حفظ جديد لطالب بلا مستوى محدد';
  end if;

  select count(*) into v_exam_count
  from exam_results
  where level_id = v_level_id;

  if v_exam_count > 0 then
    raise exception
      'المستوى الحالي اختُبر فعلاً — لا يُسجَّل حفظ جديد قبل تعيين المستوى التالي';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_block_new_after_exam on daily_records;

create trigger trg_block_new_after_exam
  before insert on daily_records
  for each row execute function block_new_memorization_after_exam();
