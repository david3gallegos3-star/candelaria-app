import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the login screen', () => {
  render(<App />);
  const descripcion = screen.getByText(/plataforma integral para gestión de fórmulas/i);
  expect(descripcion).toBeInTheDocument();
});
