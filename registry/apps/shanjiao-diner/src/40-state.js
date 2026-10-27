/* Save state and the rules that are not drawing. */
var S = null;

function fresh() {
  var ing = {};
  for (var i = 0; i < DATA.ING_ORDER.length; i++) ing[DATA.ING_ORDER[i]] = 0;
  ing.mushroom = 4; ing.rice = 2; ing.greens = 2;
  var unlocked = {};
  for (var d = 0; d < DATA.DISH_ORDER.length; d++) {
    if (DATA.DISHES[DATA.DISH_ORDER[d]].unlock === "base") unlocked[DATA.DISH_ORDER[d]] = true;
  }
  var npc = {};
  for (var n = 0; n < DATA.NPC_ORDER.length; n++) npc[DATA.NPC_ORDER[n]] = 0;
  return {
    v: SAVE_VERSION, phase: "morning", day: 1, money: 80, rep: 1, ap: 2,
    weather: DATA.WEATHER_BY_DAY[0],
    ingredients: ing, menu: [], stock: {}, unlocked: unlocked,
    upgrades: {}, npc: npc, staff: null, seen: {}, flags: {},
    stats: { served: 0, lost: 0, earned: 0, tips: 0, days: 0 },
    rentPaid: 0, debt: 0, lastLedger: null
  };
}

function save() { if (S) game.save(SAVE_KEY, S); }
function seen(id) { return !!(S && S.seen[id]); }
function mark(id) { if (S) { S.seen[id] = 1; save(); } }
function flag(id) { return !!(S && S.flags[id]); }
function setFlag(id, v) { if (S) { S.flags[id] = v == null ? 1 : v; save(); } }

function ing(id) { return S.ingredients[id] || 0; }
function addIng(id, n) {
  S.ingredients[id] = Math.max(0, (S.ingredients[id] || 0) + n);
}
function takeIng(id, n) {
  if ((S.ingredients[id] || 0) < n) return false;
  S.ingredients[id] -= n;
  return true;
}
function mainIng(id) {
  var need = DATA.DISHES[id].need;
  for (var k in need) if (Object.prototype.hasOwnProperty.call(need, k)) return k;
  return null;
}
function maxPortions(id) {
  var need = DATA.DISHES[id].need, n = 5;
  for (var k in need) if (Object.prototype.hasOwnProperty.call(need, k)) {
    n = Math.min(n, Math.floor((S.ingredients[k] || 0) / need[k]));
  }
  return Math.max(0, n);
}
function canCookPlan(plan) {
  var used = {};
  for (var id in plan) if (Object.prototype.hasOwnProperty.call(plan, id) && plan[id] > 0) {
    var need = DATA.DISHES[id].need;
    for (var k in need) if (Object.prototype.hasOwnProperty.call(need, k)) {
      used[k] = (used[k] || 0) + need[k] * plan[id];
    }
  }
  for (var u in used) if (Object.prototype.hasOwnProperty.call(used, u) && used[u] > (S.ingredients[u] || 0)) return false;
  return true;
}
function cookPlan(plan) {
  var kinds = 0;
  for (var kk in plan) if (Object.prototype.hasOwnProperty.call(plan, kk) && plan[kk] > 0) kinds++;
  if (kinds > 4) return false;
  if (!canCookPlan(plan)) return false;
  for (var id in plan) if (Object.prototype.hasOwnProperty.call(plan, id) && plan[id] > 0) {
    var need = DATA.DISHES[id].need;
    for (var k in need) if (Object.prototype.hasOwnProperty.call(need, k)) takeIng(k, need[k] * plan[id]);
  }
  S.menu = [];
  S.stock = {};
  for (var id2 in plan) if (Object.prototype.hasOwnProperty.call(plan, id2) && plan[id2] > 0) {
    S.menu.push(id2);
    S.stock[id2] = plan[id2];
  }
  S.menu.sort(function (a, b) { return DATA.DISH_ORDER.indexOf(a) - DATA.DISH_ORDER.indexOf(b); });
  save();
  return true;
}
function stockOf(id) { return (S.stock && S.stock[id]) || 0; }
function stockTotal() {
  var n = 0;
  for (var id in S.stock) if (Object.prototype.hasOwnProperty.call(S.stock, id)) n += S.stock[id];
  return n;
}
function useStock(id) {
  if (!S.stock[id] || S.stock[id] <= 0) return false;
  S.stock[id]--;
  if (S.stock[id] <= 0) delete S.stock[id];
  return true;
}
function menuDishes() { return S.menu.slice(); }
function addRep(n) { S.rep = Math.max(0, S.rep + n); save(); }
function addMoney(n) { S.money = Math.max(0, S.money + n); save(); }
function addNpc(id, n) { S.npc[id] = Math.max(0, Math.min(5, (S.npc[id] || 0) + n)); save(); }
function hasUpgrade(id) { return !!(S.upgrades && S.upgrades[id]); }
function canBuy(id) {
  var u = DATA.UPGRADES[id];
  return !hasUpgrade(id) && S.money >= u.cost && S.rep >= u.rep;
}
function buyUpgrade(id) {
  if (!canBuy(id)) return false;
  S.money -= DATA.UPGRADES[id].cost;
  S.upgrades[id] = true;
  if (id === "stove") { unlockDish("grilled_fish"); unlockDish("pork"); }
  save();
  return true;
}
function unlockDish(id) { if (S && DATA.DISHES[id]) { S.unlocked[id] = true; save(); } }
function unlockedDishes() { return DATA.DISH_ORDER.filter(function (id) { return S.unlocked[id]; }); }
function hasHelper() { return availableHelpers().length > 0; }
function availableHelpers() {
  return DATA.NPC_ORDER.filter(function (id) { return id !== "po" && (S.npc[id] || 0) >= 3; });
}
function helperName() {
  return S.staff ? DATA.NPCS[S.staff].name : "";
}
function dayWeather(day) { return DATA.WEATHER_BY_DAY[Math.min(DATA.WEATHER_BY_DAY.length, Math.max(1, day)) - 1]; }
function rentFor(day) { return DATA.RENT[day] || 0; }
function startDay(day) {
  S.day = day;
  S.phase = "morning";
  S.weather = dayWeather(day);
  S.ap = 2;
  S.menu = [];
  S.stock = {};
  S.staff = null;
  S.flags.prepared = false;
  S.flags.opened = false;
  S.flags.forest = false;
  S.stats.days++;
  save();
}
function endDay() {
  // carry nothing except money, people and upgrades
  S.menu = [];
  S.stock = {};
  save();
}
function serveCount() {
  var base = 4 + DATA.WEATHER[S.weather].customers + (hasUpgrade("sign") ? 1 : 0) + Math.floor(S.rep / 3);
  return Math.max(3, Math.min(9, base));
}
function tableCount() { return 4; }
function totalDishes() { return unlockedDishes().length; }
function storySeen(id) { return !!S.seen[id]; }
