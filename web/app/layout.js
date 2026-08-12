import "./globals.css";
import { ASSOCIATION_NAME } from "@/lib/association";
import { getOptionalUser, canAccess } from "@/lib/auth";
import { NAV_LINKS, ROLE_LABELS } from "@/lib/nav";
import AppNav from "./AppNav";

export const metadata = {
  title: "نظام الحلقات",
  description: `نظام إدارة حلقات التحفيظ — ${ASSOCIATION_NAME}`,
};

export default async function RootLayout({ children }) {
  // اللايهوت يعمل على صفحة تسجيل الدخول أيضاً، فنقرأ المستخدم بلا تحويل:
  // بلا حساب، لا شريط تنقّل.
  const { profile } = await getOptionalUser();
  const links = profile ? NAV_LINKS.filter((l) => canAccess(profile.role, l.page)) : [];

  return (
    <html lang="ar" dir="rtl" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50">
        {profile && (
          <AppNav
            links={links}
            userName={profile.name}
            roleLabel={ROLE_LABELS[profile.role] ?? profile.role}
          />
        )}
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
