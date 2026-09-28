/**
 * The magpie, painted (D94): in flight with the red fruit in its beak
 * (`content/paintings/magpie.yaml`). Sized beak to tail.
 */
import { flap } from "../life/flap.js";
import { flutter } from "../life/flutter.js";
import { pitch } from "../life/pitch.js";
import { registerPainting } from "../painting.js";

/**
 * Its life (D96): a magpie's bounding flight, four quick beats and a glide.
 * The near wing turns about its back, from the tail's root to the nape,
 * up as painted at the top of the stroke and swung down over the body at
 * the bottom; the far wing turns about the belly's edge under the chin,
 * down as painted at the bottom and folded up behind the body at the top. The
 * long tail's end stirs.
 */
registerPainting("magpie", {
  views: [
    {
      name: "default",
      url: "cast/magpie-default.webp",
      faces: "right",
      aspect: 1433 / 999,
      feet: 0.5,
      size: { across: 0.95 },
      pixels: [1433, 999],
      life: [
        flap({
          beatHz: 3,
          burst: 4,
          rest: 0.5,
          bob: 25,
          near: { hinge: [[640, 612], [975, 355]], outline: [[640, 612], [975, 355], [720, 110], [560, 0], [300, 0], [300, 330], [450, 530]], top: 1, bottom: -0.45 },
          far: { hinge: [[1180, 505], [960, 655]], outline: [[1180, 505], [1270, 540], [1433, 690], [1433, 840], [1150, 840], [930, 700], [960, 655]], top: -0.15, bottom: 1 },
        }),
        flutter({ root: [650, 650], stir: 10, regions: [{ at: [220, 850], r: 230 }] }),
        pitch({ most: 0.35 }),
      ],
    },
  ],
});
