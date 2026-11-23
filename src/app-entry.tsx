import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import './app/app.css';
import { isNative, installAndroidAppLinks, installNativeLinks } from './app/native';

// Installed apps load their assets from the package. Only the website needs a service worker.
if (!isNative && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
installNativeLinks();
const mount = () => createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
if (isNative) void installAndroidAppLinks().then(mount, mount);
else mount();
