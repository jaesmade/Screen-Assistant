import assert from "node:assert/strict";
import test from "node:test";
import { streamChatCompletion } from "../src/main/stream.ts";
import {
  REQUEST_CANCELLED_MESSAGE,
  REQUEST_TIMEOUT_MESSAGE,
} from "../src/main/request.ts";

const url = "https://example.invalid";
const encoder = new TextEncoder();
const event = (data) =>
  `data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`;
const delta = (text, extra = {}) => ({
  model: "test/free",
  choices: [{ index: 0, delta: { content: text }, ...extra }],
});
const finish = event(delta("", { finish_reason: "stop" }));
const done = event("[DONE]");
function streamResponse(parts, onCancel = () => {}) {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const part of parts)
          controller.enqueue(
            typeof part === "string" ? encoder.encode(part) : part,
          );
        controller.close();
      },
      cancel: onCancel,
    }),
    { headers: { "Content-Type": "text/event-stream; charset=utf-8" } },
  );
}
function run(parts, progress = () => {}, options = {}) {
  return streamChatCompletion(url, {}, progress, {
    fetcher: async () => streamResponse(parts),
    ...options,
  });
}

test("streaming handles split UTF-8, SSE framing, comments, metadata, and usage frames", async () => {
  const wire =
    "\uFEFF: OPENROUTER PROCESSING\r\n\r\n" +
    'event: message\r\ndata: {"model":"test/free",\r\ndata: "choices":[{"index":0,"delta":{"role":"assistant","reasoning":"not an answer","content":"Hello 👋"}}]}\r\n\r\n' +
    event(delta(" $x = 5$")) +
    finish +
    event({ choices: [], usage: { total_tokens: 5 } }) +
    finish +
    done;
  const bytes = encoder.encode(wire);
  const progress = [];
  const result = await run(
    Array.from(bytes, (byte) => new Uint8Array([byte])),
    (update) => progress.push(update),
  );
  assert.deepEqual(result, { text: "Hello 👋 $x = 5$", model: "test/free" });
  assert.equal(progress[0].text, "Hello 👋");
  assert.equal(progress.at(-1).text, result.text);
  assert.equal(result.text.includes("not an answer"), false);
});

