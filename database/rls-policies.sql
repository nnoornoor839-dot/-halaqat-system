-- ============================================================
-- سياسات RLS والدوال المساعدة — مُصدَّرة من قاعدة البيانات الحيّة
-- ============================================================
-- هذا الملف ليس مكتوباً باليد، بل مقروء من القاعدة نفسها عبر
-- pg_policies و pg_get_functiondef، فهو يطابق الواقع لا النية.
--
-- الترتيب: تفعيل RLS ← الدوال المساعدة ← السياسات.
-- الدوال أولاً لأن كل سياسة تستدعيها.
--
-- ملاحظة: مُشغِّلات daily_records في ملف triggers.sql المستقل.
-- ============================================================


-- ------------------------------------------------------------
-- 1) تفعيل RLS على كل جدول
-- ------------------------------------------------------------
alter table public.attendance enable row level security;
alter table public.branches enable row level security;
alter table public.daily_records enable row level security;
alter table public.exam_results enable row level security;
alter table public.financial_requests enable row level security;
alter table public.halaqat enable row level security;
alter table public.milestone_log enable row level security;
alter table public.student_levels enable row level security;
alter table public.students enable row level security;
alter table public.surah_deliveries enable row level security;
alter table public.users enable row level security;
alter table public.weekly_tickets enable row level security;


-- ------------------------------------------------------------
-- 2) الدوال المساعدة
-- ------------------------------------------------------------
-- security definer ضروري: السياسة على users تحتاج قراءة users نفسه،
-- فلولا هذي الدوال لدار الاستدعاء على نفسه بلا نهاية.

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from users where id = auth.uid() and role = 'admin'
  );
$function$;

create or replace function public.my_role()
returns text
language sql
security definer
set search_path to 'public'
as $function$
  select role from users where id = auth.uid();
$function$;

create or replace function public.my_branch_id()
returns integer
language sql
security definer
set search_path to 'public'
as $function$
  select branch_id from users where id = auth.uid();
$function$;


-- ------------------------------------------------------------
-- 3) السياسات
-- ------------------------------------------------------------

-- users --------------------------------------------------------
-- لا سياسة إدراج ولا تعديل: إنشاء المستخدمين يجري من لوحة Supabase.
create policy "Users can view own profile" on public.users
  as permissive for select to public
  using (id = auth.uid());

create policy "Admins can view all users" on public.users
  as permissive for select to public
  using (is_admin());

-- branches -----------------------------------------------------
create policy "Admins full access branches" on public.branches
  as permissive for all to public
  using (is_admin()) with check (is_admin());

create policy "Users view own branch" on public.branches
  as permissive for select to public
  using (is_admin() or (id = my_branch_id()));

-- halaqat ------------------------------------------------------
create policy "Admins full access halaqat" on public.halaqat
  as permissive for all to public
  using (is_admin()) with check (is_admin());

create policy "Supervisors view branch halaqat" on public.halaqat
  as permissive for select to public
  using ((my_role() = 'supervisor') and (branch_id = my_branch_id()));

create policy "Teachers view own halaqat" on public.halaqat
  as permissive for select to public
  using ((my_role() = 'teacher') and (teacher_id = auth.uid()));

-- students -----------------------------------------------------
create policy "Admins full access students" on public.students
  as permissive for all to public
  using (is_admin()) with check (is_admin());

create policy "Supervisors view branch students" on public.students
  as permissive for select to public
  using ((my_role() = 'supervisor') and (branch_id = my_branch_id()));

create policy "Teachers view own students" on public.students
  as permissive for select to public
  using ((my_role() = 'teacher') and (halaqah_id in (
    select halaqat.id from halaqat where halaqat.teacher_id = auth.uid()
  )));

-- attendance ---------------------------------------------------
create policy "Admins full access attendance" on public.attendance
  as permissive for all to public
  using (is_admin()) with check (is_admin());

create policy "Supervisors view branch attendance" on public.attendance
  as permissive for select to public
  using ((my_role() = 'supervisor') and (student_id in (
    select students.id from students where students.branch_id = my_branch_id()
  )));

create policy "Teachers manage own students attendance" on public.attendance
  as permissive for all to public
  using ((my_role() = 'teacher') and (student_id in (
    select s.id from students s join halaqat h on s.halaqah_id = h.id
    where h.teacher_id = auth.uid()
  )))
  with check ((my_role() = 'teacher') and (student_id in (
    select s.id from students s join halaqat h on s.halaqah_id = h.id
    where h.teacher_id = auth.uid()
  )));

-- daily_records ------------------------------------------------
create policy "Admins full access daily_records" on public.daily_records
  as permissive for all to public
  using (is_admin()) with check (is_admin());

create policy "Supervisors view branch records" on public.daily_records
  as permissive for select to public
  using ((my_role() = 'supervisor') and (student_id in (
    select students.id from students where students.branch_id = my_branch_id()
  )));

