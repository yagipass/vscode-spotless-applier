export class SerialQueue {
  private readonly tails = new Map<string, Promise<unknown>>();

  run<T>(key: string, signal: AbortSignal, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const current = previous.then(() => {
      signal.throwIfAborted();
      return task();
    });
    this.tails.set(
      key,
      current.catch(() => undefined),
    );
    return current;
  }
}
