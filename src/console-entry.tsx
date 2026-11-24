import { createRoot } from 'react-dom/client';
import { Console } from './console/Console';
import './console/console.css';
import './console/desk/desk.css';
import './console/desk/access.css';
import './console/desk/sending.css';
import './console/desk/data.css';
import './console/desk/farm.css';
import './console/desk/status.css';

createRoot(document.getElementById('root')!).render(<Console />);
