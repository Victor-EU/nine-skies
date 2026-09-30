/**
 * Nezha, painted (D94): leaning into a turn on the Wind-Fire Wheels, the
 * spear low, the sash looping behind (`content/paintings/nezha.yaml`).
 * Sized wheels to buns, as the Nezha made in code is.
 */
import { circlesAlong } from "../life.js";
import { flutter } from "../life/flutter.js";
import { pitch } from "../life/pitch.js";
import { sway } from "../life/sway.js";
import { registerPainting } from "../painting.js";

const LEFT_FOOT = [{ at: [340, 1240], r: 55 }, { at: [350, 1120], r: 50 }] as const;
const RIGHT_FOOT = [{ at: [735, 1090], r: 50 }, { at: [705, 1020], r: 40 }] as const;

/**
 * His life (D96): he rides the wheels leaning into his turn and keeps his
 * balance on them; the long red sash streams and loops behind him, the
 * ribbons in his hair stir, the lotus-leaf skirt lifts, and the fire of
 * the wheels and of the spear's point licks, quicker than cloth. He noses
 * into a climb.
 */
registerPainting("nezha", {
  views: [
    {
      name: "default",
      url: "cast/nezha-default.webp",
      faces: "right",
      aspect: 997 / 1463,
      feet: 0.06,
      size: { crown: 0.97 },
      pixels: [997, 1463],
      life: [
        sway({ feet: [520, 1290], crown: 30, lean: 14 }),
        flutter({
          root: [600, 260],
          stir: 16,
          regions: circlesAlong([[520, 230], [380, 170], [230, 110], [100, 110], [40, 220], [80, 330], [180, 400], [300, 440], [420, 480]], 90),
          stiff: circlesAlong([[590, 330], [520, 500], [500, 640]], 50),
        }),
        flutter({ root: [680, 60], stir: 6, regions: [{ at: [820, 160], r: 60 }, { at: [575, 150], r: 55 }], stiff: [{ at: [690, 180], r: 90 }] }),
        flutter({ root: [620, 560], stir: 5, regions: [{ at: [450, 780], r: 80 }, { at: [810, 740], r: 80 }, { at: [530, 870], r: 60 }] }),
        // The fire: each wheel's about its hub, the spear's about its shaft, the feet on the wheels kept still.
        flutter({ root: [320, 1290], stir: 7, pace: 4, ripple: 70, regions: [{ at: [320, 1290], r: 140 }], stiff: LEFT_FOOT }),
        flutter({ root: [700, 1170], stir: 6, pace: 4, ripple: 70, regions: [{ at: [700, 1170], r: 120 }], stiff: RIGHT_FOOT }),
        flutter({ root: [760, 850], stir: 6, pace: 4, ripple: 60, regions: [{ at: [860, 920], r: 90 }, { at: [930, 1000], r: 60 }] }),
        pitch({ most: 0.08 }),
      ],
    },
    // Charging on his wheels, the spear thrust ahead (F142): he keeps his balance on them, the sash streams, the wheels and the spear's point burn.
    {
      name: "charge",
      url: "cast/nezha-charge.webp",
      faces: "right",
      aspect: 1024 / 1484,
      feet: 0.067,
      size: { crown: 1.108 },
      pixels: [1024, 1484],
      life: [
        sway({ feet: [680, 1260], crown: 190, lean: 10 }),
        flutter({ root: [800, 300], stir: 16, regions: circlesAlong([[700, 240], [500, 210], [260, 110], [80, 60], [40, 270], [110, 450], [250, 580]], 80), stiff: [{ at: [700, 300], r: 110 }] }),
        flutter({ root: [600, 700], stir: 5, regions: [{ at: [300, 720], r: 90 }, { at: [750, 850], r: 80 }] }),
        flutter({ root: [213, 1073], stir: 7, pace: 4, ripple: 70, regions: [{ at: [213, 1073], r: 130 }], stiff: [{ at: [240, 982], r: 60 }] }),
        flutter({ root: [704, 1273], stir: 7, pace: 4, ripple: 70, regions: [{ at: [704, 1273], r: 170 }], stiff: [{ at: [676, 1164], r: 60 }] }),
        flutter({ root: [895, 709], stir: 6, pace: 4, ripple: 60, regions: [{ at: [895, 709], r: 110 }] }),
        pitch({ most: 0.12 }),
      ],
    },
  ],
});
