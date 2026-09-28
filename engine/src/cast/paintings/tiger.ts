/**
 * The tiger, painted (D94): prowling the air, bare, on puffs of cloud
 * (`content/paintings/tiger.yaml`). Sized nose to tail.
 */
import { registerPainting } from "../painting.js";

registerPainting("tiger", {
  views: [
    { name: "default", url: "cast/tiger-default.webp", faces: "right", aspect: 1415 / 910, feet: 0.15, size: { across: 0.97 } },
  ],
});
