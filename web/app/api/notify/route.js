import { redirect } from 'next/navigation';
import { requireRole, PAGE_ROLES } from '@/lib/auth';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const table = searchParams.get('table');
  const id = searchParams.get('id');
  const phone = searchParams.get('phone');
  const text = searchParams.get('text');

  const { supabase } = await requireRole(PAGE_ROLES.messages);

  if (table === 'attendance' || table === 'milestone_log') {
    await supabase.from(table).update({ notified: true }).eq('id', id);
  }

  const digits = (phone || '').replace(/\D/g, '');
  redirect(`https://wa.me/${digits}?text=${encodeURIComponent(text || '')}`);
}
