# Daniel — portfolio and notes

A static site. Pages are plain HTML and one CSS file. You write articles in Markdown, then a small script turns them into the site in `docs/`.

## First time

```bash
npm install
npm run preview
```

Open http://127.0.0.1:8080. `npm run build` only writes the files, without starting the preview.

Fill in your name, email, and links in `site.json`. Leave `linkedin` empty until you have a URL.

## Add an article

Create a folder under `content/posts/`. The folder name becomes the address (`writing/plugin-timeout/`).

```text
content/posts/plugin-timeout/
  index.md
  import-flow.svg
```

`index.md` starts with a header, then normal Markdown:

```md
---
title: Plugin timeout on large imports
date: 2026-10-02
summary: Why a synchronous plugin died on a bulk import, and the async path that fixed it.
---

The import job created thousands of records in one transaction.

![Import flow](import-flow.svg)
```

Put images in that same folder and refer to them by filename. PNG, JPG, GIF, WebP, and SVG all work. The text in square brackets is the caption under the image.

Run `npm run preview` again, read the article, then commit `content/posts/` and the generated `docs/` folder.

## Publish

1. Push this repo to GitHub.
2. In the repo settings, open Pages and set the source to the `docs/` folder on your main branch.
3. The site is served for free at `https://<user>.github.io/<repo>/` (or `https://<user>.github.io/` if the repo is named `<user>.github.io`).

A domain in your name is optional and is the only expected cost. When you have one, add it under Pages → Custom domain. That writes a `CNAME` file into `docs/`. The yearly fee is whatever the registrar charges; the site itself stays free.
