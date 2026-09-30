/**
 * Guanyin of the South Sea, painted (D94, D97): standing on her lotus on
 * cloud in a white robe and hood, the vase in her left hand and the willow
 * in her right, the white parrot by her shoulder
 * (`content/paintings/guanyin.yaml`). Sized feet to hood. Until 29
 * September 2026 the card was her empty seat.
 */
import { circlesAlong } from "../life.js";
import { churn } from "../life/churn.js";
import { flap } from "../life/flap.js";
import { flutter } from "../life/flutter.js";
import { sway } from "../life/sway.js";
import { registerPainting } from "../painting.js";

const PARROT = { name: "parrot", within: [{ at: [180, 170], r: 140 }] } as const;

/**
 * Her life (D96): she stands still, leaning only a little over her feet
 * on the lotus; the willow's leaves stir in her hand and the long ends of
 * her sleeves in the air. The white parrot hovers by her shoulder, its
 * raised wing beating behind its body and the lowered one in front,
 * reaching a little further on each downstroke and never less than it is
 * painted, so the hood beside it is never uncovered; its tail fans. The
 * cloud under the lotus boils; the lotus is pale and keeps still.
 */
registerPainting("guanyin", {
  views: [
    {
      name: "default",
      url: "cast/guanyin-default.webp",
      faces: "right",
      aspect: 744 / 1522,
      feet: 0.15,
      size: { crown: 0.99 },
      pixels: [744, 1522],
      life: [
        sway({ feet: [400, 1290], crown: 12, lean: 8 }),
        flap({
          beatHz: 3.2,
          bob: 8,
          near: { hinge: [[205, 200], [240, 215]], outline: [[205, 200], [240, 215], [262, 202], [287, 206], [299, 222], [275, 244], [245, 256], [210, 252], [195, 235]], top: 1, bottom: 1.2, feather: 10 },
          far: { hinge: [[165, 208], [228, 158]], outline: [[228, 158], [215, 132], [190, 105], [160, 80], [125, 56], [90, 40], [62, 42], [56, 75], [66, 110], [84, 142], [104, 170], [124, 196], [145, 212], [165, 208]], top: 1, bottom: -0.3, feather: 14 },
          who: PARROT,
        }),
        flutter({ root: [175, 240], stir: 6, regions: [{ at: [160, 262], r: 38 }, { at: [135, 290], r: 36 }, { at: [115, 312], r: 32 }] }),
        flutter({ root: [330, 470], stir: 5, regions: circlesAlong([[290, 340], [250, 352], [215, 380], [190, 420], [175, 470], [165, 520], [160, 575]], 40), stiff: [{ at: [330, 470], r: 30 }] }),
        flutter({ root: [400, 700], stir: 5, regions: [{ at: [610, 1000], r: 70 }, { at: [175, 1020], r: 50 }] }),
        churn({
          swirl: 8,
          within: [{ at: [40, 1340], r: 60 }, { at: [720, 1330], r: 50 }, ...circlesAlong([[70, 1430], [680, 1430]], 85)],
          spare: circlesAlong([[130, 1330], [650, 1330]], 60),
        }),
      ],
    },
    // Pouring from the vase and sprinkling the dew (F142): she keeps her balance, the willow and the water stir, the parrot's wings flutter, the cloud boils about the lotus.
    {
      name: "dew",
      url: "cast/guanyin-dew.webp",
      faces: "right",
      aspect: 850 / 1536,
      feet: 0.155,
      size: { crown: 0.992 },
      pixels: [850, 1536],
      life: [
        sway({ feet: [430, 1300], crown: 20, lean: 5 }),
        flutter({ root: [290, 480], stir: 6, regions: circlesAlong([[250, 520], [170, 650], [110, 780]], 50) }),
        flutter({ root: [760, 620], stir: 4, pace: 3, regions: circlesAlong([[780, 700], [800, 850], [830, 1000]], 40) }),
        flutter({ root: [230, 170], stir: 8, regions: [{ at: [180, 110], r: 60 }] }),
        churn({ swirl: 8, within: circlesAlong([[60, 1450], [800, 1450]], 90), spare: circlesAlong([[120, 1300], [720, 1300]], 70) }),
      ],
    },
  ],
});
