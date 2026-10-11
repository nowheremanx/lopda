# lo-3d.js

A small software 3D renderer for Lo-PDA apps. MIT License. Version 1.1.0.

It draws low-poly scenes in the four tones: triangles with a z-buffer, flat sun
shading, point lights computed per pixel, fog, depth of field, billboard sprites
and particles, fixed-tone and see-through surfaces. Everything ends in a 4×4 Bayer
dither, so the output is tones 0–3 and nothing else. It does no game logic: no input, scenes, collisions or text.
Use it with lo-game.js (recommended) or on its own.

**Writing a game with an AI?** Paste this file and `LO-GAME.md` into the conversation.

---

## 1. Setting up an app

`index.html` has an empty block, like the lo-game one:

```html
<script data-lo-3d="1.1.0"></script>
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
copy inside your app; the checker rejects it. lo-3d is about 27 KB.

Every released version stays valid: an app built with 1.0.0 keeps passing the checker.
1.1.0 added `tone`, `alpha`, `Lo3D.builder` (with `tube` and `ribbon`), `Lo3D.shadow`,
`R.lookAt` and the sprite option `snap`; everything else is unchanged.

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

### The builder: faces without thinking about winding

`Lo3D.builder()` is an empty mesh you add faces to. Every face takes an `out`
direction (roughly; it only has to point to the right side) and is wound so that it
is seen from there. The last argument is the albedo. Methods return the builder,
and the builder itself is the mesh you draw.

```js
var m = Lo3D.builder();
m.tri(a, b, c, out, albedo)
m.quad(a, b, c, d, out, albedo)              // corners in order round the edge
m.box(x0, y0, z0, x1, y1, z1, albedo, top)   // axis-aligned, no bottom; top: false, or its own albedo
m.cone(x, y, z, r, h, sides, albedo, turn)   // standing on (x, y, z); turn rotates it, in whole turns
m.roof(x0, z0, x1, z1, y, h, ridge, albedo)  // four slopes up to a ridge along x (half length `ridge`), 0: a point
m.tube(path, radius, sides, albedo)          // closed tube along a path of points; radius: number or fn(t, i)
m.ribbon(path, width, albedo, up)            // flat band along a path, lying across `up` ([0, 1, 0])

var house = Lo3D.builder()
  .box(0, 0, 0, 2, 1.5, 2, 1.5, false)
  .roof(-0.3, -0.3, 2.3, 2.3, 1.5, 1, 0.4, 0.34);
R.draw(house);
```

`tube` carries each ring's frame along from the one before, so it doesn't twist
where the path turns. `t` runs from 0 to 1 along the path, so a radius function
tapers it; ends with radius 0 get no cap:

```js
var path = [];
for (var i = 0; i <= 12; i++) { var a = i / 12 * Math.PI; path.push([Math.cos(a) * 2, Math.sin(a) * 2, 0]); }
var arc = Lo3D.builder().tube(path, function (t) { return 0.15 * (1 - t); }, 5, 1);   // a tapering arc
var ring = Lo3D.builder().ribbon(circle, 0.3, 1);       // a flat ring on the ground (circle: points round it)
R.draw(ring, null, { two: true });                      // ribbons are one-sided; two: true shows both sides
```

`Lo3D.shadow(radius, sides)` is a round shadow (albedo 0.02) lying just above the
ground at the origin. Move and squash it under a character every frame:

```js
var SHADOW = Lo3D.shadow(0.36, 8);
R.draw(SHADOW, function (p) { return [p[0] + a.x, p[1], p[2] * 0.7 + a.z]; });
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
R.lookAt(eye, target)  // an eye at `eye` looking at `target`: sets x, y, z, yaw, pitch, and dist 0
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
R.draw(mesh, fn, { bias, albedo, wire, two, tone, alpha })   // fn: model -> world, or null
R.sprite(sprite, x, y, z, { scale, anchor, flip, map, shade, lit, crisp, snap, tone, alpha })
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
- **`snap: true`** rounds a sprite's size to a whole multiple (×2, ×3) or a whole fraction
  (½, ⅓) of its pixels at any distance, on whole pixels, so every sprite pixel is equally
  thick. Its size then changes in steps as it moves nearer; use it for big sprites seen
  close up (a boss), and `crisp` for people at the camera's usual distance.
