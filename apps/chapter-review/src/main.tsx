import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppErrorBoundary } from '@story-keeper/ui';
import '@story-keeper/ui/styles.css';
import './styles.css';
import { ChapterReviewApp } from './ChapterReviewApp.js';

const root = document.querySelector('#root');
if (root === null) throw new Error('Chapter review root element is missing.');

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>
      <ChapterReviewApp />
    </AppErrorBoundary>
  </StrictMode>,
);
