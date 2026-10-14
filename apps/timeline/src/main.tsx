import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@story-keeper/ui/styles.css';
import './styles.css';
import { TimelineApp } from './TimelineApp.js';

const root = document.querySelector('#root');
if (root === null) throw new Error('Timeline root element is missing.');

createRoot(root).render(
  <StrictMode>
    <TimelineApp />
  </StrictMode>,
);
