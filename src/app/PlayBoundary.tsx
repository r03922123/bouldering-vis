import { Component, type ReactNode } from 'react';

/**
 * Review finding 2 (c): if the Play screen throws, only the wall goes. The fallback offers the way
 * back to the gym (or, on the front-door wall, which has none, a reload: SPEC-launch-wall-2 R3)
 * and leaves the store alone, so the photo and its route in memory are kept.
 * It unmounts when the player leaves the wall, so the next visit starts clean.
 */
export class PlayBoundary extends Component<
  { onBack?: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="play-kept">
        <p>Something went wrong on this wall. Your photo and route are still here.</p>
        {this.props.onBack ? (
          <button type="button" onClick={this.props.onBack}>
            Back to the gym
          </button>
        ) : (
          <button type="button" onClick={() => window.location.reload()}>
            Try again
          </button>
        )}
      </div>
    );
  }
}
