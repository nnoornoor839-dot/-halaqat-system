-- ============================================================
-- نظام الحلقات — مخطط قاعدة البيانات الكامل
-- ============================================================
-- هذا الملف ينشئ الجداول التسعة اللي اتفقنا عليها بالنقاش.
-- الترتيب مهم: كل جدول ينشأ بعد الجداول اللي يرتبط بها (references)،
-- لأن قاعدة البيانات ما تقبل ربط جدول بجدول غير موجود بعد.
-- ============================================================

-- 1) الفروع: عزل بيانات بنين/بنات
create table branches (
  id serial primary key,
  name text not null
);

-- 2) المستخدمين: معلم / مشرف / مدير
create table users (
  id serial primary key,
  name text not null,
  role text not null check (role in ('teacher', 'supervisor', 'admin')),
  branch_id int references branches(id),  -- فارغ (NULL) = المدير يشوف كل الفروع
  created_at timestamptz default now()
);

-- 3) الحلقات: كل حلقة لها معلم مسؤول
create table halaqat (
  id serial primary key,
  name text not null,
  teacher_id int references users(id),
  branch_id int references branches(id) not null
);

-- 4) الطلاب
create table students (
  id serial primary key,
  name text not null,
  branch_id int references branches(id) not null,
  halaqah_id int references halaqat(id),
  created_at timestamptz default now()
);

-- 5) السجلات اليومية — قلب النظام القرآني
-- نخزّن المدى الخام (من سورة:آية إلى سورة:آية)، لا رقماً مجمّعاً،
-- عشان محرك quranEngine.js يحسب التغطية الحقيقية بلا تضخم.
create table daily_records (
  id serial primary key,
  student_id int references students(id) not null,
  date date not null,
  type text not null,              -- اسم حر: 'جديد' أو 'مراجعة' (المحرك يقبل أي اسم)
  start_surah int not null,
  start_ayah int not null,
  end_surah int not null,
  end_ayah int not null,
  created_at timestamptz default now()
);

-- 6) المستوى المستهدف لكل طالب/فصل
-- نخزّن الهدف نفسه فقط — نسبة التقدم تُحسب لحظياً من daily_records،
-- لا تُخزَّن أبداً (تجنّباً لتكرار خطأ "المهرة" بأرقام تفقد ارتباطها بالواقع).
-- level_number يحدده النظام تلقائياً حسب ترتيب مستويات الطالب (الأول، الثاني، …).
-- يُستخدم لتحديد حجم وحدة المراجعة، ولتحديد متى تنطبق بوابة تسليم السورة.
create table student_levels (
  id serial primary key,
  student_id int references students(id) not null,
  level_number int,
  semester text not null,
  target_start_surah int not null,
  target_start_ayah int not null,
  target_end_surah int not null,
  target_end_ayah int not null
);

-- 7) سجل المحطات — لتفادي إرسال نفس رسالة التهنئة مرتين
-- level_id يربط كل محطة بمستواها المحدد (وليس بالطالب فقط)، عشان لو انعطى
-- الطالب هدف جديد بعد إنهاء هدف قديم، تبدأ محطاته (25/50/75/100%) من جديد
-- بدل ما يظن النظام إنها مكررة من الهدف القديم.
create table milestone_log (
  id serial primary key,
  student_id int references students(id) not null,
  level_id int references student_levels(id),
  milestone_percent int not null,
  notified_at timestamptz default now()
);

-- 7ب) نتائج اختبارات نهاية المستوى — كل محاولة اختبار سجل مستقل (يدعم إعادة الاختبار)
create table exam_results (
  id serial primary key,
  level_id int references student_levels(id) not null,
  exam_date date not null,
  score numeric not null,
  grade text not null,          -- التقدير المشتق من الدرجة وقت الرصد (لا يُعاد حسابه لاحقاً)
  passed boolean not null,
  retry_date date,              -- يُملأ فقط لو رسب الطالب
  created_at timestamptz default now()
);

-- 7ج) تسليم السور — كل محاولة تسليم صف مستقل (تدعم إعادة التسليم بعد الخطأ)
-- الطالب لا ينتقل للسورة التالية في الجديد إلا بوجود صف approved = true لسورته
-- المكتملة. تنطبق من المستوى الثاني فما فوق.
create table surah_deliveries (
  id serial primary key,
  student_id int references students(id) not null,
  surah_number int not null,
  delivered_at date not null,
  approved boolean not null default false,
  created_at timestamptz default now()
);

-- 8) تذاكر الترفيه الأسبوعية — وثيقة رسمية مُصدرة، لا تُعاد حسابها لاحقاً
create table weekly_tickets (
  id serial primary key,
  student_id int references students(id) not null,
  week_start date not null,
  issued_at timestamptz default now()
);

-- 9) طلبات الاعتماد المالي — وثيقة رسمية بمبلغ ثابت وقت الاعتماد
create table financial_requests (
  id serial primary key,
  branch_id int references branches(id) not null,
  week_start date not null,
  ticket_count int not null,
  total_amount numeric not null,
  status text not null default 'قيد المراجعة',
  created_at timestamptz default now()
);
