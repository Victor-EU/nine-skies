/**
 * Nüwa, painted (D98): rising with the stone of five colours held up in
 * both hands to mend the sky, her serpent's body trailing behind her in
 * one long S (`content/paintings/nuwa.yaml`). Sized across the picture,
 * the tail's curl to the stone.
 */
import { circlesAlong } from "../life.js";
import { churn } from "../life/churn.js";
import { flutter } from "../life/flutter.js";
import { pitch } from "../life/pitch.js";
import { serpent } from "../life/serpent.js";
import { registerPainting } from "../painting.js";

/** The serpent's body, from under the robe's hem at her waist to the tip of the tail. */
const SPINE = [[1055, 590], [1035, 700], [975, 810], [900, 885], [800, 915], [700, 850], [600, 760], [500, 700], [400, 697], [300, 757], [200, 806], [100, 836], [35, 760], [60, 660], [110, 622], [155, 565]] as const;

/**
 * Her life (D96): the serpent's body swims a slow wave down to its tail,
 * which curls, and carries the wisps of cloud at its coils along; the
 * woman rides the head of the wave and keeps almost still. Her long silk
 * ribbon streams from her shoulders, her loose hair lifts, her hanging
 * sleeve and the flare of her robe stir. The smoke off the stone and the
 * clouds clear of her coils boil; the stone and her scales do not. She
 * noses into her climb.
 */
registerPainting("nuwa", {
  views: [
    {
      name: "default",
      url: "cast/nuwa-default.webp",
      faces: "right",
      aspect: 1386 / 1017,
      feet: 0.5,
      size: { across: 0.96 },
      pixels: [1386, 1017],
      life: [
        serpent({ spine: SPINE, radius: 55, reach: 110, waves: 1, swing: 0.025, bob: 0.003 }),
        flutter({
          root: [880, 320],
          stir: 14,
          regions: [
            ...circlesAlong([[840, 360], [760, 370], [680, 355], [600, 345], [540, 370], [510, 420], [500, 470], [450, 480], [380, 450], [330, 445]], 40),
            ...circlesAlong([[830, 400], [760, 440], [680, 460], [600, 480], [555, 520], [545, 570]], 40),
          ],
        }),
        flutter({ root: [860, 150], stir: 6, regions: circlesAlong([[800, 240], [775, 285], [760, 330]], 30) }),
        flutter({ root: [1180, 300], stir: 5, regions: [{ at: [1215, 480], r: 50 }, { at: [1210, 570], r: 45 }] }),
        flutter({ root: [900, 500], stir: 6, regions: [{ at: [700, 575], r: 60 }] }),
        churn({
          swirl: 7,
          within: [{ at: [620, 615], r: 50 }, { at: [250, 705], r: 40 }, { at: [800, 750], r: 45 }, { at: [1120, 85], r: 40 }],
          spare: [...circlesAlong(SPINE, 50), { at: [1250, 110], r: 90 }],
        }),
        pitch({ most: 0.15 }),
      ],
    },
  ],
});
