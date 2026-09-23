# Stills

One still a scene, the frame the look is signed off on (design v2, "The
look"; plan v2, stage 3, D77). Each is the scene held at a second into its
flight on its rail in auto, at the scene's own hour, drawn at 1280 × 720
through every pass of the look, and taken from the running app. Sixty
seconds unless the scene's picture is elsewhere: Huangshan at twenty, with
Lotus Peak ahead across the horizon; Heaven Lake at 108, the first crossing
of the crater.

```
npm run dev                       # the film, with the world under dist-world/china
```

then in the browser console, scene by scene (`i` is the scene's index from 0):

```
__ns.hold(i, 60); await __ns.settled(); await __ns.still("0N-<id>", 1280, 720)   // 20 for scene 1, 108 for scene 6
```

`__ns.settled()` waits until the ground in view has landed whole - heights,
water and colour - and stayed so for two seconds. A still taken before that
is of whatever had arrived: the camera at the band's floor over nothing
(F81), or, with the browser pane hidden and frames throttled, sky alone
(F87).

A still is re-taken whenever the look or the scene changes, and committed
beside the change, so the look cannot drift without a diff. The frame-cost
stations (`app/public/capture-stations.json`, `make stations`) are the same
nine points.

The other files here are stage 0's (F76): hillshades of the source at the
three new hero areas, and the rough-cut frames before the look existed.
