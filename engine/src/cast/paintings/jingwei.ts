/**
 * Jingwei, painted (D94): in flight with her twig
 * (`content/paintings/jingwei.yaml`). Sized bill to tail, about three
 * fifths of her spread wings.
 */
import { flap } from "../life/flap.js";
import { pitch } from "../life/pitch.js";
import { registerPainting } from "../painting.js";

/**
 * Its life (D96): a crow's steady beat. Its wings turn as the magpie's do,
 * the near one about its back and the far one about the belly's edge.
 */
registerPainting("jingwei", {
  views: [
    {
      name: "default",
      url: "cast/jingwei-default.webp",
      faces: "right",
      aspect: 1471 / 971,
      feet: 0.5,
      size: { across: 0.6 },
      pixels: [1471, 971],
      life: [
        flap({
          beatHz: 2,
          bob: 25,
          near: { hinge: [[600, 600], [930, 350]], outline: [[600, 600], [930, 350], [800, 150], [560, 40], [150, 0], [0, 0], [0, 260], [300, 420], [440, 560]], top: 1, bottom: -0.45 },
          far: { hinge: [[1120, 495], [870, 700]], outline: [[1120, 495], [1260, 540], [1471, 800], [1471, 971], [1250, 971], [850, 745], [870, 700]], top: -0.15, bottom: 1 },
        }),
        pitch({ most: 0.35 }),
      ],
    },
  ],
});
