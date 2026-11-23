import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import './app/app.css';
import { isNative, installNativeLinks } from './app/native';

// Inside the iPhone app the files are already on the phone (and WKWebView has no service worker for capacitor://).
if (!isNative && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
installNativeLinks();
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
