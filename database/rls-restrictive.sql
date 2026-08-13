-- ============================================================
-- تضييق الصلاحيات الزائدة — سياسات RESTRICTIVE
-- ============================================================
-- السياسات القائمة تمنح `for all` للمعلم والمشرف، و`all` في Postgres
-- تعني الأربعة: select + insert + update + delete. والتطبيق لا يستخدم
-- من ذلك إلا ما هو مذكور أدناه، فالباقي صلاحية ممنوحة بلا حاجة —
-- يبلغها من يحمل مفتاح دخوله عبر واجهة Supabase مباشرة، لا عبر الموقع.
--
-- لماذا RESTRICTIVE لا تعديل السياسات القائمة؟
--   لأن Postgres يجمع RESTRICTIVE بـ AND فوق PERMISSIVE. فالنتيجة
--   تضييق مضمون بلا لمس أي سياسة عاملة، وبلا خطر على القراءة والإدراج
--   اللذين يعتمد عليهما الموقع اليوم.
--
-- ما يحتاجه التطبيق فعلاً (مُتحقَّق منه بالبحث في web/app و web/lib):
--   daily_records       insert, select        → يُمنع update و delete
--   attendance          upsert, select        → يُمنع delete فقط
--   milestone_log       insert, select, update(notified) → يُمنع delete
--   weekly_tickets      insert, select        → يُمنع update و delete
--   financial_requests  insert, select        → يُمنع delete فقط
--
-- ملاحظة على attendance و milestone_log: كلاهما يحتاج UPDATE فعلاً —
-- الأول لأن التطبيق يستخدم upsert (إدراج أو تعديل حسب الحالة)، والثاني
-- لتعليم الرسالة مُرسَلة (notified = true). فيُمنع الحذف وحده فيهما.
--
-- financial_requests: الحذف يُمنع، والتعديل يُترك لأن عمود status
-- مصمَّم للتغيير (قيد المراجعة ← معتمد).
-- ============================================================


-- daily_records — لا تعديل ولا حذف لغير المدير
drop policy if exists daily_records_no_update on public.daily_records;
create policy daily_records_no_update on public.daily_records
  as restrictive for update to public
  using (is_admin());

drop policy if exists daily_records_no_delete on public.daily_records;
create policy daily_records_no_delete on public.daily_records
  as restrictive for delete to public
  using (is_admin());


-- attendance — التعديل مطلوب (upsert)، فالحذف وحده يُمنع
drop policy if exists attendance_no_delete on public.attendance;
create policy attendance_no_delete on public.attendance
  as restrictive for delete to public
  using (is_admin());


-- milestone_log — التعديل مطلوب (notified)، فالحذف وحده يُمنع
drop policy if exists milestone_log_no_delete on public.milestone_log;
create policy milestone_log_no_delete on public.milestone_log
  as restrictive for delete to public
  using (is_admin());


-- weekly_tickets — وثيقة صادرة: لا تُعدَّل ولا تُحذف
drop policy if exists weekly_tickets_no_update on public.weekly_tickets;
create policy weekly_tickets_no_update on public.weekly_tickets
  as restrictive for update to public
  using (is_admin());

drop policy if exists weekly_tickets_no_delete on public.weekly_tickets;
create policy weekly_tickets_no_delete on public.weekly_tickets
  as restrictive for delete to public
  using (is_admin());


-- financial_requests — الحذف يُمنع، والتعديل متروك لتغيير الحالة
drop policy if exists financial_requests_no_delete on public.financial_requests;
create policy financial_requests_no_delete on public.financial_requests
  as restrictive for delete to public
  using (is_admin());


-- ملاحظة: exam_results و surah_deliveries لا تحتاجان شيئاً هنا — ليس
-- لهما أصلاً سياسة تعديل ولا حذف، فهما مقفلان بالفطرة لا بالاستثناء.
