/**
 * The carp, painted (D94): leaping out of spray and cloud
 * (`content/paintings/carp.yaml`). Sized lips to tail, its arc across
 * the picture.
 */
import { circlesAlong } from "../life.js";
import { churn } from "../life/churn.js";
import { flutter } from "../life/flutter.js";
import { pitch } from "../life/pitch.js";
import { serpent } from "../life/serpent.js";
import { registerPainting } from "../painting.js";

/**
 * Its life (D96): the carp swims up out of the spray as it leaps, its
 * body sending a wave to its great tail, which beats; its fins and barbels
 * stir, the spray and cloud it leaps from boil, and it noses into its
 * climb. Its belly is pale, so the churn keeps to the spray below it.
 */
registerPainting("carp", {
  views: [
    {
      name: "default",
      url: "cast/carp-default.webp",
      faces: "right",
      aspect: 1432 / 957,
      feet: 0.5,
      size: { across: 0.9 },
      pixels: [1432, 957],
      life: [
        serpent({ spine: [[1290, 60], [1150, 130], [1000, 200], [850, 280], [700, 360], [560, 450], [440, 540], [330, 610], [200, 650]], radius: 110, reach: 230, waves: 0.8, swing: 0.03, bob: 0.004 }),
        flutter({ root: [880, 260], stir: 6, regions: [{ at: [830, 120], r: 110 }, { at: [1100, 380], r: 100 }, { at: [680, 520], r: 60 }] }),
        flutter({ root: [1290, 70], stir: 8, regions: [{ at: [1360, 200], r: 80 }, { at: [1400, 160], r: 40 }] }),
        churn({ swirl: 8, within: circlesAlong([[80, 860], [400, 820], [650, 760], [800, 600]], 150), spare: circlesAlong([[1150, 320], [950, 380], [750, 480]], 70) }),
        pitch({ most: 0.2 }),
      ],
    },
  ],
});
