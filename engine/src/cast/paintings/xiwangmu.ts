/**
 * The Queen Mother of the West, painted (D94): on her cloud with the peach
 * and the three blue birds (`content/paintings/xiwangmu.yaml`). Sized hem
 * to headdress.
 */
import { registerPainting } from "../painting.js";

registerPainting("xiwangmu", {
  views: [
    { name: "default", url: "cast/xiwangmu-default.webp", faces: "right", aspect: 943 / 1526, feet: 0.1, size: { crown: 0.97 } },
  ],
});
