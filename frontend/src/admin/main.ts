import '../style.css';
import './admin.css';
import { AdminApp } from './app.ts';

new AdminApp(document.querySelector<HTMLDivElement>('#app')!).start();
