# Notices

The code in this repository is MIT-licensed (see `LICENSE`). The data the
pipeline builds worlds from is not, and neither is the data derived from it:
each keeps its source's own terms, whichever file it ends up in. What each
source asks, and why the rivers are not HydroSHEDS, is in
`docs/prototype-findings.md` (F59, F60).

## Elevation — Copernicus DEM GLO-30

Elevation data here — every world `make world` builds, the ground's relief
`make relief` cuts again from the same source as its normals (F93, F94), the
scene packs `make scenes` cuts from them and the film plays, and the stills
rendered from them in `docs/stills/` — are produced using Copernicus
WorldDEM-30:

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

## The ground's colour — EOxCloudless 2016

The colour of the ground in the film — every colour tile `make colour` cuts
into `dist-world/<world>/colour/`, the scene packs that carry them, and the
stills rendered from them — is cut from EOX's Sentinel-2 cloudless mosaic of
2016, reprojected, cleared of cloud and re-encoded:

> EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains
> modified Copernicus Sentinel data 2016), released under the Creative
> Commons Attribution 4.0 International License

The licence is CC BY 4.0, <https://creativecommons.org/licenses/by/4.0/>:
anyone may share and adapt the tiles, with that credit, a link to the
licence, and a note that they were changed. They were: reprojected to the
film's Albers grid, cloud flecks filled from the ground around them, and
re-encoded as WebP. Later years of the mosaic are CC BY-NC-SA 4.0 and are
not used (F87).

## The south's colour — Copernicus Sentinel-2

Where that mosaic is most cloud, the south is coloured from the Sentinel-2
archive instead: four hero areas (Tiger Leaping Gorge, the Three Gorges,
Guilin and Huangshan) and the country tiles of their four scenes. Their
colour tiles in `dist-world/<world>/colour/`, the scene packs that carry
them and the stills rendered from them are the median of the clear views of
Sentinel-2 Level-2A passes from 2018 to 2025, reprojected, toned to match
the mosaic and re-encoded (`make colour`, F89, F90):

> Contains modified Copernicus Sentinel data 2018-2025

The passes are ESA's Level-2A Collection 1, as Element 84 publishes them on
the AWS Open Data registry. The European Commission's legal notice on the
use of Copernicus Sentinel data,
<https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice>,
grants free, full and open use for reproduction, distribution,
communication to the public, and adaptation, modification and combination
with other data. Whoever distributes an adaptation carries the notice
above. The data come without warranty, and a user renounces any claim for
damages against the European Union and the data's providers.

## The walls' rock — Poly Haven

Where the ground stands steeper than a photograph from above can show, the
film lays photographed rock over it (`make rock`, F92): four scans from Poly
Haven, <https://polyhaven.com>, resized, their heights ranked and
re-encoded into `dist-world/<world>/rock/` and the film's shared files.
Marble Cliff 03 (<https://polyhaven.com/a/marble_cliff_03>), Marble Cliff 04
(<https://polyhaven.com/a/marble_cliff_04>) and Dark Rock 02
(<https://polyhaven.com/a/dark_rock_02>) are by Amal Kumar; Cliff Side
(<https://polyhaven.com/a/cliff_side>) is photographed by James Ray Cock and
Dario Barresi and processed by Jenelle van Heerden. Every Poly Haven asset is
CC0, <https://polyhaven.com/license>: in the public domain, to be used for
any purpose, credit not required. They are credited all the same.

## Music and sound

Nine cues, one a scene, and a bed of wind, each licensed or commissioned
and none of them made here. Each is listed with its author, its licence and
where it came from in `content/sound.yaml`, and credited on the film's
credits page from there.

