import type { WorldCommand } from "../../core/model/Commands.ts";

export class CommandQueue {
  private queue: WorldCommand[] = [];

  push(cmd: WorldCommand): void {
    this.queue.push(cmd);
  }

  drain(): WorldCommand[] {
    const commands = this.queue;
    this.queue = [];
    return commands;
  }

  clear(): void {
    this.queue = [];
  }

  get length(): number {
    return this.queue.length;
  }
}
