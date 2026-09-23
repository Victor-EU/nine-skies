# Notices

The code in this repository is MIT-licensed (see `LICENSE`). The data the
pipeline builds worlds from is not, and neither is the data derived from it:
each keeps its source's own terms, whichever file it ends up in. What each
source asks, and why the rivers are not HydroSHEDS, is in
`docs/prototype-findings.md` (F59, F60).

## Elevation — Copernicus DEM GLO-30

Elevation data here — every world `make world` builds, the scene packs
`make scenes` cuts from it and the film plays, and the stills rendered from
them in `docs/stills/` — are produced using Copernicus WorldDEM-30:

> produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus
> Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European
> Union and ESA; all rights reserved

> The organisations in charge of the Copernicus programme by law or by
> delegation do not incur any liability for any use of the Copernicus
> WorldDEM-30.

The source is the public GLO-30 release on the AWS Open Data mirror, under the
licence for COP-DEM-GLO-30-F, *Full, Free & Open*:
<https://dataspace.copernicus.eu/sites/default/files/media/files/2025-06/copernicus_contributing_mission_data_access_v2_cop_dem_licenses.pdf>.
It grants reproduction, distribution, communication to the public and
adaptation, free of charge and worldwide. Anyone who redistributes the data,
modified or not, carries the two notices above, must not suggest that the
Copernicus programme endorses what they do, and passes the same obligations on
to anyone they allow to redistribute it (article 6).

## Rivers and lakes — Natural Earth

The 1:10m rivers, lake centrelines and lakes, version 5.0.0, fetched by `make
vectors`. Stage 3 carves the rivers into every world `make world` builds and
keeps the lakes at their level (`make carve`), on the 90 m hero areas as well
as the country grid, so the elevation above is also made with Natural Earth. It is in the public domain and asks for no credit.

## Music and sound

Nine cues, one a scene, and a bed of wind, each licensed or commissioned
and none of them made here. Each is listed with its author, its licence and
where it came from in `content/sound.yaml`, and credited on the film's
credits page from there.

