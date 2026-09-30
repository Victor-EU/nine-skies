/**
 * The Eight Immortals, painted (D94): abreast, each on their own cloud
 * (`content/paintings/baxian.yaml`). Sized along the line.
 */
import { circlesAlong, type Px } from "../life.js";
import { churn } from "../life/churn.js";
import { flutter } from "../life/flutter.js";
import { sway } from "../life/sway.js";
import { registerPainting } from "../painting.js";

/** Each immortal, left to right: their name, where their feet are, how high their crown, and how wide they stand. */
const EIGHT: readonly { readonly name: string; readonly feet: Px; readonly crown: number; readonly r: number }[] = [
  { name: "li-tieguai", feet: [130, 490], crown: 70, r: 100 },
  { name: "zhongli-quan", feet: [320, 480], crown: 50, r: 105 },
  { name: "lu-dongbin", feet: [540, 485], crown: 20, r: 105 },
  { name: "zhang-guolao", feet: [760, 495], crown: 50, r: 110 },
  { name: "he-xiangu", feet: [930, 500], crown: 40, r: 100 },
  { name: "lan-caihe", feet: [1120, 490], crown: 80, r: 90 },
  { name: "han-xiangzi", feet: [1290, 500], crown: 60, r: 90 },
  { name: "cao-guojiu", feet: [1450, 500], crown: 30, r: 90 },
];

/**
 * Their life (D96): each of the eight keeps their own balance on their own
 * cloud, out of step with the rest, as a line of people standing in boats
 * would; He Xiangu's ribbons stir, and the clouds boil. Zhang Guolao's
 * donkey is white, so the churn keeps to the clouds' lower halves and
 * spares its hooves.
 */
/** The eight on their arts (F142): who, where across, crown and feet. */
const ARTS: readonly (readonly [string, number, number, number])[] = [
  ["li", 170, 200, 560],
  ["zhongli", 380, 180, 570],
  ["lu", 560, 158, 567],
  ["zhang", 760, 100, 583],
  ["he", 950, 192, 600],
  ["lan", 1120, 233, 617],
  ["han", 1280, 275, 700],
  ["cao", 1430, 300, 767],
];

registerPainting("baxian", {
  views: [
    {
      name: "default",
      url: "cast/baxian-default.webp",
      faces: "right",
      aspect: 1536 / 617,
      feet: 0.12,
      size: { across: 0.98 },
      pixels: [1536, 617],
      life: [
        ...EIGHT.map((one) =>
          sway({ feet: one.feet, crown: one.crown, lean: 7, who: { name: one.name, within: circlesAlong([[one.feet[0], one.crown + one.r * 0.6], [one.feet[0], one.feet[1] - one.r * 0.4]], one.r) } }),
        ),
        flutter({ root: [930, 300], stir: 5, regions: [{ at: [830, 420], r: 50 }, { at: [870, 450], r: 40 }] }),
        churn({ swirl: 5, within: circlesAlong([[0, 545], [1536, 545]], 80), spare: [{ at: [760, 470], r: 50 }] }),
      ],
    },
    // Each on their own art over the sea (F142): each keeps their own balance on it.
    {
      name: "arts",
      url: "cast/baxian-arts.webp",
      faces: "right",
      aspect: 1536 / 888,
      feet: 0.083,
      size: { across: 0.98 },
      pixels: [1536, 888],
      life: [
        ...ARTS.map(([name, x, crown, feet]) => sway({ feet: [x, feet], crown, lean: 5, who: { name, within: circlesAlong([[x, crown + 60], [x, feet]], 110) } })),
      ],
    },
  ],
});
