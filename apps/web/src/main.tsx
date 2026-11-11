import { createRoot } from 'react-dom/client';
import { Root } from './Root';
import { initTelegramViewport } from './lib/telegram';
import './seasons.css';
import './index.css';

initTelegramViewport();

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

createRoot(container).render(<Root />);
