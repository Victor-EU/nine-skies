/**
 * The magpie, painted (D94): in flight with the red fruit in its beak
 * (`content/paintings/magpie.yaml`). Sized beak to tail.
 */
import { registerPainting } from "../painting.js";

registerPainting("magpie", {
  views: [
    { name: "default", url: "cast/magpie-default.webp", faces: "right", aspect: 1433 / 999, feet: 0.5, size: { across: 0.95 } },
  ],
});
