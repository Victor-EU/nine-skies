/**
 * The dragons, painted (D94): the East King drawn first and the other kings,
 * the White Dragon of Eagle Grief Stream and the Jing River's king drawn
 * from him, so the family is one design (`content/paintings/dragon.yaml`).
 * Rising in an S from the lower left, head to the right; sized head to
 * tail across the picture, as the dragon made in code is. The Uyghur
 * dragon of the Flaming Mountains (`slain`) is his design too, lying dead
 * along its picture.
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

/**
 * The four kings together (F133), in their own picture: each king's body
 * swims on its own midline, traced by eye on the colour of his scales, so
 * it runs along the body but not exactly down it; the wave is a hundredth
 * of the body, and at the size the four are seen that is enough. None of
 * them rises and falls as a whole (`bob`), or the picture would move four
 * ways at once. Manes, beards and tails stir about still heads and
 * antlers, the pheasant plumes of the crown the Southern King holds up
 * sway on it, and the long bank of cloud they rise from churns, never
 * where the Western King's silver body lies in it.
 */
const SOUTH: readonly Px[] = [[590, 150], [505, 165], [440, 195], [420, 255], [460, 300], [530, 325], [565, 375], [520, 415], [440, 395], [370, 345], [320, 280], [250, 265], [205, 320], [215, 400], [260, 450], [190, 440], [110, 420], [45, 410]];
const WEST: readonly Px[] = [[545, 525], [470, 540], [400, 570], [355, 630], [345, 710], [330, 790], [270, 790], [225, 720], [200, 640], [130, 610], [75, 670], [90, 760], [150, 820], [170, 900], [120, 960]];
const EAST: readonly Px[] = [[1190, 245], [1090, 262], [1000, 300], [950, 380], [950, 470], [980, 560], [980, 660], [920, 720], [850, 680], [800, 580], [760, 480], [690, 470], [640, 540], [640, 640], [680, 740], [700, 840], [660, 940]];
const NORTH: readonly Px[] = [[1440, 440], [1360, 440], [1290, 470], [1240, 540], [1210, 620], [1230, 700], [1270, 780], [1240, 850], [1180, 880]];
const swims = (spine: readonly Px[]) => serpent({ radius: 50, reach: 110, spine, bob: 0 });
const disc = (x: number, y: number, r: number) => ({ at: [x, y] as Px, r });
const FOUR_KINGS: LifeRig[] = [
  swims(SOUTH),
  swims(WEST),
  swims(EAST),
  swims(NORTH),
  flutter({ root: [575, 145], stir: 12, regions: [disc(440, 125, 90), disc(395, 205, 70), disc(560, 230, 50)], stiff: [disc(590, 145, 60), disc(470, 60, 60), disc(715, 215, 60)] }),
  flutter({ root: [730, 165], stir: 10, regions: [disc(770, 90, 85)], stiff: [disc(715, 215, 60)] }),
  flutter({ root: [230, 440], stir: 14, regions: [disc(110, 420, 110)] }),
  flutter({ root: [540, 525], stir: 12, regions: [disc(380, 515, 90), disc(325, 600, 60), disc(520, 580, 45)], stiff: [disc(545, 525, 60), disc(440, 440, 70)] }),
  flutter({ root: [170, 860], stir: 14, regions: [disc(120, 925, 100)] }),
  flutter({ root: [1190, 245], stir: 12, regions: [disc(1020, 200, 110), disc(960, 300, 80), disc(1170, 320, 60)], stiff: [disc(1190, 245, 70), disc(1070, 85, 110)] }),
  flutter({ root: [690, 860], stir: 14, regions: [disc(650, 930, 100)] }),
  flutter({ root: [1430, 440], stir: 12, regions: [disc(1300, 420, 80), disc(1250, 500, 60), disc(1420, 500, 45)], stiff: [disc(1435, 440, 55), disc(1340, 360, 70)] }),
  churn({
    swirl: 7,
    grey: 0.12,
    pale: 0.86,
    within: circlesAlong([[60, 905], [1460, 905]], 130),
    spare: [SOUTH, WEST, EAST, NORTH].flatMap((spine) => circlesAlong(spine, 70)),
  }),
  pitch({ most: 0.15 }),
];

/**
 * The dragon of the Flaming Mountains is dead, so nothing of him moves but
 * the smoke off his back, as off hot rock, found by its colour in the
 * plumes over him and never on his scales.
 */
