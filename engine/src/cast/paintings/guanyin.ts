/**
 * Guanyin's seat, painted (D94): the empty lotus throne on cloud, the vase
 * and willow, the white parrot; no part of her (`LIVING_FAITHS`,
 * `content/paintings/guanyin.yaml`). Sized across the cloud it rests on.
 */
import { registerPainting } from "../painting.js";

registerPainting("guanyin", {
  views: [
    { name: "default", url: "cast/guanyin-default.webp", faces: "right", aspect: 923 / 1426, feet: 0.3, size: { across: 1 } },
  ],
});
