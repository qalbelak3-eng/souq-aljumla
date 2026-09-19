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
import AbandonedCartNotifier from '@/components/AbandonedCartNotifier';
import CustomerGreetingsNotifier from '@/components/CustomerGreetingsNotifier';
import { ScrollNavProvider } from '@/context/ScrollNavContext';

export const viewport: Viewport = {
  themeColor: '#fff8c1',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  metadataBase: new URL('https://souqaljomla.com'),
  alternates: {
    canonical: 'https://souqaljomla.com',
  },
  title: 'سوق جملة كربلاء | الأكبر والأشمل لتجارة المواد الغذائية بالجملة',
  description: 'المتجر العراقي الرسمي لـ سوق جملة كربلاء (سوق الجملة) - الأكبر والأشمل في كربلاء لتجارة وتوريد المواد الغذائية والسناكات بالجملة والمفرد بالدينار العراقي.',
  applicationName: 'سوق جملة كربلاء',
  manifest: '/manifest.json',
  openGraph: {
    siteName: 'سوق جملة كربلاء',
    title: 'سوق جملة كربلاء | الأكبر والأشمل في كربلاء',
    description: 'المتجر العراقي الرسمي لـ سوق جملة كربلاء - الأكبر والأشمل لتجارة وتوريد المواد الغذائية والسناكات بالجملة والمفرد.',
    url: 'https://souqaljomla.com',
    locale: 'ar_IQ',
    type: 'website',
    images: [
      {
        url: '/app-icon.png',
        width: 512,
        height: 512,
        alt: 'سوق جملة كربلاء',
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: 'سوق جملة كربلاء',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/favicon.ico?v=4', sizes: '48x48' },
      { url: '/favicon.png?v=4', sizes: '48x48', type: 'image/png' },
      { url: '/icon-192.png?v=4', sizes: '192x192', type: 'image/png' },
      { url: '/app-icon.png?v=4', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/favicon.ico?v=4',
    apple: [
      { url: '/apple-touch-icon.png?v=4', sizes: '180x180', type: 'image/png' },
    ],
  },
  keywords: 'سوق جملة كربلاء, سوق الجملة, سوق الجملة كربلاء, الأكبر والأشمل في كربلاء, جملة ومفرد, كربلاء, العراق, سناكات, مواد غذائية',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        {/* Explicit Cache-Busted Favicon Links to overwrite browser icon cache immediately */}
        <link rel="icon" type="image/png" sizes="48x48" href="/favicon.png?v=4" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png?v=4" />
        <link rel="icon" type="image/png" sizes="512x512" href="/app-icon.png?v=4" />
        <link rel="icon" type="image/x-icon" href="/favicon.ico?v=4" />
        <link rel="shortcut icon" href="/favicon.ico?v=4" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=4" />

        {/* Google Official Site Name Structured Data (Schema.org JSON-LD) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              'name': 'سوق جملة كربلاء',
              'alternateName': [
                'سوق الجملة كربلاء',
                'سوق الجملة في كربلاء',
                'سوق الجملة',
                'سوق جملة كربلاء العراقي',
                'Souq Al-Jumla Karbala',
                'Souq Al-Jumla'
              ],
              'url': 'https://souqaljomla.com',
              'description': 'المتجر العراقي الرسمي لـ سوق جملة كربلاء لتجارة وتوريد المواد الغذائية والسناكات بالجملة والمفرد',
              'inLanguage': 'ar-IQ'
            }),
          }}
        />

        {/* Google Official Organization Structured Data (Schema.org JSON-LD) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              'name': 'سوق جملة كربلاء',
              'alternateName': 'سوق الجملة',
              'url': 'https://souqaljomla.com',
              'logo': 'https://souqaljomla.com/app-icon.png'
            }),
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  window.addEventListener('beforeinstallprompt', function(e) {
                    e.preventDefault();
                    window.deferredPWAInstallPrompt = e;
                    window.dispatchEvent(new Event('pwa-prompt-ready'));
                  });
                  if ('serviceWorker' in navigator) {
                    window.addEventListener('load', function() {
                      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function(err) {
                        console.warn('SW registration:', err);
                      });
                    });
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-screen flex flex-col bg-white text-slate-900 selection:bg-brand-blue selection:text-white">
        <ServiceWorkerCleaner />
        <PWAInstallPrompt />
        <ToastProvider>
          <ConfirmProvider>
            <AuthProvider>
              <CustomerGreetingsNotifier />
              <CartProvider>
                <AbandonedCartNotifier />
                <NotificationsProvider>
                  <ScrollNavProvider>
                    <StoreLayoutWrapper>
                      {children}
                    </StoreLayoutWrapper>
                  </ScrollNavProvider>
                </NotificationsProvider>
              </CartProvider>
            </AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
