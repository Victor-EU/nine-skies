/**
 * The pilgrims, painted (D94): the monk on the white horse, Bajie and Sha
 * on a road of cloud, and the monk alone setting out (`monk`)
 * (`content/paintings/pilgrims.yaml`). Sized across, horse's nose to
 * Sha's pack, and nose to tail for the monk alone.
 */
import { registerPainting } from "../painting.js";

registerPainting("pilgrims", {
  views: [
    { name: "default", url: "cast/pilgrims-default.webp", faces: "right", aspect: 1473 / 938, feet: 0.2, size: { across: 0.97 } },
    { name: "monk", url: "cast/pilgrims-monk.webp", faces: "right", aspect: 868 / 1024, feet: 0.1, size: { across: 0.9 } },
  ],
});
