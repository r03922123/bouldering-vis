import { useMemo, type ButtonHTMLAttributes } from 'react';
import { COLOR } from '../palette';
import { iconArt, type PixelIcon } from './icons';
import { PixelCanvas } from './PixelCanvas';
import { PixelText } from './PixelText';

// SPEC-pixel-kit › Public Interface (PixelButton) and AC 36. A native <button> (.px-button, at
// least 44 × 44 CSS px) whose accessible name is `label`: the icon is aria-hidden and the label's
// real text is in PixelText's visually hidden span.

export function PixelButton({
  label,
  icon,
  pressed,
  className,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon?: PixelIcon;
  pressed?: boolean;
}) {
  const art = useMemo(() => (icon ? iconArt(icon, COLOR.chalk) : null), [icon]);
  return (
    <button
      type={type}
      className={className ? `px-button ${className}` : 'px-button'}
      aria-pressed={pressed}
      {...rest}
    >
      {art && <PixelCanvas art={art} />}
      <PixelText text={label} />
    </button>
  );
}
