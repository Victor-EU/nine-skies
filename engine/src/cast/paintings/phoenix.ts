/**
 * The fenghuang, painted (D94): in flight, the five plumes streaming
 * (`content/paintings/phoenix.yaml`). Sized beak to the plumes' ends.
 */
import type { Px } from "../life.js";
import { flap } from "../life/flap.js";
import { flutter } from "../life/flutter.js";
import { pitch } from "../life/pitch.js";
import { serpent } from "../life/serpent.js";
import { circlesAlong } from "../life.js";
import { registerPainting } from "../painting.js";

/**
 * Its life (D96): slow, stately beats, both wings raised as painted at the
 * top of the stroke, the near one turning about its back down to edge on
 * (at its pace a wing swung over the body is long seen, and muddles it),
 * the far one about the nape behind the neck; each of the five plumes swimming on its own
 * from its root, as a streamer does; the beaded crest stirring.
 */
const PLUMES: readonly (readonly Px[])[] = [
  [[890, 590], [650, 520], [500, 420], [380, 350], [250, 330], [130, 360], [60, 440]],
  [[880, 610], [700, 620], [560, 580], [420, 520], [280, 500], [150, 520], [40, 600]],
  [[870, 645], [720, 700], [560, 680], [420, 620], [300, 600], [180, 640], [110, 740]],
  [[860, 690], [720, 760], [560, 760], [420, 720], [300, 720], [210, 790], [190, 880]],
  [[860, 760], [740, 860], [600, 890], [480, 880], [380, 880], [340, 950]],
];

/** Its five plumes gliding (F142), body to tip. */
const GLIDE_PLUMES: readonly Px[][] = [
  [[950, 560], [700, 470], [400, 430], [150, 420], [40, 430]],
  [[950, 580], [700, 560], [400, 540], [150, 540], [40, 550]],
  [[950, 600], [700, 650], [400, 660], [150, 660], [60, 670]],
  [[950, 620], [750, 740], [450, 780], [200, 790], [120, 800]],
  [[950, 640], [800, 820], [550, 880], [350, 900], [250, 900]],
];

registerPainting("phoenix", {
  views: [
    {
      name: "default",
      url: "cast/phoenix-default.webp",
      faces: "right",
      aspect: 1499 / 1022,
      feet: 0.5,
      size: { across: 0.97 },
      pixels: [1499, 1022],
      life: [
        flap({
          beatHz: 0.7,
          bob: 25,
          near: { hinge: [[1010, 548], [1265, 470]], outline: [[1010, 548], [1265, 470], [1190, 250], [1000, 0], [780, 0], [780, 350], [900, 520]], top: 1, bottom: 0.05, glide: 0.6 },
          far: { hinge: [[1215, 440], [1330, 415]], outline: [[1215, 440], [1330, 415], [1350, 330], [1300, 240], [1180, 270]], top: 1, bottom: -0.3 },
        }),
        ...PLUMES.map((spine) => serpent({ spine, radius: 30, reach: 70, swing: 0.025, waves: 1.2, bob: 0 })),
        flutter({ root: [1410, 330], stir: 8, regions: [{ at: [1370, 220], r: 90 }], stiff: [{ at: [1430, 340], r: 50 }] }),
        pitch({ most: 0.3 }),
      ],
    },
    // Gliding, its wings held (F142): its tips and crest stir and its five plumes wave out behind.
    {
      name: "glide",
      url: "cast/phoenix-glide.webp",
      faces: "right",
      aspect: 1536 / 1022,
      feet: 0.5,
      size: { across: 0.951 },
      pixels: [1536, 1022],
      life: [
        ...GLIDE_PLUMES.map((spine) => serpent({ spine, radius: 30, reach: 70, swing: 0.025, waves: 1.2, bob: 0 })),
        flutter({ root: [900, 300], stir: 6, regions: circlesAlong([[450, 60], [650, 40]], 90) }),
        flutter({ root: [1300, 450], stir: 5, regions: [{ at: [1450, 450], r: 90 }] }),
        flutter({ root: [1290, 280], stir: 8, regions: [{ at: [1250, 200], r: 70 }], stiff: [{ at: [1310, 300], r: 40 }] }),
        pitch({ most: 0.3 }),
      ],
    },
  ],
});
