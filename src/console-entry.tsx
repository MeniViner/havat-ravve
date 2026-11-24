import { createRoot } from 'react-dom/client';
import { Console } from './console/Console';
import './console/console.css';
import './console/desk/desk.css';

createRoot(document.getElementById('root')!).render(<Console />);
