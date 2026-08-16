-- ============================================================
-- بوابة تأكيد الجاهزية للاختبار
-- ============================================================
-- إتمام التغطية حسابٌ آلي: كل آية في مدى المستوى غُطّيت. لكنه لا يعرف
-- هل يتقنها الطالب فعلاً. فالمعلم — وهو من يسمعه يومياً — يؤكد الجاهزية،
-- والمشرف لا يستطيع رصد الاختبار قبل تأكيده.
--
-- صف لكل فعل، لا عمود يُعدَّل:
--   • السحب لو نُفِّذ بتعديل عمود لاحتاج صلاحية update على الجدول، وهي ما
--     ضيّقناه عمداً في rls-restrictive.sql.
--   • والصف-لكل-فعل متسق مع surah_deliveries و exam_results: كل محاولة
--     واقعة مستقلة تُحفظ، لا حالة تُمحى بحالة بعدها.
-- الحالة الحالية = آخر صف زمنياً.
--
-- إعادة التأكيد بعد الرسوب بلا عمود إضافي: التأكيد صالح فقط إن كان أحدث
-- من آخر محاولة اختبار. فبمجرد رصد نتيجة يسقط التأكيد من تلقائه.
--
-- هذا الملف لترقية قاعدة قائمة. القاعدة الجديدة تحصل على الجدول من
-- schema.sql (رقم 9)، وعلى سياساته من هنا — فشغّل هذا الملف بعد
-- rls-policies.sql وتجاوَز أمر create table إن كان الجدول موجوداً.
-- ============================================================

create table exam_readiness (
  id serial primary key,
  level_id int references student_levels(id) not null,
  action text not null check (action in ('confirm', 'withdraw')),
  acted_by uuid references users(id) not null,
  acted_at timestamptz not null default now()
);

-- الاستعلام الوحيد على هذا الجدول: آخر صف لمستوى.
create index exam_readiness_level_idx on exam_readiness (level_id, acted_at desc, id desc);


alter table exam_readiness enable row level security;

-- القراءة بحدود الفرع — المشرف يحتاجها ليعرف من ينتظر رصده.
create policy exam_readiness_select on public.exam_readiness
  as permissive for select to public
  using (is_admin() or exists (
    select 1 from student_levels sl join students s on s.id = sl.student_id
    where sl.id = exam_readiness.level_id and s.branch_id = my_branch_id()
  ));

-- الإدراج: المعلم لطلاب حلقاته، والمشرف داخل فرعه (قد ينوب عن معلم غائب).
-- acted_by مقيَّد بالمستخدم نفسه فلا ينسب أحدٌ تأكيداً لغيره.
create policy exam_readiness_insert on public.exam_readiness
  as permissive for insert to public
  with check (
    acted_by = auth.uid()
    and (
      is_admin()
      or (my_role() = 'supervisor' and exists (
        select 1 from student_levels sl join students s on s.id = sl.student_id
        where sl.id = exam_readiness.level_id and s.branch_id = my_branch_id()
      ))
      or (my_role() = 'teacher' and exists (
        select 1 from student_levels sl
          join students s on s.id = sl.student_id
          join halaqat h on h.id = s.halaqah_id
        where sl.id = exam_readiness.level_id and h.teacher_id = auth.uid()
      ))
    )
  );

-- لا سياسة تعديل ولا حذف: السحب فعلٌ يُضاف لا حالة تُمحى.
