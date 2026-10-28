import { spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename } from "node:path";

const pkg = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const tag = process.argv[2] || `v${pkg.version}`;
if (tag !== `v${pkg.version}`)
  throw new Error("Release tag must match package.json version");
const repo = "jaesmade/Screen-Assistant";
const executable = `dist/Study-Desk-${pkg.version}-Setup-x64.exe`;
const files = [executable, "dist/SHA256SUMS.txt"];
async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
const digest = await sha256(executable);
await writeFile(files[1], `${digest}  ${basename(executable)}\n`);
const notes = await readFile(
  new URL(`../docs/releases/${tag}.md`, import.meta.url),
  "utf8",
);
const revision = spawnSync("git", ["rev-parse", `${tag}^{commit}`], {
  encoding: "utf8",
});
if (revision.status !== 0)
  throw new Error("Create and push the release tag before publishing");
let token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token) {
  const credential = spawnSync("git", ["credential", "fill"], {
    input: `protocol=https\nhost=github.com\npath=${repo}.git\n\n`,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "Never" },
  });
  if (credential.status === 0)
    token = credential.stdout
      .split(/\r?\n/)
      .find((line) => line.startsWith("password="))
      ?.slice(9);
}
if (!token)
  throw new Error(
    "No GitHub publishing credential is available. Sign in with Git Credential Manager or set GH_TOKEN.",
  );
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};
async function api(path, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });
  if (response.status === 404) return null;
  const value = await response.json();
  if (!response.ok)
    throw new Error(
      `GitHub returned ${response.status}: ${value.message || "Request failed"}`,
    );
  return value;
}
let release = await api(`/releases/tags/${encodeURIComponent(tag)}`);
if (release && !release.draft)
  throw new Error(
    "A published release already exists for this tag; refusing to replace its assets",
  );
if (!release)
  release = await api("/releases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tag_name: tag,
      target_commitish: revision.stdout.trim(),
      name: `Study Desk ${pkg.version}`,
      body: notes,
      draft: true,
      prerelease: false,
    }),
  });
for (const file of files) {
  const name = basename(file),
    size = (await stat(file)).size,
    hash = await sha256(file);
  console.log(`Uploading ${name} (${(size / 1024 / 1024).toFixed(1)} MiB)`);
  const existing = (await api(`/releases/${release.id}/assets`)).find(
    (asset) => asset.name === name,
  );
  if (existing) {
    if (existing.size !== size || existing.digest !== `sha256:${hash}`)
      throw new Error(`Draft asset ${name} differs from the local build`);
    continue;
  }
  const upload = new URL(release.upload_url.replace(/\{.*$/, ""));
  if (upload.origin !== "https://uploads.github.com")
    throw new Error("Unexpected GitHub upload host");
  upload.searchParams.set("name", name);
  const response = await fetch(upload, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/octet-stream",
      "Content-Length": String(size),
    },
    body: createReadStream(file),
    duplex: "half",
  });
  const asset = await response.json();
  if (!response.ok)
    throw new Error(`Installer upload failed (${response.status})`);
  if (
    asset.size !== size ||
    (asset.digest && asset.digest !== `sha256:${hash}`)
  )
    throw new Error("Uploaded asset verification failed");
}
release = await api(`/releases/${release.id}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ draft: false, make_latest: "true" }),
});
console.log(
  JSON.stringify(
    {
      url: release.html_url,
      tag,
      commit: revision.stdout.trim(),
      assets: release.assets.map((asset) => ({
        name: asset.name,
        size: asset.size,
        digest: asset.digest,
        url: asset.browser_download_url,
      })),
    },
    null,
    2,
  ),
);
