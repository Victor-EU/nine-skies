/**
 * Yao Ji, painted (D94): the goddess on her cloud over the Wu Gorge, a
 * hand out over the river (`content/paintings/yaoji.yaml`). Sized hem to
 * hair.
 */
import { circlesAlong } from "../life.js";
import { churn } from "../life/churn.js";
import { flutter } from "../life/flutter.js";
import { sway } from "../life/sway.js";
import { registerPainting } from "../painting.js";

/**
 * Her life (D96): she keeps her balance on her cloud; the long white
 * ribbon streams and loops from her shoulders, her hair lifts behind her,
 * her sleeves and the hem of her robes stir, and the cloud boils. Her
 * robes are pale, so only the cloud under them churns.
 */
registerPainting("yaoji", {
  views: [
    {
      name: "default",
      url: "cast/yaoji-default.webp",
      faces: "right",
      aspect: 964 / 1495,
      feet: 0.12,
      size: { crown: 0.97 },
      pixels: [964, 1495],
      life: [
        sway({ feet: [480, 1270], crown: 20, lean: 14 }),
        flutter({
          root: [460, 320],
          stir: 16,
          regions: [
            ...circlesAlong([[400, 300], [280, 250], [150, 170], [80, 220], [130, 330], [60, 450], [150, 520], [320, 470], [420, 420]], 70),
            ...circlesAlong([[250, 660], [100, 690], [60, 760], [150, 830], [240, 850]], 60),
          ],
        }),
        flutter({ root: [540, 150], stir: 8, regions: circlesAlong([[430, 330], [350, 450], [270, 560], [230, 650]], 70) }),
        flutter({ root: [700, 350], stir: 6, regions: [{ at: [780, 800], r: 90 }, { at: [820, 950], r: 80 }] }),
        flutter({ root: [480, 700], stir: 8, regions: [{ at: [180, 950], r: 100 }, { at: [240, 1060], r: 80 }] }),
        churn({ swirl: 8, within: [{ at: [170, 1320], r: 130 }, { at: [800, 1340], r: 110 }, ...circlesAlong([[250, 1420], [750, 1420]], 110)] }),
      ],
    },
    // Stilling the gorge with the rain (F142): she keeps her balance, her ribbons stream, the rain falls from her sleeves and the cloud boils under her.
    {
      name: "rain",
      url: "cast/yaoji-rain.webp",
      faces: "right",
      aspect: 999 / 1534,
      feet: 0.114,
      size: { crown: 0.921 },
      pixels: [999, 1534],
      life: [
        sway({ feet: [560, 1360], crown: 20, lean: 10 }),
        flutter({ root: [520, 200], stir: 14, regions: [...circlesAlong([[450, 180], [300, 120], [150, 120], [100, 250], [200, 330]], 55), ...circlesAlong([[200, 700], [100, 760], [120, 860]], 55)] }),
        flutter({ root: [560, 500], stir: 5, pace: 2, regions: [{ at: [250, 700], r: 80 }, { at: [930, 720], r: 90 }] }),
        churn({ swirl: 8, within: circlesAlong([[80, 1420], [940, 1420]], 130) }),
      ],
    },
  ],
});
