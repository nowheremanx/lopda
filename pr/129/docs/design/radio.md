# 设计草稿：电波台（内置声波通信）

状态：**M2 已实现，M3 已实现**（2026-10-29，runtime 0.49.0）。M4（文本）未做。
产品定位：不是 `Acoustic Lab` 调试页，而是一台双机、离线、点对点的“电波台”。`experiments/acoustic-lab` 继续作为调参和回归台。

## 1. 为什么是内置程序

商店 app 跑在 `sandbox="allow-scripts"` 的 iframe 里，源是 opaque origin，浏览器拒绝 `getUserMedia`。
在 iPhone 16 / 13 Pro 上实测是 `NotAllowedError`；只加 `allow="microphone"` 仍然拒绝；加 `allow-same-origin` 能开，
但会破坏商店 app 的隔离。`PAD.mic` 只给 `{level, pitch}`（20 Hz，50–1500 Hz），不够 4-FSK。

内置程序在 runtime 自己的源里运行，可以直接拿原始麦克风、FFT 和 AudioBuffer。因此第一版把声波通信做成内置程序，
商店版以后如果需要，再用 `PAD.acoustic` 的符号级桥接（不暴露原始 PCM）。

## 2. 模块

```
runtime/acoustic.js       纯函数：4-FSK 符号、前导码、合成、同步、已知序列解码
runtime/acoustic-link.js  纯函数：帧、CRC-16、HELLO/DATA/ACK/NACK/FIN
runtime/apps/radio.js     内置“电波台”：麦克风、扬声器、握手、收/发/仪表和日志
tests/acoustic.test.mjs   符号映射、各速率、噪声、静音、截断、定时
tests/acoustic-link.test.mjs  帧、CRC、各类型经过调制解调
```

`acoustic.js` 不碰 DOM 或 Web Audio；它可以在 Node 里直接测。`radio.js` 只做 I/O 和界面。

## 3. M2 的调制与同步

| 项 | 值 |
|---|---|
| 调制 | 4-FSK |
| 音调 | 1500 / 2500 / 3500 / 4500 Hz |
| 符号 | 2 bit；一个字节四个符号，MSB pair 在前 |
| 默认速率 | 10 ms（两台 iPhone 双向都稳；5 ms 视扬声器音量） |
| 前导/同步 | 16 符号：`0 3 0 3 0 3 0 3 1 2 0 3 3 0 2 1` |
| 速率 | 40 / 20 / 10 / 5 ms |
| 发射 | 相位连续的 sine，150 ms 静音前后；一个 AudioBuffer |
| 接收 | 宿主 `getUserMedia`，ScriptProcessor 收 PCM，离线在最后 8 秒搜索同步 |
| 同步 | 1/8 符号网格上的相关，最佳 12/16 后在半/四分之一格内细化 |
| 判决 | 最高/次高 ≥ 6 dB，RMS > −60 dBFS；否则擦除 |
| 解码 | 已知测试序列：符号错误、字节错误、擦除、goodput |
| 帧 | 版本 1、类型、会话 2、序号 2、长度 2、payload、CRC-16 |
| 速率协商 | 10 / 20 / 40 ms 自动握手；5 ms 手动 |
| 可靠传输 | Stop-and-wait，ACK/NACK，3 次 DATA 重试，FIN |

位序示例：`0xB4 = 10 11 01 00 → [2,3,1,0]`。

M2 的接收是“采一段，再解码”，不是持续跟踪。前导码给出起点；一个 burst 内的时钟漂移可以忽略。

## 3.1 M3 握手和可靠链路

- 发送端先用 **10 ms** 发 `HELLO`；接收端在 3.2 秒的采集窗口里同时尝试 10/20/40 ms，解出后用同一速率回
  `HELLO_ACK`。发送端在 10 ms 上等 4.8 秒；没有 ACK 就改发 20 ms，再 40 ms。这样 HELLO 和 ACK 两个方向都被
  验证过，选出的就是双向都能用的最快档。
- 选定速率后，发送端发一个 `DATA`（M3 用 16 字节测试 payload），接收端校验 CRC 后回 `ACK`；失败回 `NACK`，
  发送端最多重试 3 次。最后 `FIN`/`ACK`。会话 ID 和序号在每一帧里，旧 ACK 不会确认新帧。
- 半双工：发送 burst 时停麦克风，等 ACK 时停发送。一次链路用同一速率；5 ms 不参与自动握手。
- M3 的接收端在每次 burst 前重新打开麦克风；没有做持续符号时钟，也没有在 ACK 丢失时自动重新握手（M5 的
  退避/重连）。这是当前已知限制。

## 4. 界面

- **发报**：自动握手（M3）或手动测试（M2）；速率/测试序列、十六进制预览、握手/ACK/重试进度。
- **收报**：等待连接（M3）或手动接收（M2）；握手、CRC、ACK、收到与期望的十六进制。
- **仪表**：收到/期望的符号色块、置信度条、日志。
- 自动模式：一台点“等待连接”，另一台点“连接并发送”。手动模式：两台选同样的速率和测试序列，
  先点收报，再点发报。
- 发送时停麦克风；接收时停发送。打开麦克风期间静音键不起作用，状态栏有监听记号。

## 5. 已验证

- `node --test tests/acoustic.test.mjs`：48 kHz 和 44.1 kHz × 40/20/10/5 ms 全部 0 符号错误；噪声、静音、截断、
  定时偏移各有用例。
- 浏览器假麦克风：内置 app 在 40/10/5 ms 都得到 `Sync 16/16`、`0/64` 符号错误、`0/16` 字节错误；
  goodput 分别约 40 / 160 / 320 bit/s。
- M3 帧/CRC：`tests/acoustic-link.test.mjs` 覆盖所有类型、CRC 错误、长度错误，以及 10/20/40 ms 经过
  `acoustic.js` 合成/解码的往返。
- 真机 M2 双机测试（2026-10-29，iPhone 16 + 13 Pro）：
  - 16 → 13 Pro：5 ms 完美。
  - 13 Pro → 16：5 ms 有错，10 ms 完美。
  - 外放、音量足够时 5 ms 可用；确认声音从底部外放出来。提高发射电平（0.55 → 0.9）和强制 `"playback"` 后，结果没有明显变化。
  - 方向差异更像 **接收端**：13 Pro 的话筒能从 16 的 5 ms 信号里正确解码，而 16 接 13 Pro 时需要 10 ms。不是 13 Pro 扬声器的问题。
  - 因此内置 app 默认 10 ms；5 ms 保留给链路很好的一对。
  - 同一套解码器在两个方向结果不同，说明是声学/话筒差异，不是解码逻辑的方向性。

## 6. 下一步

- **M3 真机**：两台 iPhone 跑自动握手 + 16 字节 DATA，记录选定速率、ACK、重试和失败。
- **M4**：文本 UTF-8 分片、按序重组、发送/接收消息列表；帧的 `Type` 先支持 TEXT，之后加 BINARY。
  多帧时仍用 Stop-and-wait，序号递增。
- **M5**：速率/距离/误码统计；图片/文件按链路实际吞吐再决定，4-FSK 40 ms 的 50 bit/s 不适合直接传图。
- 商店版：如果确实需要，设计 `PAD.acoustic`（符号级，不暴露 PCM）；不要为了它给商店 iframe 开 `allow-same-origin`。
