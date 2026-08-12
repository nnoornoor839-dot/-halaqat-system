'use client';

import { useEffect, useState } from 'react';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function ScreenRotator({ slides }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, 10000);
    return () => clearInterval(timer);
  }, [slides.length]);

  if (slides.length === 0) {
    return <p className="text-slate-400 text-3xl">ما فيه بيانات لعرضها.</p>;
  }

  const current = slides[index];
  const isChampions = current.type === 'champions';

  return (
    <div className="w-full max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-5xl font-black text-white">
          {isChampions ? '🏇 فرسان اليوم' : current.name}
        </h1>
        <div className="flex gap-2">
          {slides.map((_, i) => (
            <span
              key={i}
              className={`w-3 h-3 rounded-full ${i === index ? 'bg-emerald-400' : 'bg-slate-600'}`}
            />
          ))}
        </div>
      </div>

      {isChampions ? (
        <div className="flex flex-col gap-4">
          {current.champions.map((c, i) => (
            <div
              key={c.id}
              className="bg-slate-800 rounded-2xl p-6 flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <span className="text-4xl">{MEDALS[i]}</span>
                <div>
                  <span className="text-3xl font-bold text-white block">{c.name}</span>
                  {c.halaqahName && <span className="text-slate-400 text-lg">{c.halaqahName}</span>}
                </div>
              </div>
              <span className="text-2xl font-black text-amber-400">{c.ayahsToday} آية</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {current.students.map((s) => (
            <div
              key={s.id}
              className="bg-slate-800 rounded-2xl p-6 flex items-center justify-between"
            >
              <span className="text-3xl font-bold text-white">{s.name}</span>
              <div className="w-64">
                <div className="flex justify-between text-lg text-slate-300 mb-1">
                  <span>التقدم</span>
                  <span>{s.progress !== null ? `${s.progress}%` : '—'}</span>
                </div>
                <div className="h-4 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-700"
                    style={{ width: `${s.progress ?? 0}%` }}
                  />
                </div>
              </div>
            </div>
          ))}

          {current.students.length === 0 && (
            <p className="text-slate-400 text-2xl text-center py-10">ما فيه طلاب بهذي الحلقة.</p>
          )}
        </div>
      )}
    </div>
  );
}
