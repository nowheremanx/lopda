/* Load the save, then open the shop. */
var booted = false, bootSave = null;
game.load(SAVE_KEY).then(function (v) {
  if (v && v.v === SAVE_VERSION) bootSave = v;
  booted = true;
});
game.start("title");
