/**
 * The dragons, painted (D94): the East King drawn first and the other kings,
 * the White Dragon of Eagle Grief Stream and the Jing River's king drawn
 * from him, so the family is one design (`content/paintings/dragon.yaml`).
 * Rising in an S from the lower left, head to the right; sized head to
 * tail across the picture, as the dragon made in code is. The Uyghur
 * dragon lying along the Flaming Mountains (`lantern`) has no view and
 * stays made in code.
 */
import { registerPainting } from "../painting.js";

registerPainting("dragon", {
  views: [
    { name: "east-king", url: "cast/dragon-east-king.webp", faces: "right", aspect: 1505 / 999, feet: 0.5, size: { across: 0.97 } },
    { name: "south-king", url: "cast/dragon-south-king.webp", faces: "right", aspect: 1520 / 996, feet: 0.5, size: { across: 0.97 } },
    { name: "west-king", url: "cast/dragon-west-king.webp", faces: "right", aspect: 1504 / 998, feet: 0.5, size: { across: 0.97 } },
    { name: "north-king", url: "cast/dragon-north-king.webp", faces: "right", aspect: 1525 / 1006, feet: 0.5, size: { across: 0.97 } },
    { name: "white", url: "cast/dragon-white.webp", faces: "right", aspect: 1517 / 1006, feet: 0.5, size: { across: 0.97 } },
    { name: "dust", url: "cast/dragon-dust.webp", faces: "right", aspect: 1508 / 1004, feet: 0.5, size: { across: 0.97 } },
  ],
});
