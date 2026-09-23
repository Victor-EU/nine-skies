# Water — sea-to-sky

Written by `make water` (F72). Which samples of the conditioned grid are
water, and the rivers stage 3 carved, as the layer the terrain draws. A
sample is water only where two sources agree: the ground's own value and
Natural Earth's coastline or lake outline. Every number below is a count
of 1 km samples.

## Sea

A sample GLO-30 writes as exactly 0 m that the coastline puts outside every
country, and every sample of a one-degree cell the mirror has no source for.

| | samples |
| --- | ---: |
| sea | 407,663 |
| … of it on fetched ground | 129,479 |
| … of it where the mirror has no source (F54) | 278,184 |
| 0 m inside the coastline: land at sea level, not sea | 293 |
| 0 m outside it that stage 3 raised: lagoons the fill closed | 480 |
| above 0 m outside it: the shore itself, and islands the coastline leaves out | 13,094 |

## Lakes

A sample inside a lake's outline, at the value most of that lake's samples
carry, and holding the same value as a neighbour. GLO-30 flattens a water
body to one value, so a sample wholly over water carries it exactly.

**58 lakes** have fetched ground here: 23,323 samples inside
their outlines, of which **11,922 are drawn** (51.1 %). 7 draw nothing: no value is shared by two neighbours at the level most
of their samples carry, so the ground there is not a water surface.

| lake | outline | level, m | at level | drawn | share |
| --- | ---: | ---: | ---: | ---: | ---: |
| Tai | 2,509 | 0.50 | 1,885 | 1,880 | 74.9 % |
| Hongze Lake | 2,347 | 8.50 | 879 | 878 | 37.4 % |
| Poyang | 2,077 | 11.50 | 1,090 | 1,087 | 52.3 % |
| Namtso | 1,885 | 4,725.50 | 1,738 | 1,738 | 92.2 % |
| Siling | 851 | 4,544.50 | 841 | 841 | 98.8 % |
| Gaoyou | 849 | 4.00 | 358 | 357 | 42.0 % |
| Chao | 786 | 6.50 | 653 | 653 | 83.1 % |
| Danjiangkou Shuiku | 781 | 145.00 | 138 | 137 | 17.5 % |
| Dongting | 775 | 26.44 | 38 | 38 | 4.9 % |
| Yamdrok | 663 | 4,438.00 | 193 | 186 | 28.1 % |
| Qiandao Lake | 581 | 99.00 | 96 | 90 | 15.5 % |
| Ngoring | 499 | 4,272.00 | 425 | 425 | 85.2 % |
| Gyaring | 480 | 4,292.00 | 415 | 414 | 86.2 % |
| (unnamed) | 471 | 4,936.50 | 375 | 375 | 79.6 % |
| Liangzi | 449 | 14.50 | 90 | 87 | 19.4 % |
| (unnamed) | 399 | 4,860.00 | 319 | 319 | 79.9 % |
| Longgan | 373 | 10.00 | 163 | 161 | 43.2 % |
| (unnamed) | 354 | 4,936.50 | 309 | 309 | 87.3 % |
| Nansi | 332 | 29.00 | 50 | 49 | 14.8 % |
| Shijiu | 307 | 0.00 | 41 | 40 | 13.0 % |

Drawing nothing: (unnamed) (203), (unnamed) (151), (unnamed) (106), (unnamed) (69), (unnamed) (66), (unnamed) (1), (unnamed) (1).

## Rivers

Stage 3's channels, found again from the same inputs and refused unless
every sample it lowered lies on one. Each is cut to eight-connected and
smoothed twice, and every sample within the reach carries its offset to
the nearest point of the nearest one.

**98 channels** over 37,241 samples. The drawn line lies a median **112 m** from a channel sample and at
most **707 m** — half a sample's diagonal, the corner a four-connected
step turns at. 228,898 samples carry an offset.

| river byte (scalerank + 1) | channels | samples within reach |
| ---: | ---: | ---: |
| 2 | 9 | 42,366 |
| 3 | 5 | 26,200 |
| 4 | 9 | 12,812 |
| 5 | 10 | 18,348 |
| 7 | 15 | 32,077 |
| 8 | 21 | 53,531 |
| 9 | 15 | 20,383 |
| 10 | 14 | 23,181 |

## Tiles

672 of 1,155 tiles carry water. Built in 3 s.
