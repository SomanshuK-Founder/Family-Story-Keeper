import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppErrorBoundary } from '@story-keeper/ui';
import '@story-keeper/ui/styles.css';
import './styles.css';
import { FamilyTreeApp } from './FamilyTreeApp.js';

const root = document.querySelector('#root');
if (root === null) throw new Error('Family tree root element is missing.');

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>
      <FamilyTreeApp />
    </AppErrorBoundary>
  </StrictMode>,
);
