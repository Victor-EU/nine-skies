/**
 * Laozi, painted (D97): the old sage on his green ox, going west out of the
 * Hangu Pass on a bank of violet cloud, the purple air that came before him
 * (`content/paintings/laozi.yaml`). Sized across the picture, the cloud's
 * trail to the ox's muzzle.
 */
import { circlesAlong } from "../life.js";
import { churn } from "../life/churn.js";
import { flutter } from "../life/flutter.js";
import { gait } from "../life/gait.js";
import { pitch } from "../life/pitch.js";
import { serpent } from "../life/serpent.js";
import { registerPainting } from "../painting.js";

/** Where each hoof is sunk in the bank, spared its boiling so the hoof keeps its shape. */
const HOOVES = [
  { at: [412, 845], r: 35 },
  { at: [680, 932], r: 45 },
  { at: [900, 915], r: 40 },
  { at: [1180, 955], r: 45 },
] as const;

/**
 * Its life (D96): the ox walks slowly, as oxen do, its hooves painted sunk
 * in the bank of cloud, so they wade: each leg bends the picture about it
 * and the cloud stretches about the hoof, rather than the leg being drawn
 * on its own and leaving a hole in the bank. Its head nods under its long
 * horns and its tail swings. The old man rides it still: only the white
 * horsetail of his whisk stirs over his shoulder, and the loose end of
 * his robe. The violet bank boils about the hooves and along its trail.
 */
registerPainting("laozi", {
  views: [
    {
      name: "default",
      url: "cast/laozi-default.webp",
      faces: "right",
      aspect: 1446 / 1024,
      feet: 0.1,
      size: { across: 0.97 },
      pixels: [1446, 1024],
      life: [
        gait({
          strideHz: 0.4,
          swing: 0.12,
          fold: 0.25,
          bob: 7,
          legs: [
            { foot: "far-hind", line: [[455, 690], [425, 770], [412, 840]], radius: 34, painted: -0.6, inPicture: true },
            { foot: "near-hind", line: [[560, 690], [595, 800], [675, 930]], radius: 45, painted: 0.5, inPicture: true },
            { foot: "far-fore", line: [[925, 720], [912, 830], [900, 912]], radius: 40, painted: -0.1, inPicture: true },
            { foot: "near-fore", line: [[1080, 700], [1095, 850], [1178, 952]], radius: 50, painted: 0.7, inPicture: true },
          ],
          head: { regions: [{ at: [1330, 560], r: 120 }, ...circlesAlong([[1250, 440], [1120, 360], [1020, 305]], 45)], nod: 5 },
        }),
        serpent({ spine: [[455, 470], [430, 560], [400, 640], [370, 710], [340, 780], [320, 830]], radius: 32, reach: 60, waves: 0.8, swing: 0.04, bob: 0 }),
        flutter({ root: [678, 100], stir: 5, regions: circlesAlong([[655, 160], [620, 280], [595, 370]], 40) }),
        flutter({ root: [640, 470], stir: 4, regions: [{ at: [575, 515], r: 45 }] }),
        churn({ swirl: 7, within: circlesAlong([[60, 760], [250, 840], [500, 900], [800, 940], [1060, 950], [1240, 965]], 90), spare: HOOVES }),
        pitch({ most: 0.1 }),
      ],
    },
  ],
});
