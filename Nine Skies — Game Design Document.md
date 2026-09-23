# Nine Skies — Design

Version 2, 23 September 2026. Version 1 is in `docs/archive/`; it described a
twelve-hour game, and this document replaces it entirely.

## What it is

Nine Skies is an eighteen-minute flight over real China, in the browser. Open
a link and it plays: nine scenes of two minutes each, one landscape per scene,
from Huangshan's granite above the clouds to the face of Everest. You can steer, you can
speed up or slow down, or you can do nothing at all. After eighteen minutes it
is over.

It is a public research project. The source is MIT-licensed, the world is
built from open elevation and river data under those sources' own terms, and
the question it asks is written on the front of it: *can eighteen minutes over
real ground give someone who has never been to China a true picture of what
it looks like?* The answer is collected in public, after launch, through the repository's
discussions and in the findings log; the film itself records nothing. There
is no private playtest before it.

## Who it is for, and how long they will give it

Someone who pictures China as one place. No flight-sim experience, no prior
knowledge, a laptop or a phone, and no patience for a game. Many will give it
four minutes and some will give it all eighteen, so:

- The first scene has to earn the second.
- Every scene has to stand on its own, so that a viewer who leaves after three
  has still seen three true things.
- Nothing is required of the viewer. Nothing is learned in a menu. Nothing
  waits for a key press.

## Pillars

1. **Real ground.** Every mountain, gorge, river and lake is where it is and as
   big, relative to its neighbours, as it is. The elevation is Copernicus
   GLO-30; the rivers are Natural Earth, carved into their valleys; the lakes
   sit at their real level. The only invented thing is the style.
2. **Contrast by cut.** The lesson is the difference between one scene and the
   next, and the map between them shows how far apart they are. A gorge, then
   a desert below sea level, then a plateau at 4,500 m. Nobody needs to be
   told that these are different countries inside one.
3. **Always moving.** The camera never stops and the viewer never has to act.
   Steering is a pleasure, not a job.
4. **Two minutes, then gone.** No scene overstays. The clock is the structure,
   and it is the only structure.
5. **Beautiful first.** Every frame must be worth a screenshot. A scene whose
   still frame is not beautiful is not finished, whatever else it does.

## The nine scenes

"Nine skies" now means nine scenes. Version 1 organised China into nine
regions; that table is retired as a structure. A scene is chosen for what the
ground can actually show at the resolution we have, not for administrative
coverage, which is why the Northeast is not here: frozen black-soil farmland
is a texture, and there is no texture at 1 km.

Each scene is 120 seconds: a 6-second lead-in (the map jump and the title
card) and 114 seconds of flight. Nine scenes make exactly eighteen minutes.
The order follows the three great steps of Chinese geography, east to west
and up, with the sun moving from dawn to dusk across the film.

