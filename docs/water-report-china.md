# Water — china

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
| sea | 6,488,467 |
| … of it on fetched ground | 1,375,576 |
| … of it where the mirror has no source (F54) | 5,112,891 |
| 0 m inside the coastline: land at sea level, not sea | 2,739 |
| 0 m outside it that stage 3 raised: lagoons the fill closed | 22 |
| above 0 m outside it: the shore itself, and islands the coastline leaves out | 65,606 |

## Lakes

A sample inside a lake's outline, at the value most of that lake's samples
carry, and holding the same value as a neighbour. GLO-30 flattens a water
body to one value, so a sample wholly over water carries it exactly.

**183 lakes** have fetched ground here: 124,375 samples inside
their outlines, of which **95,463 are drawn** (76.8 %). 19 draw nothing: no value is shared by two neighbours at the level most
of their samples carry, so the ground there is not a water surface.

| lake | outline | level, m | at level | drawn | share |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baikal | 21,483 | 455.00 | 20,598 | 20,594 | 95.9 % |
| Balkhash | 17,590 | 341.00 | 15,052 | 15,042 | 85.5 % |
| Issyk-Kul | 6,261 | 1,606.50 | 5,900 | 5,898 | 94.2 % |
| Qinghai | 4,464 | 3,194.50 | 4,057 | 4,057 | 90.9 % |
| Zaysan | 4,214 | 390.00 | 3,259 | 3,258 | 77.3 % |
| Khanka | 4,047 | 68.00 | 3,927 | 3,927 | 97.0 % |
| Uvs | 3,316 | 761.50 | 3,246 | 3,246 | 97.9 % |
| Alakol | 2,840 | 349.00 | 2,657 | 2,656 | 93.5 % |
| Khövsgöl Nuur | 2,773 | 1,645.50 | 2,508 | 2,506 | 90.4 % |
| Tai | 2,509 | 0.50 | 1,885 | 1,880 | 74.9 % |
| Hulun | 2,363 | 539.00 | 1,613 | 1,613 | 68.3 % |
| Hongze Lake | 2,347 | 8.50 | 880 | 879 | 37.5 % |
| Poyang | 2,077 | 11.50 | 1,090 | 1,087 | 52.3 % |
| Namtso | 1,885 | 4,725.50 | 1,738 | 1,738 | 92.2 % |
| Siling | 1,572 | 4,544.50 | 1,527 | 1,527 | 97.1 % |
| Khar-Us | 1,554 | 1,159.50 | 764 | 763 | 49.1 % |
| Khyargas Nuur | 1,357 | 1,029.00 | 1,212 | 1,212 | 89.3 % |
| (unnamed) | 1,010 | 4,614.50 | 844 | 844 | 83.6 % |
| Bosten | 1,004 | 1,044.50 | 793 | 793 | 79.0 % |
| Khar | 939 | 1,131.00 | 734 | 731 | 77.8 % |

Drawing nothing: Ulgain Gobi (236), (unnamed) (203), (unnamed) (151), Ozero Bolshoye Topolnoye (110), (unnamed) (106), (unnamed) (69), (unnamed) (66), (unnamed) (27), (unnamed) (27), (unnamed) (17), (unnamed) (15), (unnamed) (13), and 7 more.

## Rivers

Stage 3's channels, found again from the same inputs and refused unless
every sample it lowered lies on one. Each is cut to eight-connected and
smoothed twice, and every sample within the reach carries its offset to
the nearest point of the nearest one.

**314 channels** over 136,989 samples. The drawn line lies a median **112 m** from a channel sample and at
most **707 m** — half a sample's diagonal, the corner a four-connected
step turns at. 836,508 samples carry an offset.

| river byte (scalerank + 1) | channels | samples within reach |
| ---: | ---: | ---: |
| 2 | 12 | 43,506 |
| 3 | 19 | 73,376 |
| 4 | 22 | 97,703 |
| 5 | 21 | 64,776 |
| 6 | 4 | 13,403 |
| 7 | 40 | 117,580 |
| 8 | 92 | 177,364 |
| 9 | 66 | 143,492 |
| 10 | 38 | 105,308 |

## A river's own surface

Where the grid resolves a river wider than its channel: a sample at exactly
its channel's level, reached from the channel through samples that are too,
on ground stage 3 did not raise, and not sea or inside a lake's outline
(F73). A channel sample counts only beside one off the channel; a river one
sample wide is the ribbon's to draw.

**2,744 samples** of 1,000 m, 2,744.0 km², in 215 pieces; 951 of them are channel samples.

| samples | level, m | river | lat | lon |
| ---: | ---: | --- | ---: | ---: |
| 168 | 2,579.00 | Yellow | 36.10 N | 100.72 E |
| 146 | 390.00 | Irtysh | 47.76 N | 84.48 E |
| 132 | 4,544.50 | Za’gya | 32.04 N | 88.97 E |
| 112 | 458.50 | Godavari | 19.50 N | 75.29 E |
| 110 | 120.50 | Brahmani | 21.33 N | 84.94 E |
| 103 | 3,882.50 | (unnamed) | 37.51 N | 89.74 E |
| 96 | 239.00 | Irtysh | 50.33 N | 81.39 E |
| 94 | 330.00 | Godavari | 18.99 N | 78.24 E |
| 83 | 249.50 | Narmada | 22.26 N | 76.73 E |
| 74 | 101.00 | Tapti | 21.24 N | 73.66 E |
| 65 | 525.00 | Yenisey | 51.59 N | 92.51 E |
| 65 | 101.00 | Tapti | 21.44 N | 73.86 E |

## Tiles

3,841 of 7,245 tiles carry water. Built in 23 s.
