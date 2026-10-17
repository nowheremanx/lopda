# Contributing

There are two ways to contribute, and they have different rules.

## 做一个 app / Make an app in 10 minutes

1. Copy `sdk/template/` (or `sdk/template-game/` or `sdk/template-vn/`) to
   `registry/apps/<id>/`. [把模板复制到 app 文件夹。]
2. Or give [`sdk/PROMPT.md`](sdk/PROMPT.md) to an AI assistant and ask it to
   make an app. [也可以把提示词交给 AI 助手，让它写一个 app。]
3. Try it locally: run `python3 -m http.server 8086` from the repo root, then
   open `http://localhost:8086/sdk/dev.html?app=registry/apps/<id>`.
   You can also try it online at
   [nowheremanx.github.io/lopda/sdk/dev.html](https://nowheremanx.github.io/lopda/sdk/dev.html)
   with `?app=registry/apps/<id>` added to the URL.
   [本地试用：在仓库根目录运行 `python3 -m http.server 8086`，再打开上面的链接。
   线上试用：在 GitHub Pages 开发台链接后加上 `?app=registry/apps/<id>`。]
4. Run `node tools/check-app.mjs registry/apps/<id>`, then
   `node tools/build-index.mjs`, and open a PR using the checklist.
   [检查 app、更新目录，再按投稿清单提 PR。]

Reviewers use [`docs/REVIEW.md`](docs/REVIEW.md).

## A. Submit an app to the registry

1. Copy `sdk/template/` to `registry/apps/<your-app-id>/`.
   The id is lowercase letters, digits and hyphens, 3 to 32 characters.
2. Write your app in `index.html` (one self-contained file) and fill in
   `manifest.json`. Read `SPEC.md` first. Using an AI to write it is fine;
   `sdk/PROMPT.md` is a ready-made prompt.
3. Test it locally with `sdk/dev.html` (open it from a local web server and
   pick your app).
   Larger apps may keep their code in `src/*.js` and include each file with
   `<script data-src="src/x.js"></script>`; run `node tools/bundle-app.mjs
   registry/apps/<your-app-id>` to copy the files into `index.html`. Reviewers
   read `src/`; the checker fails when `index.html` is out of date.
4. Run the checker and fix every error:

   ```sh
   node tools/check-app.mjs registry/apps/<your-app-id>
   ```

5. Open a pull request. A maintainer reviews it for content and whether it
   works. Security comes from the sandbox, so reviewers do not need to audit
   every line, but obvious abuse is rejected.
6. After merge, `node tools/build-index.mjs` regenerates `registry/index.json`.

Your app keeps its own license (one of the permissive licenses in
`LICENSING.md`). You keep your copyright.

What gets rejected:

- Anything the checker flags (network access, external resources, colors
  outside the palette, oversized files, a non-permissive license).
- Content that is hateful, sexual, harassing, or that imitates a real brand.
- Apps that are a copy of another registry app with a new name.

## B. Change the runtime, tools or docs

- Open an issue first for anything larger than a bug fix.
- Contributions are licensed under the MIT License, like the rest of the project.

- Keep the design rule in mind: a change should remove a decision from the user
  or keep the count the same. Changes that add options need a strong reason.
