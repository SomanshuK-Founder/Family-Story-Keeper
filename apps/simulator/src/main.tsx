import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@story-keeper/ui/styles.css';
import './styles.css';
import { SimulatorApp } from './SimulatorApp.js';

const root = document.querySelector('#root');
if (root === null) throw new Error('Simulator root element is missing.');

createRoot(root).render(
  <StrictMode>
    <SimulatorApp />
  </StrictMode>,
);
