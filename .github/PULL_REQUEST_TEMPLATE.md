## App submission

- [ ] One folder `registry/apps/<id>/` with `manifest.json` and `index.html`. [一个 `registry/apps/<id>/` 文件夹，含这两个文件。]
- [ ] `node tools/check-app.mjs registry/apps/<id>` passes. [检查通过。]
- [ ] Ran `node tools/build-index.mjs`; `registry/index.json` is updated. [已运行，目录已更新。]
- [ ] Art, sound and music are original, or public domain with the source named next to it. [素材原创；公有领域素材注明来源。]
- [ ] License is MIT, 0BSD, BSD-2-Clause, BSD-3-Clause, ISC, Apache-2.0, CC0-1.0 or Unlicense. [使用允许的许可证。]
- [ ] If the app uses tilt or the microphone, it is playable with keys too. [用倾斜或麦克风时，也能用按键玩。]
- [ ] Tested at 331×359 (`sdk/UI.md`). [已在 331×359 测试。]
- [ ] Declares only the permissions it needs. [只声明必要权限。]

Review checklist: [`docs/REVIEW.md`](../docs/REVIEW.md).

## Other changes

Describe non-app changes and how you tested them. [非 app 改动及测试方式。]
