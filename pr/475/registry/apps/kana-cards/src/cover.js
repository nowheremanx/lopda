/* 五十音图 / Kana: the cover picture on the home screen. MIT License.
   160 x 160 tones (0 ink, 1 dark, 2 mid, 3 paper): flash cards with あ and ア, an inkstone and brush, a desk calendar,
   blank cards pinned on the wall. The flat corner the generator left for a title now carries the wall's
   speckle, thinning towards the top so the name stays readable. Made from the owner's picture, reduced to the four tones; stored packed, 2 bits a
   pixel. The app's name sits on the dark wall top left, as text over the canvas. */
var KANA_COVER = (function () {
  var W = 160, H = 160;
  var PIC = "" +
    "qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVqQAAAAAAAA" +
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABpAAAAAAAAAAAAAAAAAA" +
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAaQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGkAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
    "AAAAVUFVVVVVVVVVVVVVVVVQBpABVVVWVVVVVZVVVVVVVVVVVVVVVVVVlWVSqqqqqqqqqqqqqqqqkAaQAVVVVVVVWVVVVVVWZVVVZVWVVVZVVVVVUqqq" +
    "qqqqqqqqqqqqqpAGkAFVVVaVVVVVVVVVVVVVVVVVVVVZVVVVWVKoRpWqqqqqqqqqqqqQBpABVVVZVVVVVVWVVZVVVVVVVVVVVVVVVVVSqJVAqqqqqqqq" +
    "qqqqkAaQAVVVVVVVVVlVVVVVVVVVVVVVVVVVVVVWUqiqEFaqqqqqqqqqqpAGkAJVVZVVVVVVVVVVVVVZVVVWVWVZVlVZVVKoqgKQGqqqqqqqqqqQBpAC" +
    "VlVVVVVWVVVVVVVVVVVVVVVVVVVVVVVSqKqqqpqlqqqqqqqqkAaQAVVVVmVVVVlVVWVVVVVVVmVVVVVVVVWVkqiqqqqKlFZaqqqqqpAGkAFVVVVWVVVZ" +
    "VVVVVVVZVVVVVVVVVVVVVZKoqqqqipaQQqqqqqqQBpABWVZVVVVZVVlVVVVlVVVVVWVVVVVVVVVSqKqqqoqWqFEqqqqqkAaQAVVVVVVVVVVVVVVVVVVl" +
    "VVVVVVVVVVVVUqiqqqqKlqqqqGqqqpAGkAFVVVVVVVVVVlVVVVVVVWVVWVVZVVlVVZKoqqqqipaqqqgqWqqQBpABVVaVZVVVVaVVlVVWVVVVlVpVVlVV" +
    "ZVWSqKqqqoqWqqqoKgBkUAaQAVVVVVVVVVVVVVVlVVVVVVVlVVVVVVVVUqiqqqqWlqqqqCqqqqAGkAFVVlVlVVVVVVVVVVVVlmVVVVVVlVZVZVKoqqqq" +
    "mpaqqqgqqqqgBpABVVlVVVVVVVVVVVVVVVVlVVZVVVVZVVWSpaqqqpqWqqqoKqqqoAaQAVVVVWVVVVVWVVVVVVWVVWVVVZVVVVVVUqaqqqqalqqqqCqq" +
    "qqAGkAFlVVVlVVZVVlVZVlVVVVVVVVVVVVVVVVKmqqqqmpaqqqgqqqqgBpABVVVVVZZVVVVZVVVVVVVVVVVVVZWmmVlSpqqqqpqWqqqoKqqqoAaQAVVV" +
    "VaVVVVVVVVVVVpVVVlVVVVVVVVVVUqaqqqpalqqqqCqqqqAGkAGZZVWVVVVWVVVVZVVVVVVVmVVVVVVVllKmqqqqCpaqqqgqqqqgBpABZVVVVVmVVVVl" +
    "VVVVVVVVVVpVVZVVVlVSpqqqqhaWqqqoKqqqoAaQAVVVZlVVVlVVVVVVVVVWVpVVVVVVZZlVUqaqqqoalqqqqCqqqqAGkAFVVWVVVVlVWVVVVVZVpVVl" +
    "VVVVWVlVmZKmqqqqKoaqqqgqqqqgBpABVVVVWlZVVpVVVVVlalVVmVVVVVVVWWZRpaqqqiqaqqqoKqqqoAaQAVVVVVVVVVVVVZWVVVVWVVVVZVVVVVVV" +
    "kamqqqoqmqqqqCqqqqAGkAFWVVVZVWZVZVZVlVVZVVVVVVVVpVVVVVGqqqqqGpqqqqhqqqqgBpABVVVZVVVlVWVmVVVVVlWVVVVVVZlVVVVRqqqqqhqa" +
    "qqqoaqqqoAaQAVlWlVVVVVWlVVVVVVVVVpVVmWVVVVVVUqqqqBYWmqqqqKqqqqAGkAKalVVZVlVVVVVWmZlVVVVZWVlVllWVVVGqqqqUFpqqqqhqqqqg" +
    "BpABVVZWVZVlZVZlZlVVVlmVVlVVValmWVVRqqqqqlqaqqqoqqqqoAaQAVVVlVVVVVVVVZVmVVZVWlVVVVVZVVVVUaqqqqqqiqqqqGqqqqAGkAJVVVlV" +
    "VVVVZZVZaWVVVVVVZVllZVVVVZGqqqqqqpKqqqiqqqqgBpACWWVVVWVVVVVZVVWZmWlVZVVVaVVVVVZRqqqqqqqqqqqoaqqqoAaQAWZVVVWZVVVVVVVV" +
    "VlVVlVVZlVVZVVVVkaqqqqqqqqQaqKqqqqAGkAFlmWVVWllVVVVVlVWVVVVVlaWVVWlaZZGqqqqqqqqqVViqqqqgBpABWVVWVVVmZWlVVVVVVlZVZVZV" +
    "ZVVVVZlRqqqqqqqqpqoAaqqqoAaQAVVlVWmlWVlZVVlVVWZlVVVVVVWVVVVakaqqqqpqqqqqpaqpQZAGkAGVZVZVVVlVVVVVVZWpZVVZVVVWZVVZVVGq" +
    "qqqqqqqqqqqqqqUQBpABVVpVVlZWVVlVVlVZVVWVVlVlVVVZVZZRqqqqqqqqqqqqqqqqUAaQAVVVVVlVVVVlVVWVVlaVpZpZVWVVVZVlUaqqqqqqqqqq" +
    "qqqqqpAGkAFllaVllVWlllVVpZVVVWVlVWllVVVZVVGmqqqqqqqqqqqqqqqQBpABlWpVVZZVVVVlZVaVVVVVVlVVWVVVVWlRqqqqqqqqqqqqqqqqkAaQ" +
    "AZVVWVlVVpVVlVZVpZVVmVllWVVVVmmlUZZqqqmqqqqqqqqqqpAGkAJlVVVpVVVVWVWVWVVVVZaVZVVVmVmVVVGaqqqqaqqqqqqqqqqQBpABlllZVpWV" +
    "VaVVVlaVWWVlVmZlVZWZZVZRWmqalqmpKqqqqqqpkAaQAWWVVVVlZlZqWVaVVlVlZZWVZVVVVVVWUWqqqqmkFUaqqqqqqpAGkAFmZVmVWlVllWVlVVla" +
    "ZVVVWaZVpVlVVVGqqpmqpEFWVqqqqqqQBpABZpVVpWlVVVZZllVWVVVpVaVVZmVaZppRVqmmqaWQBRaqaqqqkAaQAlZZmVZZVZVlVVlVmVVpVVZVWpVV" +
    "ZlZWUaqqqqpSlkBRqaqqqpAGkAVVVZVWWmqWlWpWVWVWVVZamWWmpVVVlUFqmpapkqKhQVRqqqqQBpAFlWWVZVVVVVllVVVVmVZVVVVaVlpVZVQAVaqq" +
    "qlaqppAFWqqqkAaQBlVVVZlWVVZVlWZVVVWVVVVVVVVVVVABVAVlmWmGqqSqAVmqqpAGkAWVmVZlVZWVampWVZlqVlVVmVZqVVQAqWoAWmqmRqqpqoAa" +
    "BaqQBpAGalWVmVVlaZmlppVZVmValVpVZZVFWqqplRVVmVpaqqqJUBGqkAaQBllVlqWVWVVWZWVlWVZlVWVaVlkBWqqqpVpBVmZaVqqqlqQRqpAGkAWa" +
    "ZVmapmpqlZllWVWVmVVVVlUAaqqqqqmqUBVWGqZaqpKlQGqQBpAGVZVWVlZVmVVlVVVZVaZVVVVQWqqqqqpmqlpBaCqqVaqqpKUFkAaQBZWVVWmWlWVq" +
    "ZVaVWaVqVVVQFqqqqqqqqqamlBgqqqpaqqlqRpAGkAaVlVVVVlWZVVVVlVWVVlVUFWqqqqqqqqqpapVEKqqqlaqqqgGQBpAGWZqWmmaqlmmlmmpWppak" +
    "BqqqqqqqqqqqlqpaUKqqqqpVqqoBkAaQBlpqWZZmVqaVmWVZlZlUFaqqqqqqqqqqqmqqlZWqqqqqlaqqEZAGkAapmlqWZamaZlZlapVVRWqqqqqqqqqq" +
    "qqqmqaqWqqqqqqWWqBGQBpAGmqWpWZZlqamallalQVqqqqqqqqqqqqqqqqmqlqqqqqqqpWgVkAaQBqmVmmZZmpmaZmZVECqqqqqqqqqqqqqqqqppqpKq" +
    "qqqqqlqoUVAGkAWmalqZpmlaWVmlQFqqqqqqqqqqqqqqqqqqpqpWqqqqpBRVqFCQBpAFWVVZlmVmVZaVVFqqqqqqqqqqqqqqqqqqqqqpVqqqqqaRVaRQ" +
    "UAaQBlWVaapaaaVWVAWqqqqqqqqqqqqqqqqqqqqqmkaqqqqVhZWkUFAGkAaVpZVmVlWVUAaqqqqqqqqqqqqqqqqqqqqqqqZaqqqqmVVaoVCQBpAFmVpV" +
    "paWpVAKqqqqqqqqqqqqqqqqqqqqqqqqqWqqqqqWVVpFUUAaQBllaVVZlVQVqqqqqqqqqqqqqqqqqqqqqqqqqqhqqqqqqWVaRVFAGkAaqZqlmpUFaqqqq" +
    "qqqqqqqqqqqqqqqqqqqqqqpqqqqqqqpalVQQBpAFqZaZlQBqqqqqqqqqqqqqqqqqqqqqqqqqqqqqGqqqqqqlqoVUEAaQBaZVZlAGqqqqqqqqqqqqqqqq" +
    "qqqqqqqqqqqqqgaqqqqqpVqFVBAGkAZqlVQWqqqqqqqqqqqqqqqqqqqqqqqqqWqqqqqQaqqqqqVaRVUQBpAGVpQVaqqqqqqqqqqqqqqqqqqqqqqqqlRa" +
    "qqqqpAaqqqqpWgVVEAaQBVRGqqqqqqqqqqqqqqqqqqqqqqqqqpFVVqqqqqpAaqqqlqoVVRAGkAQVqqqqqqqqqqqqqqqqqqqqqqqqqqgFQBSqqqqqpQaq" +
    "qpVpFVUABpAFaqqqqqqqqqqqqqqqqqqqqqqqqqlAVAABGqqqqqpAaqpVaQVVQAaQBqqqqqqqqqqqqqqqqqqqqqqqqqpQVQABqVWqqqqqlQaqlalQVUAG" +
    "kAaqqqqqqqqqqqqqqqqqqqqqqqqqAVAAAP4FaqqqqqlAaqWkVQFABpAGqqqqqqqqqqqqqqqqqqqqqqqqqgUABUb/gUaqqqqqlQaqpFVQAAaQBqqqqqqq" +
    "qqqqqqqqqqqqqqqqqqoBUFQB6kBRqqqqqpVAaqBUQAAGkAaqqqqqqqqqqqqqqqqqqqqqqqqqBFRAAHkEFFqqqqqqVAaRVAAQBpAGqqqqqqqqqqqqqqqq" +
    "qqqqqqqqqgUVAAAUFUFWqqqqqqlAkQAVUAaQBqqqqqqqqqqqqqqqqqqqqqqqqqoFVUAAABVQUaqqqqqllAABlZAGkAaqqqqqqqqqqqqqqpWqqqqqqqqq" +
    "QVVUAAABVRVqqqqqqqlBVWZQBpAGqqqqqqqqqqqqqqVYaqqqqqqqqpBVFQAAABVRWqqqqqqplVVaUAaQBqqqqqqqqqqqqqkavhqqqqqqqqqkBUVAAAAF" +
    "VBCqqqqqqmllVVAGkAaqqqqqqqqqqqoW//+aqqqqqqqqqkFRUAAAAVUEqqqqqqqWlZWQBpAGqqqqqqqqqqlFv///5qqVVWqqqqqQVBQAAAAVVGqqqqqq" +
    "qqZVUAaQBqqqqqqqqqlWr/////mqmqoFVVVVUFUFQAAAAVUaqqqqqqqllZAGkAaqqqqqqqqAr//////9Kl//6uqv+qFFUVAAFUBVUqqqqqqqqmZQBpAG" +
    "qqqqqqqQf////////xpf///////2kVRQAVQABVSqqqqqqqmpkAaQBqqqqqqqn////+r/r//VX///////9qRVFVUAAAFVSqqqqqqqqpAGkAaqqqqqqVv/" +
    "///Q/gv/5F////////WpRVFAAAABFVWqqqqqqqmQBpAGqqqqqqhS////4OQf//0f/////1/0qlFUAAAAVkVUaqqqqqqqUAaQBqqqqqqoJP////QBe///" +
    "S/6qAAAH/aqUVAAAFVVkVUaqqqqqqpAGkAaqqqqqqBm////kFtH//9v4ABVVAv2qqRQAAFalVRVVaqqqqqqQBpAGqqqqqqhGL//lQB/gVX/n/ga//Qf9" +
    "qqpAAFaqqlVVVRqqqqqqkAaQBqqqqqqkFov/9AQfAAAf9P+/5vQf/WqqkAVqqqqVVBVAqqqqqpAGkAaqqqqqpBSb////AAD9B/0//+BRv/8qqqVWqqqq" +
    "qVVFECqqqqqQBpAGqqqqqqQEJf///wFQ/0H/W//0F///KqqqqqqqqqqVVQUaqqqqkAaQBqqqqqqVARj///0B0P/Q/9b/9C///yqqqqqqqqqqqlUFWqqq" +
    "qpAGkAaqqqqqlEBJf//4EJL/4P/0//R///8qqqqqqqqqqqqlQBqqqqqQBpAGqqqqqqQQUV//9HQC/+D//T/0f///KqqqqqqqqqqqqlVqqqqqkAaQBqqq" +
    "qqqpFVSb/+T4B//Q//9v4P///1qqqqqqqqqqqqqqqqqqqpAGkAaqqqqqqkRFZ//g/gb/gv//m9H///+aqqqqqqqqqqqqqqqqqqqQBpAGqqqqqqpBARn/" +
    "4P0A/0b//9JH////mqqqqqqqqqqqqqqqqqqqkAaQBqqqqqqqkUVZf+CkFX4b///0H////5qqqqqqqqqqqqqqqqqqqpAGkAaqqqqqqqRVVm/0AH/9f///" +
    "/m/////WqqqqqqqqqqqqqqqqqqqQBpAGqqqqqqqoEFGb/QH///////9L////5qqqqqqqqqqqqqqqqqqqkAaQBqqqqqqqqgRUkv//////////2////+aq" +
    "qqqqqqqqqqqqqqqqqpAGkAaqqqqqqqpFFWb//////////wv////mqqqqqqqqqqqqqqqqqqqQBpAGqqqqqqqqkQVZv////////5AL////pqqqqqqqqqqq" +
    "qqqqqqqqkAaQBqqqqqqqqqRVRX////////kFC////7aqqqqqqqqqqqqqqqqqqpAGkAaqqqqqqqqkEVFf//////9VUC////+2qqqqqqqqqqqqqqqqqqqQ" +
    "BpAGqqqqqqqqqgRUl/////6QVAAv///+9aqqqqqqqqqqqqqqqqqqkAaQBqqqqqqqqqpFFGX////pFUABL///+viqqqqqqqqqqqqqqqqqqpAGkAaqqqqq" +
    "qqqqgRUY///5RVAVVBVV///9qqqqqqqqqqqqqqqqqqlQBpAGqqqqqqqqqpBURn//UVQBVUEAAABVUKqqqqqqqqqqqqqqqqqAUAaQBqqqqqqqqqqkERZe" +
    "kBVAVVAVFmqaZVaqqqqqqqqqqqqqqqqkFVAGkAaqqqqqqqqqqRBFhBVQFVQFRBqqqqqqqqqqqqqqqqqqqqqlAVVQBpAGqqqqqqqqqqpERFFVFVQFUAUa" +
    "qqqqqqqqqqqqqqqqqqqpVVVVUAaQBqqqqqqqqqqqkRUUBVQFVAFUGqqqqqqqqqqqqqqqqqqqhFVVVVAGkAaqqqqqqqqqqpFEQVUBVUBVQWqqqqqqqqqq" +
    "qqqqqqqqpAVVVVVQBpAGqqqqqqqqqqqkUUUAVVBVUFqqqqqqqqqqqqqqqqqqlBVVVVVVUAaQBqqqqqqqqqqqqRBBVUBVQVaqqqqqqqqqqqqqqqqqpUVV" +
    "VVVVVVAGkAaqqqqqqqqqqqlERVAFVBaqqqqqqqqqqqqqqqqqqlFVVVVVVVVQBpAGqqqqqqqqqqqqQQQBVQVqqqqqqqqqqqqqqqqqqpAVVVVVVVVVQAaQ" +
    "BqqqqqqqqqqqqpBAVUFaqqqqqqqqqqqqqqqqqpRFVVVVVVVVUAAGkAaqqqqqqqqqqqqkFUBWqqqqqqqqqqqqqqqqqqVFVVVVVVVVUQAABpAGqqqqqqqq" +
    "qqqqpAAVqqqqqqqqqqqqqqqqqqkAVVVVVVVVVAAAAAaQBqqqqqqqqqqqqqkBaqqqqqqqqqqqqqqqqqqkVVVVVVVVVVAAAAAGkAaqqqqqqqqqqqqqWqqq" +
    "qqqqqqqqqqqqqqqlAVVVVVVVVVAAAAAABpAGqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpQVVVVVVVVVAAAAAAAAaQBqqqqqqqqqqqqqqqqqqqqqqqqqqq" +
    "qqqqlFVVVVVVVVUAAAAAAAAGkAaqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpBVVVVVVVVVQAAAAAAAABpAGqqqqqqqqqqqqqqqqqqqqqqqqqqqqpQFVVVVV" +
    "VVVVAAAAAAAAAAaQBqqqqqqqqqqqqqqqqqqqqqqqqqqqqVVVVVVVVVVUAAAAAAAAAAAGkAaqqqqqqqqqqqqqqqqqqqqqqqqqqgBVVVVVVVVVAAAAAAAA" +
    "AAAABpAGqqqqqqqqqqqqqqqqqqqqqqqqqpAVVVVVVVVVUAAAAAAAAAAAAAaQBqqqqqqqqqqqqqqqqqqqqqqqqpQFVVVVVVVVVAAAAAAAAAAAAAAGkAaq" +
    "qqqqqqqqqqqqqqqqqqqqqqVEVVVVVVVVVAAAAAAAAAAAAAAABpAGqqqqqqqqqqqqqqqqqqqqqqpRVVVVVVVVVQAAAAAAAAAAAAAAAAaQBqqqqqqqqqqq" +
    "qqqqqqqqqqqQFVVVVVVVVVAAAAAAAAAAAAAAAAAGkAVVVVVVVVVVVVVVVVVVVVVUAVUVVVVVFRQAAAAAAAAAAAAAAAAABpAAAAAAAAAAAAAAAAAAAAAA" +
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAaQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
    "AAAAAAAAAAAAAAAAAAAABpAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAalVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV" +
    "VVVVVVVVVVVaqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqg==";
  /* the four tones as RGB, the same values as the page's CSS */
  var TONES = [[0x1f, 0x2a, 0x14], [0x4a, 0x5a, 0x32], [0x7d, 0x8a, 0x58], [0xa3, 0xad, 0x7e]];
  /* into a canvas with putImageData only (drawImage from a canvas swaps red and blue on Safari) */
  function draw(canvas) {
    if (!canvas || !canvas.getContext) return;
    var g = canvas.getContext("2d");
    if (!g || !g.createImageData) return;
    canvas.width = W; canvas.height = H;
    var img = g.createImageData(W, H), px = img.data, b = atob(PIC), i, t, o;
    for (i = 0; i < W * H; i++) {
      t = TONES[(b.charCodeAt(i >> 2) >> (6 - 2 * (i & 3))) & 3];
      o = i * 4;
      px[o] = t[0]; px[o + 1] = t[1]; px[o + 2] = t[2]; px[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  return { W: W, H: H, draw: draw };
})();
