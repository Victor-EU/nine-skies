/**
 * The qilin, painted (D94): walking the air, flames at its shoulders and
 * hocks (`content/paintings/qilin.yaml`). Sized nose to tail.
 */
import { churn } from "../life/churn.js";
import { flutter } from "../life/flutter.js";
import { gait } from "../life/gait.js";
import { pitch } from "../life/pitch.js";
import { sway } from "../life/sway.js";
import { serpent } from "../life/serpent.js";
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
    // Stopped, looking back (F142): it keeps its stance, its mane stirs, its flames lick, its tail swings, the cloud under its hooves boils.
    {
      name: "look",
      url: "cast/qilin-look.webp",
      faces: "right",
      aspect: 1313 / 1024,
      feet: 0.089,
      size: { across: 1.095 },
      pixels: [1313, 1024],
      life: [
        sway({ feet: [700, 930], crown: 20, lean: 5 }),
        serpent({ spine: [[400, 480], [280, 450], [170, 470], [90, 560], [70, 680]], radius: 50, reach: 110, waves: 1, swing: 0.04, bob: 0 }),
        flutter({ root: [1000, 250], stir: 7, regions: [{ at: [1050, 250], r: 120 }], stiff: [{ at: [1010, 190], r: 70 }] }),
        flutter({ root: [820, 380], stir: 6, pace: 4, ripple: 60, regions: [{ at: [800, 380], r: 120 }, { at: [380, 680], r: 90 }, { at: [950, 700], r: 70 }] }),
        churn({ swirl: 6, within: [{ at: [400, 930], r: 90 }, { at: [770, 920], r: 90 }, { at: [1030, 935], r: 90 }, { at: [1160, 810], r: 80 }], spare: [{ at: [400, 870], r: 40 }, { at: [770, 860], r: 40 }, { at: [1030, 875], r: 40 }, { at: [1160, 760], r: 40 }] }),
      ],
    },
  ],
});
