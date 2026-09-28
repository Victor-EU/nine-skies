/**
 * The old turtle of the Tongtian, painted (D94): rowing the air, moss on
 * his shell (`content/paintings/turtle.yaml`). Sized nose to tail.
 */
import { registerPainting } from "../painting.js";

registerPainting("turtle", {
  views: [
    { name: "default", url: "cast/turtle-default.webp", faces: "right", aspect: 1434 / 836, feet: 0.5, size: { across: 0.97 } },
  ],
});
