/**
 * The elephant of heaven, painted (D94): walking the air in its crimson
 * and gold (`content/paintings/elephant.yaml`). Sized trunk to tail.
 */
import { registerPainting } from "../painting.js";

registerPainting("elephant", {
  views: [
    { name: "default", url: "cast/elephant-default.webp", faces: "right", aspect: 1367 / 990, feet: 0.12, size: { across: 0.97 } },
  ],
});
