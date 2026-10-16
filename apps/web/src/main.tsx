import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { EvaluatorApp } from './features/evaluator/EvaluatorApp';
import './styles.css';

// 평가위원 화면은 /evaluator 경로로 들어온다. 공통 라우터 도입(cookiesh1 협의) 전까지의 임시 분기.
const isEvaluator = window.location.pathname.startsWith('/evaluator');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isEvaluator ? <EvaluatorApp /> : <App />}</React.StrictMode>,
);
