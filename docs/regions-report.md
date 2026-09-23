# Region report — what the ground draws of the nine, 1000 m grid

2026-09-23 · `china-1km-conditioned.tif` · Natural Earth admin-0, the de facto view, burnt in memory and never written (D10, D66)

D14's region raster is the one position -> region map the air, the music,
the weather and the journal are all to read. This report asks how much of
it the ground draws without being told: where China's land, read on one
side of a height, falls into pieces the GDD's region table would
recognise, and where it holds together. It is a measurement and not a
region map; nothing else reads it (F66).

## The GDD's three steps, inside China

| Band | km² | Share |
| --- | ---: | ---: |
| first step (the GDD's 0-500 m) | 2,540,582 | 27.1 % |
| between the first and second | 1,476,344 | 15.7 % |
| second step (1,000-2,000 m) | 2,336,106 | 24.9 % |
| between the second and third | 1,102,203 | 11.8 % |
| third step (4,000-5,000 m) | 1,229,080 | 13.1 % |
| above the third | 692,038 | 7.4 % |

The GDD gives each step a typical height, and 27.5 % of China stands
between them. A step is a description; an edge between two of them is a
height somebody chooses, which is why everything below is read at more
than one.

## The plateau: an edge the ground draws, and the route crosses it many times

| Ground at or above | km² joined to Lhasa | Expedition 1 first in at | km in | Crossings, raw | smoothed 5 km | smoothed 11 km | smoothed 21 km |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2,500 m | 2,596,553 | km 1,782 | 1,129 | 17 | 5 (from km 1,788) | 3 (from km 1,800) | 5 (from km 1,802) |
| 3,000 m | 2,351,942 | km 1,802 | 1,087 | 17 | 7 (from km 1,825) | 3 (from km 1,841) | 3 (from km 1,841) |
| 3,500 m | 2,021,041 | km 1,842 | 1,023 | 35 | 13 (from km 1,843) | 9 (from km 1,845) | 7 (from km 1,857) |

- **2,500 m** holds Lhasa, Everest summit, Qinghai Lake.
- **3,000 m** holds Lhasa, Everest summit, Qinghai Lake.
- **3,500 m** holds Lhasa, Everest summit.

Smoothed is an opening and then a closing at the radius that cuts off
spurs and closes valleys narrower than the width named. A crossing is the
route going in or out. D14 promises one crossing per boundary, so that the
tint and the music change together once; over the Hengduan a raw threshold
changes them every time a valley dips under it.

Ground under the route across the rim, every 10 km:

```
 1690 km    500 m    1700 km    511 m    1710 km    520 m    1720 km    527 m
 1730 km    541 m    1740 km    630 m    1750 km    646 m    1760 km   1137 m
 1770 km   1385 m    1780 km   2204 m    1790 km   2669 m    1800 km   2710 m
 1810 km   2813 m    1820 km   2835 m    1830 km   2321 m    1840 km   2940 m
 1850 km   4054 m    1860 km   4497 m    1870 km   4270 m    1880 km   3386 m
 1890 km   3335 m    1900 km   5055 m    1910 km   3536 m    1920 km   4033 m
 1930 km   4293 m    1940 km   3682 m    1950 km   4122 m    1960 km   4420 m
 1970 km   3894 m    1980 km   3106 m    1990 km   4143 m    2000 km   4103 m
```

## The lowlands: what they fall into when their narrow ways are cut

China's ground below each height, with every way through it narrower than
the width named cut, and then every cell of it given back to the piece it
is joined to most directly along the ground, so the pieces divide the
lowland between them. Pieces of 20,000 km² and more, largest first, with
the named places whose own cell stands in them.

A place whose own cell is outside China's de facto outline is in no piece
at any height: Heihe, Heilongjiang. A city on a border river can sit a
cell over the line the outline follows.

### Below 500 m — 2,540,582 km² of China

| Cut where narrower than | km² | Centre | Latitude | Longitude | Named places in it |
| ---: | ---: | --- | --- | --- | --- |
| nothing cut | 2,369,585 | 35.2 N 118.0 E | 20.2–53.6 N | 103.3–134.8 E | Shanghai, Wuhan, Yichang, Qutang Gorge, Wu Gorge, Xiling Gorge, Chongqing |
|  | 62,013 | 45.1 N 85.6 E | 44.1–46.4 N | 82.0–88.4 E | — |
|  | 29,714 | 19.2 N 109.8 E | 18.2–20.2 N | 108.6–111.0 E | — |
|  | 21,100 | 42.7 N 90.6 E | 42.3–43.1 N | 88.1–93.2 E | Ayding Lake, Turpan |
| 5 km | 2,214,229 | 35.6 N 118.6 E | 20.3–53.6 N | 105.6–134.8 E | Shanghai, Wuhan, Yichang, Wu Gorge, Xiling Gorge |
|  | 91,213 | 30.0 N 105.6 E | 27.7–32.5 N | 103.3–108.5 E | Chongqing |
|  | 62,013 | 45.1 N 85.6 E | 44.1–46.4 N | 82.0–88.4 E | — |
|  | 29,714 | 19.2 N 109.8 E | 18.2–20.2 N | 108.6–111.0 E | — |
|  | 21,580 | 27.0 N 118.0 E | 25.7–28.2 N | 116.6–119.3 E | — |
|  | 21,100 | 42.7 N 90.6 E | 42.3–43.1 N | 88.1–93.2 E | Ayding Lake, Turpan |
| 11 km | 1,814,358 | 37.6 N 119.8 E | 24.6–53.4 N | 107.1–134.8 E | Shanghai, Wuhan, Yichang, Qutang Gorge, Wu Gorge, Xiling Gorge |
|  | 261,423 | 23.2 N 111.1 E | 20.3–26.2 N | 106.5–117.2 E | — |
|  | 96,962 | 30.1 N 105.7 E | 27.7–32.5 N | 103.3–108.5 E | Chongqing |
|  | 62,013 | 45.1 N 85.6 E | 44.1–46.4 N | 82.0–88.4 E | — |
|  | 25,876 | 19.4 N 109.8 E | 18.4–20.2 N | 108.6–111.0 E | — |
|  | 22,929 | 26.9 N 118.2 E | 25.8–28.2 N | 116.6–119.9 E | — |
|  | 22,161 | 27.7 N 110.0 E | 26.0–29.0 N | 108.7–111.1 E | — |
| 21 km | 1,078,845 | 32.4 N 115.9 E | 24.7–41.2 N | 107.1–122.7 E | Shanghai, Wuhan, Yichang, Qutang Gorge, Wu Gorge, Xiling Gorge |
|  | 688,628 | 45.9 N 125.7 E | 40.0–53.4 N | 119.2–134.8 E | — |
|  | 173,087 | 23.2 N 109.4 E | 20.3–26.2 N | 105.7–112.5 E | — |
|  | 96,587 | 30.1 N 105.7 E | 27.7–32.5 N | 103.3–108.5 E | Chongqing |
|  | 74,797 | 23.1 N 113.2 E | 21.5–24.8 N | 111.1–115.6 E | — |
|  | 62,013 | 45.1 N 85.6 E | 44.1–46.4 N | 82.0–88.4 E | — |
|  | 34,255 | 24.6 N 115.7 E | 22.9–25.9 N | 114.3–117.0 E | — |
|  | 29,714 | 19.2 N 109.8 E | 18.2–20.2 N | 108.6–111.0 E | — |
| 41 km | 1,178,353 | 32.0 N 116.1 E | 24.4–41.2 N | 107.1–122.7 E | Shanghai, Wuhan, Yichang, Qutang Gorge, Wu Gorge, Xiling Gorge |
|  | 722,397 | 46.1 N 125.7 E | 40.1–53.6 N | 119.2–134.8 E | — |
|  | 116,287 | 23.5 N 114.4 E | 21.7–25.4 N | 111.5–118.4 E | — |
|  | 109,680 | 23.1 N 109.3 E | 21.4–25.2 N | 105.7–112.1 E | — |
|  | 80,074 | 29.8 N 105.5 E | 27.7–31.6 N | 103.4–108.5 E | Chongqing |
|  | 62,013 | 45.1 N 85.6 E | 44.1–46.4 N | 82.0–88.4 E | — |
|  | 46,214 | 24.5 N 109.3 E | 23.1–26.2 N | 107.7–111.0 E | — |
|  | 31,250 | 21.7 N 110.5 E | 20.2–22.7 N | 109.6–111.8 E | — |

### Below 1,500 m — 5,716,170 km² of China

| Cut where narrower than | km² | Centre | Latitude | Longitude | Named places in it |
| ---: | ---: | --- | --- | --- | --- |
| nothing cut | 5,571,690 | 37.3 N 110.3 E | 20.2–53.6 N | 75.5–134.8 E | Shanghai, Wuhan, Yichang, Qutang Gorge, Wu Gorge, Xiling Gorge, Chongqing, Chengdu, Ayding Lake, Turpan, The Tarim's terminal basin |
|  | 49,909 | 22.7 N 100.9 E | 21.1–26.2 N | 99.1–103.3 E | — |
|  | 33,829 | 19.2 N 109.7 E | 18.2–20.2 N | 108.6–111.0 E | — |
| 5 km | 5,568,621 | 37.3 N 110.3 E | 20.2–53.6 N | 75.5–134.8 E | Shanghai, Wuhan, Yichang, Qutang Gorge, Wu Gorge, Xiling Gorge, Chongqing, Chengdu, Ayding Lake, Turpan, The Tarim's terminal basin |
|  | 33,829 | 19.2 N 109.7 E | 18.2–20.2 N | 108.6–111.0 E | — |
|  | 31,565 | 22.7 N 100.7 E | 21.1–26.2 N | 99.1–101.8 E | — |
| 11 km | 5,564,248 | 37.3 N 110.3 E | 20.3–53.6 N | 75.5–134.8 E | Shanghai, Wuhan, Yichang, Qutang Gorge, Wu Gorge, Xiling Gorge, Chongqing, Chengdu, Ayding Lake, Turpan, The Tarim's terminal basin |
|  | 49,909 | 22.7 N 100.9 E | 21.1–26.2 N | 99.1–103.3 E | — |
|  | 33,829 | 19.2 N 109.7 E | 18.2–20.2 N | 108.6–111.0 E | — |
| 21 km | 5,556,535 | 37.3 N 110.2 E | 20.3–53.6 N | 75.5–134.8 E | Shanghai, Wuhan, Yichang, Qutang Gorge, Wu Gorge, Xiling Gorge, Chongqing, Chengdu, Ayding Lake, Turpan, The Tarim's terminal basin |
|  | 46,031 | 22.8 N 100.9 E | 21.4–26.2 N | 99.1–103.3 E | — |
|  | 33,829 | 19.2 N 109.7 E | 18.2–20.2 N | 108.6–111.0 E | — |
| 41 km | 4,289,755 | 36.7 N 115.9 E | 20.3–53.6 N | 96.4–134.8 E | Shanghai, Wuhan, Yichang, Xiling Gorge |
|  | 956,031 | 41.6 N 86.4 E | 36.8–48.8 N | 75.5–96.8 E | Ayding Lake, Turpan, The Tarim's terminal basin |
|  | 244,451 | 30.3 N 105.9 E | 25.5–33.7 N | 100.4–110.4 E | Qutang Gorge, Wu Gorge, Chongqing, Chengdu |
|  | 33,829 | 19.2 N 109.7 E | 18.2–20.2 N | 108.6–111.0 E | — |
|  | 25,429 | 33.3 N 107.0 E | 32.6–34.2 N | 105.1–108.6 E | — |
|  | 21,377 | 40.0 N 113.4 E | 39.0–40.8 N | 112.2–114.8 E | — |
|  | 21,120 | 41.4 N 114.3 E | 40.6–42.0 N | 113.0–116.0 E | — |