| # | Scene | Where | Light | Ground on screen | What you see |
| --- | --- | --- | --- | --- | --- |
| 1 | Huangshan | The granite massif, a loop over Lotus Peak | Dawn, November, a sea of cloud | ~85 km, slow | Peaks standing out of cloud that fills every valley: the picture painters made for a thousand years. Decided over the estuary at the rough cut (F79): the flattest ground in the slot that decides whether anyone watches scene 2. 30 m hero grid. |
| 2 | The Three Gorges | Yichang west through Xiling, Wu and Qutang | Late afternoon, the sun ahead, mist on the water | ~150 km, low | The walls close in. The camera is below the rim for most of two minutes. The Yangtze as a corridor through rock. 90 m hero grid, already built. |
| 3 | Karst | Guilin to Yangshuo along the Li | Morning, mist | ~60 km, low and slow | Limestone towers at eye level, the river threading between them. The one scene that needs the source's own 30 m. |
| 4 | The First Bend | Shigu to Tiger Leaping Gorge | Midday, hard light | ~80 km | The Jinsha turns back on itself and cuts the deepest gorge in the film, 360 m wide where you fly it, under snow peaks. 90 m hero grid, already built. |
| 5 | Loess | The Yellow River's great bend, Shaanxi–Shanxi | Afternoon, dust | ~400 km | Ochre ground gullied in every direction, and a yellow river cut into it. The second step. |
| 6 | Grassland to Heaven Lake | Xilingol east across the plain to Changbai | Evening, huge sky, then last light on a volcano | ~940 km, the fastest scene, then the slowest | Grass to the horizon at the film's fastest, then the rail slows over Changbai and circles the crater lake. Two landscapes in one time box, by speed (F79). At half speed the lake never arrives; that is the time box's rule. 90 m hero grid. |
| 7 | Below the Sea | Tian Shan snow down into Turpan, to Ayding Lake at −154 m, then the Taklamakan's edge | Evening, orange | ~600 km | Snow, then a bowl below sea level, then dunes. The three things a desert can be, in two minutes. |
| 8 | The Roof | Qinghai Lake or Namtso, across the plateau | Dusk, thin clean air | ~700 km, high and fast | Flat ground at 4,500 m for the whole scene. Turquoise salt lakes. The horizon sharp because there is no air to soften it. The third step. |
| 9 | The Wall | The Himalaya from the north: Rongbuk, then Everest | Last light | ~150 km | The plateau ends in a wall and the wall is 8,000 m. The sun goes behind the ridge and the film ends on the map, showing the whole route flown. |

Three scenes were provisional until the rough cut was watched, and all
three were decided by watching it, not by a playtest (F76, F79). Scene 1:
the estuary was the flattest ground in the film in the slot that decides
whether anyone watches scene 2, and Huangshan, granite peaks in a sea of
cloud on a 30 m grid, opens the film instead. Scene 6: the steppe reads but
is flat, and Changbai's crater lake is too good to leave out, so one scene
carries both by speed, the grassland at the film's fastest and the lake
circled at its slowest. Scene 3: the 30 m grid resolves the towers.

Distances are author targets in real kilometres, not measurements. A rail
key carries its speed as real kilometres of ground a minute, and the camera
moves at whatever speed shows the landscape: thousands of kilometres
an hour over the steppe, a walking pace between the karst towers. Nothing
in this film claims to be a flying speed. No aircraft could cross China in
eighteen minutes, and the film does not pretend one can; it shows what is
there, and the map between scenes says how far apart it is.

## Controls

Flight has four inputs and no others.

| Input | Keyboard | Gamepad | Touch |
| --- | --- | --- | --- |
| Faster | Up arrow / W | Right trigger | Right button |
| Slower | Down arrow / S | Left trigger | Left button |
| Direction | Left and right arrows / A, D | Left stick | Drag |
| Auto | Space | A button | Tap the Auto badge |

**Auto is the default and the attractor.** Every scene has an authored rail:
a spline the camera follows at an authored speed and height. Steering moves
the camera off the rail as an offset; auto eases it back. Auto resumes on a
press, and by itself after four seconds without input, so a viewer who steers
once and lets go still sees the end of the scene. The Auto badge on screen
lights when the rail is flying.

**Direction is heading only.** Altitude is automatic: the camera holds an
authored band above the ground, following the terrain smoothly, climbing for
the ground it reads ahead along its heading. How far ahead is the scene's to
say: eight kilometres over the plateau, one and a half over Huangshan, so the camera
flies among the spires rather than over the highest of them. Nobody can hit
a mountain, dive into the sea, or drift into the sky. Each rail also carries a
heading corridor, the widest the camera may turn away from the rail's own
direction, so the viewer can look at the other wall of the gorge but cannot
fly out of the scene.

**Speed** scales the rail's authored speed between half and double, with a
smooth ramp. Bank is cosmetic: the camera rolls into a turn because that is
what looks right, not because anything is being simulated.

**A scene is a time box, not a distance.** It ends at 120 seconds wherever
the camera is. Slowing down shows you less of the route; speeding up shows
you more, and every rail is authored with slack past its two-minute mark so
a fast viewer never runs out of path. Steering can change what you see. It
cannot change when the film ends.

