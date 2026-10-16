import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { SessionProvider } from './lib/session';
import { purgeExpiredDrafts } from './lib/draft';
import { ToastProvider } from './ui/ui';
import './styles.css';
import './styles/login.css';
import './styles/evaluate.css';
import './styles/screens.css';

purgeExpiredDrafts();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><SessionProvider><ToastProvider><App /></ToastProvider></SessionProvider></React.StrictMode>,
);
