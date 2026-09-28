/**
 * The qilin, painted (D94): walking the air, flames at its shoulders and
 * hocks (`content/paintings/qilin.yaml`). Sized nose to tail.
 */
import { registerPainting } from "../painting.js";

registerPainting("qilin", {
  views: [
    { name: "default", url: "cast/qilin-default.webp", faces: "right", aspect: 1327 / 1020, feet: 0.08, size: { across: 0.95 } },
  ],
});
