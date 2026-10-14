// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SimulatorApp } from './SimulatorApp.js';
import './test-setup.js';

describe('SimulatorApp', () => {
  it('renders the shared Story Keeper controls and simulator regions', () => {
    render(<SimulatorApp />);

    expect(screen.getByRole('heading', { name: 'Simulator', level: 1 })).toBeInTheDocument();
    expect(screen.getByLabelText('Narrator')).toHaveValue('rosa');
    expect(screen.getByLabelText('Relative')).toHaveValue('maya');
    expect(screen.getByRole('button', { name: '+3 Days' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'A story begins here' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'A family moment' })).toBeInTheDocument();
  });

  it('advances the visible demo date without contacting a backend', () => {
    render(<SimulatorApp />);
    fireEvent.click(screen.getByRole('button', { name: '+3 Days' }));
    expect(screen.getByText('Demo day: +3 days')).toBeInTheDocument();
  });
});
