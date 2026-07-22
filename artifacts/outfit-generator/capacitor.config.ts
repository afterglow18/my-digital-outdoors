import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mydigitaloutdoors.app',
  appName: 'My Outdoors',
  webDir: 'dist/public',

  // -------------------------------------------------------------------------
  // iOS-specific configuration
  // -------------------------------------------------------------------------
  ios: {
    // Allow the WKWebView to scroll; the app manages its own scroll areas
    scrollEnabled: true,
    // Prevents white flash on launch
    backgroundColor: '#F9F4EE',
    // Allow inline media playback (used for wardrobe image previews)
    allowsInlineMediaPlayback: true,

    // -------------------------------------------------------------------------
    // Privacy usage descriptions — required by iOS TCC; missing any one causes
    // a hard crash (SIGABRT) or silent refusal when camera/library is accessed.
    // -------------------------------------------------------------------------
    infoPlist: {
      NSCameraUsageDescription:
        'My Outdoors uses your camera to photograph clothing items for your wardrobe.',
      NSPhotoLibraryUsageDescription:
        'My Outdoors reads your photo library so you can add clothing photos to your wardrobe.',
      NSPhotoLibraryAddUsageDescription:
        'My Outdoors saves captured photos to your photo library.',
    },
  },

  plugins: {
    // Keep the splash screen visible until the React app signals it is ready
    SplashScreen: {
      launchShowDuration: 1800,
      launchAutoHide: true,
      backgroundColor: '#F9F4EE',
      iosSpinnerStyle: 'small',
      showSpinner: false,
    },

    // Overlay the status bar so the cream background shows through the notch
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#F9F4EE',
      overlaysWebView: true,
    },
  },
};

export default config;
