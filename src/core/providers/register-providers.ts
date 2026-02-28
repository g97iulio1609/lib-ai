/**
 * Built-in provider registrations.
 *
 * Each provider self-registers with the ProviderRegistry.
 * Import this module once (side-effect) to populate the registry
 * before using ProviderFactory.
 */
import { AIProviderFactory } from '@giulio-leone/lib-core';
import { ProviderRegistry, type ProviderInstance } from './provider-registry';

ProviderRegistry.register('openrouter', (apiKey, preferredProvider) =>
  AIProviderFactory.createOpenRouter({ apiKey, preferredProvider }) as unknown as ProviderInstance
);

ProviderRegistry.register('openai', (apiKey) =>
  AIProviderFactory.createOpenAI(apiKey) as unknown as ProviderInstance
);

ProviderRegistry.register('anthropic', (apiKey) =>
  AIProviderFactory.createAnthropic(apiKey) as unknown as ProviderInstance
);

ProviderRegistry.register('google', (apiKey) =>
  AIProviderFactory.createGoogle(apiKey) as unknown as ProviderInstance
);

ProviderRegistry.register('xai', (apiKey) =>
  AIProviderFactory.createXAI(apiKey) as unknown as ProviderInstance
);

ProviderRegistry.register('minimax', (apiKey) =>
  AIProviderFactory.createMiniMax(apiKey) as unknown as ProviderInstance
);
