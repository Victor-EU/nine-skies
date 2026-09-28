/**
 * The old turtle of the Tongtian, painted (D94): rowing the air, moss on
 * his shell (`content/paintings/turtle.yaml`). Sized nose to tail.
 */
import { flutter } from "../life/flutter.js";
import { gait } from "../life/gait.js";
import { pitch } from "../life/pitch.js";
import { registerPainting } from "../painting.js";

/**
 * His life (D96): he rows the air as a river turtle swims, with the walk
 * of its kind, each flipper in turn: back slowly while it pulls, forward
 * quickly and feathered while it returns. The flippers turn where they
 * leave the shell, so the shell under them keeps still; the thin far hind
 * flipper lies behind the near one, and keeps still with the shell, since
 * the two cannot be drawn apart. His head nods
 * with the stroke, the moss on his shell stirs, and he noses into a climb.
 */
registerPainting("turtle", {
  views: [
    {
      name: "default",
      url: "cast/turtle-default.webp",
      faces: "right",
      aspect: 1434 / 836,
      feet: 0.5,
      size: { across: 0.97 },
      pixels: [1434, 836],
      life: [
        gait({
          strideHz: 0.35,
          swing: 0.3,
          fold: 0.25,
          bob: 6,
          legs: [
            { foot: "near-hind", line: [[330, 580], [200, 680], [60, 760]], radius: 80, painted: -0.5 },
            { foot: "far-fore", line: [[1100, 420], [1250, 510], [1400, 640]], radius: 75, painted: 0.6 },
            { foot: "near-fore", line: [[640, 560], [540, 660], [450, 760]], radius: 95, painted: -0.6 },
          ],
          head: { regions: [{ at: [1280, 60], r: 120 }, { at: [1150, 150], r: 100 }], nod: 6 },
        }),
        flutter({ root: [700, 150], stir: 4, regions: [{ at: [600, 280], r: 70 }, { at: [1100, 370], r: 50 }, { at: [380, 380], r: 60 }] }),
        pitch({ most: 0.1 }),
      ],
    },
  ],
});
