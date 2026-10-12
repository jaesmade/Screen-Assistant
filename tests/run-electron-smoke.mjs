import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = await mkdtemp(join(tmpdir(), "study-desk-smoke-"));
const environment = { ...process.env, STUDY_DESK_SMOKE_DIR: directory };
delete environment.ELECTRON_RENDERER_URL;
delete environment.ELECTRON_RUN_AS_NODE;
try {
  const electronPath = createRequire(import.meta.url)("electron");
  const child = spawn(
    electronPath,
    [fileURLToPath(new URL("./electron-smoke.cjs", import.meta.url))],
    { env: environment, stdio: "inherit" },
  );
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  process.exitCode = code;
} finally {
  // Remove only the test directory created above, after Electron releases it.
  if (
    dirname(resolve(directory)) !== resolve(tmpdir()) ||
    !basename(directory).startsWith("study-desk-smoke-")
  ) {
    throw new Error("Unexpected smoke-test directory; refusing cleanup.");
  }
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
