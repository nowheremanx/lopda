/* Rain on the mountain road: slanted streaks falling round the camera's target and a few splashes on the ground.
   Drawn after R.present(), so it goes straight into the tone image (mid and paper) and is only hidden behind nearer
   surfaces. No Math.random: every drop is World.hash of its number, moved by the frame time t, so a frame is
   the same every time it is replayed. */
var Weather = (function () {
  var hash = World.hash, DROPS = 34, SPLASH = 10, FALL = 7.5, SPEED = 11;
  /* view: {x, z} (what the camera looks at); t: seconds */
  function rain(R, view, t) {
    var i, x, z, y, q;
    for (i = 0; i < DROPS; i++) {
      x = view.x + (hash(i, 31) - 0.5) * 16;
      z = view.z + (hash(i, 32) - 0.3) * 15;
      q = (t * SPEED * (0.85 + hash(i, 33) * 0.3) + hash(i, 34) * FALL) % FALL;
      y = FALL - q;
      R.streak([x, y, z], [x - 0.14, y - 0.6, z], hash(i, 35) < 0.5 ? 2 : 3);
    }
    for (i = 0; i < SPLASH; i++) {
      x = view.x + (hash(i, 41) - 0.5) * 12;
      z = view.z + (hash(i, 42) - 0.3) * 11;
      q = (t * 2.6 + hash(i, 43)) % 1;
      if (q < 0.3) R.dot([x, 0.03, z], 3, q < 0.15 ? 0.1 : 0.22);
    }
  }
  return { rain: rain };
})();
