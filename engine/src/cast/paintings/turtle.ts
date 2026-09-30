/**
 * The old turtle of the Tongtian, painted (D94): rowing the air, moss on
 * his shell (`content/paintings/turtle.yaml`). Sized nose to tail.
 */
import { flutter } from "../life/flutter.js";
import { BEAT, gait } from "../life/gait.js";
import { pitch } from "../life/pitch.js";
import { sway } from "../life/sway.js";
import { serpent } from "../life/serpent.js";
import { circlesAlong } from "../life.js";
import { registerPainting } from "../painting.js";

/**
 * His life (D96): he rows the air as a river turtle swims, with the walk
 * of its kind, each flipper in turn: back slowly while it pulls, forward
 * quickly and feathered while it returns. The flippers turn where they
 * leave the shell, so the shell under them keeps still. The thin far hind
 * flipper lies along the near one: it is drawn apart on a finer mesh, and
 * the two swing only toward each other, the far one down behind the near
 * and the near one up over the far, so neither uncovers the seam between. His head nods
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
      // The far hind flipper is 40 pixels across: a cell of 15 pixels draws it apart from the near one.
      cells: 96,
      life: [
        gait({
          strideHz: 0.35,
          swing: 0.3,
          fold: 0.25,
          bob: 6,
          legs: [
            // The hind flippers touch, so each swings only toward the other, and neither uncovers their seam: the near one
            // painted all the way forward swings back, up over the far one; the far one, painted all the way back, swings
            // forward, down behind the near one.
            { foot: "near-hind", line: [[380, 560], [210, 632], [55, 740]], radius: 74, painted: 1, swing: 0.15 },
            // It strokes with the near one, so the two never cross.
            { foot: "far-hind", line: [[330, 512], [190, 570], [38, 617]], radius: 30, painted: -1, swing: 0.12, beat: BEAT["near-hind"] },
            { foot: "far-fore", line: [[1100, 420], [1250, 510], [1400, 640]], radius: 75, painted: 0.6 },
            { foot: "near-fore", line: [[640, 560], [540, 660], [450, 760]], radius: 95, painted: -0.6 },
          ],
          head: { regions: [{ at: [1280, 60], r: 120 }, { at: [1150, 150], r: 100 }], nod: 6 },
        }),
        flutter({ root: [700, 150], stir: 4, regions: [{ at: [600, 280], r: 70 }, { at: [1100, 370], r: 50 }, { at: [380, 380], r: 60 }] }),
        pitch({ most: 0.1 }),
      ],
    },
    // Resting, its neck raised to ask its question (F142): it rocks as it floats, its neck sways, the weed on its shell stirs.
    {
      name: "look",
      url: "cast/turtle-look.webp",
      faces: "right",
      aspect: 1526 / 1024,
      feet: 0.5,
      size: { across: 1.03 },
      pixels: [1526, 1024],
      life: [
        sway({ feet: [760, 650], crown: 30, lean: 5 }),
        serpent({ spine: [[1370, 40], [1290, 110], [1200, 200], [1140, 320], [1080, 420]], radius: 60, reach: 110, waves: 0.5, swing: 0.03, bob: 0 }),
        flutter({ root: [700, 200], stir: 4, regions: circlesAlong([[350, 350], [550, 250], [750, 250], [1150, 250]], 60) }),
        pitch({ most: 0.1 }),
      ],
    },
  ],
});
