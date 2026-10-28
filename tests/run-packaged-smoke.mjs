import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
const directory = await mkdtemp(join(tmpdir(), "study-desk-packaged-"));
const environment = { ...process.env, STUDY_DESK_PACKAGED_TEST_DIR: directory };
delete environment.ELECTRON_RUN_AS_NODE;
delete environment.ELECTRON_RENDERER_URL;
delete environment.STUDY_DESK_SMOKE_DIR;
const executable = resolve(
  process.argv[2] || "dist/win-unpacked/Study Desk.exe",
);
try {
  const child = spawn(executable, [], {
    env: environment,
    stdio: "ignore",
    windowsHide: true,
  });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  const report = JSON.parse(
    await readFile(join(directory, "report.json"), "utf8"),
  );
  if (code !== 0 || !report.passed) throw new Error(JSON.stringify(report));
  console.log(
    "PASS: packaged application, native encryption, real offline OCR, overlay isolation, streaming, and history",
  );
  console.log(JSON.stringify(report));
} finally {
  if (
    dirname(resolve(directory)) !== resolve(tmpdir()) ||
    !basename(directory).startsWith("study-desk-packaged-")
  )
    throw new Error("Invalid cleanup target");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 200,
  });
}
