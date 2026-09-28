/**
 * Nezha, painted (D94): leaning into a turn on the Wind-Fire Wheels, the
 * spear low, the sash looping behind (`content/paintings/nezha.yaml`).
 * Sized wheels to buns, as the Nezha made in code is.
 */
import { registerPainting } from "../painting.js";

registerPainting("nezha", {
  views: [
    { name: "default", url: "cast/nezha-default.webp", faces: "right", aspect: 997 / 1463, feet: 0.06, size: { crown: 0.97 } },
  ],
});
