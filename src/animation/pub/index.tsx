import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PubAnimation } from './PubAnimation.tsx';
import './PubAnimation.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PubAnimation />
  </StrictMode>,
);
