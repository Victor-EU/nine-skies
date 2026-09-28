/**
 * The Peng, painted (D94): soaring on its spread wings of beaten gold
 * (`content/paintings/peng.yaml`). Sized wingtip to wingtip.
 */
import { registerPainting } from "../painting.js";

registerPainting("peng", {
  views: [
    { name: "default", url: "cast/peng-default.webp", faces: "right", aspect: 1536 / 993, feet: 0.5, size: { across: 0.97 } },
  ],
});
