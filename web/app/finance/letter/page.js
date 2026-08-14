import { redirect } from 'next/navigation';
import { requireRole, PAGE_ROLES } from '@/lib/auth';
import PrintButton from './PrintButton';

import { ASSOCIATION_NAME } from '@/lib/association';

export default async function FinanceLetterPage({ searchParams }) {
  const params = await searchParams;
  const id = params?.id;

  const { supabase } = await requireRole(PAGE_ROLES.finance);

  if (!id) {
    redirect('/finance');
  }

  const { data: request } = await supabase
    .from('financial_requests')
    .select('id, branch_id, week_start, ticket_count, total_amount, status, created_at')
    .eq('id', id)
    .single();

  if (!request) {
    redirect('/finance');
  }

  const { data: branch } = await supabase
    .from('branches')
    .select('name')
    .eq('id', request.branch_id)
    .single();

  const costPerStudent =
    request.ticket_count > 0 ? (request.total_amount / request.ticket_count).toFixed(2) : '0.00';

  const createdDate = new Date(request.created_at).toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div dir="rtl" className="bg-slate-100 p-4 sm:p-8 print:bg-white print:p-0">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>

      <div className="max-w-2xl mx-auto no-print mb-6 flex justify-between items-center">
        <a href="/finance" className="text-brand-700 font-bold">
          ← رجوع
        </a>
        <PrintButton />
      </div>

      <div className="max-w-2xl mx-auto bg-white shadow-md border border-slate-300 p-6 sm:p-10 print:shadow-none print:border-0">
        <div className="text-center border-b-4 border-brand-600 pb-5 mb-8 flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt={ASSOCIATION_NAME} className="h-20 w-auto" />
          <p className="text-slate-500">طلب اعتماد صرف — تذاكر الترفيه الأسبوعية</p>
        </div>

        <p className="text-left text-slate-500 mb-6">{createdDate}</p>

        <p className="text-lg leading-loose text-slate-800 mb-6">
          السلام عليكم ورحمة الله وبركاته،
          <br />
          <br />
          نفيدكم بأن عدد الطلاب المستحقين لتذاكر الترفيه الأسبوعية عن فرع{' '}
          <strong>{branch?.name ?? '—'}</strong>، للأسبوع الممتد من{' '}
          <strong>{request.week_start}</strong>، بلغ{' '}
          <strong>{request.ticket_count}</strong> طالباً، وذلك بناءً على استيفائهم شرط الاستحقاق
          (حضور مبكر وإنجاز يومي طوال أيام العمل).
          <br />
          <br />
          نأمل التكرم بالموافقة على اعتماد صرف المبلغ المذكور أدناه لتغطية تكاليف يوم الترفيه.
        </p>

        <table className="w-full border-collapse mb-8">
          <tbody>
            <tr className="border-b border-slate-200">
              <td className="py-3 font-bold text-slate-600">عدد الطلاب المستحقين</td>
              <td className="py-3 text-left font-black">{request.ticket_count}</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="py-3 font-bold text-slate-600">تكلفة الفرد الواحد</td>
              <td className="py-3 text-left font-black">{costPerStudent} ريال</td>
            </tr>
            <tr className="bg-slate-50">
              <td className="py-3 font-bold text-slate-800 text-lg">الإجمالي المطلوب اعتماده</td>
              <td className="py-3 text-left font-black text-brand-700 text-xl">
                {request.total_amount} ريال
              </td>
            </tr>
          </tbody>
        </table>

        {/* سطر التوقيعات: عمودان على الورق والحاسوب، وواحد تحت الآخر على
            الجوال. وخط التوقيع حدٌّ سفلي لا شرطات، فالشرطات عرضها ثابت
            يتمدّد خارج الشاشة الضيقة، والحدّ يتقلّص مع المتاح. */}
        <div className="flex flex-col sm:flex-row print:flex-row justify-between gap-10 sm:gap-6 mt-16 text-slate-600">
          <div className="text-center flex-1">
            <p className="mb-12">توقيع المشرف</p>
            <div className="border-b border-slate-400 mx-auto max-w-[200px]" />
          </div>
          <div className="text-center flex-1">
            <p className="mb-12">اعتماد المدير التنفيذي</p>
            <div className="border-b border-slate-400 mx-auto max-w-[200px]" />
          </div>
        </div>
      </div>
    </div>
  );
}
