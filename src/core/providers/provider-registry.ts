import type { LanguageModel } from 'ai';
import type { ProviderConfig } from './types';

export type ProviderModelOptions = {
  maxTokens?: number;
  temperature?: number;
  reasoningEffort?: ProviderConfig['reasoningEffort'];
  thinkingConfig?: { thinkingLevel: ProviderConfig['thinkingLevel'] };
};

export type ProviderInstance = (model: string, options?: ProviderModelOptions) => LanguageModel;

/** Creates a ProviderInstance given an API key and optional preferred provider */
export type ProviderCreator = (
  apiKey: string,
  preferredProvider?: string | null
) => ProviderInstance;

/**
 * ProviderRegistry — Plugin registry for AI providers (Open/Closed Principle).
 *
 * Providers self-register via `ProviderRegistry.register()`.
 * The factory delegates to this registry instead of hard-coded switch/case.
 */
export class ProviderRegistry {
  private static providers = new Map<string, ProviderCreator>();

  /** Register a provider creator under the given name */
  static register(name: string, creator: ProviderCreator): void {
    this.providers.set(name, creator);
  }

  /** Create a ProviderInstance by name */
  static create(
    name: string,
    apiKey: string,
    preferredProvider?: string | null
  ): ProviderInstance {
    const creator = this.providers.get(name);
    if (!creator) {
      throw new Error(
        `Unknown provider: ${name}. Registered providers: [${this.list().join(', ')}]`
      );
    }
    return creator(apiKey, preferredProvider);
  }

  /** Check whether a provider is registered */
  static has(name: string): boolean {
    return this.providers.has(name);
  }

  /** List all registered provider names */
  static list(): string[] {
    return Array.from(this.providers.keys());
  }

  /** Remove all registrations (useful for testing) */
  static clear(): void {
    this.providers.clear();
  }
}
