/* 每日推箱 / DailyBox: the input and animation clock, with no DOM and no lo-game so tests can
   drive it directly. It is a straight port of the owner-approved proto/feel.html; the numbers are
   the feel and must not be tuned.

   One press moves at once. A press during an animation is remembered (the last one only) and runs
   when the animation ends. Holding repeats after 220 ms, at the walking pace with no extra gap, and
   150 ms later after a push. Auto-repeat stops (until the key is released and pressed again) when a
   box lands on a goal or a dead square, or the postman bumps.

   The caller drives it in this order every frame:
     var ended = BoxInput.advance(state, dtMs);
     if (ended) { ...; BoxInput.finish(state, nowMs, ended.kind, stop); }
     ... handle presses with press()
     var move = BoxInput.next(state, nowMs);   // a queued or repeated direction
     if (move) { Board.step(...); BoxInput.begin(state, kind, nowMs); }
   Times are milliseconds. */
var BoxInput = (function () {
  "use strict";

  var MS = {
    walk: 120,    // one step
    brace: 50,    // push: lean against the box, it has not moved yet
    move: 180,    // push: both slide one cell, ease in and out
    bump: 90,     // knock into a wall, or a box that cannot move
    hold: 220,    // a held direction starts repeating after this
    gap: 150,     // extra wait after a push before the next repeated push
    dust: 140     // two mid pixels behind a pushed box
  };

  function create() {
    return {
      held: null,      // the direction held now
      holdAt: 0,       // when it went down
      readyAt: 0,      // no repeat before this (a push adds the gap)
      blocked: false,  // repeat is off until the key is released and pressed again
      queued: null,    // the last direction pressed during an animation
      anim: null,      // { kind, t, dur, ... } - the game adds its own drawing fields
      won: false
    };
  }

  function duration(kind) {
    return kind === "push" ? MS.brace + MS.move : kind === "bump" ? MS.bump : MS.walk;
  }

  /* A direction went down. Returns the direction to move now, or null when an animation has to
     finish first (the direction is then queued). A different direction starts a new hold and
     clears the auto-stop. */
  function press(state, dir, now) {
    if (state.held !== dir) {
      state.held = dir;
      state.holdAt = now;
      state.blocked = false;
    }
    if (state.anim || state.won) {
      state.queued = dir;
      return null;
    }
    return dir;
  }

  function release(state, dir) {
    if (state.held === dir) state.held = null;
  }

  /* The move has been applied to the board: start its animation. */
  function begin(state, kind, now) {
    state.anim = { kind: kind, t: 0, dur: duration(kind) };
    return state.anim;
  }

  /* Advance the animation; when it finishes, return it (so the caller can see kind and its own
     drawing fields) and clear state.anim. */
  function advance(state, dt) {
    if (!state.anim) return null;
    state.anim.t += dt;
    if (state.anim.t < state.anim.dur) return null;
    var done = state.anim;
    state.anim = null;
    return done;
  }

  /* The animation's consequences: a push holds the repeat back for the gap; a bump, or a push
     that put the box on a goal or a dead square, stops it until the key is pressed again. */
  function finish(state, now, kind, stop) {
    if (kind === "push") state.readyAt = now + MS.gap;
    else state.readyAt = now;
    if (stop) state.blocked = true;
  }

  /* The direction to move this frame: a remembered press first (it is a deliberate press, so its
     move runs at once), then a held direction once both the hold delay and the push gap are over. */
  function next(state, now) {
    if (state.anim || state.won) return null;
    if (state.queued) {
      var dir = state.queued;
      state.queued = null;
      return { dir: dir, repeat: false };
    }
    if (state.held && !state.blocked && now >= state.holdAt + MS.hold && now >= state.readyAt) {
      return { dir: state.held, repeat: true };
    }
    return null;
  }

  return {
    MS: MS,
    create: create,
    duration: duration,
    press: press,
    release: release,
    begin: begin,
    advance: advance,
    finish: finish,
    next: next
  };
})();
