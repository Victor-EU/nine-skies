/**
 * The carp, painted (D94): leaping out of spray and cloud
 * (`content/paintings/carp.yaml`). Sized lips to tail, its arc across
 * the picture.
 */
import { registerPainting } from "../painting.js";

registerPainting("carp", {
  views: [
    { name: "default", url: "cast/carp-default.webp", faces: "right", aspect: 1432 / 957, feet: 0.5, size: { across: 0.9 } },
  ],
});
