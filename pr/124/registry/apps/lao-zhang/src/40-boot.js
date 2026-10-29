/* 矿工老张: boot, load the best run and the run in progress, then hand the page to the UI loop. */
(function () {
  var state = GM.newState();
  GM.ui.init(state);
  GM.ui.setBest({ ok: true, best: { level: 0, bank: 0 } });
  GM.ui.setRun({ ok: true, run: null });
  GM.ui.enter("title");
  requestAnimationFrame(GM.ui.loop);

  function loadKey(key) {
    return new Promise(function (resolve) {
      if (typeof PAD === "undefined" || !PAD.load) { resolve(null); return; }
      try {
        var p = PAD.load(key);
        if (p && typeof p.then === "function") p.then(resolve, function () { resolve(undefined); });
        else resolve(p);
      } catch (e) {
        resolve(undefined);
      }
    });
  }

  Promise.all([loadKey("best"), loadKey("run")]).then(function (res) {
    var bestInfo = res[0] === undefined
      ? { ok: false, corrupt: true, best: { level: 0, bank: 0 } }
      : GM.readBest(res[0]);
    var runInfo = res[1] === undefined
      ? { ok: false, corrupt: true, run: null }
      : GM.readRun(res[1]);
    GM.ui.setBest(bestInfo);
    if (state.screen === "title" && !state.run) {
      GM.ui.setRun(runInfo);
      GM.ui.enter("title");
    }
  });
})();
