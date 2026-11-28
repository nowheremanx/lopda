/* 华容道 / Klotski: the title picture. MIT License.
   A 124 x 124 buffer of tones (0 ink, 1 dark, 2 mid, 3 paper): the warlord's block one slide from the exit of a wooden
   tray, the pass's cliffs behind. Made from the owner's picture, reduced to the four tones; stored packed, 2 bits a
   pixel. The name goes on a dark block top left, drawn from lopix12 glyphs (sdk/fonts, OFL) at twice their size. */
var KLOTSKI_TITLE_ART = (function () {
  var W = 124, H = 124;
  var PIC = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKqqqqqqqqqqqqqqqqqqqr///////////////////wCqqqqqqqqqqqqqqqqqqqq///////////////////8Aqqqqqqqqqqqqqqqqqqqqv///////////////////AKqqqqqqqqqqqqqqqqqqqr///////////////////wCqqqqqqqqqqqqqqqqqqqq///////////////////8Aqqqqqqqqqqqqqqqqqqqqv///////////////////AKqqqqqqqqqqqqqqqqqqqr///////////////////wCqqqqqqqqqqqqqqqqqqqq///////////////////8Aqqqqqqqqqqqqqqqqqqqqv////////////////6qvAKqqqqqqqqqqqqqqqqqqqr///////////////+qqqgCqqqqqqqqqqqqqqqqqqqq///////////////+qqqoAqqqqqqqqqqqqqqqqqqqqv//////////////+qqqqAKqqqqqqqqqqqqqqqqqqqr///////////////qqqqgCqqqqqqqqqqqqqqqqqqqq///////////////6qqqoAqqqqqqqqqqqqqqqqqqqqv///////////////qqqqAKqqqqqqqqqqqqqqqqqqqr///////////////6qqqgCqqqqqqqqqqqqqqqqqqqq///////////////+qqqoAqqqqqqqqqqqqqqqqqqqqv//////////////+qqqqAKqqqqqqqqqqqqqqqqqqqr//////////////+qqqqgCqqqqqqqqqqqqqqqqqqqq///////////////qqqqoAqqqqqqqqqqqqqqqqqqqqv//////////////+qqqqAKqqqqqqqqqqqqqqqqqqqr//////////////+6qqqgCqqqqqqqqqqqqqqqqqqqq///////////////+qqqoAqqqqqqqqqqqqqqqqqqqqv/////+qr///////qqqqAKqqqqqqqqqqqqqqqqqqqr//////qqr//////qqqqgCqqqqqqqqqqqqqqqqqqqq//////qqqr////+qqqqoAqqqqqqqqqqqqqqqqqqqqv/////+qqqv////qqqqqAKqqqqqqqqqqqqqqqqqqqr//////6qqq////6qqqqgCqqqqqqqqqqqqqqqqqqqq//////+qqqq//++qqqqoAqqqqqqqqqqqqqqqqqqqqv/////+qqqqq//qqqqqqAKqqqqqqqqqqqqqqqqqqqr//////qqqqqv+qqqqqqgCqqqqqqqqqqqqqqqqqqqq//////qqqqqr+qqqqqqoAqqqqqqqqqqqqqqqqqqqqv/////6qqqqr+qqqqqqqAKqqqqqqqqqqqqqqqqqqqr/////6qqqqqqqqqqqqqgCqqqqqqqqqqqqqqqqqqqq/////+qqqqqqqqqqqqqoAqqqqqqqqqqqqqqqqqqqq/////+qqqqqqqqqqqqqqAKqqqqqqqqqqqqqqqqqqqr//6v6qqqqqqqqqqqqqqgD//////////6qqqqqqqqqv+qqqqqqqqqqqqqqqqqoA///////////5VVVVVVVVVVVVVVVVVVVVVVVVW7uqAP//////////9qqqqqqqqqqqqqqqqqqqqqqqqqP/qgD///////////alVVVVVVVVVVVVVVVVVVVVVVan/6oA///////////2kAAAAAAAAAAAAAAAAAAAAAACo/+qAP//////////9pZqqYAAAAAAAAAAAWqqUZqqZaP/qgD///////////aaqaqQAAAAAAAAAAqpaqKqmmmj/6oA///////////2mqlqkAAAAAAAAAAKqWqiqlppo/+qAP//////////9pqnapAAAAAAAAAACqqaoqqmqaP/rwD//////////9aap5qRVVVVQVVVVUqmiqKppqmm/+4A///////////ampuakVVVVUFVVVVKp5qiqeapqv/qAP//////////2pqqmpFVVVVBVVVVSqaaoqmmqan//wD//////////9qZpmqRVVVVQVVVVUqqWqKqmqmp//8A///////////amqUqkVVVVUFVVVVKqBqiqlapqv//AP//////////2oqlKpFVVVVBVVVVSqgaoqoGqKr//wD//////////9pKqGqRVVVVQVVVVUqoKqKqSqhq//8A///////////aSqhqkVVVVUFVVVVKqWqiqlqoav//AP//////////2kqoapAAAAAAAAAACqlqoqpaqGn//wD//////////5pKqGqRqqqqqqqqqkqpaqKqWqhp//8A//////////+aSqhqkqmqqqqqqqZKqWqiqlqoaf//AKv/////////mkqoapGqqqqqqqqqiqlqoqpaqGn//wCq/////////5pKqGqSqqqmqqqqqoqpaqKqWqhp//8Aqr////////9qCqhqkqqaqqqqqqqKqWqiqlqoaf//AKq/////////aQqoapKqqqqqmqqqiqlqoqpaqGn//wCqr////////2kKqGqSqqqqqqqqqoqpaqKqWqhp//8Aqq//7/////9pCqhqkqqqqqqqqqqKqWqiqlqoaf//AKqv/qr/////aQqoapKpaqqqVqqqiqlqoqpaqGn//wCqqqqq/////2kKqGqSqqqqqqqqqoqpaqKqWqhp//8Aqqqqqv////9qCqhqkVVVVVVVVVVKqWqiqlqoaf//AKqqqqr/////agqoapFVVVVVVVVVSqlqoqpaqCn//wCqqqqqv////2oKqGqQAAAAAAAAAAqpaqKqWqgp//8Aqqqqqr////9qCqhqkv///9v///+KqWqiqlqoKf//AKqqqqr/////agqoapP///9G////yqlqoqpaqCn//wCqqqqr//+q/2oKqGqT/qr5aS///8qpaqKqWqgpv/8Aqqqqqv/+qq2qCqhqk///5qlb///KqWqiqlpoKq//AKqqqqr/+qqtqgqqqpP//9QUG+qviqqqoaqqaCpv/wCqqqqq/+qqrakFVVVD//9GqVb//4VVVVFVVVQab/8Aqqqqqq/qqq2oBRVUQ//9amqpf//EVVRQRVUUGm//AKqqqqqv6qqtqAUVVEOq9appqm//xRVQUEVUFBpv/wCqqqqqq+qqragFVVVD/+qpFKqb/8FVVUAVVVQab/8AqqqqqqvqqqmoAUVVQ//apKkak//CqqqkqqqpGm//AKqqqqqr+qqtqAAAAAP/lVaqVVP/wqQGpJoBqRqv/wCqqqqqqv6qragVVVVT/9aqqWqT/8KQAaSkAGkar/8Aqqqqqqq6qq2oFVVVU//JaVWlo//ClqWkpalpGq//AKqqqqqqqqqtpBVVVVP/mIb/RSf/gprpoKa6aRqv/wCqqqqqqqqqqKgVVVVRVVXovm4lVUKbeaCm3mkab/8AqqqqqqqqqqmkFVVVUv8akf8GIf+CpuagqbmpGq//AKqqqqqqqqqppBVVVVP/CvP/nyH/wpVFoKVVaRqv/wCqqqqqqqqvqaQVVVVT/Yb///8V/8KaamSmlZkar/8Aqqqqqqqqv6akFVVVU/yh/6v/Gb6CmalQZmpZGp//AKqqqqqqr//mpBVVVVP9pf6q/io/wUVVEFFVRBqf/wCqqqqqq///5qQVVVVT9qW5vn4qb8FFVRBRVUQan/8Aqqqqq/////akFVVUA5qgt6t8GpvAVVVQFVVUGp//AKqqqr/////2pGqqmgNaR2/r9YanwqqqpGqqqhqf/wCqqv7/////9qRqgKoD1S/bRtf1W8KoBqRqQKoKn/8Aqq////////agaQAqA///9QBf///CkAGkaQAqCp//AKq////////2oGiqagK///4A//+6gpalpGiqagqf/wD/////////9qBp7moD+q//g//r/8Ka6aRprqoKn/8A//////////agafdqAv///9v///+Cm3mkabeqCp//AP/////////2oGp+agFVVVVBVVVVQqb2pGpuagqf/wD/////////9qBpVFoBVVVVQVVVVUKVRaRpVFoKn/8A//////////agZaqWAVVVVUFVVVQCmlpkZamaCp//AP/////////2oCWalgFVVVVBVVVUApmpZGWalgqf/wD/////////6qARVVUBVVVVQVVAAAFFVRAQVUEKp/8A/////////+qgEVVVAAVVVUFVVVVBRVUQEFVRBqf/AP/////////qoBRVRQFQVVVBVVVVQUVUEBRVRQan/wD/////////6qAAAAAAAAAAAVVVQAABRAAEAAAGp/8A/////////+qlVVVVVVVVVVQAAAlVVVVVVVVVWqf/AP/////////qqqqqqqqqqqqkAAAaqqqVVVqqqqqn/wD/////////6qqqqqqqqqqqpAAAGqqqqqqqqqqqp/8A/////////+KqqqqqqqqqqqQAABqqqqqqqqqqqpf/AP/////////gVVVVVVVVUFAAAAAFVVUAFVVVVVVH/wD/////////4AAABVVVVVUVU///wABVVVVVVVUVR/8A/////////+FVVVVVVVVVVVP//8VVVVVVVVVVAEf/AP/////////gAFVVUAABVVVT///FVVVVVVVVVVUH/wD/////////4ABVVVVVVVVVU///xVVVVVVVVAAAF/8A//////////AAAAAAVVVVVVP//8VVVVVAFVVVVUv/AP/////////5VVVVVVVVVVVX///VVVVVVVVVVVVv/wD///////////////////////////////////////8A////////////////////////////////////////AP///////////////////////////////////////wD///////////////////////////////////////8A////////////////////////////////////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
  var GLYPH = {"华": "12:AAEgImY4rgIiIeBA/+BABABAAAA=", "容": "12:AABA/+kSZMCgMYwGP4IIIIP4AAA=", "道": "12:AAhIX+AgD8yET8SESET8oAn+AAA=", "K": "7:AAIUSRQwUJESEAAA", "L": "6:AAgggggggg+AAA==", "O": "8:AAA4RIKCgoKCRDgAAA==", "T": "8:AAD+EBAQEBAQEBAAAA==", "S": "7:AAHkKAgMBAUJ4AAA", "I": "4:AORERETgAA=="};
  var art = null;
  function picture() {
    if (art) return art;
    var b = atob(PIC), rows = [], y, x, i, r;
    for (y = 0; y < H; y++) {
      r = "";
      for (x = 0; x < W; x++) { i = y * W + x; r += (b.charCodeAt(i >> 2) >> (6 - 2 * (i & 3))) & 3; }
      rows.push(r);
    }
    art = LoGame.sprite(rows);
    return art;
  }
  /* a glyph as rows of 0/1, its empty columns on both sides dropped: the name is set tight */
  function glyph(ch) {
    var s = GLYPH[ch], w = +s.split(":")[0], b = atob(s.split(":")[1]), rows = [], x, y, i;
    for (y = 0; y < 14; y++) { var r = []; for (x = 0; x < w; x++) { i = y * w + x; r.push((b.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1); } rows.push(r); }
    var l = 0, rr = w - 1, col = function (c) { for (var k = 0; k < 14; k++) if (rows[k][c]) return true; return false; };
    while (l < rr && !col(l)) l++;
    while (rr > l && !col(rr)) rr--;
    return { w: rr - l + 1, rows: rows.map(function (q) { return q.slice(l, rr + 1); }) };
  }
  function bigWidth(str, gap) {
    var w = 0;
    for (var i = 0; i < str.length; i++) w += glyph(str.charAt(i)).w * 2 + (i ? gap : 0);
    return w;
  }
  /* the name at twice the font's size: paper with an ink shadow one pixel down and right */
  function bigText(g, str, x, y, gap) {
    [[1, g.INK], [0, g.PAPER]].forEach(function (pass) {
      var cx = x + pass[0];
      for (var n = 0; n < str.length; n++) {
        var gl = glyph(str.charAt(n));
        for (var j = 0; j < 14; j++) for (var i = 0; i < gl.w; i++) if (gl.rows[j][i]) g.rect(cx + i * 2, y + pass[0] + j * 2, 2, 2, pass[1]);
        cx += gl.w * 2 + gap;
      }
    });
  }
  /* the picture at (x, y), with a dark block in its sky sized to the name */
  function draw(g, x, y, name, gap) {
    g.sprite(picture(), x, y);
    g.rect(x + 2, y + 2, bigWidth(name, gap) + 10, 33, g.DARK);
    bigText(g, name, x + 6, y + 4, gap);
  }
  return { W: W, H: H, draw: draw };
})();
