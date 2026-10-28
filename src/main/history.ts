import { randomUUID } from "node:crypto";
import { readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import type {
  QuestionHistoryEntry,
  QuestionHistorySummary,
} from "../shared/types";

export const HISTORY_MAX_ENTRIES = 100;
export const HISTORY_MAX_BYTES = 50 * 1024 * 1024;

function isEntry(value: unknown): value is QuestionHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as QuestionHistoryEntry;
  return (
    typeof entry.id === "string" &&
    /^[a-f0-9-]{36}$/.test(entry.id) &&
    typeof entry.createdAt === "string" &&
    Number.isFinite(Date.parse(entry.createdAt)) &&
    typeof entry.question === "string" &&
    entry.question.length <= 12_000 &&
    typeof entry.answer === "string" &&
    entry.answer.length > 0 &&
    entry.answer.length <= 200_000 &&
    typeof entry.model === "string" &&
    entry.model.length > 0 &&
    entry.model.length <= 512 &&
    (entry.imageDataUrl === undefined ||
      (typeof entry.imageDataUrl === "string" &&
        entry.imageDataUrl.length <= 12_000_000 &&
        /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/]+=*$/.test(
          entry.imageDataUrl,
        )))
  );
}

export function createHistoryStore(
  filePath: string,
  { maxEntries = HISTORY_MAX_ENTRIES, maxBytes = HISTORY_MAX_BYTES } = {},
) {
  // Serialize reads and writes so overlapping save/delete/clear operations cannot
  // restore a deleted entry or lose a successful save.
  let pending: Promise<unknown> = Promise.resolve();
  function run<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation);
    pending = result.catch(() => {});
    return result;
  }

  async function read(): Promise<QuestionHistoryEntry[]> {
    try {
      if ((await stat(filePath)).size > maxBytes)
        throw new Error("History file is too large");
      const data = JSON.parse(await readFile(filePath, "utf8"));
      if (
        data.version !== 1 ||
        !Array.isArray(data.entries) ||
        data.entries.length > maxEntries ||
        !data.entries.every(isEntry) ||
        new Set(data.entries.map((entry: QuestionHistoryEntry) => entry.id))
          .size !== data.entries.length
      ) {
        throw new Error("Invalid history format");
      }
      return data.entries;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw new Error(
        "Saved question history could not be read. Clear history to start fresh.",
        { cause: error },
      );
    }
  }

  async function commit(contents: string) {
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, contents, {
        mode: 0o600,
        flag: "wx",
      });
      await rename(temporaryPath, filePath);
    } finally {
      await unlink(temporaryPath).catch(() => {});
    }
  }
  const write = (entries: QuestionHistoryEntry[]) =>
    commit(JSON.stringify({ version: 1, entries }));

  return {
    list: () =>
      run(
        async (): Promise<QuestionHistorySummary[]> =>
          (await read()).map(({ imageDataUrl, answer, ...entry }) => ({
            ...entry,
            preview: answer
              .replace(/```[\s\S]*?```/g, "Code example")
              .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
              .replace(/[#*_`$|]/g, "")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 180),
            hasImage: Boolean(imageDataUrl),
          })),
      ),
    get: (id: string) =>
      run(async () => (await read()).find((entry) => entry.id === id) ?? null),
    save: (input: Omit<QuestionHistoryEntry, "id" | "createdAt">) =>
      run(async () => {
        // Pick only documented fields; credentials and provider metadata never enter history.
        const entry: QuestionHistoryEntry = {
          id: randomUUID(),
          createdAt: new Date().toISOString(),
          question: input.question,
          answer: input.answer,
          model: input.model,
          ...(input.imageDataUrl ? { imageDataUrl: input.imageDataUrl } : {}),
        };
        if (!isEntry(entry))
          throw new Error("This response could not be saved to history.");
        if (
          Buffer.byteLength(JSON.stringify({ version: 1, entries: [entry] })) >
          maxBytes
        ) {
          throw new Error("This question is too large to save to history.");
        }
        const entries = [entry, ...(await read())].slice(0, maxEntries);
        // Serialize each entry once, instead of repeatedly serializing up to
        // 50 MB of crop data for every evicted entry.
        const serialized = entries.map((value) => JSON.stringify(value));
        const sizes = serialized.map((value) => Buffer.byteLength(value));
        let bytes =
          Buffer.byteLength('{"version":1,"entries":[]}') +
          sizes.reduce((a, b) => a + b, 0) +
          Math.max(0, serialized.length - 1);
        while (bytes > maxBytes) {
          bytes -= sizes.pop()! + 1;
          serialized.pop();
        }
        await commit('{"version":1,"entries":[' + serialized.join(",") + "]}");
        return entry.id;
      }),
    delete: (id: string) =>
      run(async () => write((await read()).filter((entry) => entry.id !== id))),
    // Clearing also allows explicit recovery from an unreadable history file.
    clear: () => run(async () => write([])),
  };
}
