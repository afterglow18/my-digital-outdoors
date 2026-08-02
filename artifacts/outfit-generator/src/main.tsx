import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { initializeRevenueCat } from './lib/revenuecat';

// Prime the singleton before React mounts so _rcSettled flips to true
// before any component renders. configure() is fire-and-forget; the promise
// resolves synchronously on the next microtask.
initializeRevenueCat().catch(console.warn);

createRoot(document.getElementById('root')!).render(<App />);
