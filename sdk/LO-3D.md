# lo-3d.js

A small software 3D renderer for Lo-PDA apps. MIT License. Version 1.0.0.

It draws low-poly scenes in the four tones: triangles with a z-buffer, flat sun
shading, point lights computed per pixel, fog, depth of field, billboard sprites
and particles. Everything ends in a 4×4 Bayer dither, so the output is tones 0–3
and nothing else. It does no game logic: no input, scenes, collisions or text.
Use it with lo-game.js (recommended) or on its own.

**Writing a game with an AI?** Paste this file and `LO-GAME.md` into the conversation.

---

## 1. Setting up an app

`index.html` has an empty block, like the lo-game one:

```html
<script data-lo-3d="1.0.0"></script>
<script data-lo-game="1.2.0"></script>
<script>
var game = LoGame.create({ width: 160, height: 144 });
var R = Lo3D.create({ width: 160, height: 144 });
var cube = Lo3D.box(1, 1, 1);
game.scene("main", {
  draw: function (g) {
    R.camera.yaw = game.time; R.camera.pitch = -0.5; R.camera.dist = 4;
    R.clear(0.9);
    R.draw(cube);
    g.sprite(R.present(), 0, 0);      // the result is a lo-game sprite
  }
});
game.start("main");
</script>
```

```sh
node tools/bundle-app.mjs registry/apps/<id>   # fills lo-3d, lo-game, the font block and src/ files
node tools/check-app.mjs registry/apps/<id>    # verifies the copies are unmodified
```

`sdk/dev.html` fills an empty block by itself while you develop. Do not edit the
copy inside your app; the checker rejects it. lo-3d is about 20 KB.

Without lo-game, paint the result into a canvas yourself:
`ctx.putImageData(R.paint(ctx.createImageData(160, 144)), 0, 0)`.
`registry/apps/vector-dream` does this.

## 2. The world

- Points are `[x, y, z]` arrays. **x right, y up, z away from the camera** (at yaw 0).
- A mesh is `{ v: [[x,y,z], ...], t: [[a,b,c], ...], c: [albedo per triangle], two }`.
  `c` is optional (albedo 1). `two: true` draws both sides.
- **Winding**: a triangle is seen from the side where its corners run
  counter-clockwise. If a mesh shows its inside, reverse each triangle (`[a, c, b]`).
  `Lo3D.box` and `Lo3D.ico` face outwards.
- **Albedo** is how light a surface is under full light, about 0–1.5. The sun and
  the lights multiply it; values over 1 are fine (they just reach paper sooner).

```js
Lo3D.box(w, h, d)          // centred on the origin
Lo3D.ico(r)                // a 20-sided ball
Lo3D.move(mesh, dx, dy, dz)
Lo3D.transform(mesh, fn)   // fn(p) -> new p, for every vertex
Lo3D.paint(mesh, albedo)   // one albedo for every triangle
Lo3D.merge([m1, m2, ...])  // one mesh: draw a static scene in one call
Lo3D.add, sub, scale, dot, cross, norm, rotX, rotY, rotZ   // vector helpers
```

Build static scenery once (merge it into a few meshes, by area) and draw those
meshes every frame. A mesh drawn without a transform keeps its face normals
between frames, so don't modify its vertices afterwards; make a new mesh instead.

## 3. The renderer: `R = Lo3D.create({ width, height })`

```js
R.camera = { x, y, z, yaw, pitch, dist, focal }
  // view = rotX(rotY(p - (x,y,z), -yaw), pitch) + (0, 0, dist)
  // dist 0: an eye at (x,y,z). dist > 0: orbiting the point (x,y,z), looking at it.
  // pitch < 0 looks down. focal is in pixels (120): bigger zooms in.
R.near = 0.2          // nothing nearer than this is drawn
R.clip = true         // cut triangles at the near plane (false skips them whole)
R.sun = { dir, ambient, diffuse }   // dir points toward the sun; flat shading per triangle
R.lights = [{ x, y, z, radius, power }]   // point lights, per pixel, fade to 0 at radius
R.fog = { near, far, lum }          // surfaces fade to luminance lum between two view depths
R.focus = { near, far }             // outside these view depths the dither is twice as coarse
```

Every frame:

```js
R.clear(lum or function (y) { return lum; })   // background (sky), and reset depth
R.draw(mesh, fn, { bias, albedo, wire, two })   // fn: model -> world, or null
R.sprite(sprite, x, y, z, { scale, anchor, flip, map, shade, lit, crisp })
R.present()                          // lights + dither -> R.image (tones 0-3), returned
R.dot([x, y, z], tone, size)         // after present: particles, hidden behind nearer surfaces
R.streak(a, b, tone)                 // after present: a 3D line (rain), same depth test
```

- `bias` adds luminance to the whole mesh: glowing windows and lanterns.
- `wire: true` outlines the triangles in ink instead of filling them.
- Sprites are lo-game sprites (`LoGame.sprite`), standing upright and facing the camera,
  anchored at their feet (`anchor: "center"` for things that float). `scale` is world units
  per sprite pixel (1/16). Their tones are kept exactly unless `shade` (a luminance factor)
  or `lit: true` (point lights) changes them. **`crisp: true`** draws a sprite at exactly
  1:1 on whole pixels when it is near 1:1 anyway, so characters stay readable; set your
  camera so that `scale * focal / dist` is 1.
- Fog and focus use view depth: the distance along the camera's line of sight.
- `R.project([x, y, z])` gives `[screenX, screenY, depth]`, or null behind the camera:
  use it to cull your own chunks or place text over the scene.
- `R.lum` and `R.depth` (Float32Array, one per pixel) and `R.image.px` (tones) are open
  for your own effects. `R.stats.tris` counts triangles drawn this frame.

## 4. Making it read on a 160×144, four-tone screen

- Aim surfaces at the tones: luminance 0, 1/3, 2/3 and 1 come out as flat ink, dark,
  mid and paper. Anything between is a dither. Big flat areas should sit near a tone;
  keep dither for gradients, light pools and fog.
- Sun: ambient about 0.3, diffuse about 0.5 keeps walls, roofs and ground apart.
- Keep sprites unlit and crisp. People are the thing the player looks for.
- Fog hides where the world ends and saves work: don't draw what is fully fogged.

## 5. Speed

Everything is JavaScript on the CPU. A 160×144 frame with ~3000 triangles and ten
point lights takes about 4–5 ms in desktop Chromium. To stay fast:

- Draw only meshes on screen (`R.project` the corners of a chunk's box).
- Lights cost per pixel inside their radius; drop the ones far from the camera.
- Fewer, bigger triangles are cheaper than many small ones, but fog and point light
  positions are interpolated per triangle, so keep floors in tiles of about 1 unit.

## 6. Rules that still apply

Everything in `SPEC.md` holds: one HTML file up to 512 KB, four tones, no network,
no `eval`. Write pixels with `putImageData` (lo-game does), never by drawing one
canvas onto another.
