# Lo-PDA Acoustic Lab · M1 Tone Lab

这是声波通信项目的 **M1**：只验证音调发送、麦克风采集、实时频谱和四音调检测。
**不包含**符号定时、帧同步、CRC、ACK/重传或文本传输；这些从 M2 开始。

> **M2 已开始。** 产品方向已经改为内置的 **电波台**（`runtime/apps/radio.js`），M2 的
> 4-FSK 符号引擎在 `runtime/acoustic.js`，设计见 `docs/design/radio.md`。本页继续保留为调参/回归台。

```
experiments/acoustic-lab/
  index.html    自包含实验页（无依赖、无网络、无存储）
  serve.mjs     手机测试用的 HTTPS 服务（自签名证书，生成在 ~/.cache）
  verify.mjs    Chromium + 假麦克风的自动验证
  RESULTS.md    已经跑过的结果，以及还没跑的真机项
```

## 为什么是独立顶层页，而不是商店 app

Lo-PDA 的 app 运行在：

```html
<iframe sandbox="allow-scripts">
```

这个 iframe 没有 `allow="microphone"`，而且 `sandbox` 不带 `allow-same-origin`，源是 opaque origin。
实测（Chromium 156，页面内“沙箱麦克风探测”）：

- `sandbox="allow-scripts"` → `getUserMedia` 失败：`SecurityError: Invalid security origin`
- 再加 `allow="microphone"` → 仍然失败
- 加 `allow-same-origin` → 才能打开麦克风，但这会让 app 能访问宿主页面，不能作为商店 app 的默认方案

所以 M1 按 SPEC 3.2 先做顶层测试页。M2 之前要决定：由宿主提供原始音频/频谱桥接、把声学通信做成系统级页面，或调整 iframe 的源与权限策略。

## 跑起来

### 电脑（最快）

在仓库根目录：

```sh
python3 -m http.server 8086
# 打开 http://localhost:8086/experiments/acoustic-lab/
```

`localhost` 是安全上下文，麦克风可用。点“开始监听麦克风”，允许浏览器权限。

### 手机：Cloudflare 临时 HTTPS（推荐，和仓库 README 一样）

不需要证书、账号或手机设置。仓库根目录开两个终端：

```sh
# 1. 静态服务器。用 127.0.0.1 明确指向 IPv4，避免 localhost 走到别的 IPv6 服务
python3 -m http.server 8086 --bind 127.0.0.1

# 2. Cloudflare quick tunnel（如未安装：brew install cloudflared）
cloudflared tunnel --url http://127.0.0.1:8086 --no-autoupdate
```

第二条命令会打印：

```
https://<随机名>.trycloudflare.com
```

手机直接打开：

```
https://<随机名>.trycloudflare.com/experiments/acoustic-lab/
```

这是受信任的 HTTPS，Safari 会正常弹麦克风权限。quick tunnel 只在命令运行期间有效；实验页本身仍然完全离线，不使用 Cloudflare 或任何网络 API，tunnel 只是开发时的 HTTPS 入口。

如果 8086 已被别的服务占用，换一个端口，例如：

```sh
python3 -m http.server 8091 --bind 127.0.0.1
cloudflared tunnel --url http://127.0.0.1:8091 --no-autoupdate
```

### 手机：局域网自签名 HTTPS（没有 cloudflared 时）

```sh
node experiments/acoustic-lab/serve.mjs
```

终端会打印 `https://192.168.x.x:8443/...` 和证书下载地址。证书需要安装并在 iPhone 的“证书信任设置”里完全信任；局域网 IP 变了要删掉 `~/.cache/lopda-acoustic-lab` 重新生成。能用 Cloudflare 时优先用上面的方式。

注意：不要用 `http://192.168.x.x` 直接打开。那不是安全上下文，Safari 会拒绝 `getUserMedia`。

## 页面怎么用

- **开始监听麦克风 / 停止监听**：麦克风只在点击后打开，停止按钮随时可用；切走页面或锁屏会自动关闭。
- **频谱**：2048 点 FFT，显示 0–6 kHz；四个虚线标记是 1500 / 2500 / 3500 / 4500 Hz。
- **CONF / SNR / LEVEL**：CONF 是最高音调与第二高音调的 dB 差；SNR 是与保护频段（600/900/2/3/4/5/5.8 kHz）中位数的差；LEVEL 是 30 ms 窗口的 RMS。
- **四根能量条**：每个候选频率的 Goertzel 能量（相对最高值归一化）。
- **RX 色块**：最近检测到的音调序列；`·` 表示擦除/无信号。
- **1–4 音调按钮**：单独播放 420 ms 的某个音调，用来听扬声器和看频谱。
- **播放四音**：依次播放 1→2→3→4，每音 420 ms。麦克风开着时可以同时观察 RX。
- **回声自测**：播放 `1 2 3 4 2 1 4 3`（每音 240 ms + 160 ms 间隔），用麦克风收回并比对。7/8 以上通过。手机平放、音量 40% 以上、环境安静时最容易通过。
- **环境与诊断**：安全上下文、AudioContext 状态/采样率/延迟、audioSession、轨道实际参数（回声消除/降噪/AGC）、FFT 分辨率、最近的检测统计、沙箱探测结果。
- **DSP 自检**：不经过麦克风，用纯合成正弦 + 噪声验证 Goertzel 判决，应该 4/4。
- **生成报告**：把环境、最后一次自测、日志写成可复制的文本，用于记录两台手机的结果。

