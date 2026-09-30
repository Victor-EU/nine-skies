/**
 * Miyolangsangma's tigress, painted (D94): walking the air with the
 * empty saddle cloth and the bowl; no part of the goddess (`LIVING_FAITHS`,
 * `content/paintings/miyolangsangma.yaml`). Sized nose to tail tip.
 */
import { churn } from "../life/churn.js";
import { gait } from "../life/gait.js";
import { pitch } from "../life/pitch.js";
import { serpent } from "../life/serpent.js";
import { sway } from "../life/sway.js";
import { flutter } from "../life/flutter.js";
import { circlesAlong } from "../life.js";
import { registerPainting } from "../painting.js";

const NEAR_HIND = [{ at: [230, 840], r: 80 }, { at: [330, 845], r: 85 }, { at: [400, 835], r: 70 }] as const;
const FAR_HIND = [{ at: [620, 830], r: 80 }, { at: [720, 830], r: 85 }, { at: [790, 825], r: 65 }] as const;
const FAR_FORE = [{ at: [910, 850], r: 75 }, { at: [1000, 850], r: 80 }, { at: [1060, 850], r: 55 }] as const;
const NEAR_FORE = [{ at: [1180, 875], r: 80 }, { at: [1270, 875], r: 85 }, { at: [1350, 870], r: 65 }] as const;

/**
 * Its life (D96): an unhurried walk, each paw's puff of cloud carried and
 * pressed and a print of it left behind as the paw lifts, the back rocking under the bowl, the head held high and dipping
 * a little. The tail swings its curled tip.
 */
registerPainting("miyolangsangma", {
  views: [
    {
      name: "default",
      url: "cast/miyolangsangma-default.webp",
      faces: "right",
      aspect: 1411 / 955,
      feet: 0.12,
      size: { across: 0.97 },
      pixels: [1411, 955],
      life: [
        gait({
          strideHz: 0.55,
          swing: 0.18,
          fold: 0.4,
          bob: 8,
          legs: [
            { foot: "near-hind", line: [[420, 450], [300, 680], [310, 810]], radius: 65, painted: -0.6, cloud: NEAR_HIND },
            { foot: "far-hind", line: [[620, 600], [660, 730], [720, 800]], radius: 60, painted: 0.3, cloud: FAR_HIND },
            { foot: "far-fore", line: [[950, 600], [950, 740], [960, 820]], radius: 60, painted: 0, cloud: FAR_FORE },
            { foot: "near-fore", line: [[1100, 560], [1230, 760], [1270, 830]], radius: 70, painted: 0.8, cloud: NEAR_FORE },
          ],
          head: { regions: [{ at: [1200, 120], r: 170 }], nod: 5 },
          prints: true,
        }),
        serpent({ spine: [[330, 400], [280, 520], [220, 630], [140, 690], [60, 660], [40, 600], [70, 540]], radius: 40, reach: 85, waves: 0.8, swing: 0.05, bob: 0 }),
        churn({ swirl: 6, within: [...NEAR_HIND, ...FAR_HIND, ...FAR_FORE, ...NEAR_FORE] }),
        pitch({ most: 0.15 }),
      ],
    },
    // Lying at rest on the cloud (F142): she breathes, her tail stirs, the tassels swing, the cloud boils under her.
    {
      name: "rest",
      url: "cast/miyolangsangma-rest.webp",
      faces: "right",
      aspect: 1509 / 950,
      feet: 0.142,
      size: { across: 1.088 },
      pixels: [1509, 950],
      life: [
        sway({ feet: [800, 760], crown: 30, lean: 4 }),
        serpent({ spine: [[380, 650], [250, 700], [120, 720], [40, 680]], radius: 45, reach: 90, waves: 1, swing: 0.03, bob: 0 }),
        flutter({ root: [1000, 420], stir: 4, regions: [{ at: [1030, 540], r: 50 }, { at: [650, 680], r: 80 }] }),
        churn({ swirl: 6, within: circlesAlong([[60, 830], [1480, 830]], 110), spare: [{ at: [1380, 770], r: 80 }, { at: [1180, 770], r: 60 }] }),
      ],
    },
  ],
});
