/**
 * The pilgrims, painted (D94): the monk on the white horse, Bajie and Sha
 * on a road of cloud, and the monk alone setting out (`monk`)
 * (`content/paintings/pilgrims.yaml`). Sized across, horse's nose to
 * Sha's pack, and nose to tail for the monk alone.
 */
import { circlesAlong } from "../life.js";
import { churn } from "../life/churn.js";
import { flutter } from "../life/flutter.js";
import { gait } from "../life/gait.js";
import { pitch } from "../life/pitch.js";
import { serpent } from "../life/serpent.js";
import { sway } from "../life/sway.js";
import { registerPainting } from "../painting.js";

const MONK_FAR_HIND = [{ at: [160, 930], r: 75 }, { at: [80, 905], r: 55 }, { at: [230, 950], r: 50 }] as const;
const MONK_NEAR_HIND = [{ at: [350, 930], r: 75 }, { at: [410, 870], r: 60 }, { at: [290, 960], r: 50 }, { at: [445, 945], r: 40 }] as const;
const MONK_FAR_FORE = [{ at: [560, 930], r: 65 }, { at: [500, 960], r: 50 }] as const;
const MONK_NEAR_FORE = [{ at: [690, 960], r: 70 }, { at: [780, 960], r: 55 }, { at: [630, 975], r: 45 }] as const;

/** The three on the road, and the horse: where each is in the picture. */
const SHA = { name: "sha", within: circlesAlong([[250, 150], [250, 560]], 220) } as const;
const BAJIE = { name: "bajie", within: circlesAlong([[660, 250], [660, 600]], 210) } as const;
const HORSE = { name: "horse", within: [{ at: [1150, 300], r: 330 }, { at: [1300, 450], r: 200 }, { at: [1000, 450], r: 200 }] } as const;

/**
 * The pilgrims on the road (D96): Sha and Bajie each walk, keeping their
 * own balance, the hems of their robes swinging; the white horse walks
 * under the monk, its head nodding, its tail, mane and tassels swinging;
 * and the road of cloud boils under them all. Their feet are painted sunk
 * in the road, so they wade: each leg bends the picture about it, the
 * cloud stretching about the foot, rather than being drawn on its own and
 * leaving a hole in the road. Only the horse's near foreleg, which stands
 * clear of the road, strides on its own. Sha's far leg, under his robe in
 * the painting, is borrowed from his near one and shows in front of it as
 * it steps forward. The horse has no far hind: the monk's robe hangs over
 * its hindquarters nearly to the road, so there is nowhere for one to show.
 *
 * The monk alone (D96): the white horse walks, each hoof's puff of cloud
 * carried and pressed and a print of it left behind, its head nodding; its
 * tail swings, its mane and the red tassels of its harness stir. The horse
 * is white, so only its puffs of cloud churn.
 */
