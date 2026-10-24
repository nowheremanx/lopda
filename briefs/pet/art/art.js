/* Lo-PDA pet style proposals: sprites as text grids. k ink, d dark, m mid, p paper, . transparent. */
var TONE={k:"#1f2a14",d:"#4a5a32",m:"#7d8a58",p:"#a3ad7e"};

var CH={};
/* 1. 团子 Mochi: a round blob with ear nubs */
CH.mochi={name:"团子 Mochi", fill:"m", eyes:[[8,5],[8,10]], mouth:[11,7], grid:[
"................",
"................",
"....kk....kk....",
"...kmmk..kmmk...",
"...kmmmkkmmmk...",
"..kmpmmmmmmmmk..",
".kmppmmmmmmmmmk.",
".kmpmmmmmmmmmmk.",
".kmmmkmmmmkmmmk.",
".kmmmkmmmmkmmmk.",
".kmmmmmmmmmmmmk.",
".kmdmmmkkmmmdmk.",
"..kmmmmmmmmmmk..",
"...kkmmmmmmkk...",
"....kdkkkkdk....",
"....kk....kk...."]};
/* 2. 啾啾 Pip: a round chick with a tuft */
CH.pip={name:"啾啾 Pip", fill:"m", eyes:[[7,6],[7,9]], mouth:[9,7], beak:true, grid:[
"................",
".......kk.......",
"......kmk.......",
".....kkkkkk.....",
"....kmmmmmmk....",
"...kmpmmmmmmk...",
"...kppmmmmmmk...",
"..kmmmkmmkmmmk..",
"..kmmmkmmkmmmk..",
"..kmmmmddmmmmk..",
".kkmmmmkkmmmmkk.",
".kdkmmmmmmmmkdk.",
"..kmmmmmmmmmmk..",
"...kkmmmmmmkk...",
".....kkkkkk.....",
"......k..k......"]};
/* 3. 芯仔 Chip: a microchip that came alive inside the machine */
CH.chip={name:"芯仔 Chip", fill:"m", eyes:[[5,5],[5,10]], mouth:[8,7], grid:[
"......kkk.......",
".......k........",
"..kkkkkkkkkkkk..",
"..kddddddddddk..",
"kkkdmmmmmmmmdkkk",
"..kdmkmmmmkmdk..",
"kkkdmkmmmmkmdkkk",
"..kdmmmmmmmmdk..",
"kkkdmmmkkmmmdkkk",
"..kdmmmmmmmmdk..",
"kkkddddddddddkkk",
"..kdpddddddddk..",
"..kkkkkkkkkkkk..",
"...k.k....k.k...",
"...k.k....k.k...",
"................"]};

var EGG=[
"................",
"......kkkk......",
".....kmmmmk.....",
"....kmpmmmmk....",
"...kmppmmmmmk...",
"...kmpmmmdmmk...",
"..kmmmmmdddmmk..",
"..kmmmmmmdmmmk..",
"..kmmdmmmmmmmk..",
"..kmdddmmmmmmk..",
"..kmmdmmmmdmmk..",
"..kmmmmmmdddmk..",
"...kmmmmmmdmk...",
"....kmmmmmmk....",
".....kkkkkk.....",
"................"];
var BABY=[
"................",
"................",
"................",
"................",
"................",
"................",
"......kkkk......",
".....kmmmmk.....",
"....kmpmmmmk....",
"....kmkmmkmk....",
"....kmmmmmmk....",
"....kmmkkmmk....",
".....kmmmmk.....",
"......kkkk......",
"................",
"................"];

var P={};
P.card=["kkkkkkkkk","kpppppppk","kpkkkkppk","kpppppppk","kpkkkkkpk","kpppppppk","kkkkkkkkk"];
P.flag=["kkkkkkkk","kppppppk","kpkkkppk","kpppkppk","kppkkppk","kpppkppk","kpkkkppk","kppppppk","kkkkkkkk","k.......","k.......","k.......","k.......","k......."];
P.books=["...kkkkkkkk.","...kmmmmmmk.","..kkkkkkkkkk","..kpppppppdk",".kkkkkkkkkk.",".kdddddddmk.","kkkkkkkkkkkk","kmmmmmmmmmpk","kkkkkkkkkkkk"];
P.film=[".kkkkk..","kdpddk..","kdddkkkk","kdddkmmk","kdddkkkk","kdddk...",".kkkk..."];
P.bowl=["...dmdm...","..dmdmdd..","kkkkkkkkkk",".kppppppk.","..kkkkkk.."];
P.poop=["...k...","..kmk..",".kmmmk.",".kkkkk.","kmmmmmk","kkkkkkk"];
P.heart=[".kk.kk.","kddkddk","kdddddk",".kdddk.","..kdk..","...k..."];
P.heartE=[".kk.kk.","k..k..k","k.....k",".k...k.","..k.k..","...k..."];
P.sign=[
"kkkkkkkkkkkkkkkk",
"kppppppppppppppk",
"kppppppppppppppk",
"kppppppppppppppk",
"kppppppppppppppk",
"kppppppppppppppk",
"kkkkkkkkkkkkkkkk",
".......kk.......",
".......kk.......",
".......kk.......",
".....kkkkkk....."];
/* souvenirs, 16x16 */
var SOUV={};
SOUV.shell={name:"贝壳", grid:[
"................",
".......kk.......",
"......kmmk......",
".....kmpmmk.....",
"....kmpkmkmk....",
"...kmpmkmkmmk...",
"..kmpmmkmkmmmk..",
"..kmmmkmmmkmmk..",
".kmmmmkmmmkmmmk.",
".kmmmkmmmmmkmmk.",
".kmmmkmmmmmkmmk.",
"..kdmmmmmmmmmdk.",
"...kkdddddddkk..",
".....kkkkkkk....",
"................",
"................"]};
SOUV.leaf={name:"红叶", grid:[
"................",
".......k........",
"......kdk.......",
"..k..kdddk..k...",
"..kk.kdpdk.kk...",
"..kdkkdpdkkdk...",
"...kddkpkddk....",
"kkkkdddpdddkkkk.",
".kddddkpkddddk..",
"..kkdddpdddkk...",
"....kdkpkdk.....",
"...kdk.p.kdk....",
"...kk..k..kk....",
".......k........",
".......k........",
"................"]};
SOUV.post={name:"明信片", grid:[
"................",
"................",
"kkkkkkkkkkkkkkkk",
"kppppppppkpkkkpk",
"kpmmmmmmpkpkmkpk",
"kpmmpmmmpkpkkkpk",
"kpmpppmmpkppppk.",
"kpmmmmmmpkpkkkpk",
"kpdddmddpkppppk.",
"kpdddddkpkpkkkpk",
"kppppppppkppppk.",
"kpkkkkkppkpkkkpk",
"kppppppppkppppk.",
"kkkkkkkkkkkkkkkk",
"................",
"................"]};

