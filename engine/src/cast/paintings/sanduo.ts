/**
 * Sanduo's mount, painted (D94): the white horse riderless, the white
 * spear and pennant at the saddle; no part of him (`LIVING_FAITHS`,
 * `content/paintings/sanduo.yaml`). Sized hoof to the spear's blade.
 */
import { registerPainting } from "../painting.js";

registerPainting("sanduo", {
  views: [
    { name: "default", url: "cast/sanduo-default.webp", faces: "right", aspect: 1099 / 1018, feet: 0.1, size: { crown: 0.97 } },
  ],
});
