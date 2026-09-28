/**
 * The Queen Mother of the West, painted (D94): on her cloud with the peach
 * and the three blue birds (`content/paintings/xiwangmu.yaml`). Sized hem
 * to headdress.
 */
import { circlesAlong } from "../life.js";
import { churn } from "../life/churn.js";
import { flap } from "../life/flap.js";
import { flutter } from "../life/flutter.js";
import { sway } from "../life/sway.js";
import { registerPainting } from "../painting.js";

/**
 * Her life (D96): she stands still as a queen does, leaning only a little
 * over her feet; the jade pendants of her crown and the ends of her
 * sleeves stir, and her cloud boils. The three blue birds about her beat
 * their wings, each out of step with the others, and their long tails
 * stream: the raised wing as the magpie's does, and the far one, painted
 * below or beside the body and two of them over her robe, reaching further
 * as the near one comes down, drawn in front so it never goes behind the
 * robe it lies over.
 */
registerPainting("xiwangmu", {
  views: [
    {
      name: "default",
      url: "cast/xiwangmu-default.webp",
      faces: "right",
      aspect: 943 / 1526,
      feet: 0.1,
      size: { crown: 0.97 },
      pixels: [943, 1526],
      life: [
        sway({ feet: [470, 1390], crown: 10, lean: 10 }),
        flap({
          beatHz: 2.5,
          bob: 6,
          near: { hinge: [[220, 270], [262, 222]], outline: [[262, 222], [262, 181], [234, 132], [191, 93], [157, 70], [124, 67], [116, 112], [118, 169], [137, 223], [168, 267], [200, 275], [220, 270]], top: 1, bottom: -0.35, feather: 14 },
          far: { hinge: [[275, 292], [305, 268]], outline: [[305, 268], [330, 280], [345, 300], [345, 322], [320, 322], [295, 312], [275, 292]], top: 1, bottom: 1.3, front: true, feather: 14 },
          who: { name: "bird-high", within: [{ at: [250, 240], r: 100 }] },
        }),
        flap({
          beatHz: 2.3,
          bob: 5,
          near: { hinge: [[205, 725], [240, 665]], outline: [[240, 665], [232, 623], [198, 581], [162, 553], [117, 547], [67, 559], [37, 590], [48, 640], [86, 688], [139, 727], [180, 735], [205, 725]], top: 1, bottom: -0.35, feather: 14 },
          far: { hinge: [[232, 690], [236, 748]], outline: [[232, 690], [265, 698], [300, 706], [350, 732], [352, 745], [325, 755], [285, 755], [236, 748]], top: 1, bottom: 1.3, front: true, feather: 14 },
          who: { name: "bird-low", within: [{ at: [220, 690], r: 80 }] },
        }),
        flap({
          beatHz: 2.6,
          bob: 6,
          near: { hinge: [[722, 300], [765, 410]], outline: [[722, 300], [734, 265], [769, 224], [804, 198], [838, 200], [870, 236], [899, 294], [890, 357], [844, 403], [800, 410], [765, 410]], top: 1, bottom: -0.35, feather: 14 },
          far: { hinge: [[700, 340], [706, 412]], outline: [[700, 340], [660, 344], [622, 356], [610, 376], [635, 398], [672, 412], [706, 412]], top: 1, bottom: 1.3, front: true, feather: 14 },
          who: { name: "bird-right", within: [{ at: [715, 360], r: 90 }] },
        }),
        // The tails, each from its bird.
        flutter({ root: [225, 265], stir: 10, regions: [...circlesAlong([[200, 260], [150, 300], [100, 360], [70, 430], [50, 470]], 50), ...circlesAlong([[190, 270], [130, 350], [100, 440], [100, 500]], 45)] }),
        flutter({ root: [205, 735], stir: 10, regions: circlesAlong([[190, 720], [150, 800], [120, 880], [100, 960], [90, 1010]], 55) }),
        flutter({ root: [770, 420], stir: 10, regions: circlesAlong([[790, 450], [830, 520], [870, 600], [900, 680]], 55) }),
        flutter({ root: [470, 110], stir: 4, regions: [{ at: [355, 230], r: 45 }, { at: [570, 230], r: 40 }, { at: [310, 110], r: 35 }, { at: [600, 135], r: 35 }], stiff: [{ at: [480, 230], r: 75 }] }),
        flutter({ root: [470, 600], stir: 5, regions: [{ at: [265, 1000], r: 80 }, { at: [680, 1030], r: 80 }] }),
        churn({ swirl: 8, within: [{ at: [120, 1320], r: 140 }, { at: [800, 1300], r: 110 }, ...circlesAlong([[60, 1470], [900, 1470]], 100)] }),
      ],
    },
  ],
});
