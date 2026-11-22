import { createRoot } from 'react-dom/client';
import { Console } from './console/Console';
import './console/console.css';

createRoot(document.getElementById('root')!).render(<Console />);
