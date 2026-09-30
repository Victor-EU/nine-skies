/**
 * The Bull Demon King, painted (D94): the white bull walking the air,
 * Nezha's fire wheel on his right horn (`content/paintings/niumowang.yaml`).
 * Sized muzzle to tail.
 */
import { churn } from "../life/churn.js";
import { circlesAlong } from "../life.js";
import { flutter } from "../life/flutter.js";
import { gait } from "../life/gait.js";
import { pitch } from "../life/pitch.js";
import { serpent } from "../life/serpent.js";
import { sway } from "../life/sway.js";
import { registerPainting } from "../painting.js";

/**
 * Its life (D96): a heavy, head-down stride through the bank of cloud it
 * wades in, the body rolling over each leg and the head tossing. The bank
 * boils about his legs, the tail lashes, the sash's end stirs, and the
 * burning wheel swings on its horn.
 */
registerPainting("niumowang", {
  views: [
    {
      name: "default",
      url: "cast/niumowang-default.webp",
      faces: "right",
      aspect: 1473 / 1014,
      feet: 0.1,
      size: { across: 0.97 },
      pixels: [1473, 1014],
      life: [
        gait({
          strideHz: 0.45,
          swing: 0.15,
          fold: 0.3,
          bob: 12,
          legs: [
            { foot: "near-hind", line: [[420, 520], [340, 760], [330, 950]], radius: 70, painted: -0.5 },
            { foot: "far-hind", line: [[560, 600], [580, 760], [600, 850]], radius: 60, painted: 0.3 },
            { foot: "far-fore", line: [[820, 650], [820, 780], [830, 860]], radius: 60, painted: -0.3 },
            { foot: "near-fore", line: [[900, 520], [1000, 800], [1060, 940]], radius: 90, painted: 0.8 },
          ],
          head: { regions: [{ at: [1190, 440], r: 170 }], nod: 10 },
        }),
        serpent({ spine: [[380, 390], [320, 470], [270, 560], [220, 620], [140, 650], [60, 640]], radius: 40, reach: 90, waves: 0.8, swing: 0.05, bob: 0 }),
        flutter({ root: [520, 400], stir: 8, regions: [{ at: [380, 590], r: 90 }] }),
        flutter({ root: [1395, 250], stir: 12, regions: [{ at: [1380, 400], r: 170 }], stiff: [{ at: [1400, 190], r: 110 }] }),
        churn({ swirl: 8, within: circlesAlong([[170, 860], [450, 880], [750, 900], [1050, 930]], 150) }),
        pitch({ most: 0.12 }),
      ],
    },
    // Stopped with his horns lowered at Nezha (F142): he breathes, his tail lashes, the saddle cloth stirs, Nezha's wheel burns on his horn, the cloud boils.
    {
      name: "horns",
      url: "cast/niumowang-horns.webp",
      faces: "right",
      aspect: 1529 / 985,
      feet: 0.103,
      size: { across: 0.934 },
      pixels: [1529, 985],
      life: [
        sway({ feet: [700, 850], crown: 30, lean: 6 }),
        serpent({ spine: [[383, 383], [217, 433], [100, 483], [50, 500]], radius: 50, reach: 100, waves: 1, swing: 0.05, bob: 0 }),
        flutter({ root: [600, 300], stir: 5, regions: [{ at: [420, 560], r: 100 }] }),
        flutter({ root: [1425, 600], stir: 6, pace: 4, ripple: 70, regions: [{ at: [1425, 600], r: 130 }] }),
        churn({ swirl: 8, within: circlesAlong([[80, 800], [1250, 800]], 110), spare: [{ at: [1100, 830], r: 60 }, { at: [290, 870], r: 50 }] }),
      ],
    },
  ],
});
