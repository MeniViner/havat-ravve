import React from 'react';import {createRoot} from 'react-dom/client';import Admin from './Admin';import {transport} from './transport';import './admin.css';
createRoot(document.getElementById('root')!).render(<Admin transport={transport}/>);
