import { fireEvent, render, screen } from '@testing-library/react';
import { useAppStore } from '../../store/app';
import { Credits, HoldCard } from './HoldCard';

const top = (p: number) => [
  { type: 'crimp' as const, prob: p },
  { type: 'edge' as const, prob: (1 - p) / 2 },
  { type: 'jug' as const, prob: (1 - p) / 2 },
];

describe('HoldCard', () => {
  beforeEach(() => useAppStore.setState(useAppStore.getInitialState()));

  it('shows only the details before the analysis', () => {
    render(<HoldCard holdId="a" details="Chalk: none" />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('Chalk: none')).toBeInTheDocument();
  });

  it('says it is identifying the type once the analysis has started', () => {
    useAppStore.setState({ analysisTriggered: true });
    render(<HoldCard holdId="a" />);
    expect(screen.getByText('Identifying hold type…')).toBeInTheDocument();
  });

  it('shows the type, a confidence meter and the explanation, with no generic picture', () => {
    useAppStore.setState({
      analysisTriggered: true,
      classifications: { a: { holdId: 'a', top: top(0.72) } },
    });
    render(<HoldCard holdId="a" />);
    expect(screen.getByText('Crimp', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Confidence' })).toHaveAttribute(
      'aria-valuenow',
      '72',
    );
    expect(screen.getByText(/Half-crimp by default/)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('warns calmly when unsure and invites a correction', () => {
    useAppStore.setState({
      analysisTriggered: true,
      classifications: { a: { holdId: 'a', top: top(0.3) } },
    });
    render(<HoldCard holdId="a" />);
    expect(screen.getByRole('note')).toHaveTextContent(
      'Not sure this is a Crimp. Pick the right type if it’s wrong.',
    );
    expect(screen.getByText('Crimp?', { selector: 'strong' })).toBeInTheDocument();
  });

  it('uses the display name with the right article in the warning ("an Edge")', () => {
    useAppStore.setState({
      analysisTriggered: true,
      classifications: {
        a: {
          holdId: 'a',
          top: [
            { type: 'edge', prob: 0.3 },
            { type: 'crimp', prob: 0.2 },
            { type: 'jug', prob: 0.15 },
          ],
        },
      },
    });
    render(<HoldCard holdId="a" />);
    expect(screen.getByRole('note')).toHaveTextContent('Not sure this is an Edge.');
  });

  it('lets the user override the type, which removes the warning', () => {
    useAppStore.setState({
      analysisTriggered: true,
      classifications: { a: { holdId: 'a', top: top(0.3) } },
    });
    render(<HoldCard holdId="a" />);
    const select = screen.getByRole('combobox', { name: 'Hold type' });
    fireEvent.change(select, { target: { value: 'pinch' } });
    expect(useAppStore.getState().classOverrides['a']).toBe('pinch');
    expect(screen.getByText('Pinch', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    fireEvent.change(select, { target: { value: '' } });
    expect(useAppStore.getState().classOverrides['a']).toBeUndefined();
  });

  it('renders the direction slot (with its own control) under the explanation', () => {
    render(<HoldCard holdId="a" direction={<span>Pull down</span>} />);
    expect(screen.getByText('Pull down')).toBeInTheDocument();
  });
});

describe('Credits', () => {
  it('names the models and the on-device privacy', () => {
    render(<Credits />);
    expect(screen.getByText(/never leaves this device/)).toBeInTheDocument();
  });

  it('credits no example photos while Learn photos are off', () => {
    const { container } = render(<Credits />);
    expect(container).toHaveTextContent('Beta Guide');
    expect(container).not.toHaveTextContent('Example photos');
  });

  it("credits the sample photos to this project's author, and links only to Beta Guide", () => {
    const { container } = render(<Credits />);
    expect(container).toHaveTextContent('Sample wall photos: taken by this project’s author.');
    const links = [...container.querySelectorAll('a')].map((a) => a.textContent);
    expect(links).toEqual(['Beta Guide']);
  });
});
