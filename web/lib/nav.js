// روابط التنقّل — مصدر واحد يستخدمه شريط التنقّل ولوحة التحكم معاً،
// وكل رابط مربوط بمفتاح صلاحيته في PAGE_ROLES فلا يظهر لمن يُمنع منه.
export const NAV_LINKS = [
  { page: 'teacher', href: '/teacher', label: 'تحضير اليوم' },
  { page: 'review', href: '/review', label: 'المراجعة' },
  { page: 'overview', href: '/overview', label: 'نظرة عامة' },
  { page: 'levels', href: '/levels', label: 'المستويات والاختبارات' },
  { page: 'tickets', href: '/tickets', label: 'تذاكر الترفيه' },
  { page: 'messages', href: '/messages', label: 'رسائل اليوم' },
  { page: 'finance', href: '/finance', label: 'حاسبة الميزانية' },
  { page: 'executive', href: '/executive', label: 'لوحة القيادة' },
  { page: 'screen', href: '/screen', label: 'شاشة العرض' },
];

export const ROLE_LABELS = {
  teacher: 'معلم',
  supervisor: 'مشرف',
  admin: 'مدير تنفيذي',
};
