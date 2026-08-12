import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// حماية قاعدة البيانات (RLS) تمنع المستخدم من رؤية بيانات فروع أخرى، لكنها لا تمنعه
// من فتح صفحة ليست من اختصاصه وتنفيذ إجراءاتها على طلاب فرعه. هذي الدوال تسدّ ذلك
// على مستوى الصفحة نفسها.

export async function requireUser() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('users')
    .select('id, name, role, branch_id')
    .eq('id', user.id)
    .single();

  return { supabase, user, profile };
}

// نسخة لا تُحوّل لتسجيل الدخول — يحتاجها اللايهوت العام، لأنه يُشغَّل على صفحة
// تسجيل الدخول نفسها، فالتحويل منها يصنع حلقة لا تنتهي.
export async function getOptionalUser() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, user: null, profile: null };

  const { data: profile } = await supabase
    .from('users')
    .select('id, name, role, branch_id')
    .eq('id', user.id)
    .single();

  return { supabase, user, profile };
}

export async function requireRole(allowedRoles) {
  const ctx = await requireUser();

  if (!ctx.profile || !allowedRoles.includes(ctx.profile.role)) {
    redirect('/dashboard?denied=1');
  }

  return ctx;
}

// أدوار الصفحات — مصدر واحد للحقيقة، تستخدمه الصفحات ولوحة التحكم معاً
// حتى لا يظهر للمستخدم رابط لصفحة سيُمنع منها.
export const PAGE_ROLES = {
  teacher: ['teacher', 'supervisor', 'admin'],
  sard: ['teacher', 'supervisor', 'admin'],
  review: ['teacher', 'supervisor', 'admin'],
  messages: ['teacher', 'supervisor', 'admin'],
  screen: ['teacher', 'supervisor', 'admin'],
  overview: ['supervisor', 'admin'],
  levels: ['supervisor', 'admin'],
  tickets: ['supervisor', 'admin'],
  finance: ['supervisor', 'admin'],
  executive: ['admin'],
};

export function canAccess(role, page) {
  return PAGE_ROLES[page]?.includes(role) ?? false;
}
