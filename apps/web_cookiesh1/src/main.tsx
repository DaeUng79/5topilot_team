import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { SessionProvider } from './lib/session';
import { purgeExpiredDrafts } from './lib/draft';
import './styles.css';

purgeExpiredDrafts();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><SessionProvider><App /></SessionProvider></React.StrictMode>,
);
