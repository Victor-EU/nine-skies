/**
 * The dragons, painted (D94): the East King drawn first and the other kings,
 * the White Dragon of Eagle Grief Stream and the Jing River's king drawn
 * from him, so the family is one design (`content/paintings/dragon.yaml`).
 * Rising in an S from the lower left, head to the right; sized head to
 * tail across the picture, as the dragon made in code is. The Uyghur
 * dragon lying along the Flaming Mountains (`lantern`) has no view and
 * stays made in code.
 */
import { circlesAlong, type LifeRig, type Px } from "../life.js";
import { churn, PALE } from "../life/churn.js";
import { flutter } from "../life/flutter.js";
import { pitch } from "../life/pitch.js";
import { serpent } from "../life/serpent.js";
import { registerPainting } from "../painting.js";

/**
 * The dragons' life (D96), traced on the East King's painting: his midline
 * from the head down the neck, round the lower coil, over the arch, down to
 * the hind legs, back up over the left coil and down to the tuft; his mane,
 * beard and whiskers stirring about a still head and antlers; the tuft of
 * his tail; the cloud he rides, found by its colour, but never on his body
 * or his head.
 *
 * The other liveries were drawn from his picture, so his rig serves each,
 * moved to where the figure lies in it: fitted by silhouette, 28 September
 * 2026, a few pixels at most. Only what their cloud looks like differs: the
 * Western King's silver and the White Dragon's pearl are nearly the grey of
 * cloud, so their cloud must be brighter than they are, and the Jing River
 * King rides dust the colour of loess.
 */
const SPINE: readonly Px[] = [
  [1320, 225], [1235, 270], [1185, 335], [1195, 430], [1235, 520], [1220, 612], [1100, 668], [965, 640], [855, 578], [745, 505], [645, 468], [575, 530], [565, 630],
  [610, 705], [505, 668], [405, 600], [325, 535], [255, 500], [190, 545], [170, 630], [225, 705], [290, 785], [325, 860], [250, 880], [140, 835], [60, 780],
];
const HEAD: Px = [1345, 225];

function lifeAt(dx: number, dy: number, cloud: { readonly grey?: number; readonly pale?: number }): LifeRig[] {
  const at = ([x, y]: Px): Px => [x + dx, y + dy];
  const circle = (x: number, y: number, r: number) => ({ at: at([x, y]), r });
  const spine = SPINE.map(at);
  return [
    serpent({ radius: 70, reach: 320, spine }),
    flutter({
      root: at([1330, 225]),
      stir: 12,
      regions: [circle(1120, 230, 170), circle(1050, 390, 110), circle(1050, 530, 80), circle(1265, 330, 70), circle(1440, 250, 90)],
      stiff: [circle(1160, 70, 110), circle(1275, 60, 60), circle(HEAD[0], HEAD[1], 75)],
    }),
    flutter({ root: at([320, 845]), stir: 14, regions: [circle(170, 850, 170)] }),
    churn({ swirl: 7, grey: cloud.grey ?? 0.15, pale: cloud.pale ?? PALE, spare: [...circlesAlong(spine, 95), circle(HEAD[0], HEAD[1], 130), circle(785, 500, 45)] }),
    pitch({ most: 0.3 }),
  ];
}

registerPainting("dragon", {
  views: [
    { name: "east-king", url: "cast/dragon-east-king.webp", faces: "right", aspect: 1505 / 999, feet: 0.5, size: { across: 0.97 }, pixels: [1505, 999], life: lifeAt(0, 0, {}) },
    { name: "south-king", url: "cast/dragon-south-king.webp", faces: "right", aspect: 1520 / 996, feet: 0.5, size: { across: 0.97 }, pixels: [1520, 996], life: lifeAt(15, 0, {}) },
    { name: "west-king", url: "cast/dragon-west-king.webp", faces: "right", aspect: 1504 / 998, feet: 0.5, size: { across: 0.97 }, pixels: [1504, 998], life: lifeAt(-5, 0, { grey: 0.12, pale: 0.86 }) },
    { name: "north-king", url: "cast/dragon-north-king.webp", faces: "right", aspect: 1525 / 1006, feet: 0.5, size: { across: 0.97 }, pixels: [1525, 1006], life: lifeAt(15, 5, { pale: 0.75 }) },
    { name: "white", url: "cast/dragon-white.webp", faces: "right", aspect: 1517 / 1006, feet: 0.5, size: { across: 0.97 }, pixels: [1517, 1006], life: lifeAt(10, 5, { grey: 0.12, pale: 0.8 }) },
    { name: "dust", url: "cast/dragon-dust.webp", faces: "right", aspect: 1508 / 1004, feet: 0.5, size: { across: 0.97 }, pixels: [1508, 1004], life: lifeAt(0, 0, { grey: 0.55, pale: 0.72 }) },
  ],
});
