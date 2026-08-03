import { Slot } from 'expo-router';
import { AuthProvider } from '../src/providers/AuthProvider';
import { QueryProvider } from '../src/providers/QueryProvider';

export default function RootLayout() {
  return (
    <QueryProvider>
      <AuthProvider>
        <Slot />
      </AuthProvider>
    </QueryProvider>
  );
}