const SLAIN: LifeRig[] = [
  churn({ swirl: 6, grey: 0.25, pale: 0.5, within: [disc(185, 185, 45), disc(390, 145, 70), disc(545, 200, 50), disc(790, 110, 90), disc(925, 170, 70)] }),
];

/** The White Dragon diving and the Jing River King rearing (F142), head to tail. */
const DIVE: readonly Px[] = [[1440, 740], [1300, 690], [1150, 620], [1000, 560], [850, 470], [700, 380], [560, 300], [420, 220], [280, 160], [140, 120]];
const REAR: readonly Px[] = [[1150, 130], [1060, 250], [1000, 400], [1050, 560], [950, 680], [780, 700], [600, 690], [420, 660], [260, 650], [120, 640]];

registerPainting("dragon", {
  views: [
    { name: "east-king", url: "cast/dragon-east-king.webp", faces: "right", aspect: 1505 / 999, feet: 0.5, size: { across: 0.97 }, pixels: [1505, 999], life: lifeAt(0, 0, {}) },
    { name: "south-king", url: "cast/dragon-south-king.webp", faces: "right", aspect: 1520 / 996, feet: 0.5, size: { across: 0.97 }, pixels: [1520, 996], life: lifeAt(15, 0, {}) },
    { name: "west-king", url: "cast/dragon-west-king.webp", faces: "right", aspect: 1504 / 998, feet: 0.5, size: { across: 0.97 }, pixels: [1504, 998], life: lifeAt(-5, 0, { grey: 0.12, pale: 0.86 }) },
    { name: "north-king", url: "cast/dragon-north-king.webp", faces: "right", aspect: 1525 / 1006, feet: 0.5, size: { across: 0.97 }, pixels: [1525, 1006], life: lifeAt(15, 5, { pale: 0.75 }) },
    { name: "white", url: "cast/dragon-white.webp", faces: "right", aspect: 1517 / 1006, feet: 0.5, size: { across: 0.97 }, pixels: [1517, 1006], life: lifeAt(10, 5, { grey: 0.12, pale: 0.8 }) },
    { name: "dust", url: "cast/dragon-dust.webp", faces: "right", aspect: 1508 / 1004, feet: 0.5, size: { across: 0.97 }, pixels: [1508, 1004], life: lifeAt(0, 0, { grey: 0.55, pale: 0.72 }) },
    { name: "four-kings", url: "cast/dragon-four-kings.webp", faces: "right", aspect: 1523 / 1024, feet: 0.5, size: { across: 0.97 }, pixels: [1523, 1024], life: FOUR_KINGS },
    { name: "slain", url: "cast/dragon-slain.webp", faces: "right", aspect: 1536 / 568, feet: 0.25, size: { across: 0.98 }, pixels: [1536, 568], life: SLAIN },
    // The White Dragon diving (F142): its body swims its wave, mane and tail stream, its cloud boils.
    {
      name: "white-dive",
      url: "cast/dragon-white-dive.webp",
      faces: "right",
      aspect: 1531 / 1006,
      feet: 0.5,
      size: { across: 1.205 },
      pixels: [1531, 1006],
      life: [
        serpent({ radius: 70, reach: 280, spine: DIVE }),
        flutter({ root: [1400, 650], stir: 12, regions: [{ at: [1250, 600], r: 130 }, { at: [1350, 560], r: 90 }], stiff: [{ at: [1450, 750], r: 80 }] }),
        flutter({ root: [250, 180], stir: 14, regions: [{ at: [120, 130], r: 130 }] }),
        churn({ swirl: 7, grey: 0.12, pale: 0.8, spare: [...circlesAlong(DIVE, 95), { at: [1440, 740], r: 130 }] }),
        pitch({ most: 0.3 }),
      ],
    },
    // The Jing River King rearing, roaring (F142): his coils swim, his mane streams, the dust boils off him.
    {
      name: "dust-rear",
      url: "cast/dragon-dust-rear.webp",
      faces: "right",
      aspect: 1432 / 1024,
      feet: 0.5,
      size: { across: 1.021 },
      pixels: [1432, 1024],
      life: [
        serpent({ radius: 70, reach: 260, spine: REAR }),
        flutter({ root: [1150, 150], stir: 12, regions: [{ at: [1050, 250], r: 120 }, { at: [900, 160], r: 90 }], stiff: [{ at: [1180, 110], r: 80 }] }),
        churn({ swirl: 7, grey: 0.55, pale: 0.72, spare: [...circlesAlong(REAR, 95), { at: [1150, 130], r: 130 }] }),
        pitch({ most: 0.2 }),
      ],
    },
  ],
});