test("progress is delivered before the response completes, and DONE releases an open reader", async () => {
  let controller;
  let cancelled = false;
  let progressed;
  const received = new Promise((resolve) => {
    progressed = resolve;
  });
  let completed = false;
  const response = new Response(
    new ReadableStream({
      start(value) {
        controller = value;
      },
      cancel() {
        cancelled = true;
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
  const pending = streamChatCompletion(url, {}, progressed, {
    fetcher: async () => response,
  }).then((result) => {
    completed = true;
    return result;
  });
  controller.enqueue(encoder.encode(event(delta("First"))));
  assert.equal((await received).text, "First");
  assert.equal(completed, false);
  controller.enqueue(encoder.encode(event(delta(" second")) + finish + done));
  assert.equal((await pending).text, "First second");
  assert.equal(cancelled, true);
});

test("pre-stream HTTP and JSON errors retain the provider message", async () => {
  for (const status of [200, 401, 429]) {
    await assert.rejects(
      streamChatCompletion(url, {}, () => {}, {
        fetcher: async () =>
          Response.json({ error: { message: "Provider says no" } }, { status }),
      }),
      /Provider says no/,
    );
  }
  await assert.rejects(
    streamChatCompletion(url, {}, () => {}, {
      fetcher: async () => new Response("not JSON", { status: 502 }),
    }),
    /502/,
  );
  await assert.rejects(
    streamChatCompletion(url, {}, () => {}, {
      fetcher: async () => Response.json({ choices: [] }),
    }),
    /did not return a streaming response/,
  );
});

test("mid-stream provider errors preserve delivered text and reject completion", async () => {
  const progress = [];
  await assert.rejects(
    run(
      [
        event(delta("Partial answer")),
        event({ error: { message: "Provider disconnected" } }),
        done,
      ],
      (value) => progress.push(value),
    ),
    /Provider disconnected/,
  );
  assert.equal(progress.at(-1).text, "Partial answer");
});

test("EOF without DONE, malformed packets, and empty responses are not successful", async () => {
  await assert.rejects(
    run([event(delta("Partial")), finish]),
    /connection ended/,
  );
  await assert.rejects(
    run(["data: {bad\n\n", done]),
    /invalid response stream/,
  );
  for (const invalid of [null, { choices: {} }, delta({ unexpected: true })]) {
    await assert.rejects(
      run([event(JSON.stringify(invalid)), done]),
      /invalid response stream/,
    );
  }
  await assert.rejects(
    run([
      event({ choices: [{ delta: { reasoning: "hidden" } }] }),
      finish,
      done,
    ]),
    /empty response/,
  );
});

test("output limits and finish errors retain the last text without reporting success", async () => {
  for (const reason of ["length", "error", "content_filter", "tool_calls"]) {
    const progress = [];
    await assert.rejects(
      run([event(delta("Partial", { finish_reason: reason })), done], (value) =>
        progress.push(value),
      ),
      /partial explanation|partial response/,
    );
    assert.equal(progress.at(-1).text, "Partial");
  }
  await assert.rejects(
    run([event(delta("x".repeat(200001))), done]),
    /too large/,
  );
  await assert.rejects(
    run(["data: " + "x".repeat(524289)]),
    /invalid response stream/,
  );
});

test("cancellation before fetch starts avoids network work", async () => {
  const controller = new AbortController();
  controller.abort(new Error(REQUEST_CANCELLED_MESSAGE));
  let calls = 0;
  await assert.rejects(
    streamChatCompletion(url, {}, () => {}, {
      signal: controller.signal,
      fetcher: async () => {
        calls++;
        return streamResponse([]);
      },
    }),
    { message: REQUEST_CANCELLED_MESSAGE },
  );
  assert.equal(calls, 0);
});

test("cancellation interrupts pending headers even when fetch ignores its signal", async () => {
  const controller = new AbortController();
  let entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  let fetchSignal;
  const pending = streamChatCompletion(url, {}, () => {}, {
    signal: controller.signal,
    fetcher: async (_, options) => {
      fetchSignal = options.signal;
      entered();
      return new Promise(() => {});
    },
  });
  await started;
  controller.abort(new Error(REQUEST_CANCELLED_MESSAGE));
  await assert.rejects(pending, { message: REQUEST_CANCELLED_MESSAGE });
  assert.equal(fetchSignal.aborted, true);
});

test("cancellation during streaming cancels the reader and preserves prior progress", async () => {
  const controller = new AbortController();
  let source;
  let cancelled = false;
  let delivered;
  const received = new Promise((resolve) => {
    delivered = resolve;
  });
  const pending = streamChatCompletion(url, {}, delivered, {
    signal: controller.signal,
    fetcher: async () =>
      new Response(
        new ReadableStream({
          start(value) {
            source = value;
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      ),
  });
  await Promise.resolve();
  await Promise.resolve();
  source.enqueue(encoder.encode(event(delta("Visible partial"))));
  assert.equal((await received).text, "Visible partial");
  controller.abort(new Error(REQUEST_CANCELLED_MESSAGE));
  await assert.rejects(pending, { message: REQUEST_CANCELLED_MESSAGE });
  assert.equal(cancelled, true);
});

test("the response deadline bounds both headers and a stalled stream body", async () => {
  let signal;
  await assert.rejects(
    streamChatCompletion(url, {}, () => {}, {
      timeoutMs: 15,
      fetcher: async (_, options) => {
        signal = options.signal;
        return new Promise(() => {});
      },
    }),
    { message: REQUEST_TIMEOUT_MESSAGE },
  );
  assert.equal(signal.aborted, true);
  let cancelled = false;
  await assert.rejects(
    streamChatCompletion(url, {}, () => {}, {
      timeoutMs: 15,
      fetcher: async () =>
        new Response(
          new ReadableStream({
            cancel() {
              cancelled = true;
            },
          }),
          { headers: { "Content-Type": "text/event-stream" } },
        ),
    }),
    { message: REQUEST_TIMEOUT_MESSAGE },
  );
  assert.equal(cancelled, true);
});
