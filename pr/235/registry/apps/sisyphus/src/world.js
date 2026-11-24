/* Sisyphus: the mountain, the path and the camera. All numbers are internal pixels. */
var WORLD = (function () {
  var W = 160, H = 178;
  var SUMMIT_X = 900, BASE_Y = 330, SUMMIT_Y = 78;
  var FAR_END = 1080, WORLD_W = 1120;
  var WEATHERS = ["clear", "wind", "rain"];

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* The long ledge: a smooth climb, a little uneven, steep at the top. */
  function pathY(x) {
    var t = clamp(x / SUMMIT_X, 0, 1);
    var e = t * t * (3 - 2 * t);
    return BASE_Y - (BASE_Y - SUMMIT_Y) * e + Math.sin(t * Math.PI) * 3;
  }

  /* The other side: steep, short, and then the dark. */
  function farPathY(x) {
    var t = clamp((x - SUMMIT_X) / (FAR_END - SUMMIT_X), 0, 1);
    return SUMMIT_Y + 300 * t * t;
  }

  function pathX(p) { return 40 + clamp(p, 0, 1) * (SUMMIT_X - 40); }

  function makeCamera() { return { x: 0, y: BASE_Y - 110 }; }

  function follow(cam, tx, ty, dt, snap) {
    var gx = clamp(tx - 54, 0, WORLD_W - W);
    var gy = clamp(ty - 106, -46, 300);
    if (snap) { cam.x = gx; cam.y = gy; return; }
    var k = Math.min(1, dt * 5);
    cam.x += (gx - cam.x) * k;
    cam.y += (gy - cam.y) * k;
  }

  function pickWeather() {
    return WEATHERS[Math.floor(Math.random() * WEATHERS.length)];
  }

  return {
    W: W, H: H, SUMMIT_X: SUMMIT_X, BASE_Y: BASE_Y, SUMMIT_Y: SUMMIT_Y,
    FAR_END: FAR_END, WORLD_W: WORLD_W, WEATHERS: WEATHERS,
    clamp: clamp, pathY: pathY, farPathY: farPathY, pathX: pathX,
    makeCamera: makeCamera, follow: follow, pickWeather: pickWeather
  };
})();
