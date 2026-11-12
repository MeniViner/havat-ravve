import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import './app/base.css';
import './app/farm.css';
import './app/css/eventday.css';
import './app/css/guest.css';
import './app/css/manage.css';
import './app/css/events.css';

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
