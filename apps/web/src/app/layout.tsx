import type { Metadata, Viewport } from 'next';
import { Header } from '@/components/Header';
import { AuthProvider } from '@/lib/auth';
import { I18nProvider } from '@/lib/i18n';
import './globals.css';

export const metadata: Metadata = {
  title: 'KrisiMandi – कृषिमण्डी',
  description: 'Sell your harvest from the farm. Buyers in Sarlahi make offers or bid.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = { themeColor: '#2f7a3e', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ne">
      <body>
        <I18nProvider>
          <AuthProvider>
            <Header />
            <main className="main">{children}</main>
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
