import type { Metadata, Viewport } from 'next';
import './globals.css';
import { CartProvider } from '@/context/CartContext';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { ConfirmProvider } from '@/context/ConfirmModalContext';
import { NotificationsProvider } from '@/context/NotificationsContext';
import StoreLayoutWrapper from '@/components/StoreLayoutWrapper';
import ServiceWorkerCleaner from '@/components/ServiceWorkerCleaner';
import PWAInstallPrompt from '@/components/PWAInstallPrompt';

export const viewport: Viewport = {
  themeColor: '#1b8738',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: 'سوق الجملة | الأكبر والأشمل في كربلاء 🇮🇶',
  description: 'المتجر العراقي الرسمي لـ سوق الجملة - الأكبر والأشمل في كربلاء لتجارة وتوريد المواد الغذائية والسناكات بالجملة والمفرد بالدينار العراقي.',
  applicationName: 'سوق الجملة',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'سوق الجملة',
    statusBarStyle: 'default',
  },
  icons: {
    icon: '/app-icon.png',
    shortcut: '/app-icon.png',
    apple: '/apple-touch-icon.png',
  },
  keywords: 'سوق الجملة, سوق الجملة كربلاء, الأكبر والأشمل في كربلاء, جملة ومفرد, كربلاء, العراق, سناكات, مواد غذائية',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen flex flex-col bg-[#f3f8fc] text-slate-900 selection:bg-brand-blue selection:text-white">
        <ServiceWorkerCleaner />
        <PWAInstallPrompt />
        <ToastProvider>
          <ConfirmProvider>
            <AuthProvider>
              <CartProvider>
                <NotificationsProvider>
                  <StoreLayoutWrapper>
                    {children}
                  </StoreLayoutWrapper>
                </NotificationsProvider>
              </CartProvider>
            </AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
