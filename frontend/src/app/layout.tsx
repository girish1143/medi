import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: {
    default: 'MediBook — Book trusted doctors in India',
    template: '%s | MediBook',
  },
  description:
    'MediBook is a modern healthcare booking platform to find verified doctors, book in-clinic or online consultations, and manage your care in one place.',
  keywords: ['doctor appointment', 'book doctor online', 'healthcare India', 'MediBook', 'online consultation'],
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  openGraph: {
    title: 'MediBook — Book trusted doctors in India',
    description: 'Verified doctors, transparent fees and instant confirmation.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#1d4ed8',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
