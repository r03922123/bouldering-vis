/** A real ImageData in the browser; a structural stand-in where the constructor is missing (jsdom). */
export function makeImageData(width: number, height: number): ImageData {
  if (typeof ImageData !== 'undefined') return new ImageData(width, height);
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
    colorSpace: 'srgb',
  } as ImageData;
}
