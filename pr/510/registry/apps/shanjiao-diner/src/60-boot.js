/* Load the save, then open the shop. */
var booted = false, bootSave = null, bootFailed = false, bootNewer = false;
game.load(SAVE_KEY).then(function (v) {
  if (v && v.v === SAVE_VERSION) bootSave = v;
  else if (v != null) {
    /* a save this build does not know (a newer version's): keep it, write nothing */
    bootFailed = true;
    bootNewer = !!(v && typeof v.v === "number" && v.v > SAVE_VERSION);
  }
  booted = true;
}, function () {
  /* the save cannot be read: never write over it.  The runtime refuses this
   * app's writes until the player clears it in Settings, so a new game would
   * be a whole week that is never saved: the title offers none (SPEC.md 8). */
  bootSave = null;
  bootFailed = true;
  booted = true;
});
game.start("title");