/* menu icons, 8x8, one bit */
var ICON={};
ICON.food=["........","..k.k.k.",".k.k.k..","kkkkkkkk","k......k",".k....k.","..kkkk..","........"];
ICON.light=["..kkkk..",".k....k.",".k....k.",".k....k.","..k..k..","..kkkk..","..kkkk..","...kk..."];
ICON.play=["..kkkk..",".k..k.k.","k..k...k","kkk...kk","k...kk.k","k..k...k",".k.k..k.","..kkkk.."];
ICON.wash=["...k....","...k....","..k.k...","..k.k...",".k...k..",".k...k..",".k...k..","..kkk..."];
ICON.look=["........","..kkkk..",".k....k.","k..kk..k","k..kk..k",".k....k.","..kkkk..","........"];
ICON.box=["kkkkkkkk","k......k","kkkkkkkk","k..kk..k","k......k","k......k","k......k","kkkkkkkk"];
ICON.mail=["........","kkkkkkkk","kk....kk","k.k..k.k","k..kk..k","k......k","kkkkkkkk","........"];
ICON.call=["..kkkk..",".k.kk.k.","k..kk..k","k..kk..k","k......k",".k.kk.k.","..kkkk..","..k....."];

/* ---------- sprite transforms ---------- */
function rows(g){ return g.map(function(r){ return r.split(""); }); }
function join(a){ return a.map(function(r){ return r.join(""); }); }
function variant(c,kind){
  var a=rows(c.grid), f=c.fill;
  function set(r,col,v){ if(a[r] && a[r][col]!==undefined) a[r][col]=v; }
  if(kind==="sleep"||kind==="happy"){
    c.eyes.forEach(function(e){ var r=e[0], col=e[1];
      set(r,col,f); set(r+1,col,f);
      if(kind==="sleep"){ set(r+1,col-1,"k"); set(r+1,col,"k"); }
      else { set(r,col,"k"); set(r+1,col-1,"k"); set(r+1,col+1,"k"); }
    });
  }
  if(kind==="eat"||kind==="happy"){
    var m=c.mouth;
    if(c.beak){ set(m[0],m[1],"k"); set(m[0],m[1]+1,"k"); set(m[0]+1,m[1],"d"); set(m[0]+1,m[1]+1,"d"); }
    else { set(m[0],m[1],"k"); set(m[0],m[1]+1,"k"); set(m[0]+1,m[1],"k"); set(m[0]+1,m[1]+1,"k"); set(m[0],m[1]-1,"k"); set(m[0],m[1]+2,"k"); }
  }
  return join(a);
}
function silhouette(c,kind){ /* Game & Watch segment: one solid shape, eyes cut out */
  var g=kind? variant(c,kind) : c.grid, a=rows(g);
  var out=a.map(function(r){ return r.map(function(v){ return v==="."?".":"k"; }); });
  var cut=function(r,col){ if(out[r]) out[r][col]="p"; };
  c.eyes.forEach(function(e){
    if(kind==="sleep"){ cut(e[0]+1,e[1]-1); cut(e[0]+1,e[1]); }
    else { cut(e[0],e[1]); cut(e[0]+1,e[1]); }
  });
  /* keep a thin gap between body and outline so the shape reads */
  return join(out);
}
function check(){
  var bad=[];
  function chk(n,g){ var w=g[0].length; g.forEach(function(r,i){ if(r.length!==w) bad.push(n+" row "+i+" len "+r.length+" want "+w); }); }
  for(var k in CH) chk(k,CH[k].grid);
  chk("egg",EGG); chk("baby",BABY);
  for(var p in P) chk(p,P[p]);
  for(var s in SOUV) chk(s,SOUV[s].grid);
  for(var i in ICON) chk(i,ICON[i]);
  return bad;
}
