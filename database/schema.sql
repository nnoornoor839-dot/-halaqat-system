-- ============================================================
-- نظام الحلقات — مخطط قاعدة البيانات
-- ============================================================
-- هذا الملف مُعاد بناؤه من القاعدة الحيّة (information_schema.columns
-- و pg_constraint)، لا من الذاكرة. فما فيه هو ما هو مطبَّق فعلاً.
--
-- الترتيب مهم: كل جدول بعد ما يرتبط به، لأن القاعدة ترفض ربط جدول
-- بجدول غير موجود بعد.
--
-- ملفات مكمّلة تُطبَّق بعد هذا الملف بالترتيب:
--   1. rls-policies.sql         الدوال المساعدة وسياسات RLS
--   2. rls-restrictive.sql      تضييق صلاحيات التعديل والحذف
--   3. surah-ayah-counts.sql    جدول عدد آيات السور المرجعي
--   4. triggers.sql             حرّاس daily_records
--   5. trigger-ayah-bounds.sql  النسخة النافذة من دالة التحقق
--
-- exam-readiness.sql ينشئ الجدول رقم 9 أدناه مع سياساته. المُعرَّف هنا
-- للقاعدة الجديدة، وذاك الملف لترقية قاعدة قائمة.
--
-- constraints.sql لا يُشغَّل على قاعدة جديدة — قيوده مدمجة هنا أصلاً،
-- وهو مخصص لترقية قاعدة قائمة.
-- ============================================================


-- 1) الفروع: عزل بيانات بنين/بنات
create table branches (
  id serial primary key,
  name text not null
);


-- 2) المستخدمون: معلم / مشرف / مدير
-- id من نوع uuid لا serial، لأنه نفس معرّف حساب Supabase Auth. هذا شرط
-- لعمل تسجيل الدخول: auth.uid() تُرجع uuid، وكل سياسات RLS تقارن به.
-- رقم صحيح هنا يعني نظاماً لا يمكن الدخول إليه إطلاقاً.
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('teacher', 'supervisor', 'admin')),
  branch_id int references branches(id),  -- فارغ (NULL) = المدير يرى كل الفروع
  created_at timestamptz default now()
);


-- 3) الحلقات: كل حلقة لها معلم مسؤول
create table halaqat (
  id serial primary key,
  name text not null,
  teacher_id uuid references users(id),
  branch_id int references branches(id) not null
);


-- 4) الطلاب
create table students (
  id serial primary key,
  name text not null,
  branch_id int references branches(id) not null,
  halaqah_id int references halaqat(id),
  parent_phone text,                 -- تستخدمه صفحة الرسائل لمراسلة ولي الأمر
  created_at timestamptz default now()
);


-- 5) الحضور
-- القيد الفريد على (student_id, date) شرط لعمل upsert في صفحة التحضير:
-- الضغط على «حاضر» ثم «غائب» يُعدّل نفس الصف بدل أن يضيف صفاً ثانياً.
-- notified يمنع تكرار رسالة الغياب لولي الأمر.
create table attendance (
  id serial primary key,
  student_id int references students(id) not null,
  date date not null,
  attended boolean not null default false,
  early_arrival boolean not null default false,
  notified boolean not null default false,
  created_at timestamptz default now(),
  unique (student_id, date)
);


-- 6) السجلات اليومية — قلب النظام القرآني
-- نخزّن المدى الخام (من سورة:آية إلى سورة:آية) لا رقماً مجمّعاً، ليحسب
-- محرك quranEngine.js التغطية الحقيقية بلا تضخم.
-- قيود type والسرد التراكمي وحدود الآيات مفروضة بمُشغِّل لا بـ check،
-- لأنها تحتاج مراجعة جداول أخرى. انظر triggers.sql.
create table daily_records (
  id serial primary key,
  student_id int references students(id) not null,
  date date not null,
  type text not null,              -- 'جديد' أو 'مراجعة'
  start_surah int not null,
  start_ayah int not null,
  end_surah int not null,
  end_ayah int not null,
  created_at timestamptz default now()
);


