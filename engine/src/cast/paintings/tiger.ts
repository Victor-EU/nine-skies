/**
 * The tiger, painted (D94): prowling the air, bare, on puffs of cloud
 * (`content/paintings/tiger.yaml`). Sized nose to tail.
 */
import { churn } from "../life/churn.js";
import { gait } from "../life/gait.js";
import { pitch } from "../life/pitch.js";
import { serpent } from "../life/serpent.js";
import { sway } from "../life/sway.js";
import { circlesAlong } from "../life.js";
import { registerPainting } from "../painting.js";

const HIND = [{ at: [200, 700], r: 110 }, { at: [320, 690], r: 110 }, { at: [430, 700], r: 110 }] as const;
const FAR_HIND = [{ at: [670, 725], r: 100 }, { at: [770, 725], r: 100 }, { at: [860, 725], r: 100 }] as const;
const FORE = [{ at: [1030, 785], r: 105 }, { at: [1150, 780], r: 105 }, { at: [1270, 780], r: 105 }, { at: [1340, 790], r: 90 }] as const;

/**
 * Its life (D96): a prowl, the near hind, near fore and far hind stepping
 * in turn (the far fore is tucked behind the near one and steps with it),
 * each foot's puff of cloud carried with it, pressed as it lands and
 * leaving a print of itself behind as it lifts. The
 * back rocks, the head dips, and the long tail swings.
 */
registerPainting("tiger", {
  views: [
    {
      name: "default",
      url: "cast/tiger-default.webp",
      faces: "right",
      aspect: 1415 / 910,
      feet: 0.15,
      size: { across: 0.97 },
      pixels: [1415, 910],
      life: [
        gait({
          strideHz: 0.6,
          swing: 0.2,
          bob: 10,
          legs: [
            { foot: "near-hind", line: [[480, 400], [360, 560], [350, 655]], radius: 65, painted: -0.8, cloud: HIND },
            { foot: "far-hind", line: [[690, 450], [700, 590], [780, 670]], radius: 60, painted: 0.4, cloud: FAR_HIND },
            // The far forepaw, tucked behind it, goes with it.
            { foot: "near-fore", line: [[1010, 420], [1140, 660], [1180, 740]], radius: 80, painted: 0.8, cloud: FORE, with: [{ at: [1010, 690], r: 80 }] },
          ],
          head: { regions: [{ at: [1230, 330], r: 170 }], nod: 6 },
          prints: true,
        }),
        serpent({ spine: [[420, 270], [370, 320], [310, 380], [240, 430], [160, 460], [90, 450], [45, 420]], radius: 35, reach: 80, waves: 0.8, swing: 0.05, bob: 0 }),
        churn({ swirl: 6, within: [...HIND, ...FAR_HIND, ...FORE] }),
        pitch({ most: 0.15 }),
      ],
    },
    // Stopped, roaring (F142): it keeps its stance, breathing, its tail swinging, the cloud under its paws boiling.
    {
      name: "roar",
      url: "cast/tiger-roar.webp",
      faces: "right",
      aspect: 1469 / 1006,
      feet: 0.136,
      size: { across: 0.934 },
      pixels: [1469, 1006],
      life: [
        sway({ feet: [800, 830], crown: 20, lean: 6 }),
        serpent({ spine: [[400, 425], [250, 450], [100, 383], [42, 267], [67, 133], [167, 83], [233, 133]], radius: 45, reach: 90, waves: 1, swing: 0.04, bob: 0 }),
        churn({ swirl: 6, within: circlesAlong([[150, 830], [1400, 830]], 110), spare: [{ at: [300, 780], r: 45 }, { at: [717, 800], r: 45 }, { at: [933, 833], r: 45 }, { at: [1267, 800], r: 45 }] }),
      ],
    },
  ],
});
