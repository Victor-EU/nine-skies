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
    // His other pictures (F139), each measured as the scout is, eye to sole, so he is one size in all. In each he keeps
    // his balance on the cloud as the scout does, loose cloth and plumes stirring, the cloud boiling under him.
    // The rebel taunting Nezha, the staff out level, the plumes streaming.
    {
      name: "fight",
      url: "cast/wukong-fight.webp",
      faces: "right",
      aspect: 990 / 1515,
      feet: 0.1465,
      size: { crown: 0.8825 },
      pixels: [990, 1515],
      life: [
        sway({ feet: [650, 1290], crown: 150, lean: 16 }),
        flutter({
          root: [690, 190],
          stir: 14,
          regions: [...circlesAlong([[640, 150], [430, 20], [200, 40], [110, 200], [120, 440]], 60), ...circlesAlong([[700, 150], [560, 20], [400, 80], [340, 300]], 50)],
          stiff: circlesAlong([[20, 490], [440, 400]], 30),
        }),
        flutter({ root: [650, 650], stir: 8, regions: [{ at: [300, 720], r: 80 }, { at: [330, 850], r: 80 }, { at: [880, 700], r: 70 }, { at: [860, 500], r: 60 }] }),
        churn({ swirl: 8, within: [{ at: [640, 1370], r: 250 }, { at: [430, 1350], r: 120 }, { at: [850, 1350], r: 120 }] }),
      ],
    },
    // At the Flaming Mountains, swinging the Rakshasi's fan: the great leaf flexes as he swings it.
    {
      name: "fan",
      url: "cast/wukong-fan.webp",
      faces: "right",
      aspect: 1007 / 1536,
      feet: 0.127,
      size: { crown: 0.827 },
      pixels: [1007, 1536],
      life: [
        sway({ feet: [550, 1290], crown: 235, lean: 14 }),
        flutter({ root: [640, 380], stir: 14, regions: [{ at: [800, 230], r: 190 }, { at: [900, 120], r: 110 }], stiff: [{ at: [640, 420], r: 60 }] }),
        flutter({
          root: [410, 250],
          stir: 12,
          regions: [...circlesAlong([[390, 230], [260, 80], [80, 150], [20, 400], [30, 620]], 60), ...circlesAlong([[430, 220], [330, 60], [180, 200], [160, 420]], 50)],
        }),
        flutter({ root: [480, 700], stir: 8, regions: [{ at: [120, 850], r: 80 }, { at: [300, 950], r: 80 }, { at: [800, 950], r: 70 }] }),
        churn({ swirl: 8, within: [{ at: [560, 1420], r: 300 }, { at: [250, 1400], r: 130 }, { at: [850, 1420], r: 130 }] }),
      ],
    },
    // The pilgrim in the golden fillet, scouting.
    {
      name: "pilgrim",
      url: "cast/wukong-pilgrim.webp",
      faces: "right",
      aspect: 997 / 1463,
      feet: 0.173,
      size: { crown: 1.003 },
      pixels: [997, 1463],
      life: [
        sway({ feet: [520, 1210], crown: 30, lean: 16 }),
        flutter({ root: [500, 450], stir: 7, regions: [{ at: [330, 430], r: 80 }, { at: [700, 330], r: 70 }, { at: [330, 800], r: 80 }, { at: [650, 850], r: 70 }], stiff: circlesAlong([[20, 410], [980, 40]], 30) }),
        churn({ swirl: 8, within: [{ at: [560, 1330], r: 230 }, { at: [380, 1320], r: 120 }, { at: [740, 1330], r: 120 }] }),
      ],
    },
    // Striking, the staff over his head.
    {
      name: "pilgrim-strike",
      url: "cast/wukong-pilgrim-strike.webp",
      faces: "right",
      aspect: 1012 / 1524,
      feet: 0.12,
      size: { crown: 0.888 },
      pixels: [1012, 1524],
      life: [
        sway({ feet: [420, 1300], crown: 250, lean: 14 }),
        flutter({ root: [520, 650], stir: 8, regions: [{ at: [300, 700], r: 80 }, { at: [260, 900], r: 90 }, { at: [640, 900], r: 70 }, { at: [820, 420], r: 60 }], stiff: circlesAlong([[20, 340], [980, 20]], 30) }),
        churn({ swirl: 8, within: [{ at: [560, 1300], r: 250 }, { at: [330, 1320], r: 120 }, { at: [800, 1310], r: 120 }] }),
      ],
    },
    // Crouched on his heels, the staff across his shoulders, peering down.
    {
      name: "pilgrim-crouch",
      url: "cast/wukong-pilgrim-crouch.webp",
      faces: "right",
      aspect: 1018 / 1008,
      feet: 0.291,
      size: { crown: 1.8 },
      pixels: [1018, 1008],
      life: [
        sway({ feet: [540, 715], crown: 20, lean: 9 }),
        flutter({ root: [520, 330], stir: 6, regions: [{ at: [300, 560], r: 70 }, { at: [760, 560], r: 60 }], stiff: circlesAlong([[20, 120], [1000, 270]], 30) }),
        churn({ swirl: 8, within: [{ at: [520, 830], r: 200 }, { at: [300, 800], r: 100 }, { at: [760, 810], r: 110 }] }),
      ],
    },
    // Bowing, palms together, the staff in the crook of his arm.
    {
      name: "pilgrim-bow",
      url: "cast/wukong-pilgrim-bow.webp",
      faces: "right",
      aspect: 707 / 1528,
      feet: 0.184,
      size: { crown: 0.908 },
      pixels: [707, 1528],
      life: [
        sway({ feet: [380, 1250], crown: 120, lean: 10 }),
        flutter({ root: [370, 700], stir: 6, regions: [{ at: [210, 850], r: 70 }, { at: [520, 850], r: 70 }], stiff: circlesAlong([[268, 20], [432, 1080]], 28) }),
        churn({ swirl: 8, within: [{ at: [380, 1360], r: 220 }] }),
      ],
    },
  ],
});
