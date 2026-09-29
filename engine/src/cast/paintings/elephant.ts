/**
 * The elephant of heaven, painted (D94): walking the air in its crimson
 * and gold (`content/paintings/elephant.yaml`). Sized trunk to tail.
 */
import { churn } from "../life/churn.js";
import { flutter } from "../life/flutter.js";
import { gait } from "../life/gait.js";
import { pitch } from "../life/pitch.js";
import { serpent } from "../life/serpent.js";
import { registerPainting } from "../painting.js";

const NEAR_HIND = [{ at: [130, 855], r: 85 }, { at: [240, 850], r: 90 }] as const;
const FAR_HIND = [{ at: [440, 870], r: 85 }, { at: [560, 870], r: 85 }] as const;
const FAR_FORE = [{ at: [685, 890], r: 75 }, { at: [790, 890], r: 80 }] as const;
const NEAR_FORE = [{ at: [920, 910], r: 90 }, { at: [1060, 905], r: 100 }] as const;

/**
 * Its life (D96): a slow, short-stepped walk, the great body rising and
 * settling over each leg, each foot's cloud pressed flat under its
 * weight and a print of it left behind as the foot lifts. The trunk sways, the ear stirs, and the tail swings its tassel.
 */
registerPainting("elephant", {
  views: [
    {
      name: "default",
      url: "cast/elephant-default.webp",
      faces: "right",
      aspect: 1367 / 990,
      feet: 0.12,
      size: { across: 0.97 },
      pixels: [1367, 990],
      life: [
        gait({
          strideHz: 0.4,
          swing: 0.12,
          fold: 0.25,
          bob: 8,
          legs: [
            { foot: "near-hind", line: [[300, 480], [230, 690], [220, 800]], radius: 80, painted: -0.6, cloud: NEAR_HIND },
            { foot: "far-hind", line: [[540, 600], [540, 740], [540, 800]], radius: 70, painted: 0, cloud: FAR_HIND },
            { foot: "far-fore", line: [[730, 600], [730, 740], [730, 810]], radius: 70, painted: -0.2, cloud: FAR_FORE },
            { foot: "near-fore", line: [[820, 480], [930, 720], [970, 830]], radius: 85, painted: 0.8, cloud: NEAR_FORE },
          ],
          head: { regions: [{ at: [1000, 250], r: 170 }], nod: 5 },
          prints: true,
        }),
        serpent({ spine: [[1050, 380], [1090, 470], [1170, 530], [1260, 520], [1330, 450], [1330, 360], [1270, 320], [1240, 350]], radius: 40, reach: 70, waves: 0.7, swing: 0.03, bob: 0 }),
        serpent({ spine: [[260, 460], [200, 540], [150, 590], [100, 670], [70, 760]], radius: 35, reach: 70, waves: 0.8, swing: 0.06, bob: 0 }),
        flutter({ root: [880, 150], stir: 6, regions: [{ at: [790, 280], r: 100 }] }),
        churn({ swirl: 6, within: [...NEAR_HIND, ...FAR_HIND, ...FAR_FORE, ...NEAR_FORE] }),
        pitch({ most: 0.1 }),
      ],
    },
  ],
});
