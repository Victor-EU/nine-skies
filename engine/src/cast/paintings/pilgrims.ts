/**
 * The pilgrims, painted (D94): the monk on the white horse, Bajie and Sha
 * on a road of cloud, and the monk alone setting out (`monk`)
 * (`content/paintings/pilgrims.yaml`). Sized across, horse's nose to
 * Sha's pack, and nose to tail for the monk alone.
 */
import { circlesAlong } from "../life.js";
import { churn } from "../life/churn.js";
import { flutter } from "../life/flutter.js";
import { gait } from "../life/gait.js";
import { pitch } from "../life/pitch.js";
import { serpent } from "../life/serpent.js";
import { sway } from "../life/sway.js";
import { registerPainting } from "../painting.js";

const MONK_FAR_HIND = [{ at: [160, 930], r: 75 }, { at: [80, 905], r: 55 }, { at: [230, 950], r: 50 }] as const;
const MONK_NEAR_HIND = [{ at: [350, 930], r: 75 }, { at: [410, 870], r: 60 }, { at: [290, 960], r: 50 }, { at: [445, 945], r: 40 }] as const;
const MONK_FAR_FORE = [{ at: [560, 930], r: 65 }, { at: [500, 960], r: 50 }] as const;
const MONK_NEAR_FORE = [{ at: [690, 960], r: 70 }, { at: [780, 960], r: 55 }, { at: [630, 975], r: 45 }] as const;

/** The three on the road, and the horse: where each is in the picture. */
const SHA = { name: "sha", within: circlesAlong([[250, 150], [250, 560]], 220) } as const;
const BAJIE = { name: "bajie", within: circlesAlong([[660, 250], [660, 600]], 210) } as const;
const HORSE = { name: "horse", within: [{ at: [1150, 300], r: 330 }, { at: [1300, 450], r: 200 }, { at: [1000, 450], r: 200 }] } as const;
/** The party over the ice (F139). */
const ICE_SHA = { name: "sha", within: circlesAlong([[290, 200], [290, 640]], 210) } as const;
const ICE_BAJIE = { name: "bajie", within: circlesAlong([[680, 260], [680, 660]], 200) } as const;
const ICE_HORSE = { name: "horse", within: [{ at: [1180, 420], r: 330 }, { at: [1350, 560], r: 200 }, { at: [1000, 560], r: 200 }] } as const;
/** The road led by Sha, and on foot, and the monk leading his horse alone (F141). */
const LED_BAJIE = { name: "bajie", within: circlesAlong([[380, 250], [380, 700]], 210) } as const;
const LED_SHA = { name: "sha", within: circlesAlong([[1330, 250], [1330, 700]], 200) } as const;
const LED_HORSE = { name: "horse", within: [{ at: [850, 430], r: 290 }, { at: [1000, 600], r: 180 }, { at: [640, 620], r: 170 }] } as const;
const FOOT_SHA = { name: "sha", within: circlesAlong([[300, 200], [300, 620]], 200) } as const;
const FOOT_BAJIE = { name: "bajie", within: circlesAlong([[670, 250], [670, 640]], 190) } as const;
const FOOT_MONK = { name: "monk", within: circlesAlong([[1310, 230], [1310, 660]], 180) } as const;
const FOOT_HORSE = { name: "horse", within: [{ at: [980, 420], r: 200 }, { at: [960, 600], r: 150 }] } as const;
const LED_MONK = { name: "monk", within: circlesAlong([[1050, 200], [1050, 830]], 200) } as const;
const LED_HORSE_ALONE = { name: "horse", within: [{ at: [450, 480], r: 330 }, { at: [650, 700], r: 200 }, { at: [260, 700], r: 200 }] } as const;

