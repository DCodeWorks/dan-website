import { createReadStream, statSync } from "node:fs";
import { mkdir, readdir, readFile, copyFile, writeFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";

const root = path.dirname(fileURLToPath(import.meta.url));
const docsDir = path.join(root, "docs");
const postsDir = path.join(root, "content", "posts");

const marked = new Marked({ gfm: true });
marked.use({
  renderer: {
    image({ href, text }) {
      const src = escapeHtml(href ?? "");
      const alt = escapeHtml(text ?? "");
      return `<figure><img src="${src}" alt="${alt}"><figcaption>${alt}</figcaption></figure>`;
    },
    paragraph(token) {
      const text = this.parser.parseInline(token.tokens);
      if (text.startsWith("<figure>") && text.endsWith("</figure>")) return `${text}\n`;
      return `<p>${text}</p>\n`;
    },
  },
});

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parsePost(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    throw new Error("Post is missing a header block wrapped in --- lines.");
  }

  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const splitAt = line.indexOf(":");
    if (splitAt === -1) continue;
    const key = line.slice(0, splitAt).trim();
    const value = line.slice(splitAt + 1).trim();
    meta[key] = value;
  }

  for (const key of ["title", "date", "summary"]) {
    if (!meta[key]) {
      throw new Error(`Post header is missing ${key}.`);
    }
  }

  return { ...meta, body: match[2].trim() };
}

function formatDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function layout({ site, title, description, depth, current, body }) {
  const prefix = depth === 0 ? "" : "../".repeat(depth);
  const home = prefix === "" ? "./" : prefix;
  const writing = `${prefix}writing/`;
  const contact = `${prefix}contact/`;

  const item = (href, label, id) => {
    const currentAttr = current === id ? ' aria-current="page"' : "";
    return `<li><a href="${href}"${currentAttr}>${label}</a></li>`;
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="stylesheet" href="${prefix}css/style.css">
</head>
<body>
  <div class="wrap">
    <header class="site-header">
      <nav aria-label="Site">
        <ul class="nav">
          ${item(home, "Home", "home")}
          ${item(writing, "Writing", "writing")}
          ${item(contact, "Contact", "contact")}
        </ul>
      </nav>
    </header>
    <main>
${body}
    </main>
    <footer class="site-footer">
      <a href="${contact}">Contact ${escapeHtml(site.name)}</a>
    </footer>
  </div>
</body>
</html>
`;
}

function postList(posts, depth) {
  const prefix = depth === 0 ? "writing/" : "";
  if (posts.length === 0) {
    return "<p>No notes yet.</p>";
  }

  const items = posts
    .map(
      (post) => `<li>
        <a href="${prefix}${post.slug}/">${escapeHtml(post.title)}</a>
        <time datetime="${escapeHtml(post.date)}">${escapeHtml(formatDate(post.date))}</time>
        <p>${escapeHtml(post.summary)}</p>
      </li>`
    )
    .join("\n");

  return `<ul class="posts">\n${items}\n</ul>`;
}

async function loadPosts() {
  let entries = [];
  try {
    entries = await readdir(postsDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const posts = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(postsDir, entry.name);
    const file = path.join(dir, "index.md");
    const raw = await readFile(file, "utf8");
    let parsed;
    try {
      parsed = parsePost(raw);
    } catch (error) {
      throw new Error(`${entry.name}: ${error.message}`);
    }
    posts.push({ slug: entry.name, dir, ...parsed });
  }

  posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return posts;
}

async function copyPostAssets(post) {
  const target = path.join(docsDir, "writing", post.slug);
  await mkdir(target, { recursive: true });
  const files = await readdir(post.dir);
  for (const name of files) {
    if (name === "index.md") continue;
    const from = path.join(post.dir, name);
    const info = await stat(from);
    if (!info.isFile()) continue;
    await copyFile(from, path.join(target, name));
  }
}

async function build() {
  const site = JSON.parse(await readFile(path.join(root, "site.json"), "utf8"));
  const posts = await loadPosts();

  await mkdir(path.join(docsDir, "css"), { recursive: true });
  await mkdir(path.join(docsDir, "writing"), { recursive: true });
  await mkdir(path.join(docsDir, "contact"), { recursive: true });
  await copyFile(path.join(root, "css", "style.css"), path.join(docsDir, "css", "style.css"));

  const homeBody = `      <h1>${escapeHtml(site.name)}</h1>
      <p class="role">${escapeHtml(site.role)}</p>
      <p>${escapeHtml(site.intro)}</p>
      <p>${escapeHtml(site.freelance)} <a href="contact/">Get in touch</a>.</p>
      <h2>Latest notes</h2>
      ${postList(posts.slice(0, 5), 0)}`;

  const writingBody = `      <h1>Writing</h1>
      <p>Notes on Dynamics 365 problems, written so I can find them again.</p>
      ${postList(posts, 1)}`;

  const contactBits = [`<p><a href="mailto:${escapeHtml(site.email)}">${escapeHtml(site.email)}</a></p>`];
  if (site.linkedin) {
    contactBits.push(
      `<p><a href="${escapeHtml(site.linkedin)}">LinkedIn</a></p>`
    );
  }
  if (site.location) {
    contactBits.push(`<p>${escapeHtml(site.location)}</p>`);
  }
  const contactBody = `      <h1>Contact</h1>
      <p>For a freelance Dynamics 365 project, email me.</p>
      ${contactBits.join("\n      ")}`;

  await writeFile(
    path.join(docsDir, "index.html"),
    layout({
      site,
      title: `${site.name} — ${site.role}`,
      description: site.intro,
      depth: 0,
      current: "home",
      body: homeBody,
    })
  );

  await writeFile(
    path.join(docsDir, "writing", "index.html"),
    layout({
      site,
      title: `Writing — ${site.name}`,
      description: "Notes on Dynamics 365 development.",
      depth: 1,
      current: "writing",
      body: writingBody,
    })
  );

  await writeFile(
    path.join(docsDir, "contact", "index.html"),
    layout({
      site,
      title: `Contact — ${site.name}`,
      description: `Contact ${site.name} about Dynamics 365 freelance work.`,
      depth: 1,
      current: "contact",
      body: contactBody,
    })
  );

  for (const post of posts) {
    await copyPostAssets(post);
    const html = await marked.parse(post.body);
    const body = `      <article>
        <h1>${escapeHtml(post.title)}</h1>
        <time class="post-date" datetime="${escapeHtml(post.date)}">${escapeHtml(formatDate(post.date))}</time>
        <div class="content">
${html}
        </div>
      </article>`;
    await writeFile(
      path.join(docsDir, "writing", post.slug, "index.html"),
      layout({
        site,
        title: `${post.title} — ${site.name}`,
        description: post.summary,
        depth: 2,
        current: "writing",
        body,
      })
    );
  }

  console.log(`Built ${posts.length} post${posts.length === 1 ? "" : "s"} into docs/`);
}

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

function fileInsideDocs(pathname) {
  const rel = decodeURIComponent(pathname).replace(/^[/\\]+/, "");
  const file = path.resolve(docsDir, rel);
  const relative = path.relative(docsDir, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return file;
}

function startPreview() {
  const port = 8080;
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    const file = fileInsideDocs(url.pathname);
    if (!file) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }

    let target = file;
    try {
      const info = statSync(file);
      if (info.isDirectory()) {
        if (!url.pathname.endsWith("/")) {
          res.writeHead(302, { Location: `${url.pathname}/` });
          res.end();
          return;
        }
        target = path.join(file, "index.html");
        statSync(target);
      }
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const type = types[path.extname(target).toLowerCase()] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    createReadStream(target).pipe(res);
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`Preview at http://127.0.0.1:${port}`);
  });
}

await build();
if (process.argv.includes("--preview")) startPreview();
