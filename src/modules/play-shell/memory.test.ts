import type { Plan } from '../beta-moves';
import {
  forgetPlan,
  forgetPlans,
  planKey,
  REMEMBERED_WALLS,
  rememberedPlan,
  rememberPlan,
} from './memory';

const plan = (n: number) => ({ beta: { steps: [] }, past: [], future: [], n }) as unknown as Plan;

beforeEach(forgetPlans);

describe('the session plan memory', () => {
  it('gives a plan back only for the same wall and the same route', () => {
    rememberPlan(planKey('w1', 'k1'), plan(1));
    expect(rememberedPlan(planKey('w1', 'k1'))).toEqual(plan(1));
    expect(rememberedPlan(planKey('w1', 'k2'))).toBeUndefined();
    expect(rememberedPlan(planKey('w2', 'k1'))).toBeUndefined();
  });

  it('forgets a plan on request, and the oldest wall past the limit', () => {
    rememberPlan(planKey('w1', 'k'), plan(1));
    forgetPlan(planKey('w1', 'k'));
    expect(rememberedPlan(planKey('w1', 'k'))).toBeUndefined();
    for (let i = 0; i <= REMEMBERED_WALLS; i++) rememberPlan(planKey(`w${i}`, 'k'), plan(i));
    expect(rememberedPlan(planKey('w0', 'k'))).toBeUndefined();
    expect(rememberedPlan(planKey(`w${REMEMBERED_WALLS}`, 'k'))).toBeDefined();
  });
});
