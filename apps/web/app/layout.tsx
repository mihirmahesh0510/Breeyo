import '@breeyo/ui/src/theme/portal.css';
import { Providers } from './providers';

export const metadata = {
  title: 'Breeyo - Veterinary Practice Management',
  description: 'Owner portal for veterinary clinics',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
