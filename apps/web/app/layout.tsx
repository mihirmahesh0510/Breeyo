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
      <body>{children}</body>
    </html>
  );
}
