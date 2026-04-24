import * as vscode from "vscode";
import type { Provider } from "../types";
import { OllamaProvider } from "./ollama";
import { LMStudioProvider } from "./lmstudio";
import { ApfelProvider } from "./apfel";
import { VesselProvider } from "./vessel";

export type ProviderName = "ollama" | "lmstudio" | "apfel" | "vessel" | "openrouter";

const PROVIDER_LABELS: Record<ProviderName, string> = {
  ollama: "Ollama (local)",
  lmstudio: "LM Studio (local)",
  apfel: "Apple Foundation Model (local)",
  vessel: "8gent Vessel (cloud)",
  openrouter: "OpenRouter (cloud)",
};

/** Create a provider instance from VS Code settings */
export function createProvider(name: ProviderName): Provider {
  const config = vscode.workspace.getConfiguration("8gent");

  switch (name) {
    case "ollama":
      return new OllamaProvider(
        config.get("ollama.endpoint", "http://localhost:11434"),
        config.get("ollama.model", "qwen2.5-coder:7b")
      );

    case "lmstudio":
      return new LMStudioProvider(
        config.get("lmstudio.endpoint", "http://localhost:1234"),
        config.get("lmstudio.model", "")
      );

    case "apfel":
      return new ApfelProvider();

    case "vessel":
      return new VesselProvider(
        config.get("vessel.url", ""),
        config.get("vessel.channel", "app")
      );

    case "openrouter":
      // OpenRouter uses the same OpenAI-compatible API as LM Studio
      return new LMStudioProvider(
        "https://openrouter.ai/api",
        config.get("openrouter.model", "auto:free")
      );

    default:
      throw new Error(`Unknown provider: ${name}`);
  }
}

/** Auto-detect which local providers are available */
export async function detectProviders(): Promise<ProviderName[]> {
  const available: ProviderName[] = [];

  const checks: [ProviderName, Provider][] = [
    ["ollama", createProvider("ollama")],
    ["lmstudio", createProvider("lmstudio")],
    ["apfel", createProvider("apfel")],
  ];

  const results = await Promise.allSettled(
    checks.map(async ([name, provider]) => {
      const ok = await provider.healthCheck();
      if (ok) available.push(name);
    })
  );

  return available;
}

/** Show a quick-pick to switch providers */
export async function pickProvider(current: ProviderName): Promise<ProviderName | undefined> {
  const items = (Object.keys(PROVIDER_LABELS) as ProviderName[]).map((name) => ({
    label: PROVIDER_LABELS[name],
    description: name === current ? "(active)" : undefined,
    name,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Select AI provider",
  });

  return picked?.name;
}

export { PROVIDER_LABELS };
