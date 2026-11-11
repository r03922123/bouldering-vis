import levelFile from '../../../tests/fixtures/synthetic-route.level.json';
import betasFile from '../../../tests/fixtures/synthetic-route.betas.json';
import type { RouteHold, WallFoot } from '../beta-moves';
import type { WallAngle } from '../climber-stance';
import type { PlayWall } from './play';

// Tests only: the synthetic route (ADR-0003 (e); beta-moves' synthetic-route.test.ts) as Play's
// wall input, and its betas.

export const SYNTHETIC: PlayWall = {
  holds: levelFile.holds as RouteHold[],
  wallFeet: levelFile.wallFeet as unknown as WallFoot[],
  height: levelFile.height,
  wallAngleDeg: levelFile.wallAngleDeg as WallAngle,
  photo: levelFile.photo,
};

export const SYNTHETIC_BETAS: { name: string; text: string }[] = betasFile.betas;
export const betaText = (name: string) => SYNTHETIC_BETAS.find((b) => b.name === name)!.text;
