/**
 * Sanduo's mount, painted (D94): the white horse riderless, the white
 * spear and pennant at the saddle; no part of him (`LIVING_FAITHS`,
 * `content/paintings/sanduo.yaml`). Sized hoof to the spear's blade.
 */
import { churn } from "../life/churn.js";
import { flutter } from "../life/flutter.js";
import { gait } from "../life/gait.js";
import { pitch } from "../life/pitch.js";
import { serpent } from "../life/serpent.js";
import { registerPainting } from "../painting.js";

const NEAR_HIND = [{ at: [260, 935], r: 70 }, { at: [345, 940], r: 70 }] as const;
const FAR_HIND = [{ at: [580, 935], r: 65 }, { at: [650, 935], r: 60 }] as const;
const FAR_FORE = [{ at: [740, 955], r: 65 }, { at: [820, 955], r: 65 }] as const;
const NEAR_FORE = [{ at: [950, 945], r: 70 }, { at: [1040, 945], r: 70 }] as const;

/**
 * Its life (D96): a proud walk, knees lifted high, each hoof's puff of
 * cloud carried and pressed and a print of it left behind, the head nodding with the forelegs. The
 * pennant flies from the spear, the long tail streams and the mane stirs;
 * the horse is white, so only its puffs of cloud churn.
 */
registerPainting("sanduo", {
  views: [
    {
      name: "default",
      url: "cast/sanduo-default.webp",
      faces: "right",
      aspect: 1099 / 1018,
      feet: 0.1,
      size: { crown: 0.97 },
      pixels: [1099, 1018],
      life: [
        gait({
          strideHz: 0.6,
          swing: 0.2,
          fold: 0.5,
          bob: 8,
          legs: [
            { foot: "near-hind", line: [[450, 560], [350, 790], [325, 900]], radius: 55, painted: -0.7, cloud: NEAR_HIND },
            { foot: "far-hind", line: [[560, 650], [560, 790], [615, 890]], radius: 50, painted: 0.3, cloud: FAR_HIND },
            { foot: "far-fore", line: [[790, 680], [800, 810], [780, 920]], radius: 45, painted: -0.3, cloud: FAR_FORE },
            { foot: "near-fore", line: [[870, 640], [960, 790], [1010, 895]], radius: 50, painted: 0.8, cloud: NEAR_FORE },
          ],
          head: { regions: [{ at: [980, 290], r: 110 }], nod: 10 },
          prints: true,
        }),
        serpent({ spine: [[640, 160], [500, 210], [350, 250], [200, 300], [40, 355]], radius: 60, reach: 110, waves: 1.3, swing: 0.04, bob: 0 }),
        serpent({ spine: [[440, 500], [350, 560], [250, 620], [150, 690], [60, 760]], radius: 60, reach: 120, waves: 1, swing: 0.04, bob: 0 }),
        flutter({ root: [930, 230], stir: 8, regions: [{ at: [830, 330], r: 110 }, { at: [780, 440], r: 80 }] }),
        churn({ swirl: 6, within: [...NEAR_HIND, ...FAR_HIND, ...FAR_FORE, ...NEAR_FORE] }),
        pitch({ most: 0.15 }),
      ],
    },
  ],
});