Beside the flight there is a player bar, as in any video: play and pause,
the nine chapters to jump between, and the time. That is navigation, not
flight, and it is the only other thing on screen. Phones play in landscape;
in portrait the film asks you to turn the phone and waits.

## Between scenes

Each scene opens with its lead-in: the map, drawn from the horizon field,
with the route flown so far and a line jumping to the next scene, the
distance written on it (*1,900 km west*), and the title card. Then the cut
into flight. The map is where the geography is stated, and it costs six
seconds a scene.

## Text

A title card per scene: the place in characters, in pinyin and in English,
and one line under it. Up to three captions per scene, each twelve words or
fewer, on screen for six seconds. The whole film says fewer than forty lines.
Every line is something the viewer can see at that moment, or a number
about it: *Below sea level. 47 °C (117 °F) in July.* Every figure is shown in
metric and, beside it, in the feet, miles or Fahrenheit an American viewer
measures in; a figure and its conversion count as one word. Nothing is
explained that the picture already says.

English first. Characters on every title. Other languages after launch.

## The look

Low-poly, flat-shaded terrain, kept from version 1, because it lets the shape
of the ground carry the frame. What version 1 did not build and this design
requires:

- **A sun.** Direction from the scene's date and hour, shadows on the ground,
  a warm side and a cold side to every ridge.
- **A sky per scene.** Its own gradient, its own haze colour and density, its
  own hour. The haze and the sky are one colour so the ground fades into the
  sky without a seam; that rule stands.
- **Clouds.** Low cloud filling the Sichuan basin, mist on the Li, a clear
  plateau. Slabs and billboards, not a simulation.
- **A palette per scene.** Elevation and slope drive it, tinted by the scene:
  ochre for the loess, orange for the dunes, tan and turquoise for the
  plateau. Land cover from ESA WorldCover is the version-2 upgrade if time
  allows; it is not required for launch.
- **Water with light in it.** Specular sun on the river, a colour that reads
  as depth in the lakes.
- **A snow line** by elevation and latitude.
- **A grade.** Bloom on the sun and water, a vignette, a per-scene colour
  grade. Cheap, and most of the difference between a render and a picture.

The look is signed off one scene at a time, on a still frame. The first
scene taken to a finished still is the reference; the rule that produced it
is then applied to the other eight. Every signed-off still is committed and
re-rendered on every build, so the look cannot drift without a diff.

## Sound

Nine music cues, one per scene, and one ambient bed of wind that thins with
altitude. All of it is recorded sound, found and licensed from libraries on
the web; none of it is made in this repository (D85). Launch without sound is
worse than launch late.

## What version 1 had and this does not

The arcade flight model, air density, engine lapse and the altitude floor;
nine expeditions with leg speeds and clearance checks; twelve challenges;
discoveries, the journal, the atlas and the comparison spreads; saves and
profiles; the HUD's five readouts; signed route sections; the balloon and
the glider; cities; weather; seasons as a setting. All of it existed to
serve a player holding a stick for hours, and the player now has eighteen
minutes.

One thing that version 1 fought and this design does not: on a flown route,
altitude cost minutes, and a Shanghai to Lhasa climb could not be shorter
than thirty-five. On rails the climb is a cut. Each scene chooses its own
speed and its own height, and the plateau is reached by jumping to it.

## Fixed

- The world is not rebuilt. The country grid (Albers, 1 km, 105 × 69 tiles),
  its carved rivers and its water layer stand as built. Hero grids are added
  beside it, never changed underneath it.
- Horizontal 1:8 and vertical 0.75×, because the world was built to them and
  relief at that product was measured to read.
- Eighteen minutes, nine scenes, 120 seconds each, 6 of them lead-in.
- Speed is chosen per scene for the picture, never for realism. The goal is
  to show the landscape, not to fly at a true speed.
- Four flight inputs. Auto by default.
- Fewer than forty lines of text.
- No account, no tracking, no gate, no unlock.
