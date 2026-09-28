/**
 * Guanyin's seat, painted (D94): the empty lotus throne on cloud, the vase
 * and willow, the white parrot; no part of her (`LIVING_FAITHS`,
 * `content/paintings/guanyin.yaml`). Sized across the cloud it rests on.
 */
import { circlesAlong } from "../life.js";
import { churn } from "../life/churn.js";
import { flap } from "../life/flap.js";
import { flutter } from "../life/flutter.js";
import { registerPainting } from "../painting.js";

/**
 * Its life (D96): the seat is empty and keeps still (`LIVING_FAITHS`); the
 * white parrot hovers over it, beating its raised wing, the willow in the
 * vase sways, and the cloud under the throne boils. The throne and the
 * vase are pale, so only the cloud churns.
 */
registerPainting("guanyin", {
  views: [
    {
      name: "default",
      url: "cast/guanyin-default.webp",
      faces: "right",
      aspect: 923 / 1426,
      feet: 0.3,
      size: { across: 1 },
      pixels: [923, 1426],
      life: [
        flap({
          beatHz: 3.2,
          bob: 10,
          near: { hinge: [[235, 228], [312, 158]], outline: [[312, 158], [312, 122], [276, 76], [224, 29], [167, -4], [123, -6], [103, 22], [104, 76], [124, 134], [160, 191], [200, 215], [235, 228]], top: 1, bottom: -0.35, feather: 14 },
          who: { name: "parrot", within: [{ at: [290, 220], r: 170 }] },
        }),
        flutter({ root: [460, 430], stir: 10, regions: [{ at: [520, 330], r: 90 }, { at: [620, 330], r: 90 }, { at: [680, 450], r: 80 }, { at: [700, 560], r: 70 }, { at: [480, 370], r: 60 }], stiff: [{ at: [455, 470], r: 45 }] }),
        churn({ swirl: 8, within: [{ at: [110, 1180], r: 130 }, { at: [810, 1120], r: 130 }, { at: [570, 1170], r: 100 }, ...circlesAlong([[140, 1330], [800, 1330]], 120)], spare: [{ at: [340, 1090], r: 100 }] }),
      ],
    },
  ],
});