registerPainting("pilgrims", {
  views: [
    {
      name: "default",
      url: "cast/pilgrims-default.webp",
      faces: "right",
      aspect: 1473 / 938,
      feet: 0.2,
      size: { across: 0.97 },
      pixels: [1473, 938],
      life: [
        sway({ feet: [330, 665], crown: 115, lean: 8, who: SHA }),
        sway({ feet: [640, 690], crown: 185, lean: 8, who: BAJIE }),
        // Sha's near leg wades; his far one, under his robe in the painting, is the near one again, showing in front of it as it steps forward.
        gait({
          strideHz: 0.55,
          swing: 0.13,
          fold: 0.15,
          bob: 8,
          legs: [
            { foot: "near", line: [[375, 500], [388, 585], [430, 665]], radius: 28, painted: 0.6, inPicture: true },
            { foot: "far", line: [[375, 500], [388, 585], [430, 665]], radius: 28, painted: 0.6, borrow: { shift: [6, -8], shade: 0.55, above: 648 } },
          ],
          who: SHA,
        }),
        gait({
          strideHz: 0.5,
          swing: 0.13,
          fold: 0.15,
          bob: 9,
          legs: [
            { foot: "near", line: [[670, 540], [690, 615], [735, 687]], radius: 32, painted: 0.6, inPicture: true },
            { foot: "far", line: [[530, 560], [530, 635], [535, 688]], radius: 28, painted: -0.4, inPicture: true },
          ],
          who: BAJIE,
        }),
        gait({
          strideHz: 0.55,
          swing: 0.18,
          fold: 0.45,
          bob: 6,
          legs: [
            { foot: "near-fore", line: [[1285, 575], [1340, 655], [1372, 722]], radius: 22, painted: 0.5 },
            { foot: "near-hind", line: [[990, 580], [992, 645], [1000, 690]], radius: 22, painted: -0.3, inPicture: true },
            { foot: "far-fore", line: [[1185, 540], [1190, 630], [1200, 705]], radius: 24, painted: -0.2, inPicture: true },
          ],
          head: { regions: [{ at: [1340, 320], r: 100 }], nod: 5 },
          who: HORSE,
        }),
        serpent({ spine: [[905, 420], [860, 500], [820, 580], [790, 630]], radius: 45, reach: 80, waves: 1, swing: 0.04, bob: 0 }),
        flutter({ root: [270, 400], stir: 5, regions: [{ at: [180, 560], r: 70 }, { at: [330, 570], r: 60 }, { at: [400, 480], r: 50 }] }),
        flutter({ root: [640, 420], stir: 5, regions: [{ at: [520, 560], r: 60 }, { at: [770, 540], r: 60 }] }),
        flutter({ root: [1000, 350], stir: 4, regions: [{ at: [940, 560], r: 70 }, { at: [1030, 610], r: 50 }], stiff: circlesAlong([[1050, 690], [1100, 420]], 25) }),
        flutter({ root: [1250, 470], stir: 5, regions: [{ at: [1270, 600], r: 40 }, { at: [1230, 540], r: 30 }, { at: [1310, 420], r: 35 }, { at: [1230, 290], r: 60 }] }),
        churn({ swirl: 6, within: circlesAlong([[40, 790], [1440, 790]], 110), spare: [{ at: [1375, 730], r: 40 }, { at: [1190, 705], r: 35 }, { at: [990, 690], r: 40 }] }),
      ],
    },
    {
      name: "monk",
      url: "cast/pilgrims-monk.webp",
      faces: "right",
      aspect: 868 / 1024,
      feet: 0.1,
      size: { across: 0.9 },
      pixels: [868, 1024],
      life: [
        gait({
          strideHz: 0.55,
          swing: 0.18,
          fold: 0.45,
          bob: 8,
          legs: [
            { foot: "near-hind", line: [[290, 730], [310, 860], [350, 925]], radius: 36, painted: 0.4, cloud: MONK_NEAR_HIND },
            { foot: "far-hind", line: [[235, 730], [200, 860], [172, 912]], radius: 30, painted: -0.7, cloud: MONK_FAR_HIND },
            { foot: "far-fore", line: [[615, 730], [600, 840], [585, 900]], radius: 30, painted: -0.2, cloud: MONK_FAR_FORE },
            { foot: "near-fore", line: [[570, 720], [615, 835], [690, 950]], radius: 34, painted: 0.7, cloud: MONK_NEAR_FORE },
          ],
          head: { regions: [{ at: [780, 380], r: 110 }], nod: 6 },
          prints: true,
        }),
        serpent({ spine: [[210, 500], [150, 560], [110, 650], [90, 740], [80, 800]], radius: 60, reach: 110, waves: 1, swing: 0.04, bob: 0 }),
        flutter({ root: [740, 250], stir: 6, regions: [{ at: [650, 300], r: 80 }, { at: [620, 360], r: 55 }] }),
        flutter({ root: [620, 540], stir: 6, regions: [{ at: [525, 610], r: 35 }, { at: [605, 630], r: 35 }, { at: [665, 690], r: 45 }, { at: [720, 620], r: 40 }, { at: [745, 520], r: 30 }, { at: [445, 770], r: 35 }] }),
        churn({ swirl: 6, within: [...MONK_FAR_HIND, ...MONK_NEAR_HIND, ...MONK_FAR_FORE, ...MONK_NEAR_FORE] }),
        pitch({ most: 0.12 }),
      ],
    },
  ],
});