- Fog and focus use view depth: the distance along the camera's line of sight.

### Fixed tones and transparency

**`tone: 0–3`** draws a mesh or sprite in exactly that tone: no sun, lights, fog or
dither. It is still hidden behind nearer surfaces and hides what is behind it. Use it
for effects that must not melt into the background: a glowing blade at luminance 0.6
dithers to the same dark-mid mix as the wall behind it and disappears; `tone: 3`
stays paper on any background.

**`alpha: 0–1`** is screen-door transparency: the surface leaves out a fixed pattern
of pixels (16 levels, the pattern tied to the screen so it does not crawl as things
move) and the scene shows through the gaps. It works with `tone` and with ordinary
lighting, so a fade-out is a tween of `alpha` instead of blinking.

```js
R.draw(slash, fn, { tone: 3 });                         // always paper, never lost in the scene
R.draw(ghost, fn, { alpha: 0.5 });                      // half there, lit like everything else
R.sprite(foe.art, x, y, z, { alpha: 1 - fade });        // fading out as it dies
R.draw(wave, fn, { tone: 2, alpha: 0.25 });             // a thin veil of mid
```

Halves and quarters read best (`alpha: 0.5`, `0.25`, `0.75`): their patterns are even.
Behind a see-through surface, a nearer see-through surface keeps out the same pixels,
so two veils at 0.5 do not add up to solid; give them different alphas if they overlap.
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
point lights takes about 4–5 ms in desktop Chromium. The showcase game keeps to a
budget of triangles and lights per frame (`docs/decisions.md` 12.2); it is a fair
guide for other 3D apps. To stay fast:

- Draw only meshes on screen (`R.project` the corners of a chunk's box).
- Lights cost per pixel inside their radius; drop the ones far from the camera.
- Fewer, bigger triangles are cheaper than many small ones, but fog and point light
  positions are interpolated per triangle, so keep floors in tiles of about 1 unit.

## 6. Rules that still apply

Everything in `SPEC.md` holds: one HTML file up to 512 KB, four tones, no network,
no `eval`. Write pixels with `putImageData` (lo-game does), never by drawing one
canvas onto another.

## 7. 实例 (examples in the showcase game)

Each 1.1 feature is used for real in `registry/apps/zhenyao-tower/src/`. Read these before inventing your own:

- `tone`, an effect that reads on any background: `SPELL.sword` in [spells.js](../registry/apps/zhenyao-tower/src/spells.js) draws the blades (`BLADE`, `HILT`, `GUARD` in [fx.js](../registry/apps/zhenyao-tower/src/fx.js)) in fixed tones, so the scene is not darkened to make them stand out; `SPELL.vine` and the ice shards of `SPELL.tide` do the same.
- `alpha`, see-through water: `SPELL.tide` (spells.js) draws the body of the wave at `alpha: 0.5` and keeps the crest solid in `tone: 3`.
- `alpha`, fading instead of blinking: the phantom tower dissolving in `SPELL.pagoda` and a falling foe (`ANIM.down` in spells.js, `render` in [battle.js](../registry/apps/zhenyao-tower/src/battle.js)) tween an `alpha` from 1 to 0.
- `builder().tube`, tapering vines: `SPELL.vine` (spells.js) rebuilds one tube per vine every frame from the growing spiral, instead of a chain of cubes.
- `builder().ribbon`, trails: `FX.trail` (fx.js) is a camera-facing ribbon along a projectile's last positions, older half at `alpha: 0.5`; `SPELL.sword`, `SPELL.talisman` and `FOE.ember` (spells.js) use it instead of dot particles.
- `Lo3D.shadow`, a ground shadow that grows with height: `SPELL.seal` (spells.js) scales it as the seal falls.
- sprite `snap`: the boss in `render` (battle.js), so every pixel of the big close-up sprite is equally thick.
- sprite `lit`: foes in `render` (battle.js, `lit()`) take spell point lights only while a light reaches them, because a lit sprite goes through the dither and loses its exact tones.
