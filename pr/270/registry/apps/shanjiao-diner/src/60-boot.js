/* Load the save, then open the shop. */
var booted = false, bootSave = null, bootFailed = false;
game.load(SAVE_KEY).then(function (v) {
  if (v && v.v === SAVE_VERSION) bootSave = v;
  booted = true;
}, function () {
  /* the save cannot be read: start with no save and never write over it */
  bootSave = null;
  bootFailed = true;
  booted = true;
});
game.start("title");
