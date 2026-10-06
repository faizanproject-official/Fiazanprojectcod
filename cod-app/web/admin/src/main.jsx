import React from 'react';
import { createRoot } from 'react-dom/client';
import '@shopify/polaris/build/esm/styles.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App />);
