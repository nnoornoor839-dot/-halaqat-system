'use client';

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="no-print bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg px-6 py-3 transition"
    >
      🖨️ طباعة / حفظ PDF
    </button>
  );
}
