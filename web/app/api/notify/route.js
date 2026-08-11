import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const table = searchParams.get('table');
  const id = searchParams.get('id');
  const phone = searchParams.get('phone');
  const text = searchParams.get('text');

  if (table === 'attendance' || table === 'milestone_log') {
    const supabase = await createClient();
    await supabase.from(table).update({ notified: true }).eq('id', id);
  }

  const digits = (phone || '').replace(/\D/g, '');
  redirect(`https://wa.me/${digits}?text=${encodeURIComponent(text || '')}`);
}
