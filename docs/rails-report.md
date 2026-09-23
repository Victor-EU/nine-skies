# Rails report

Every scene's rail flown over `dist-world/china` by `tools/rails.ts` (plan v2, D83): the altitude
controller reading the drawn ground every 250 m at the authored speed. *Above* is the
camera over the ground directly under it; *ahead* counts samples where ground within
2000 m along the heading stands above the camera, which is a wall in the frame.
The flight is 114 s; a viewer at double speed needs twice that of rail.

| Scene | Rail | At authored speed | Over hero grid | Off world | Above ground | Altitude | Ground ahead | Worst ahead | At floor | At ceiling |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| rivers-mouth | 739 km | 296 s | 0 % | 0 | 229–417 m | 302–505 m | 0 % | 0 m | 0 % | 0 % |
| three-gorges | 576 km | 384 s | 25 % | 0 | 120–900 m | 397–1691 m | 1 % | 326 m | 1 % | 0 % |
| karst | 139 km | 234 s | 52 % | 0 | 123–636 m | 353–977 m | 0 % | 0 m | 0 % | 0 % |
| first-bend | 199 km | 239 s | 47 % | 0 | 150–1200 m | 2337–4064 m | 2 % | 396 m | 0 % | 4 % |
| loess | 714 km | 238 s | 0 % | 0 | 538–790 m | 935–1759 m | 0 % | 0 m | 0 % | 0 % |
| steppe-to-stone | 1850 km | 247 s | 0 % | 0 | 400–1323 m | 1665–3547 m | 0 % | 0 m | 0 % | 0 % |
| below-the-sea | 1168 km | 234 s | 5 % | 0 | 304–2500 m | 508–6012 m | 0 % | 0 m | 0 % | 0 % |
| the-roof | 1417 km | 236 s | 0 % | 0 | 500–2141 m | 4400–6819 m | 0 % | 0 m | 0 % | 0 % |
| the-wall | 272 km | 272 s | 16 % | 0 | 792–3000 m | 1876–9733 m | 0 % | 0 m | 0 % | 0 % |
