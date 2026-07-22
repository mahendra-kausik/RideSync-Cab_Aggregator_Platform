import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { setupGlobalErrorHandling } from './utils/errorHandling';

// Set up global error handling
setupGlobalErrorHandling();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
);