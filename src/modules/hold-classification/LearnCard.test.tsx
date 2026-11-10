import { fireEvent, render, screen } from '@testing-library/react';
import { LearnButton } from './LearnCard';

describe('Learn card', () => {
  it('opens a labeled dialog for the type: how to hold, a common mistake, and footwork', () => {
    render(<LearnButton type="crimp" />);
    const button = screen.getByRole('button', { name: 'Learn about Crimp' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    const dialog = screen.getByRole('dialog', { name: 'Crimp' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(dialog).toHaveTextContent('How to hold');
    expect(dialog).toHaveTextContent('Half-crimp by default');
    expect(dialog).toHaveTextContent('Common mistake');
    expect(dialog).toHaveTextContent('Full-crimping everything');
    expect(dialog).toHaveTextContent('As a foothold');
    // Focus moves into the card so keyboard users land on it.
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it('closes with Esc or the close button and gives focus back to the Learn button', () => {
    render(<LearnButton type="crimp" />);
    const button = screen.getByRole('button', { name: 'Learn about Crimp' });
    fireEvent.click(button);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('shows no catalog photos while Learn photos are off', () => {
    render(<LearnButton type="crimp" />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn about Crimp' }));
    const dialog = screen.getByRole('dialog', { name: 'Crimp' });
    // The card still teaches: its text shows, only the photos and their credit line are gone.
    expect(dialog).toHaveTextContent('Half-crimp by default');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(dialog).not.toHaveTextContent('Photos:');
  });

  it('shows example photos with alt text and a credit for each, when the catalog has them', () => {
    render(
      <LearnButton
        type="crimp"
        examples={[
          {
            src: '/learn/crimp-1.webp',
            credit: 'Someone',
            license: 'CC BY 4.0',
            sourceUrl: 'https://x',
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Learn about Crimp' }));
    expect(screen.getByRole('img', { name: 'Example of a crimp, 1 of 1' })).toHaveAttribute(
      'src',
      '/learn/crimp-1.webp',
    );
    expect(screen.getByRole('link', { name: 'Someone' })).toHaveAttribute('href', 'https://x');
    expect(screen.getByRole('dialog')).toHaveTextContent('CC BY 4.0');
  });
});
