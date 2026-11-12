import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import './app/app.css';
import './app/farm.css'; // styles of the new tasks and shopping screens

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
