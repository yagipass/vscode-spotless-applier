import { describe, expect, it } from "vitest";
import { SerialQueue } from "../../src/serialQueue";

const neverAborted = new AbortController().signal;

describe("SerialQueue", () => {
  it("runs requests for the same build one after another, so two saves never race in one Gradle or Maven build", async () => {
    const queue = new SerialQueue();
    const events: string[] = [];
    const first = Promise.withResolvers<undefined>();
    const a = queue.run("root", neverAborted, async () => {
      events.push("a start");
      await first.promise;
      events.push("a end");
    });
    const b = queue.run("root", neverAborted, () => {
      events.push("b start");
      return Promise.resolve();
    });
    await Promise.resolve();
    expect(events).toEqual(["a start"]);
    first.resolve(undefined);
    await Promise.all([a, b]);
    expect(events).toEqual(["a start", "a end", "b start"]);
  });

  it("runs different builds independently, so a slow Maven build does not hold up a Gradle one", async () => {
    const queue = new SerialQueue();
    const blocked = Promise.withResolvers<undefined>();
    void queue.run("maven", neverAborted, () => blocked.promise);
    await expect(
      queue.run("gradle", neverAborted, () => Promise.resolve("done")),
    ).resolves.toBe("done");
    blocked.resolve(undefined);
  });

  it("keeps working after a request fails, so one syntax error does not break every later save", async () => {
    const queue = new SerialQueue();
    await expect(
      queue.run("root", neverAborted, () =>
        Promise.reject(new Error("build failed")),
      ),
    ).rejects.toThrow("build failed");
    await expect(
      queue.run("root", neverAborted, () => Promise.resolve("formatted")),
    ).resolves.toBe("formatted");
  });

  it("skips a request cancelled while it waited, so a skipped save does not start a build", async () => {
    const queue = new SerialQueue();
    const first = Promise.withResolvers<undefined>();
    void queue.run("root", neverAborted, () => first.promise);
    const controller = new AbortController();
    let started = false;
    const cancelled = queue.run("root", controller.signal, () => {
      started = true;
      return Promise.resolve();
    });
    controller.abort();
    first.resolve(undefined);
    await expect(cancelled).rejects.toThrow();
    expect(started).toBe(false);
  });
});
