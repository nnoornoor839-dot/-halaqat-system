// سلّم التقدير الرسمي — يُستخدم وقت تسجيل نتيجة اختبار جديدة فقط.
// النتائج القديمة المخزّنة لا تتأثر أبداً بأي تعديل هنا لاحقاً (التقدير يُحفظ
// كحقيقة ثابتة وقت الرصد، مو محسوب حياً من الدرجة في كل مرة تُفتح الصفحة).
const SCALE = [
  { min: 90, grade: 'ممتاز' },
  { min: 80, grade: 'جيد جداً' },
  { min: 70, grade: 'جيد' },
  { min: 60, grade: 'مقبول' },
  { min: 0, grade: 'راسب' },
];

export function scoreToGrade(score) {
  return SCALE.find((s) => score >= s.min).grade;
}

export function isPassing(score) {
  return score >= 60;
}