create policy "Teachers manage own students records" on public.daily_records
  as permissive for all to public
  using ((my_role() = 'teacher') and (student_id in (
    select s.id from students s join halaqat h on s.halaqah_id = h.id
    where h.teacher_id = auth.uid()
  )))
  with check ((my_role() = 'teacher') and (student_id in (
    select s.id from students s join halaqat h on s.halaqah_id = h.id
    where h.teacher_id = auth.uid()
  )));

-- student_levels -----------------------------------------------
create policy "Admins full access student_levels" on public.student_levels
  as permissive for all to public
  using (is_admin()) with check (is_admin());

create policy "Supervisors view branch levels" on public.student_levels
  as permissive for select to public
  using ((my_role() = 'supervisor') and (student_id in (
    select students.id from students where students.branch_id = my_branch_id()
  )));

create policy "Teachers view own students levels" on public.student_levels
  as permissive for select to public
  using ((my_role() = 'teacher') and (student_id in (
    select s.id from students s join halaqat h on s.halaqah_id = h.id
    where h.teacher_id = auth.uid()
  )));

create policy student_levels_branch_insert on public.student_levels
  as permissive for insert to public
  with check (is_admin() or exists (
    select 1 from students s
    where s.id = student_levels.student_id and s.branch_id = my_branch_id()
  ));

-- exam_results -------------------------------------------------
-- لا سياسة تعديل ولا حذف: نتيجة الاختبار وثيقة مجمّدة.
create policy exam_results_branch_select on public.exam_results
  as permissive for select to public
  using (is_admin() or exists (
    select 1 from student_levels sl join students s on s.id = sl.student_id
    where sl.id = exam_results.level_id and s.branch_id = my_branch_id()
  ));

create policy exam_results_branch_insert on public.exam_results
  as permissive for insert to public
  with check (is_admin() or exists (
    select 1 from student_levels sl join students s on s.id = sl.student_id
    where sl.id = exam_results.level_id and s.branch_id = my_branch_id()
  ));

-- surah_deliveries ---------------------------------------------
-- لا سياسة تعديل ولا حذف: محاولة التسليم واقعة لا تُراجَع.
create policy surah_deliveries_select on public.surah_deliveries
  as permissive for select to public
  using (is_admin() or exists (
    select 1 from students s
    where s.id = surah_deliveries.student_id and s.branch_id = my_branch_id()
  ));

create policy surah_deliveries_insert on public.surah_deliveries
  as permissive for insert to public
  with check (is_admin() or exists (
    select 1 from students s
    where s.id = surah_deliveries.student_id and s.branch_id = my_branch_id()
  ));

-- milestone_log ------------------------------------------------
create policy "Admins full access milestone_log" on public.milestone_log
  as permissive for all to public
  using (is_admin()) with check (is_admin());

create policy "Supervisors view branch milestones" on public.milestone_log
  as permissive for select to public
  using ((my_role() = 'supervisor') and (student_id in (
    select students.id from students where students.branch_id = my_branch_id()
  )));

create policy "Teachers manage own students milestones" on public.milestone_log
  as permissive for all to public
  using ((my_role() = 'teacher') and (student_id in (
    select s.id from students s join halaqat h on s.halaqah_id = h.id
    where h.teacher_id = auth.uid()
  )))
  with check ((my_role() = 'teacher') and (student_id in (
    select s.id from students s join halaqat h on s.halaqah_id = h.id
    where h.teacher_id = auth.uid()
  )));

-- weekly_tickets -----------------------------------------------
create policy "Admins full access weekly_tickets" on public.weekly_tickets
  as permissive for all to public
  using (is_admin()) with check (is_admin());

create policy "Supervisors manage branch tickets" on public.weekly_tickets
  as permissive for all to public
  using ((my_role() = 'supervisor') and (student_id in (
    select students.id from students where students.branch_id = my_branch_id()
  )))
  with check ((my_role() = 'supervisor') and (student_id in (
    select students.id from students where students.branch_id = my_branch_id()
  )));

create policy "Teachers view own students tickets" on public.weekly_tickets
  as permissive for select to public
  using ((my_role() = 'teacher') and (student_id in (
    select s.id from students s join halaqat h on s.halaqah_id = h.id
    where h.teacher_id = auth.uid()
  )));

-- financial_requests -------------------------------------------
create policy "Admins full access financial_requests" on public.financial_requests
  as permissive for all to public
  using (is_admin()) with check (is_admin());

create policy "Supervisors manage branch financial requests" on public.financial_requests
  as permissive for all to public
  using ((my_role() = 'supervisor') and (branch_id = my_branch_id()))
  with check ((my_role() = 'supervisor') and (branch_id = my_branch_id()));
