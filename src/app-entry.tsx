import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import { initAppearance } from './app/appearance';
import './app/app.css';

initAppearance();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
