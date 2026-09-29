/**
 * The qilin, painted (D94): walking the air, flames at its shoulders and
 * hocks (`content/paintings/qilin.yaml`). Sized nose to tail.
 */
import { churn } from "../life/churn.js";
import { flutter } from "../life/flutter.js";
import { gait } from "../life/gait.js";
import { pitch } from "../life/pitch.js";
import { registerPainting } from "../painting.js";

const NEAR_HIND = [{ at: [310, 950], r: 70 }, { at: [380, 945], r: 75 }, { at: [440, 950], r: 65 }] as const;
const FAR_HIND = [{ at: [700, 945], r: 70 }, { at: [790, 945], r: 70 }] as const;
const FAR_FORE = [{ at: [895, 950], r: 65 }, { at: [970, 945], r: 65 }] as const;
const NEAR_FORE = [{ at: [1150, 955], r: 70 }, { at: [1240, 950], r: 70 }] as const;

/**
 * Its life (D96): a high-stepping walk, each hoof lifting its puff of
 * cloud and pressing it as it lands, and leaving a print of it behind in
 * the air as it lifts, the flames at its hocks carried with its legs. Its mane, its beard and long whisker, and its plumed tail
 * stream and stir; its antlers and face keep still.
 */
registerPainting("qilin", {
  views: [
    {
      name: "default",
      url: "cast/qilin-default.webp",
      faces: "right",
      aspect: 1327 / 1020,
      feet: 0.08,
      size: { across: 0.95 },
      pixels: [1327, 1020],
      life: [
        gait({
          strideHz: 0.55,
          swing: 0.2,
          fold: 0.5,
          bob: 8,
          legs: [
            { foot: "near-hind", line: [[520, 580], [400, 780], [380, 905]], radius: 55, painted: -0.7, cloud: NEAR_HIND },
            { foot: "far-hind", line: [[640, 620], [665, 800], [740, 900]], radius: 50, painted: 0.3, cloud: FAR_HIND },
            { foot: "far-fore", line: [[920, 640], [915, 790], [920, 905]], radius: 50, painted: -0.2, cloud: FAR_FORE },
            { foot: "near-fore", line: [[1040, 600], [1150, 800], [1210, 915]], radius: 55, painted: 0.8, cloud: NEAR_FORE },
          ],
          head: { regions: [{ at: [1110, 220], r: 160 }], nod: 6 },
          prints: true,
        }),
        flutter({ root: [980, 300], stir: 8, regions: [{ at: [860, 280], r: 130 }, { at: [1000, 360], r: 110 }], stiff: [{ at: [850, 110], r: 130 }, { at: [1130, 210], r: 90 }] }),
        flutter({ root: [1210, 230], stir: 10, regions: [{ at: [1280, 360], r: 100 }, { at: [1190, 380], r: 80 }] }),
        flutter({ root: [330, 590], stir: 14, regions: [{ at: [150, 620], r: 170 }] }),
        churn({ swirl: 6, within: [...NEAR_HIND, ...FAR_HIND, ...FAR_FORE, ...NEAR_FORE] }),
        pitch({ most: 0.15 }),
      ],
    },
  ],
});
