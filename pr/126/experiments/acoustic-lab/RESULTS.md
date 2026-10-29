# M1 results

Date: 2026-10-28 (local). M1 is **code complete**; the two-phone hardware sign-off is still open.

## 1. Automated Chromium: fake microphone with known tones — PASS

Command:

```sh
PLAYWRIGHT_DIR=/path/to/node_modules/playwright \
  node experiments/acoustic-lab/verify.mjs
```

Environment: Playwright Chromium 156.0.8078.4, macOS, `--use-fake-device-for-media-stream`
plus a generated 48 kHz WAV on the fake microphone.

| Check | Result |
|---|---|
| secure context / top-level page | pass |
| Web Audio API, `getUserMedia` present | pass |
| AudioContext after click | `running`, 48000 Hz |
| FFT | 2048 points, 23.4 Hz/bin |
| 1500 Hz detected | 71 analysis windows |
| 2500 Hz detected | 60 |
| 3500 Hz detected | 36 |
| 4500 Hz detected | 37 |
| synthetic DSP self-check | 4/4 |
| oscillator output peak, tone 1 | 1500 Hz |
| tone 2 | 2496 Hz |
| tone 3 | 3504 Hz |
| tone 4 | 4500 Hz |
| stop button closes the mic | pass |
| sandboxed iframe microphone | **blocked**: `SecurityError: Invalid security origin` |

The sandbox block is expected and is the reason the lab is a top-level page (SPEC 3.2).

## 2. Sandbox policy matrix (Chromium, same parent permission)

Each row creates an iframe with `srcdoc` and calls `getUserMedia({audio:true})`:

| iframe | result |
|---|---|
| `sandbox="allow-scripts"` (what Lo-PDA uses) | blocked, `SecurityError` |
| `sandbox="allow-scripts" allow="microphone"` | blocked, `SecurityError` |
| `sandbox="allow-scripts allow-same-origin"` | allowed |
| `sandbox="allow-scripts allow-same-origin" allow="microphone"` | allowed |
| no sandbox, no allow | allowed |
| no sandbox, `allow="microphone"` | allowed |

Conclusion for the host decision: adding `allow="microphone"` alone is not enough; the iframe
needs a non-opaque origin. `allow-scripts allow-same-origin` is not acceptable for untrusted store
apps. M2 therefore needs one of: a host-side audio/FFT bridge, a separate-origin app host with its
own permission policy, or a system-level acoustic page.

## 3. WebKit engine check — page and DSP pass, mic not available in headless

Playwright WebKit 27.2, headless, localhost:

- page loads with no JS errors;
- secure context, AudioContext present;
- oscillator output graph peak 3504 Hz for the 3500 Hz tone;
- synthetic DSP self-check 4/4;
- `getUserMedia` resolves `NotAllowedError` in headless WebKit (no test device), as expected.
  This is not an iPhone result; it only checks the page in a Safari-family engine.

## 4. Cloudflare quick tunnel access — PASS

The same page was opened through a `cloudflared` quick tunnel
(`python3 -m http.server 8091 --bind 127.0.0.1` + `cloudflared tunnel --url http://127.0.0.1:8091`):

| Check | Result |
|---|---|
| trusted HTTPS / secure context | true |
| page top-level | true |
| microphone after click | on |
| sample rate | 48000 Hz |
| known-tone counts | 71 / 37 / 37 / 37 |
| DSP self-check | 4/4 |

This is the recommended phone entry point because it needs no certificate install. A tunnel is a
development convenience only: the page itself makes no network requests and works offline.

## 5. Desktop acoustic loopback attempt — inconclusive

Headed Chromium and installed Chrome on this Mac opened a real microphone
(`MIC ON`), but the captured samples were silence (`−180 dBFS`), so the loopback self-test
was 0/8. The likely cause is macOS TCC not granting audio capture to the browser in this
session; it is not evidence that the page or the phone hardware fails.

The page's own oscillations were visible on the post-gain analyser at the expected frequencies,
so the output graph is correct. The actual speaker→air→microphone path still needs the phone pass.

## 6. Phone pass — PASS (owner, 2026-10-29)

Two real iPhones, both through the Cloudflare quick tunnel, both on iOS 18.7 and Safari 27.0.1
(`Version/27.0.1 Mobile/15E148 Safari/604.1`):

| | iPhone 16 | iPhone 13 Pro |
|---|---|---|
| secure / top-level | true / true | true / true |
| audio | running, 48000 Hz | running, 48000 Hz |
| audioSession | `play-and-record` | `play-and-record` |
| detected counts (1.5/2.5/3.5/4.5k) | 40 / 77 / 42 / 78 | 79 / 81 / 66 / 76 |
| self-test | **8/8 PASS** | **8/8 PASS** |
| self-test minimum separation | 34.1 dB | 53.8 dB |
| self-test maximum separation | 59.6 dB | 63.6 dB |
| DSP self-check | 4/4 | 4/4 |
| sandbox microphone | **BLOCKED `NotAllowedError`** | **BLOCKED `NotAllowedError`** |

iPhone 13 Pro's speaker was slightly quieter, but its self-test margins were actually higher.
The lower margins seen in the live four-tone log (iPhone 16: 4500 Hz at 8.8 dB; iPhone 13 Pro:
1500/2500 Hz at 7.0/8.5 dB) came from transitions, room noise or the two phones playing near each
other, not from steady tones: every self-test tone was decoded with at least 34 dB separation.

The target-browser sandbox result is the same as desktop Chromium: the Lo-PDA app iframe cannot get
raw microphone audio. On iOS it fails with `NotAllowedError` rather than `SecurityError`.

**M1 is signed off.** The gate for M2 (4-FSK symbol coding, sync and symbol timing) is met.

### M2 notes from this pass

- Keep the fixed 6 dB separation gate for steady tones, but do not assume transitions are clean:
  the four-tone log shows 7–9 dB at boundaries. M2 needs an explicit erasure/guard region around
  symbol edges, not a forced decision.
- Both phones report 48 kHz and `play-and-record`; 4500 Hz works well enough at this distance.
- The 13 Pro's lower speaker volume did not hurt detection, but M2 should still use relative
  candidate energy rather than an absolute amplitude threshold.

## 7. M2 built-in Radio (电波台) — synthetic PASS, two phones pending

The M2 modem moved into the runtime:

- `runtime/acoustic.js`: pure 4-FSK symbol/synth/decode functions
- `runtime/apps/radio.js`: built-in 电波台, send/receive/scope
- `tests/acoustic.test.mjs`: 7 tests, all pass

Engine round-trip (48 kHz and 44.1 kHz, 40/20/10/5 ms), no noise:

| sample rate | rates | result |
|---|---|---|
| 48000 | 40 / 20 / 10 / 5 ms | `sync 16/16`, 0 symbol errors, 0 byte errors |
| 44100 | 40 / 20 / 10 / 5 ms | `sync 16/16`, 0 symbol errors, 0 byte errors |

Noisy (σ ≈ 0.006) 40 ms and 10 ms also pass; silence/short/truncated bursts do not invent a frame.

Browser end-to-end with a generated WAV on the fake microphone, through the real built-in app:

| rate | sync | symbol errors | byte errors | goodput |
|---|---|---|---|---|
| 40 ms | 16/16 | 0/64 | 0/16 | 40 bit/s |
| 10 ms | 16/16 | 0/64 | 0/16 | 160 bit/s |
| 5 ms | 16/16 | 0/64 | 0/16 | 320 bit/s |

The real two-phone M2 pass is not done yet. M3 (frames, CRC, ACK) and M4 (text) are next.
