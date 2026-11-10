import { PixelButton } from './hud/PixelButton';
import { useSfx } from './useSfx';

// SPEC-pixel-kit › Sound Effects and AC 35. Sound is off until this is tapped; the tap is the user
// gesture that starts audio, and a tick confirms it. Every toggle on the page shares one player.

export function SoundToggle() {
  const { soundOn, setSoundOn, play } = useSfx();
  return (
    <PixelButton
      label="Sound"
      icon={soundOn ? 'sound-on' : 'sound-off'}
      pressed={soundOn}
      onClick={() => {
        setSoundOn(!soundOn);
        if (!soundOn) play('tick');
      }}
    />
  );
}
