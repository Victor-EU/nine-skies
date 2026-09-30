/**
 * The Peng, painted (D94): soaring on its spread wings of beaten gold
 * (`content/paintings/peng.yaml`). Sized wingtip to wingtip.
 */
import { flap } from "../life/flap.js";
import { flutter } from "../life/flutter.js";
import { pitch } from "../life/pitch.js";
import { circlesAlong } from "../life.js";
import { registerPainting } from "../painting.js";

/**
 * Its life (D96): the Peng soars. Two slow beats and a long glide, its
 * wings held high as painted; it beats when it climbs. The near wing turns
 * about its back; the far wing about a line along the body at the breast's
 * edge, so it rises over the neck. Its crest streams.
 */
registerPainting("peng", {
  views: [
    {
      name: "default",
      url: "cast/peng-default.webp",
      faces: "right",
      aspect: 1536 / 993,
      feet: 0.5,
      size: { across: 0.97 },
      pixels: [1536, 993],
      life: [
        flap({
          beatHz: 0.45,
          burst: 2,
          rest: 5,
          bob: 30,
          near: { hinge: [[690, 610], [960, 370]], outline: [[690, 610], [960, 370], [800, 250], [500, 110], [100, 0], [0, 0], [0, 350], [330, 500], [560, 625]], top: 1, bottom: 0.3, glide: 0.85 },
          far: { hinge: [[1170, 430], [1300, 358]], outline: [[1170, 430], [1260, 410], [1536, 460], [1536, 770], [1300, 770], [1070, 710], [1120, 600]], top: 0.3, bottom: 1.05, glide: 0.9 },
        }),
        flutter({ root: [1150, 310], stir: 10, regions: [{ at: [1030, 230], r: 120 }], stiff: [{ at: [1200, 300], r: 70 }] }),
        pitch({ most: 0.3 }),
      ],
    },
    // Stooping, wings half folded (F142): its wingtips, lower feathers and crest stir in the rush of air.
    {
      name: "stoop",
      url: "cast/peng-stoop.webp",
      faces: "right",
      aspect: 1509 / 985,
      feet: 0.5,
      size: { across: 1.174 },
      pixels: [1509, 985],
      life: [
        flutter({ root: [900, 400], stir: 10, regions: circlesAlong([[80, 150], [300, 120], [550, 80]], 110), stiff: [{ at: [1270, 580], r: 90 }] }),
        flutter({ root: [1200, 350], stir: 6, regions: circlesAlong([[1400, 250], [1470, 430]], 60) }),
        flutter({ root: [900, 600], stir: 8, regions: circlesAlong([[350, 700], [600, 800], [850, 880]], 90) }),
        flutter({ root: [1270, 560], stir: 8, regions: [{ at: [1150, 470], r: 90 }], stiff: [{ at: [1290, 590], r: 70 }] }),
        pitch({ most: 0.3 }),
      ],
    },
  ],
});