## 当前参数

| 项 | 值 |
|---|---|
| 调制 | 4-FSK（M1 只做音调，不做符号定时） |
| 频率 | 1500 / 2500 / 3500 / 4500 Hz |
| 符号时长 | 40 ms（M1 的目标参数；页面按钮的试听时长更长） |
| 检测 | 30 ms Hann 窗 + Goertzel；每 20 ms 分析一次 |
| 判决 | 最高/次高 ≥ 6 dB、与保护频段 ≥ 8 dB、RMS > −60 dBFS |
| 擦除 | 不满足条件时显示 `—`，不强行猜 |
| 可视化 | 2048 点 FFT，0–6 kHz，约 30 fps；与检测定时解耦 |
| 输出 | 单个 OscillatorNode + 增益包络，提前排程；6–10 ms 淡入淡出 |

这些是实验起点，不是已经证明的最佳值。M1 的真机结果会决定 M2 是否继续用 4500 Hz 和最小时长。

## 自动验证

```sh
# 仓库根目录已有 playwright 时
node experiments/acoustic-lab/verify.mjs

# 或者指向任意一份 playwright
PLAYWRIGHT_DIR=/path/to/node_modules/playwright node experiments/acoustic-lab/verify.mjs
```

脚本会：

1. 生成一段已知四音 WAV，作为 Chromium 的假麦克风输入；
2. 打开页面并点击“开始监听”；
3. 检查安全上下文、AudioContext、采样率、FFT 分辨率；
4. 检查四个音调都被检测到；
5. 跑合成 DSP 自检（4/4）；
6. 逐个播放四个音调，检查输出端的 post-gain analyser 峰值；
7. 在页面里创建与 Lo-PDA 相同的 sandbox iframe，尝试麦克风；
8. 检查停止按钮确实关闭麦克风。

它验证的是页面代码、DSP 和音频图，**不验证手机扬声器/麦克风的真实声学链路**。后者要用页面里的“回声自测”在两台真机上做。

## M1 通过标准

2026-10-29 已在 iPhone 16 + iPhone 13 Pro（iOS 18.7，Safari 27.0.1）上通过，两台“回声自测”都是 8/8。

- [x] 目标手机在 HTTPS 下能获得麦克风权限，页面显示 `MIC ON`。
- [x] 点 1–4 音调按钮，能听到对应声音；频谱在对应频率出现明显峰。
- [x] 两台手机靠近时，A 播放四音，B 的频谱和音调读数跟随；反过来也可以。
- [x] 单机“回声自测”≥ 7/8；两台手机互相播放时也能稳定看到四个音调。
- [x] 停止监听后系统麦克风指示灯熄灭；切走页面/锁屏后监听停止。
- [x] “生成报告”能复制出一份包含环境和结果的文本。

通过后再进入 M2（4-FSK 符号编解码、同步和符号定时）。M1 不实现帧、CRC、ACK 或文本。

## 已知限制

- 独立页不是商店 app：原因见上。M2 前必须先定宿主方案。
- 手机扬声器对 4.5 kHz 的响应、麦克风 AGC、回声消除、机身遮挡都会影响检测；页面会显示实际轨道参数，不能假定约束生效。
- iOS 的 `navigator.audioSession` 在监听时设为 `play-and-record`（`ambient` 下 iOS 会拒绝采集）；停止后设回 `ambient`。监听期间静音键不影响声音。
- 麦克风权限被拒绝、页面不是 HTTPS、AudioContext 被挂起时，页面会明确显示原因；不会静默继续。
- 桌面 macOS 上直接用真实麦克风做扬声器回声测试时，系统 TCC 可能给浏览器返回静音流；自动验证因此使用假麦克风文件。真机结果以手机页面为准。
- 不写入 localStorage/IndexedDB，不上传任何音频；报告只在本页文本框里。

## M2：内置电波台

打开 `runtime/`，首页点 **电波台 / Radio**。两台手机选同样的速率和测试序列：

1. 一台点“收报 → 接收并解码”。
2. 另一台点“发报 → 发送测试序列”。
3. 收报端显示 `Sync 16/16`、`符号错误 0/64`、`字节错误 0/16` 即通过。

M2 只传已知测试序列，没有帧、CRC 或 ACK；文本和任意字节是 M3/M4。速率可选 40 / 20 / 10 / 5 ms。
发送时麦克风关闭，接收时发送关闭；打开麦克风期间静音键不起作用。

```sh
node --test tests/acoustic.test.mjs
```

覆盖符号位序、48 kHz / 44.1 kHz × 四个速率、噪声、静音、截断和定时偏移。
