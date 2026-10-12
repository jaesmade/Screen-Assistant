import { randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";

type SecureStorage = {
  isAsyncEncryptionAvailable: () => Promise<boolean>;
  getSelectedStorageBackend: () => string;
  encryptStringAsync: (value: string) => Promise<Buffer>;
  decryptStringAsync: (
    value: Buffer,
  ) => Promise<{ result: string; shouldReEncrypt: boolean }>;
};

export function createCredentialStore(
  filePath: string,
  storage: SecureStorage,
  platform: NodeJS.Platform = process.platform,
) {
  async function isAvailable(): Promise<boolean> {
    try {
      if (!(await storage.isAsyncEncryptionAvailable())) return false;
      // Conservatively require a known OS secret store on Linux. Never persist
      // credentials when Electron falls back to a fixed plaintext password.
      if (platform === "linux") {
        return ["gnome_libsecret", "kwallet", "kwallet5", "kwallet6"].includes(
          storage.getSelectedStorageBackend(),
        );
      }
      return true;
    } catch {
      return false;
    }
  }

  async function saveKey(value: string): Promise<void> {
    if (!(await isAvailable())) {
      throw new Error(
        "Secure storage is unavailable. Your API key was not saved.",
      );
    }
    const encrypted = await storage.encryptStringAsync(value);
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, encrypted, { mode: 0o600, flag: "wx" });
      await rename(temporaryPath, filePath);
    } finally {
      await unlink(temporaryPath).catch(() => {});
    }
  }

  async function readKey(): Promise<string> {
    if (!(await isAvailable())) return "";
    let encrypted: Buffer;
    try {
      encrypted = await readFile(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
      throw error;
    }
    const { result, shouldReEncrypt } =
      await storage.decryptStringAsync(encrypted);
    if (shouldReEncrypt && result) await saveKey(result);
    return result;
  }

  async function clearKey(): Promise<void> {
    try {
      await unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  return { isAvailable, readKey, saveKey, clearKey };
}
