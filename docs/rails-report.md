# Rails report

Every scene's rail flown over `dist-world/china` by `tools/rails.ts` (plan v2, D83): the altitude
controller reading the drawn ground every 250 m at the authored speed. *Above* is the
camera over the ground directly under it; *ahead* counts samples where ground within
2000 m along the heading stands above the camera, which is a wall in the frame.
The flight is 114 s; a viewer at double speed needs twice that of rail.

| Scene | Rail | At authored speed | Over hero grid | Off world | Above ground | Altitude | Ground ahead | Worst ahead | At floor | At ceiling |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| huangshan | 89 km | 242 s | 100 % | 0 | 150–1383 m | 971–2289 m | 2 % | 161 m | 2 % | 0 % |
| three-gorges | 576 km | 384 s | 25 % | 0 | 120–900 m | 460–1691 m | 1 % | 275 m | 0 % | 0 % |
| karst | 139 km | 234 s | 52 % | 0 | 151–800 m | 368–1009 m | 0 % | 0 m | 0 % | 0 % |
| first-bend | 199 km | 239 s | 47 % | 0 | 760–1600 m | 3141–4717 m | 0 % | 10 m | 0 % | 11 % |
| loess | 714 km | 238 s | 0 % | 0 | 547–807 m | 935–1767 m | 0 % | 0 m | 0 % | 0 % |
| grassland-to-heaven-lake | 915 km | 389 s | 15 % | 0 | 300–972 m | 618–2954 m | 0 % | 0 m | 0 % | 0 % |
| below-the-sea | 1168 km | 234 s | 5 % | 0 | 306–2500 m | 508–6134 m | 0 % | 0 m | 0 % | 0 % |
| the-roof | 1417 km | 236 s | 0 % | 0 | 500–2169 m | 4402–6832 m | 0 % | 0 m | 0 % | 0 % |
| the-wall | 272 km | 272 s | 16 % | 0 | 818–3000 m | 1906–9846 m | 0 % | 0 m | 0 % | 0 % |
