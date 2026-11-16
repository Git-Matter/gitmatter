import { spawn, type SpawnOptions } from "node:child_process";

export function run(command: string[], options: SpawnOptions = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0]!, command.slice(1), { stdio: "inherit", ...options });
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
}
