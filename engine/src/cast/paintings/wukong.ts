/**
 * Sun Wukong, painted (D94): the Ming novel's rebel on his somersault
 * cloud, scouting with a hand to his brow (`content/paintings/wukong.yaml`),
 * the third of the first four drafts, 27 September 2026. He looks to the
 * picture's right; his boots are on the cloud at 0.14 of its height and his
 * crown's wings reach 0.87.
 */
import { circlesAlong } from "../life.js";
import { churn } from "../life/churn.js";
import { flutter } from "../life/flutter.js";
import { sway } from "../life/sway.js";
import { registerPainting } from "../painting.js";

/**
 * His life (D96): he keeps his balance on the cloud, leaning a little over
 * his feet; the two long pheasant plumes of his crown stream and stir, the
 * red tatters of his sleeves and skirts flutter, and the somersault cloud
 * boils under him. The staff on his shoulder keeps still where the plume
 * passes it.
 */
registerPainting("wukong", {
  views: [
    {
      name: "default",
      url: "cast/wukong-scout.webp",
      faces: "right",
      aspect: 846 / 1534,
      feet: 0.14,
      size: { crown: 0.87 },
      pixels: [846, 1534],
      life: [
        sway({ feet: [480, 1305], crown: 170, lean: 16 }),
        flutter({
          root: [480, 190],
          stir: 14,
          regions: [...circlesAlong([[330, 40], [180, 60], [90, 180], [60, 330], [65, 500]], 70), ...circlesAlong([[440, 40], [370, 110], [340, 220], [335, 330]], 60)],
          stiff: circlesAlong([[20, 550], [260, 460]], 50),
        }),
        flutter({
          root: [470, 620],
          stir: 7,
          regions: [{ at: [270, 640], r: 70 }, { at: [745, 420], r: 90 }, { at: [760, 510], r: 60 }, { at: [300, 780], r: 60 }, { at: [270, 900], r: 80 }, { at: [625, 900], r: 60 }, { at: [600, 1050], r: 60 }],
        }),
        churn({ swirl: 8, within: [{ at: [450, 1400], r: 280 }, { at: [260, 1390], r: 120 }, { at: [650, 1410], r: 120 }] }),
      ],
    },
  ],
});
