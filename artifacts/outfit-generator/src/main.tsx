import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { initializeRevenueCat } from './lib/revenuecat';

// Start RC configuration immediately — before React mounts.
// RC Capacitor v13 configure() awaits a CustomerInfo network call, so we fire
// it early and let it run in the background (errors are non-fatal here).
initializeRevenueCat().catch(console.warn);

createRoot(document.getElementById('root')!).render(<App />);
