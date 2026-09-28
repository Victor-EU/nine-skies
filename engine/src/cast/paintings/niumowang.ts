/**
 * The Bull Demon King, painted (D94): the white bull walking the air,
 * Nezha's fire wheel on his right horn (`content/paintings/niumowang.yaml`).
 * Sized muzzle to tail.
 */
import { registerPainting } from "../painting.js";

registerPainting("niumowang", {
  views: [
    { name: "default", url: "cast/niumowang-default.webp", faces: "right", aspect: 1473 / 1014, feet: 0.1, size: { across: 0.97 } },
  ],
});
