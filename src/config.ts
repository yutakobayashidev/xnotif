import { join } from "path";
import type { Config } from "./types";

const CONFIG_PATH = join(process.cwd(), "config.json");

export async function loadConfig(): Promise<Config> {
  const file = Bun.file(CONFIG_PATH);
  if (!(await file.exists())) {
    throw new Error('config.json not found. Run "init" first.');
  }
  return await file.json();
}

export async function saveConfig(config: Config): Promise<void> {
  await Bun.write(CONFIG_PATH, JSON.stringify(config, null, 2));
}
