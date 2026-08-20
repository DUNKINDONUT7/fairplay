import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Force clear the console in development to remove phantom warnings from Vite HMR
if (import.meta.env.DEV) {
  console.clear();
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);