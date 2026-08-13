-- ============================================================
-- تحديث validate_daily_record — إضافة حدّ آيات كل سورة
-- ============================================================
-- النسخة السابقة تتحقق أن رقم الآية 1 فأكثر، لكنها لا تعرف أن سورة
-- الناس ست آيات. فتقبل «الناس: آية 200» فتتضخم تغطية الطالب بآيات
-- غير موجودة، وقد يظهر «جاهز للاختبار» وهو لم ينهِ مستواه — والشهادة
-- بعدها وثيقة مجمّدة لا تُراجَع.
--
-- يُطبَّق بعد surah-ayah-counts.sql (يعتمد على جدولها).
--
-- الحالة: مُطبَّق. الدليل على أن الاستبدال جرى فعلاً: رسالة خطأ فحص
-- النوع كانت تُبلَّغ من line 4، وصارت من line 7 بعد إضافة قسم declare.
-- ============================================================

create or replace function validate_daily_record()
returns trigger
language plpgsql
as $$
declare
  v_start_max int;
  v_end_max int;
begin
  if new.type not in ('جديد', 'مراجعة') then
    raise exception 'نوع السجل غير مسموح';
  end if;

  if new.start_surah < 1 or new.start_surah > 114
     or new.end_surah < 1 or new.end_surah > 114 then
    raise exception 'رقم السورة يجب أن يكون بين 1 و114';
  end if;

  if new.start_ayah < 1 or new.end_ayah < 1 then
    raise exception 'رقم الآية يجب أن يكون 1 فأكثر';
  end if;

  -- الحد الأعلى لكل طرف من الجدول المرجعي
  select ayah_count into v_start_max
  from surah_ayah_counts where surah_number = new.start_surah;

  select ayah_count into v_end_max
  from surah_ayah_counts where surah_number = new.end_surah;

  if v_start_max is null or v_end_max is null then
    raise exception 'سورة غير معروفة في الجدول المرجعي';
  end if;

  if new.start_ayah > v_start_max then
    raise exception 'آية البداية % تتجاوز عدد آيات السورة (%)',
      new.start_ayah, v_start_max;
  end if;

  if new.end_ayah > v_end_max then
    raise exception 'آية النهاية % تتجاوز عدد آيات السورة (%)',
      new.end_ayah, v_end_max;
  end if;

  -- قاعدة السرد التراكمي تخصّ الجديد وحده. المراجعة نصيبها قد يمتد عبر
  -- عدة سور، فلا تخضع لهذين الشرطين.
  if new.type = 'جديد' then
    if new.start_ayah <> 1 then
      raise exception 'السرد الجديد يبدأ من آية 1 دائماً';
    end if;

    if new.start_surah <> new.end_surah then
      raise exception 'السرد الجديد لا يتجاوز سورة واحدة';
    end if;

    if new.end_ayah < new.start_ayah then
      raise exception 'آية النهاية يجب ألا تسبق آية البداية';
    end if;
  end if;

  return new;
end;
$$;

-- المُشغِّل نفسه لا يتغيّر — create or replace يبدّل جسم الدالة فقط،
-- فلا حاجة لإعادة إنشائه.
