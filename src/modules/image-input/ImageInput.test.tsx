import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ImageInput } from './ImageInput';
import type { WorkingImage } from './types';

vi.mock('./load', async (importOriginal) => {
  const real = await importOriginal<typeof import('./load')>();
  return {
    // Validation stays real; decoding (browser-only) is faked for supported types.
    loadImage: vi.fn(async (blob: Blob, name?: string) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type))
        return real.loadImage(blob, name);
      return {
        id: 'img-1',
        width: 4,
        height: 3,
        sourceName: name ?? 'pasted-image',
      } as WorkingImage;
    }),
  };
});

const png = () => new File(['x'], 'wall.png', { type: 'image/png' });

function setup() {
  const onLoad = vi.fn();
  const onError = vi.fn();
  render(<ImageInput onLoad={onLoad} onError={onError} />);
  return { onLoad, onError };
}

describe('ImageInput', () => {
  it('loads an image pasted from the clipboard', async () => {
    const { onLoad } = setup();
    const file = png();
    fireEvent.paste(window, {
      clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }] },
    });
    await waitFor(() =>
      expect(onLoad).toHaveBeenCalledWith(expect.objectContaining({ id: 'img-1' })),
    );
    expect(onLoad.mock.calls[0]![0].sourceName).toBe('pasted-image');
  });

  it('ignores pasted text without an error', async () => {
    const { onLoad, onError } = setup();
    fireEvent.paste(window, {
      clipboardData: { items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }] },
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(onLoad).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('loads a dropped file and highlights the zone while dragging', async () => {
    const { onLoad } = setup();
    const zone = screen.getByTestId('drop-zone');
    fireEvent.dragOver(zone, { dataTransfer: { files: [] } });
    expect(zone).toHaveClass('dragging');
    fireEvent.drop(zone, { dataTransfer: { files: [png()] } });
    expect(zone).not.toHaveClass('dragging');
    await waitFor(() => expect(onLoad).toHaveBeenCalled());
    expect(onLoad.mock.calls[0]![0].sourceName).toBe('wall.png');
  });

  it('reports an unsupported dropped file through onError', async () => {
    const { onLoad, onError } = setup();
    const gif = new File(['x'], 'a.gif', { type: 'image/gif' });
    fireEvent.drop(screen.getByTestId('drop-zone'), { dataTransfer: { files: [gif] } });
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith({ kind: 'unsupported-type', mimeType: 'image/gif' }),
    );
    expect(onLoad).not.toHaveBeenCalled();
  });

  it('offers labeled Choose file and Take photo inputs; the camera input asks for the rear camera', () => {
    setup();
    expect(screen.getByLabelText('Choose file')).toHaveAttribute('type', 'file');
    expect(screen.getByLabelText('Take photo')).toHaveAttribute('capture', 'environment');
  });

  it('loads a file picked with Choose file', async () => {
    const { onLoad } = setup();
    fireEvent.change(screen.getByLabelText('Choose file'), { target: { files: [png()] } });
    await waitFor(() => expect(onLoad).toHaveBeenCalled());
  });
});

describe('ImageInput compact (a photo is loaded)', () => {
  it('collapses to one Change photo button and expands on demand', () => {
    render(<ImageInput onLoad={() => {}} onError={() => {}} compact />);
    expect(screen.queryByLabelText('Choose file')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change photo' }));
    expect(screen.getByLabelText('Choose file')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change photo' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('still accepts a pasted image while collapsed', async () => {
    const onLoad = vi.fn();
    render(<ImageInput onLoad={onLoad} onError={() => {}} compact />);
    const file = new File(['x'], 'wall.png', { type: 'image/png' });
    fireEvent.paste(window, {
      clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }] },
    });
    await waitFor(() => expect(onLoad).toHaveBeenCalled());
  });

  it('collapses again once the new photo loads', async () => {
    const onLoad = vi.fn();
    render(<ImageInput onLoad={onLoad} onError={() => {}} compact />);
    fireEvent.click(screen.getByRole('button', { name: 'Change photo' }));
    fireEvent.change(screen.getByLabelText('Choose file'), { target: { files: [png()] } });
    await waitFor(() => expect(onLoad).toHaveBeenCalled());
    expect(screen.queryByLabelText('Choose file')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change photo' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('stays open after a failed load, so the user can pick another file', async () => {
    const onError = vi.fn();
    render(<ImageInput onLoad={() => {}} onError={onError} compact />);
    fireEvent.click(screen.getByRole('button', { name: 'Change photo' }));
    const gif = new File(['x'], 'wall.gif', { type: 'image/gif' });
    fireEvent.change(screen.getByLabelText('Choose file'), { target: { files: [gif] } });
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(screen.getByLabelText('Choose file')).toBeInTheDocument();
  });
});
