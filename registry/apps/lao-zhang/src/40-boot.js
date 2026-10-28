/* 矿工老张: boot, load the best run, and hand the page to the UI loop. */
(function () {
  var state = GM.newState();
  GM.ui.init(state);
  GM.ui.setBest({ ok: true, best: { level: 0, bank: 0 } });
  GM.ui.enter("title");
  requestAnimationFrame(GM.ui.loop);

  function ready(info) {
    GM.ui.setBest(info);
    if (state.screen === "title") GM.ui.enter("title");
  }

  if (typeof PAD !== "undefined" && PAD.load) {
    try {
      var p = PAD.load("best");
      if (p && typeof p.then === "function") {
        p.then(function (v) { ready(GM.readBest(v)); },
               function () { ready({ ok: false, corrupt: true, best: { level: 0, bank: 0 } }); });
      } else {
        ready(GM.readBest(p));
      }
    } catch (e) {
      ready({ ok: false, corrupt: true, best: { level: 0, bank: 0 } });
    }
  } else {
    ready(GM.readBest(null));
  }
})();