-- 7) المستوى المستهدف لكل طالب
-- نخزّن الهدف فقط — نسبة التقدم تُحسب لحظياً من daily_records ولا
-- تُخزَّن أبداً، تجنّباً لأرقام تفقد ارتباطها بالواقع.
-- level_number not null + unique هما ما يجعل «المستوى الحالي = الأعلى
-- رقماً» حقيقة تفرضها القاعدة لا عرفاً في الكود. عليه يعتمد مُشغِّل قفل
-- ما بعد الاختبار.
create table student_levels (
  id serial primary key,
  student_id int references students(id) not null,
  level_number int not null,
  semester text not null,
  target_start_surah int not null,
  target_start_ayah int not null,
  target_end_surah int not null,
  target_end_ayah int not null,
  unique (student_id, level_number)
);


-- 8) نتائج اختبارات نهاية المستوى
-- كل محاولة سجل مستقل (يدعم إعادة الاختبار بعد الرسوب).
-- grade يُخزَّن ولا يُشتق لاحقاً: تعديل سلّم التقديرات مستقبلاً يجب ألا
-- يغيّر شهادة صادرة.
create table exam_results (
  id serial primary key,
  level_id int references student_levels(id) not null,
  exam_date date not null,
  score numeric not null,
  grade text not null,
  passed boolean not null,
  retry_date date,                 -- يُملأ فقط عند الرسوب
  created_at timestamptz default now()
);


-- 9) تأكيد الجاهزية للاختبار
-- إتمام التغطية حسابٌ آلي لا يعرف إن كان الطالب يتقن ما غطّاه. فالمعلم يؤكد،
-- والمشرف لا يرصد اختباراً قبل تأكيده.
-- صف لكل فعل لا عمود يُعدَّل: السحب لو كان تعديلاً لاحتاج صلاحية update،
-- وهي ما ضيّقناه عمداً. الحالة الحالية = آخر صف زمنياً.
-- وإعادة التأكيد بعد الرسوب بلا عمود إضافي: التأكيد صالح فقط إن كان أحدث من
-- آخر محاولة اختبار، فيسقط من تلقائه بمجرد رصد نتيجة.
create table exam_readiness (
  id serial primary key,
  level_id int references student_levels(id) not null,
  action text not null check (action in ('confirm', 'withdraw')),
  acted_by uuid references users(id) not null,
  acted_at timestamptz not null default now()
);

create index exam_readiness_level_idx on exam_readiness (level_id, acted_at desc, id desc);


-- 10) تسليم السور
-- كل محاولة صف مستقل (تدعم إعادة التسليم بعد الرفض). الطالب لا ينتقل
-- للسورة التالية إلا بصف approved = true لسورته المكتملة. تنطبق من
-- المستوى الثاني فما فوق.
create table surah_deliveries (
  id serial primary key,
  student_id int references students(id) not null,
  surah_number int not null,
  delivered_at date not null,
  approved boolean not null default false,
  created_at timestamptz default now()
);


-- 11) سجل المحطات — لتفادي تكرار رسالة التهنئة
-- level_id يربط المحطة بمستواها لا بالطالب وحده، حتى تبدأ محطات
-- (25/50/75/100%) من جديد مع كل مستوى بدل أن تُحسب مكررة.
create table milestone_log (
  id serial primary key,
  student_id int references students(id) not null,
  level_id int references student_levels(id),
  milestone_percent int not null,
  notified boolean not null default false,
  notified_at timestamptz default now()
);


-- 12) تذاكر الترفيه الأسبوعية — وثيقة صادرة لا تُعاد حسابها
-- القيد الفريد يمنع صدور تذكرتين لطالب في أسبوع واحد. التطبيق يفحص ذلك
-- قبل الإدراج، لكن الفحص «اقرأ ثم اكتب» يسمح بالتكرار لو ضغط مشرفان في
-- اللحظة نفسها — والتكرار هنا يعني مطالبة مالية مضاعفة.
create table weekly_tickets (
  id serial primary key,
  student_id int references students(id) not null,
  week_start date not null,
  issued_at timestamptz default now(),
  unique (student_id, week_start)
);


-- 13) طلبات الاعتماد المالي — وثيقة بمبلغ ثابت وقت الاعتماد
create table financial_requests (
  id serial primary key,
  branch_id int references branches(id) not null,
  week_start date not null,
  ticket_count int not null,
  total_amount numeric not null,
  status text not null default 'قيد المراجعة',
  created_at timestamptz default now()
);
