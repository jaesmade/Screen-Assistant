import assert from "node:assert/strict";
import test from "node:test";
import {
  createOcrService,
  validateOcrImage,
  OCR_TIMEOUT_MESSAGE,
} from "../src/main/ocr.ts";

const image = new Uint8Array([1, 2, 3]);
test("OCR accepts only bounded embedded image data", () => {
  assert.equal(
    validateOcrImage("data:image/png;base64,aGVsbG8="),
    "data:image/png;base64,aGVsbG8=",
  );
  for (const invalid of [
    null,
    "https://example.com/image.png",
    "file:///image.png",
    "data:text/html;base64,aGVsbG8=",
    "data:image/png;base64,abcd!",
    "data:image/png;base64,abc",
    "data:image/png;base64," + "a".repeat(12_000_000),
  ]) {
    assert.throws(() => validateOcrImage(invalid), /valid PNG/);
  }
});

test("OCR normalizes text and confidence, validates progress, and releases its worker", async () => {
  let terminateCount = 0;
  const updates = [];
  const service = createOcrService((input, report) => {
    assert.equal(input, image);
    report(null);
    report({ stage: "unknown", progress: 0 });
    report({ stage: "loading", progress: NaN });
    report({ stage: "recognizing", progress: 2 });
    return {
      result: Promise.resolve({
        text: "  First\r\nSecond\rThird  ",
        confidence: 105,
      }),
      terminate() {
        terminateCount++;
      },
    };
  });
  assert.deepEqual(
    await service.recognize("one", image, (value) => updates.push(value)),
    { text: "First\nSecond\nThird", confidence: 100 },
  );
  assert.deepEqual(updates, [{ stage: "recognizing", progress: 1 }]);
  assert.equal(terminateCount, 1);
  assert.equal(service.cancel("one"), false);
});

test("OCR cancellation during initialization allows a new job and ignores old progress", async () => {
  const jobs = [];
  const updates = [];
  const service = createOcrService((_, report) => {
    let resolve;
    const result = new Promise((value) => {
      resolve = value;
    });
    const job = { report, resolve, terminated: false };
    jobs.push(job);
    return {
      result,
      terminate() {
        job.terminated = true;
      },
    };
  });
  const first = service.recognize("one", image, (value) => updates.push(value));
  await assert.rejects(
    service.recognize("another", image, () => {}),
    /already in progress/,
  );
  assert.equal(service.cancel("wrong-id"), false);
  assert.equal(service.cancel("one"), true);
  assert.equal(service.cancel("one"), false);
  const second = service.recognize("two", image, () => {});
  jobs[0].report({ stage: "recognizing", progress: 1 });
  assert.deepEqual(await first, { text: "", confidence: 0, cancelled: true });
  assert.equal(jobs[0].terminated, true);
  assert.deepEqual(updates, []);
  jobs[1].resolve({ text: "New result", confidence: 90 });
  assert.equal((await second).text, "New result");
  assert.equal(jobs[1].terminated, true);
});

test("OCR timeouts terminate work and leave the service ready to retry", async () => {
  let terminated = 0,
    attempt = 0;
  const service = createOcrService(
    () => ({
      result: attempt++
        ? Promise.resolve({ text: "Retry", confidence: 80 })
        : new Promise(() => {}),
      terminate() {
        terminated++;
      },
    }),
    15,
  );
  await assert.rejects(
    service.recognize("one", image, () => {}),
    { message: OCR_TIMEOUT_MESSAGE },
  );
  assert.equal(terminated, 1);
  assert.equal((await service.recognize("two", image, () => {})).text, "Retry");
  assert.equal(terminated, 2);
});

test("worker failures and malformed results cannot leave OCR busy", async () => {
  for (const result of [
    null,
    { text: 42, confidence: 0 },
    { text: "x".repeat(100001), confidence: 80 },
    { text: "ok", confidence: NaN },
  ]) {
    let released = false;
    const service = createOcrService(() => ({
      result: Promise.resolve(result),
      terminate() {
        released = true;
      },
    }));
    await assert.rejects(
      service.recognize("one", image, () => {}),
      /invalid result/,
    );
    assert.equal(released, true);
  }
  let count = 0;
  const service = createOcrService(() => ({
    result: Promise.reject(new Error("Worker exited")),
    terminate() {
      count++;
    },
  }));
  await assert.rejects(
    service.recognize("one", image, () => {}),
    /Worker exited/,
  );
  await assert.rejects(
    service.recognize("two", image, () => {}),
    /Worker exited/,
  );
  assert.equal(count, 2);
});
