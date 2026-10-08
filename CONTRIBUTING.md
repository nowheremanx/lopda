# Contributing

There are two ways to contribute, and they have different rules.

## A. Submit an app to the registry

1. Copy `sdk/template/` to `registry/apps/<your-app-id>/`.
   The id is lowercase letters, digits and hyphens, 3 to 32 characters.
2. Write your app in `index.html` (one self-contained file) and fill in
   `manifest.json`. Read `SPEC.md` first. Using an AI to write it is fine;
   `sdk/PROMPT.md` is a ready-made prompt.
3. Test it locally with `sdk/dev.html` (open it from a local web server and
   pick your app).
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
- By submitting code to `runtime/` or `tools/`, you license your contribution
  under the **MIT License**. The project then distributes the runtime as a whole
  under PolyForm Noncommercial 1.0.0. See `LICENSING.md` section 4 for why.
- Sign off every commit to certify the Developer Certificate of Origin
  (https://developercertificate.org):

  ```sh
  git commit -s -m "Fix the cutter nudge step"
  ```

- Keep the design rule in mind: a change should remove a decision from the user
  or keep the count the same. Changes that add options need a strong reason.
