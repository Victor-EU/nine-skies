/**
 * A challenge in the form the runtime is handed it (D37).
 *
 * The same contract as `ExpeditionPlan`: everything is projected, cut by the
 * content step, and nothing here is re-derived in the browser. A runtime that
 * measured its own gate positions could disagree with the check that passed
 * it, which is the one thing a bundle must not do (D21's argument).
 *
 * **There are four kinds here and six in the schema, and that is the finding
 * rather than a shortcut.** The plan's *land-in-radius* and
 * *reach-before-time* are one disc with different conditions on it, because
 * the deadline in the second belongs to the challenge; *hold-altitude* and
 * *stay-on-instruments* are one band with and without a heading, because the
 * obscuring half of an instrument challenge is weather the aeroplane flies
 * through rather than anything an objective can test. Six names an author
 * needs, four behaviours an engine has (F43).
 */
import type { SpeedMode } from "../sim/scale.js";
import type { ChallengeSpec, ChallengeStart, Deadline } from "./challenge.js";
import {
  FollowLine,
  GateSequence,
  HoldBand,
  ReachDisc,
  type Gate,
  type LinePoint,
  type Objective,
} from "./objectives.js";

export interface DiscPlan {
  readonly kind: "disc";
  readonly id: string;
  readonly label: string;
  readonly eastM: number;
  readonly northM: number;
  readonly radiusM: number;
  readonly maxAglM?: number | undefined;
  readonly maxGroundSpeedKmPerMin?: number | undefined;
}

export interface GatesPlan {
  readonly kind: "gates";
  readonly id: string;
  readonly label: string;
  readonly gates: readonly Gate[];
}

export interface BandPlan {
  readonly kind: "band";
  readonly id: string;
  readonly label: string;
  readonly minM: number;
  readonly maxM: number;
  readonly aboveGround?: boolean | undefined;
  readonly seconds: number;
  readonly headingRad?: number | undefined;
  readonly headingToleranceRad?: number | undefined;
}

export interface LinePlan {
  readonly kind: "line";
  readonly id: string;
  readonly label: string;
  readonly points: readonly LinePoint[];
  readonly corridorM: number;
}

export type ObjectivePlan = DiscPlan | GatesPlan | BandPlan | LinePlan;

export interface ChallengePlan {
  readonly id: string;
  readonly name: string;
  readonly bite: string;
  readonly speed: SpeedMode;
  readonly start: ChallengeStart;
  readonly objectives: readonly ObjectivePlan[];
  readonly deadline?: Deadline | undefined;
}

export function objectiveFromPlan(p: ObjectivePlan): Objective {
  switch (p.kind) {
    case "disc":
      return new ReachDisc(p);
    case "gates":
      return new GateSequence(p);
    case "band":
      return new HoldBand(p);
    case "line":
      return new FollowLine(p);
  }
}

/** A fresh attempt at a planned challenge. */
export function specFromPlan(plan: ChallengePlan): ChallengeSpec {
  return {
    id: plan.id,
    name: plan.name,
    start: plan.start,
    objectives: plan.objectives.map(objectiveFromPlan),
    deadline: plan.deadline,
  };
}
