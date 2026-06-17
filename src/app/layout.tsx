import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CompliTrack',
  description: 'Store compliance and management platform',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
