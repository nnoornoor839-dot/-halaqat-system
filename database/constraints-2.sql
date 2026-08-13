-- ============================================================
-- قيدان ناقصان في القاعدة الحيّة
-- ============================================================
-- ظهرا عند إعادة بناء schema.sql من القاعدة: الملف يعرّفهما لأن أي
-- قاعدة جديدة يجب أن تحملهما، والقاعدة القائمة لا تحملهما. هذا الملف
-- يوفّق بينهما.
--
-- 1) users.role بلا قيد
--    my_role() تقارن نصاً بنص: role = 'teacher'. فقيمة مثل 'Teacher'
--    أو 'معلم' تمرّ في القاعدة، ثم تفشل كل مقارنة في كل سياسة RLS —
--    فيفقد الحساب صلاحياته بصمت بلا رسالة خطأ تدل على السبب.
--
-- 2) weekly_tickets بلا قيد فريد على (student_id, week_start)
--    التطبيق يفحص «هل صدرت؟» في JavaScript ثم يُدرج
--    (web/app/tickets/page.js). وهذا نمط «اقرأ ثم اكتب»: لو ضغط
--    مشرفان في اللحظة نفسها، كلاهما يقرأ «لم تصدر» فتصدر تذكرتان —
--    ومعها مطالبة مالية مضاعفة. القيد يقفلها في القاعدة لا في التوقيت.
--
-- إن رفض أحد الأمرين، فذلك لأن بيانات مخالفة موجودة فعلاً. الرفض
-- مفيد: يكشفها بدل أن تبقى مستترة. لا شيء يتغيّر عند الرفض.
-- ============================================================


-- فحص قبلي: يجب أن يعود كلاهما صفراً
select count(*) as bad_roles
from users
where role not in ('teacher', 'supervisor', 'admin');

select count(*) as duplicate_tickets
from (
  select student_id, week_start
  from weekly_tickets
  group by student_id, week_start
  having count(*) > 1
) d;


-- القيد الأول
alter table users
  add constraint users_role_check
  check (role in ('teacher', 'supervisor', 'admin'));


-- القيد الثاني
alter table weekly_tickets
  add constraint weekly_tickets_student_week_unique
  unique (student_id, week_start);
