import "./globals.css";
import { ASSOCIATION_NAME } from "@/lib/association";

export const metadata = {
  title: "نظام الحلقات",
  description: `نظام إدارة حلقات التحفيظ — ${ASSOCIATION_NAME}`,
};

export default function RootLayout({ children }) {
  // العربية والاتجاه من اليمين على مستوى المستند كله، لا صفحة صفحة
  return (
    <html lang="ar" dir="rtl" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
