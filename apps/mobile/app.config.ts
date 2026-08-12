import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Breeyo',
  slug: 'breeyo',
  version: '1.0.0',
  scheme: 'breeyo',
  orientation: 'portrait',
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'app.breeyo.mobile',
    associatedDomains: ['applinks:breeyo.app'],
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    package: 'app.breeyo.mobile',
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          {
            scheme: 'https',
            host: 'breeyo.app',
            pathPrefix: '/staff-setup',
          },
          {
            scheme: 'https',
            host: 'breeyo.app',
            pathPrefix: '/reset-password',
          },
          {
            scheme: 'https',
            host: 'breeyo.app',
            pathPrefix: '/verify-email',
          },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-sqlite',
    [
      'react-native-vision-camera',
      {
        cameraPermissionText: 'Breeyo needs camera access to scan barcodes',
      },
    ],
  ],
});
