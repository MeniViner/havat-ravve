import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import { initAppearance } from './app/appearance';
import './app/app.css';
import { installAndroidPushLinks } from './app/native-push';
import { isNative, installAndroidAppLinks, installNativeLinks } from './app/native';

initAppearance();
// Installed apps load their assets from the package. Only the website needs a service worker.
if (!isNative && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
installNativeLinks();
const mount = () => createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
if (isNative) void Promise.allSettled([installAndroidAppLinks(), installAndroidPushLinks()]).then(mount);
else mount();
