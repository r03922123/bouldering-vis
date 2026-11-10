import { render, screen } from '@testing-library/react';
import { useAppStore } from '../../store/app';
import { DepthLegend, DepthStatusLine } from './DepthView';

describe('DepthLegend', () => {
  it('labels near and far and says the scale is relative', () => {
    render(<DepthLegend />);
    expect(screen.getByText('Near')).toBeInTheDocument();
    expect(screen.getByText('Far')).toBeInTheDocument();
    expect(screen.getByText(/relative, not to scale/i)).toBeInTheDocument();
  });
});

describe('DepthStatusLine', () => {
  beforeEach(() => useAppStore.setState(useAppStore.getInitialState()));

  it('says when depth is being computed', () => {
    useAppStore.setState({ depthStatus: { state: 'running' } });
    render(<DepthStatusLine />);
    expect(screen.getByRole('status')).toHaveTextContent('Estimating depth…');
  });
});