/**
 * The pilgrims on the road (D96): Sha and Bajie each walk, keeping their
 * own balance, the hems of their robes swinging; the white horse walks
 * under the monk, its head nodding, its tail, mane and tassels swinging;
 * and the road of cloud boils under them all. Their feet are painted sunk
 * in the road, so they wade: each leg bends the picture about it, the
 * cloud stretching about the foot, rather than being drawn on its own and
 * leaving a hole in the road. Only the horse's near foreleg, which stands
 * clear of the road, strides on its own. Sha's far leg, under his robe in
 * the painting, is borrowed from his near one and shows in front of it as
 * it steps forward. The horse has no far hind: the monk's robe hangs over
 * its hindquarters nearly to the road, so there is nowhere for one to show.
 *
 * The monk alone (D96): the white horse walks, each hoof's puff of cloud
 * carried and pressed and a print of it left behind, its head nodding; its
 * tail swings, its mane and the red tassels of its harness stir. The horse
 * is white, so only its puffs of cloud churn.
 */
registerPainting("pilgrims", {
  views: [
    {
      name: "default",
      url: "cast/pilgrims-default.webp",
      faces: "right",
      aspect: 1473 / 938,
      feet: 0.2,
      size: { across: 0.97 },
      pixels: [1473, 938],
      life: [
        sway({ feet: [330, 665], crown: 115, lean: 8, who: SHA }),
        sway({ feet: [640, 690], crown: 185, lean: 8, who: BAJIE }),
        // Sha's near leg wades; his far one, under his robe in the painting, is the near one again, showing in front of it as it steps forward.
        gait({
          strideHz: 0.55,
          swing: 0.13,
          fold: 0.15,
          bob: 8,
          legs: [
            { foot: "near", line: [[375, 500], [388, 585], [430, 665]], radius: 28, painted: 0.6, inPicture: true },
            { foot: "far", line: [[375, 500], [388, 585], [430, 665]], radius: 28, painted: 0.6, borrow: { shift: [6, -8], shade: 0.55, above: 648 } },
          ],
          who: SHA,
        }),
        gait({
          strideHz: 0.5,
          swing: 0.13,
          fold: 0.15,
          bob: 9,
          legs: [
            { foot: "near", line: [[670, 540], [690, 615], [735, 687]], radius: 32, painted: 0.6, inPicture: true },
            { foot: "far", line: [[530, 560], [530, 635], [535, 688]], radius: 28, painted: -0.4, inPicture: true },
          ],
          who: BAJIE,
        }),
        gait({
          strideHz: 0.55,
          swing: 0.18,
          fold: 0.45,
          bob: 6,
          legs: [
            { foot: "near-fore", line: [[1285, 575], [1340, 655], [1372, 722]], radius: 22, painted: 0.5 },
            { foot: "near-hind", line: [[990, 580], [992, 645], [1000, 690]], radius: 22, painted: -0.3, inPicture: true },
            { foot: "far-fore", line: [[1185, 540], [1190, 630], [1200, 705]], radius: 24, painted: -0.2, inPicture: true },
          ],
          head: { regions: [{ at: [1340, 320], r: 100 }], nod: 5 },
          who: HORSE,
        }),
        serpent({ spine: [[905, 420], [860, 500], [820, 580], [790, 630]], radius: 45, reach: 80, waves: 1, swing: 0.04, bob: 0 }),
        flutter({ root: [270, 400], stir: 5, regions: [{ at: [180, 560], r: 70 }, { at: [330, 570], r: 60 }, { at: [400, 480], r: 50 }] }),
        flutter({ root: [640, 420], stir: 5, regions: [{ at: [520, 560], r: 60 }, { at: [770, 540], r: 60 }] }),
        flutter({ root: [1000, 350], stir: 4, regions: [{ at: [940, 560], r: 70 }, { at: [1030, 610], r: 50 }], stiff: circlesAlong([[1050, 690], [1100, 420]], 25) }),
        flutter({ root: [1250, 470], stir: 5, regions: [{ at: [1270, 600], r: 40 }, { at: [1230, 540], r: 30 }, { at: [1310, 420], r: 35 }, { at: [1230, 290], r: 60 }] }),
        churn({ swirl: 6, within: circlesAlong([[40, 790], [1440, 790]], 110), spare: [{ at: [1375, 730], r: 40 }, { at: [1190, 705], r: 35 }, { at: [990, 690], r: 40 }] }),
      ],
    },
    {
      name: "monk",
      url: "cast/pilgrims-monk.webp",
      faces: "right",
      aspect: 868 / 1024,
      feet: 0.1,
      size: { across: 0.9 },
      pixels: [868, 1024],
      life: [
        gait({
          strideHz: 0.55,
          swing: 0.18,
          fold: 0.45,
          bob: 8,
          legs: [
            { foot: "near-hind", line: [[290, 730], [310, 860], [350, 925]], radius: 36, painted: 0.4, cloud: MONK_NEAR_HIND },
            { foot: "far-hind", line: [[235, 730], [200, 860], [172, 912]], radius: 30, painted: -0.7, cloud: MONK_FAR_HIND },
            { foot: "far-fore", line: [[615, 730], [600, 840], [585, 900]], radius: 30, painted: -0.2, cloud: MONK_FAR_FORE },
            { foot: "near-fore", line: [[570, 720], [615, 835], [690, 950]], radius: 34, painted: 0.7, cloud: MONK_NEAR_FORE },
          ],
          head: { regions: [{ at: [780, 380], r: 110 }], nod: 6 },
          prints: true,
        }),
        serpent({ spine: [[210, 500], [150, 560], [110, 650], [90, 740], [80, 800]], radius: 60, reach: 110, waves: 1, swing: 0.04, bob: 0 }),
        flutter({ root: [740, 250], stir: 6, regions: [{ at: [650, 300], r: 80 }, { at: [620, 360], r: 55 }] }),
        flutter({ root: [620, 540], stir: 6, regions: [{ at: [525, 610], r: 35 }, { at: [605, 630], r: 35 }, { at: [665, 690], r: 45 }, { at: [720, 620], r: 40 }, { at: [745, 520], r: 30 }, { at: [445, 770], r: 35 }] }),
        churn({ swirl: 6, within: [...MONK_FAR_HIND, ...MONK_NEAR_HIND, ...MONK_FAR_FORE, ...MONK_NEAR_FORE] }),
        pitch({ most: 0.12 }),
      ],
    },
    // The moments of the road (F139), each measured as the road is, by the horse and the three beside it, so each is the
    // party's size.
    // Halted to rest: each keeps their balance where they stand, the monk turned in the saddle; robes, ribbons, the
    // horse's mane and tail stir, and the road of cloud boils about the hooves.
    {
      name: "rest",
      url: "cast/pilgrims-rest.webp",
      faces: "right",
      aspect: 1536 / 1012,
      feet: 0.135,
      size: { across: 1.116 },
      pixels: [1536, 1012],
      life: [
        sway({ feet: [420, 795], crown: 125, lean: 7, who: { name: "sha", within: circlesAlong([[300, 180], [330, 740]], 200) } }),
        sway({ feet: [700, 800], crown: 200, lean: 7, who: { name: "bajie", within: circlesAlong([[700, 250], [700, 720]], 190) } }),
        sway({ feet: [1100, 600], crown: 95, lean: 5, who: { name: "monk", within: [{ at: [1100, 280], r: 170 }, { at: [1100, 460], r: 140 }] } }),
        serpent({ spine: [[930, 470], [890, 560], [870, 650], [865, 740]], radius: 45, reach: 80, waves: 1, swing: 0.04, bob: 0 }),
        flutter({ root: [1330, 420], stir: 4, regions: [{ at: [1300, 420], r: 70 }, { at: [1400, 450], r: 55 }] }),
        flutter({ root: [1080, 180], stir: 5, regions: circlesAlong([[1050, 220], [960, 340]], 45) }),
        flutter({ root: [340, 450], stir: 5, regions: [{ at: [330, 640], r: 60 }, { at: [455, 560], r: 55 }], stiff: circlesAlong([[215, 300], [235, 760]], 20) }),
        flutter({ root: [700, 430], stir: 5, regions: [{ at: [560, 560], r: 60 }, { at: [830, 560], r: 60 }], stiff: circlesAlong([[690, 380], [680, 700]], 22) }),
        churn({ swirl: 6, within: circlesAlong([[40, 885], [1500, 885]], 110), spare: [{ at: [1235, 820], r: 45 }, { at: [1380, 840], r: 40 }, { at: [1100, 790], r: 35 }] }),
      ],
    },
    // Stopped short at the tiger: braced, weapons out, the horse shying; they keep their balance tensely, robes and the
    // horse's mane and tail swinging, the cloud boiling.
    {
      name: "tiger",
      url: "cast/pilgrims-tiger.webp",
      faces: "right",
      aspect: 1536 / 1010,
      feet: 0.18,
      size: { across: 0.977 },
      pixels: [1536, 1010],
      life: [
        sway({ feet: [290, 745], crown: 165, lean: 6, who: { name: "sha", within: circlesAlong([[270, 260], [270, 650]], 220) } }),
        sway({ feet: [715, 760], crown: 245, lean: 6, who: { name: "bajie", within: circlesAlong([[715, 300], [715, 680]], 210) } }),
        sway({ feet: [1150, 560], crown: 90, lean: 5, who: { name: "monk", within: [{ at: [1110, 280], r: 170 }, { at: [1110, 460], r: 140 }] } }),
        serpent({ spine: [[990, 470], [945, 560], [925, 650], [930, 720]], radius: 45, reach: 80, waves: 1, swing: 0.05, bob: 0 }),
        flutter({ root: [1330, 250], stir: 5, regions: [{ at: [1300, 280], r: 70 }, { at: [1285, 380], r: 55 }] }),
        flutter({ root: [270, 380], stir: 6, regions: [{ at: [140, 600], r: 80 }, { at: [400, 600], r: 70 }], stiff: circlesAlong([[50, 200], [500, 460]], 25) }),
        flutter({ root: [715, 400], stir: 6, regions: [{ at: [560, 600], r: 70 }, { at: [880, 560], r: 60 }], stiff: circlesAlong([[470, 290], [920, 540]], 25) }),
        flutter({ root: [1100, 200], stir: 5, regions: [{ at: [1020, 330], r: 60 }, { at: [1000, 480], r: 60 }] }),
        churn({ swirl: 6, within: circlesAlong([[40, 865], [1510, 865]], 120), spare: [{ at: [1270, 780], r: 40 }, { at: [1030, 780], r: 40 }, { at: [1470, 790], r: 40 }] }),
      ],
    },
    // On the raft over the Flowing Sands: the raft rocks as a boat does, each aboard keeping their balance on it, Sha
    // poling, the horse's mane stirring, the golden dust it rides boiling under the skulls.
    {
      name: "raft",
      url: "cast/pilgrims-raft.webp",
      faces: "right",
      aspect: 1487 / 983,
      feet: 0.196,
      size: { across: 0.932 },
      pixels: [1487, 983],
      life: [
        sway({ feet: [740, 900], crown: 0, lean: 6 }),
        sway({ feet: [320, 625], crown: 110, lean: 6, who: { name: "sha", within: circlesAlong([[330, 200], [330, 560]], 180) } }),
        sway({ feet: [800, 560], crown: 235, lean: 4, who: { name: "monk", within: [{ at: [810, 390], r: 130 }] } }),
        sway({ feet: [1180, 620], crown: 315, lean: 5, who: { name: "bajie", within: [{ at: [1200, 460], r: 170 }] } }),
        flutter({ root: [1080, 200], stir: 4, regions: [{ at: [1000, 210], r: 70 }, { at: [1060, 160], r: 50 }] }),
        flutter({ root: [330, 330], stir: 6, regions: [{ at: [220, 420], r: 70 }, { at: [480, 380], r: 50 }], stiff: circlesAlong([[240, 40], [540, 650]], 22) }),
        churn({ swirl: 8, grey: 0.6, pale: 0.45, within: circlesAlong([[60, 850], [1440, 850]], 115), spare: circlesAlong([[380, 700], [1330, 700]], 80) }),
      ],
    },
    // Over the frozen Tongtian: they walk as on the road, heads down, the horse's hooves bound in straw, their cloaks
    // swinging, the frost-white cloud boiling about their feet, which wade in it.
    {
      name: "ice",
      url: "cast/pilgrims-ice.webp",
      faces: "right",
      aspect: 1524 / 1010,
      feet: 0.139,
      size: { across: 1.05 },
      pixels: [1524, 1010],
      life: [
        sway({ feet: [290, 735], crown: 150, lean: 7, who: ICE_SHA }),
        sway({ feet: [690, 755], crown: 220, lean: 7, who: ICE_BAJIE }),
        gait({
          strideHz: 0.5,
          swing: 0.12,
          fold: 0.15,
          bob: 8,
          legs: [
            { foot: "near", line: [[330, 600], [350, 680], [400, 745]], radius: 34, painted: 0.6, inPicture: true },
            { foot: "far", line: [[230, 600], [190, 670], [150, 715]], radius: 30, painted: -0.5, inPicture: true },
          ],
          who: ICE_SHA,
        }),
        gait({
          strideHz: 0.46,
          swing: 0.12,
          fold: 0.15,
          bob: 9,
          legs: [
            { foot: "near", line: [[720, 600], [770, 680], [820, 755]], radius: 34, painted: 0.6, inPicture: true },
            { foot: "far", line: [[640, 600], [590, 680], [560, 745]], radius: 30, painted: -0.5, inPicture: true },
          ],
          who: ICE_BAJIE,
        }),
        gait({
          strideHz: 0.5,
          swing: 0.16,
          fold: 0.4,
          bob: 6,
          legs: [
            { foot: "near-fore", line: [[1290, 600], [1345, 690], [1395, 835]], radius: 30, painted: 0.5, inPicture: true },
            { foot: "far-fore", line: [[1240, 620], [1260, 700], [1265, 800]], radius: 28, painted: -0.2, inPicture: true },
            { foot: "near-hind", line: [[1000, 590], [1040, 690], [1060, 780]], radius: 30, painted: -0.3, inPicture: true },
            { foot: "far-hind", line: [[930, 590], [910, 680], [905, 770]], radius: 28, painted: -0.7, inPicture: true },
          ],
          head: { regions: [{ at: [1440, 380], r: 100 }], nod: 5 },
          who: ICE_HORSE,
        }),
        serpent({ spine: [[900, 450], [870, 540], [860, 620], [870, 700]], radius: 45, reach: 80, waves: 1, swing: 0.04, bob: 0 }),
        flutter({ root: [290, 420], stir: 5, regions: [{ at: [150, 600], r: 70 }, { at: [400, 600], r: 60 }] }),
        flutter({ root: [680, 450], stir: 5, regions: [{ at: [520, 580], r: 60 }, { at: [800, 600], r: 60 }] }),
        flutter({ root: [1100, 250], stir: 4, regions: [{ at: [960, 560], r: 70 }, { at: [1380, 560], r: 60 }] }),
        churn({ swirl: 6, within: circlesAlong([[40, 860], [1500, 860]], 110), spare: [{ at: [1395, 820], r: 40 }, { at: [1265, 790], r: 35 }, { at: [1060, 770], r: 35 }, { at: [905, 760], r: 35 }] }),
      ],
    },
    // Arrived in the West: the monk standing, palms together, the two kneeling, the horse's head bowed; they breathe
    // and keep still, the monk's ribbons and the horse's mane stirring, the cloud boiling under them.
    {
      name: "arrival",
      url: "cast/pilgrims-arrival.webp",
      faces: "right",
      aspect: 1529 / 1014,
      feet: 0.18,
      size: { across: 1.103 },
      pixels: [1529, 1014],
      life: [
        sway({ feet: [330, 700], crown: 265, lean: 4, who: { name: "sha", within: [{ at: [330, 500], r: 200 }] } }),
        sway({ feet: [640, 710], crown: 330, lean: 4, who: { name: "bajie", within: [{ at: [640, 520], r: 190 }] } }),
        sway({ feet: [1240, 800], crown: 45, lean: 7, who: { name: "monk", within: circlesAlong([[1230, 110], [1240, 760]], 150) } }),
        flutter({ root: [960, 300], stir: 4, regions: [{ at: [960, 300], r: 90 }, { at: [1060, 400], r: 60 }] }),
        flutter({ root: [1200, 130], stir: 5, regions: circlesAlong([[1180, 170], [1120, 340]], 40) }),
        churn({ swirl: 6, within: circlesAlong([[40, 830], [1500, 830]], 130), spare: [{ at: [850, 700], r: 40 }, { at: [960, 710], r: 40 }, { at: [1100, 690], r: 40 }] }),
      ],
    },
    // More of the road (F141), measured as the road is. Sha leads the horse, the monk telling his beads, Bajie under the
    // luggage: each walks, the horse too, their feet wading in the road; the horse's head nods and its tail swings.
    {
      name: "road-led",
      url: "cast/pilgrims-road-led.webp",
      faces: "right",
      aspect: 1536 / 982,
      feet: 0.195,
      size: { across: 1.024 },
      pixels: [1536, 982],
      life: [
        sway({ feet: [370, 765], crown: 230, lean: 8, who: LED_BAJIE }),
        sway({ feet: [1320, 790], crown: 175, lean: 8, who: LED_SHA }),
        gait({
          strideHz: 0.5,
          swing: 0.12,
          fold: 0.15,
          bob: 9,
          legs: [
            { foot: "near", line: [[390, 630], [420, 690], [490, 760]], radius: 34, painted: 0.6, inPicture: true },
            { foot: "far", line: [[300, 640], [275, 690], [235, 745]], radius: 30, painted: -0.5, inPicture: true },
          ],
          who: LED_BAJIE,
        }),
        gait({
          strideHz: 0.55,
          swing: 0.13,
          fold: 0.15,
          bob: 8,
          legs: [
            { foot: "near", line: [[1330, 640], [1390, 700], [1470, 790]], radius: 34, painted: 0.6, inPicture: true },
            { foot: "far", line: [[1250, 640], [1200, 700], [1170, 765]], radius: 30, painted: -0.5, inPicture: true },
          ],
          who: LED_SHA,
        }),
        gait({
          strideHz: 0.55,
          swing: 0.16,
          fold: 0.4,
          bob: 6,
          legs: [
            { foot: "near-fore", line: [[950, 560], [1020, 670], [1070, 785]], radius: 26, painted: 0.5, inPicture: true },
            { foot: "far-fore", line: [[880, 540], [860, 650], [870, 760]], radius: 26, painted: -0.2, inPicture: true },
            { foot: "near-hind", line: [[640, 600], [630, 680], [620, 750]], radius: 26, painted: -0.3, inPicture: true },
          ],
          head: { regions: [{ at: [1050, 340], r: 90 }], nod: 5 },
          who: LED_HORSE,
        }),
        serpent({ spine: [[560, 450], [520, 550], [500, 640], [495, 700]], radius: 45, reach: 80, waves: 1, swing: 0.04, bob: 0 }),
        flutter({ root: [665, 150], stir: 5, regions: circlesAlong([[655, 190], [610, 400]], 26) }),
        flutter({ root: [1300, 420], stir: 5, regions: [{ at: [1180, 620], r: 60 }, { at: [1440, 600], r: 55 }] }),
        flutter({ root: [380, 440], stir: 5, regions: [{ at: [250, 640], r: 60 }, { at: [500, 620], r: 55 }] }),
        churn({ swirl: 6, within: circlesAlong([[40, 860], [1500, 860]], 110), spare: [{ at: [1070, 785], r: 40 }, { at: [870, 760], r: 35 }, { at: [620, 750], r: 35 }] }),
      ],
    },
    // The monk on foot in his bamboo hat, leading the horse, which walks unridden; Bajie and Sha behind.
    {
      name: "road-on-foot",
      url: "cast/pilgrims-road-on-foot.webp",
      faces: "right",
      aspect: 1516 / 932,
      feet: 0.25,
      size: { across: 1.018 },
      pixels: [1516, 932],
      life: [
        sway({ feet: [310, 690], crown: 80, lean: 8, who: FOOT_SHA }),
        sway({ feet: [670, 700], crown: 165, lean: 8, who: FOOT_BAJIE }),
        sway({ feet: [1320, 735], crown: 110, lean: 7, who: FOOT_MONK }),
        gait({
          strideHz: 0.55,
          swing: 0.13,
          fold: 0.15,
          bob: 8,
          legs: [
            { foot: "near", line: [[320, 560], [380, 620], [450, 690]], radius: 32, painted: 0.6, inPicture: true },
            { foot: "far", line: [[230, 560], [190, 610], [160, 670]], radius: 30, painted: -0.5, inPicture: true },
          ],
          who: FOOT_SHA,
        }),
        gait({
          strideHz: 0.5,
          swing: 0.12,
          fold: 0.15,
          bob: 9,
          legs: [
            { foot: "near", line: [[680, 560], [740, 630], [800, 700]], radius: 34, painted: 0.6, inPicture: true },
            { foot: "far", line: [[600, 560], [560, 620], [540, 690]], radius: 30, painted: -0.5, inPicture: true },
          ],
          who: FOOT_BAJIE,
        }),
        gait({
          strideHz: 0.55,
          swing: 0.12,
          fold: 0.15,
          bob: 6,
          legs: [
            { foot: "near", line: [[1330, 580], [1380, 650], [1430, 735]], radius: 30, painted: 0.6, inPicture: true },
            { foot: "far", line: [[1270, 580], [1230, 640], [1210, 715]], radius: 28, painted: -0.5, inPicture: true },
          ],
          who: FOOT_MONK,
        }),
        gait({
          strideHz: 0.55,
          swing: 0.16,
          fold: 0.4,
          bob: 6,
          legs: [
            { foot: "near-fore", line: [[1060, 560], [1070, 630], [1080, 700]], radius: 24, painted: 0.5, inPicture: true },
            { foot: "far-fore", line: [[1000, 560], [990, 630], [985, 690]], radius: 24, painted: -0.2, inPicture: true },
            { foot: "near-hind", line: [[870, 560], [855, 620], [840, 680]], radius: 26, painted: -0.3, inPicture: true },
          ],
          head: { regions: [{ at: [1150, 290], r: 80 }], nod: 5 },
          who: FOOT_HORSE,
        }),
        serpent({ spine: [[840, 470], [810, 550], [795, 620], [790, 660]], radius: 40, reach: 70, waves: 1, swing: 0.04, bob: 0 }),
        flutter({ root: [1295, 200], stir: 4, regions: circlesAlong([[1300, 250], [1295, 470]], 22) }),
        flutter({ root: [300, 400], stir: 5, regions: [{ at: [170, 560], r: 60 }, { at: [410, 540], r: 55 }] }),
        flutter({ root: [660, 420], stir: 5, regions: [{ at: [530, 560], r: 60 }, { at: [780, 560], r: 55 }] }),
        churn({ swirl: 6, within: circlesAlong([[40, 790], [1480, 790]], 110), spare: [{ at: [985, 690], r: 35 }, { at: [1080, 700], r: 35 }, { at: [840, 680], r: 35 }] }),
      ],
    },
    // The monk alone setting out (F141), measured as he rides out, by the horse. On foot leading the horse, both walking;
    // halted, turned in the saddle to look back at Chang'an, a hand raised; on foot, praying for the road, the horse's
    // head low beside him. The horse's tail and mane and the harness's tassels stir; the cloud under them boils.
    {
      name: "monk-led",
      url: "cast/pilgrims-monk-led.webp",
      faces: "right",
      aspect: 1474 / 1024,
      feet: 0.09,
      size: { across: 0.537 },
      pixels: [1474, 1024],
      life: [
        sway({ feet: [1020, 930], crown: 70, lean: 7, who: LED_MONK }),
        gait({
          strideHz: 0.55,
          swing: 0.12,
          fold: 0.15,
          bob: 6,
          legs: [
            { foot: "near", line: [[1060, 700], [1110, 820], [1160, 930]], radius: 34, painted: 0.6, inPicture: true },
            { foot: "far", line: [[980, 700], [930, 800], [880, 885]], radius: 30, painted: -0.5, inPicture: true },
          ],
          who: LED_MONK,
        }),
        gait({
          strideHz: 0.55,
          swing: 0.16,
          fold: 0.4,
          bob: 6,
          legs: [
            { foot: "near-fore", line: [[600, 650], [640, 760], [700, 890]], radius: 30, painted: 0.5, inPicture: true },
            { foot: "far-fore", line: [[540, 650], [560, 760], [560, 860]], radius: 28, painted: -0.2, inPicture: true },
            { foot: "near-hind", line: [[330, 650], [330, 770], [350, 860]], radius: 30, painted: -0.3, inPicture: true },
            { foot: "far-hind", line: [[250, 620], [250, 760], [180, 860]], radius: 28, painted: -0.7, inPicture: true },
          ],
          head: { regions: [{ at: [770, 300], r: 100 }], nod: 6 },
          who: LED_HORSE_ALONE,
        }),
        serpent({ spine: [[210, 420], [140, 500], [90, 600], [70, 720]], radius: 55, reach: 100, waves: 1, swing: 0.04, bob: 0 }),
        flutter({ root: [1080, 170], stir: 5, regions: circlesAlong([[1100, 230], [1110, 560]], 35) }),
        flutter({ root: [500, 540], stir: 6, regions: [{ at: [590, 600], r: 45 }, { at: [650, 620], r: 40 }, { at: [240, 540], r: 40 }, { at: [760, 480], r: 35 }] }),
        churn({ swirl: 6, within: circlesAlong([[40, 900], [1440, 900]], 110), spare: [{ at: [700, 890], r: 40 }, { at: [560, 860], r: 35 }, { at: [350, 860], r: 35 }, { at: [180, 860], r: 35 }, { at: [880, 885], r: 40 }, { at: [1160, 930], r: 45 }] }),
      ],
    },
    {
      name: "monk-farewell",
      url: "cast/pilgrims-monk-farewell.webp",
      faces: "right",
      aspect: 965 / 1024,
      feet: 0.087,
      size: { across: 0.826 },
      pixels: [965, 1024],
      life: [
        sway({ feet: [430, 650], crown: 60, lean: 5, who: { name: "monk", within: [{ at: [380, 250], r: 170 }, { at: [400, 480], r: 150 }] } }),
        serpent({ spine: [[200, 480], [140, 560], [90, 680], [60, 800]], radius: 55, reach: 100, waves: 1, swing: 0.04, bob: 0 }),
        flutter({ root: [760, 240], stir: 5, regions: [{ at: [800, 330], r: 80 }, { at: [720, 300], r: 60 }] }),
        flutter({ root: [620, 560], stir: 6, regions: [{ at: [660, 640], r: 55 }, { at: [800, 600], r: 45 }, { at: [860, 490], r: 35 }] }),
        flutter({ root: [440, 150], stir: 5, regions: circlesAlong([[450, 200], [460, 420]], 35) }),
        churn({ swirl: 6, within: circlesAlong([[40, 920], [920, 920]], 110) }),
      ],
    },
    {
      name: "monk-pray",
      url: "cast/pilgrims-monk-pray.webp",
      faces: "right",
      aspect: 1422 / 1022,
      feet: 0.105,
      size: { across: 0.547 },
      pixels: [1422, 1022],
      life: [
        sway({ feet: [960, 930], crown: 55, lean: 5, who: { name: "monk", within: circlesAlong([[960, 150], [960, 850]], 180) } }),
        serpent({ spine: [[230, 330], [170, 450], [140, 580], [140, 700]], radius: 55, reach: 100, waves: 1, swing: 0.03, bob: 0 }),
        flutter({ root: [560, 260], stir: 4, regions: [{ at: [620, 310], r: 90 }] }),
        flutter({ root: [990, 170], stir: 4, regions: circlesAlong([[990, 220], [1000, 420]], 30) }),
        flutter({ root: [500, 430], stir: 5, regions: [{ at: [440, 470], r: 45 }, { at: [530, 520], r: 45 }, { at: [580, 560], r: 40 }] }),
        churn({ swirl: 6, within: circlesAlong([[40, 900], [1380, 900]], 110), spare: [{ at: [330, 850], r: 45 }, { at: [560, 870], r: 45 }] }),
      ],
    },
  ],
});
