/**
 * AI Provider Config Service
 *
 * Gestisce le credenziali API per i provider supportati
 * API keys principali sono gestite su Vercel Environment Variables (secrets)
 * Database contiene solo metadata (isEnabled, defaultModel, etc.)
 */

import { ServiceRegistry, REPO_TOKENS } from '@giulio-leone/core';
import type { IAiProviderConfigRepository } from '@giulio-leone/core/repositories';
import type { ProviderName } from './types';
import {
  createEnvVar,
  getEnvVarByKey,
  updateEnvVar,
  envVarExists,
} from '@giulio-leone/lib-vercel-admin';

type VercelEnvironment = 'production' | 'preview' | 'development';
import { logError } from '@giulio-leone/lib-shared';
import { logger } from '@giulio-leone/lib-shared';

/** String constants matching the AIProvider Prisma enum */
const AI_PROVIDER = {
  GOOGLE: 'GOOGLE',
  ANTHROPIC: 'ANTHROPIC',
  OPENAI: 'OPENAI',
  XAI: 'XAI',
  OPENROUTER: 'OPENROUTER',
  MINIMAX: 'MINIMAX',
  GEMINI_CLI: 'GEMINI_CLI',
} as const;
type AIProviderValue = (typeof AI_PROVIDER)[keyof typeof AI_PROVIDER];

/** JSON value types (replaces Prisma.JsonValue / JsonObject / JsonArray) */
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

interface ProviderMapEntry {
  enum: AIProviderValue;
  env: string;
  label: string;
}

export const PROVIDER_MAP: Record<ProviderName, ProviderMapEntry> = {
  google: {
    enum: AI_PROVIDER.GOOGLE,
    env: 'GOOGLE_GENERATIVE_AI_API_KEY',
    label: 'Google AI Studio',
  },
  anthropic: {
    enum: AI_PROVIDER.ANTHROPIC,
    env: 'ANTHROPIC_API_KEY',
    label: 'Anthropic Claude',
  },
  openai: {
    enum: AI_PROVIDER.OPENAI,
    env: 'OPENAI_API_KEY',
    label: 'OpenAI',
  },
  xai: {
    enum: AI_PROVIDER.XAI,
    env: 'XAI_API_KEY',
    label: 'xAI Grok',
  },
  openrouter: {
    enum: AI_PROVIDER.OPENROUTER,
    env: 'OPENROUTER_API_KEY',
    label: 'OpenRouter',
  },
  minimax: {
    enum: AI_PROVIDER.MINIMAX,
    env: 'MINIMAX_API_KEY',
    label: 'MiniMax',
  },
  'gemini-cli': {
    enum: AI_PROVIDER.GEMINI_CLI,
    env: 'GEMINI_CLI_AUTH', // OAuth uses ~/.gemini/oauth_creds.json, env var optional
    label: 'Gemini CLI (OAuth)',
  },
};

export interface UpsertProviderConfigParams {
  provider: ProviderName;
  apiKey?: string;
  isEnabled?: boolean;
  defaultModel?: string | null;
  defaultProvider?: string | null;
  updatedBy: string;
  changeReason?: string;
}

export interface ProviderConfigDTO {
  provider: ProviderName;
  label: string;
  isEnabled: boolean;
  hasKey: boolean;
  maskedKey: string;
  updatedAt: Date | null;
  updatedBy?: string | null;
  defaultModel?: string | null;
  defaultProvider?: string | null;
  metadata?: Record<string, unknown> | null;
}

export class AIProviderConfigService {
  private static getRepo(): IAiProviderConfigRepository {
    return ServiceRegistry.getInstance().resolve<IAiProviderConfigRepository>(REPO_TOKENS.AI_PROVIDER_CONFIG);
  }

  private static normalizeEnvValue(value?: string | null): string | null {
    if (!value) {
      return null;
    }

    let trimmed = value.trim();

    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      trimmed = trimmed.slice(1, -1);
    }

    return trimmed.length > 0 ? trimmed : null;
  }

  private static async getEnvKeyStatus(provider: ProviderName) {
    const mapping = PROVIDER_MAP[provider];
    const envValue = this.normalizeEnvValue(process.env[mapping.env]);
    const hasKeyInEnv = Boolean(envValue);
    let hasKey = hasKeyInEnv;

    if (!hasKeyInEnv) {
      try {
        hasKey = await envVarExists(mapping.env);
      } catch (error: unknown) {
        logError(`Errore verifica env var ${mapping.env}`, error);
        hasKey = false;
      }
    }

    return {
      envValue,
      hasKeyInEnv,
      hasKey,
    };
  }
  /**
   * Restituisce la configurazione per un provider
   */
  static async getConfig(provider: ProviderName) {
    return this.getRepo().findByProvider(PROVIDER_MAP[provider].enum);
  }

  /**
   * Restituisce tutte le configurazioni (non include la chiave in chiaro)
   * Verifica se API key esiste su Vercel per determinare hasKey
   */
  static async listConfigs(): Promise<ProviderConfigDTO[]> {
    const configs = await this.getRepo().listAll();

    const configMap = new Map<ProviderName, (typeof configs)[number]>();
    for (const config of configs) {
      const providerName = this.enumToProviderName(config.provider as AIProviderValue);
      configMap.set(providerName, config);
    }

    const providerEntries = Object.entries(PROVIDER_MAP) as [ProviderName, ProviderMapEntry][];

    return Promise.all(
      providerEntries.map(async ([providerName, mapping]) => {
        const storedConfig = configMap.get(providerName);
        const envStatus = await this.getEnvKeyStatus(providerName);

        if (process.env.NODE_ENV === 'development') {
          if (!envStatus.hasKeyInEnv) {
            logger.debug(`[AIProviderConfig] ${mapping.env} non trovata in process.env`, {
              provider: providerName,
              envKey: mapping.env,
              envKeys: Object.keys(process.env).filter((k: string) => k.includes('API_KEY')),
            });
          } else {
            logger.debug(`[AIProviderConfig] ${mapping.env} trovata`, {
              provider: providerName,
              envKey: mapping.env,
              length: envStatus.envValue?.length ?? 0,
              startsWith: envStatus.envValue?.substring(0, 10) ?? '',
            });
          }
        }

        return this.toDTO(
          storedConfig?.provider ?? mapping.enum,
          {
            isEnabled: storedConfig?.isEnabled ?? false,
            apiKey: envStatus.hasKey ? '***' : null, // Placeholder - non leggiamo la chiave
            updatedAt: storedConfig?.updatedAt ?? null,
            updatedBy: storedConfig?.updatedBy ?? null,
            metadata: (storedConfig?.metadata as Record<string, unknown>) ?? null,
          },
          storedConfig?.defaultModel ?? null
        );
      })
    );
  }

  /**
   * Aggiorna runtime environment e cache dopo sincronizzazione Vercel
   */
  private static async updateRuntimeEnv(envKey: string, apiKey: string): Promise<void> {
    process.env[envKey] = apiKey;

    // Import dinamico per evitare dipendenze circolari
    const { ProviderFactory } = await import('./provider-factory');
    ProviderFactory.clearCache();
  }

  /**
   * Sincronizza API key con Vercel Environment Variables
   * Crea o aggiorna la env var su Vercel e aggiorna runtime
   */
  static async syncToVercel(
    provider: ProviderName,
    apiKey: string,
    environments: VercelEnvironment[] = ['production', 'preview']
  ): Promise<{ success: boolean; envVarId?: string; error?: string }> {
    const mapping = PROVIDER_MAP[provider];
    const envKey = mapping.env;

    try {
      const existingResult = await getEnvVarByKey(envKey);

      // Aggiorna esistente o crea nuova
      const result =
        existingResult.success && existingResult.data
          ? await updateEnvVar({
              envId: existingResult.data.id,
              value: apiKey,
              environments,
              sensitive: true,
            })
          : await createEnvVar({
              key: envKey,
              value: apiKey,
              environments,
              sensitive: true,
            });

      if (result.success && result.data) {
        this.updateRuntimeEnv(envKey, apiKey);
        return {
          success: true,
          envVarId: result.data.id || existingResult.data?.id,
        };
      }

      return {
        success: false,
        error: result.error || 'Errore nella sincronizzazione con Vercel',
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Aggiorna o crea configurazione per provider
   * NON salva più apiKey nel DB - solo su Vercel
   */
  static async upsertConfig(params: UpsertProviderConfigParams): Promise<ProviderConfigDTO> {
    const mapping = PROVIDER_MAP[params.provider];

    const existing = await this.getRepo().findByProvider(mapping.enum);

    // Prepara e aggiorna metadata
    const existingMetadata =
      existing?.metadata &&
      typeof existing.metadata === 'object' &&
      !Array.isArray(existing.metadata)
        ? (existing.metadata as Record<string, unknown>)
        : {};

    // Aggiorna defaultProvider se specificato
    if (params.defaultProvider !== undefined) {
      if (params.defaultProvider?.trim()) {
        existingMetadata.defaultProvider = params.defaultProvider.trim();
      } else {
        delete existingMetadata.defaultProvider;
      }
    }

    // buildMetadata preserva tutti i campi esistenti e gestisce solo history
    const metadataToSave = this.buildMetadata(
      Object.keys(existingMetadata).length > 0 ? (existingMetadata as JsonObject) : null,
      {
        changeReason: params.changeReason,
        updatedBy: params.updatedBy,
      }
    );

    // Sincronizza API key con Vercel se fornita
    let vercelEnvVarId: string | undefined = existing?.vercelEnvVarId || undefined;
    let vercelSyncError: string | undefined = undefined;
    if (params.apiKey) {
      const syncResult = await this.syncToVercel(params.provider, params.apiKey);
      if (syncResult.success && syncResult.envVarId) {
        vercelEnvVarId = syncResult.envVarId;
      } else {
        // Salva l'errore per poterlo restituire
        vercelSyncError =
          syncResult.error || 'Errore sconosciuto nella sincronizzazione con Vercel';
        // Log dell'errore per debugging
        logError(`Errore sincronizzazione Vercel per ${params.provider}`, {
          error: vercelSyncError,
        });
      }
      // Nota: anche se sync fallisce, continuiamo con l'aggiornamento metadata
    }

    // Aggiorna solo metadata nel DB (NON apiKey)
    const updated = await this.getRepo().upsert(
      mapping.enum,
      {
        provider: mapping.enum,
        isEnabled: params.isEnabled ?? true,
        defaultModel: params.defaultModel?.trim() || null,
        ...(metadataToSave !== undefined ? { metadata: metadataToSave } : {}),
        ...(vercelEnvVarId ? { vercelEnvVarId } : {}),
        updatedBy: params.updatedBy,
        updatedAt: new Date(),
      },
      {
        ...(params.isEnabled !== undefined ? { isEnabled: params.isEnabled } : {}),
        ...(params.defaultModel !== undefined
          ? { defaultModel: params.defaultModel?.trim() || null }
          : {}),
        ...(metadataToSave !== undefined ? { metadata: metadataToSave } : {}),
        ...(vercelEnvVarId ? { vercelEnvVarId } : {}),
        updatedBy: params.updatedBy,
      }
    );

    const sanitizedValue = this.normalizeEnvValue(process.env[mapping.env]);
    const hasKeyInEnv = Boolean(sanitizedValue);
    let hasKeyOnVercel = hasKeyInEnv;

    if (!hasKeyInEnv) {
      try {
        hasKeyOnVercel = await envVarExists(mapping.env);
      } catch (error: unknown) {
        // Se fallisce, assume che la key non esista
        hasKeyOnVercel = false;
      }
    }

    return this.toDTO(
      updated.provider as AIProviderValue,
      {
        isEnabled: updated.isEnabled,
        apiKey: hasKeyOnVercel ? '***' : null, // Placeholder - non leggiamo la chiave
        updatedAt: updated.updatedAt,
        updatedBy: updated.updatedBy,
        metadata: (updated.metadata as Record<string, unknown>) ?? null,
      },
      updated.defaultModel
    );
  }

  /**
   * Restituisce la chiave API per un provider.
   * Legge da Edge Config con fallback a process.env.
   */
  static async getApiKey(provider: ProviderName): Promise<string | null> {
    // Importa dinamicamente per evitare cicli o problemi di inizializzazione
    const { getDynamicAIProviderKey } = await import('@giulio-leone/lib-config/env.server');

    const apiKey = await getDynamicAIProviderKey(provider);

    // Verifica che la chiave esista e non sia vuota
    if (apiKey) {
      return this.normalizeEnvValue(apiKey);
    }

    const mapping = PROVIDER_MAP[provider];

    // Log di debug solo in sviluppo
    if (process.env.NODE_ENV === 'development') {
      logger.debug(`[AIProviderConfig] getApiKey: ${mapping.env} non trovata o vuota`, {
        provider,
        envKey: mapping.env,
        rawValue: process.env[mapping.env] ? 'presente ma vuoto o con virgolette' : 'non presente',
      });
    }

    return null;
  }

  static async getDefaultModel(provider: ProviderName): Promise<string | null> {
    // Single Source of Truth: ai_chat_models (Admin Dashboard > Models)
    const defaultModel = await this.getRepo().findDefaultChatModel(PROVIDER_MAP[provider].enum);
    return defaultModel?.modelId ?? null;
  }

  /**
   * Gets the default model WITH its provider from ai_chat_models table.
   * Used by getModelByTier to respect admin-configured provider.
   */
  static async getDefaultModelWithProvider(): Promise<{
    modelId: string;
    provider: ProviderName;
  } | null> {
    // Single Source of Truth: ai_chat_models (Admin Dashboard > Models)
    const defaultModel = await this.getRepo().findGlobalDefaultChatModel();

    if (!defaultModel) {
      return null;
    }

    // Convert AIProvider enum to ProviderName
    const providerName = this.enumToProviderName(defaultModel.provider as AIProviderValue);

    return {
      modelId: defaultModel.modelId,
      provider: providerName,
    };
  }

  /**
   * Estrae defaultProvider dal metadata
   */
  private static extractDefaultProvider(metadata: JsonValue | null): string | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return null;
    }

    const defaultProvider = (metadata as Record<string, unknown>).defaultProvider;
    return typeof defaultProvider === 'string' && defaultProvider.trim()
      ? defaultProvider.trim()
      : null;
  }

  /**
   * Restituisce il provider predefinito per OpenRouter dal metadata
   */
  static async getDefaultProvider(provider: ProviderName): Promise<string | null> {
    if (provider !== 'openrouter') {
      return null;
    }

    const config = await this.getRepo().findByProviderSelect(
      PROVIDER_MAP[provider].enum,
      { metadata: true }
    );

    return this.extractDefaultProvider((config?.metadata ?? null) as JsonValue | null);
  }

  /**
   * Conversione a DTO (senza rivelare la chiave)
   */
  static toDTO(
    provider: AIProviderValue,
    data: {
      isEnabled: boolean;
      apiKey: string | null;
      updatedAt: Date | null;
      updatedBy?: string | null;
      metadata?: Record<string, unknown> | null;
    },
    defaultModel?: string | null
  ): ProviderConfigDTO {
    const providerName = this.enumToProviderName(provider);
    const defaultProvider =
      providerName === 'openrouter'
        ? this.extractDefaultProvider(data.metadata as JsonValue | null)
        : null;

    // hasKey è true se apiKey è presente (anche se è placeholder '***')
    const hasKey = Boolean(data.apiKey);

    return {
      provider: providerName,
      label: PROVIDER_MAP[providerName].label,
      isEnabled: data.isEnabled,
      hasKey,
      maskedKey: hasKey ? 'sk-***' : '', // Maschera generica - non leggiamo la chiave da Vercel
      updatedAt: data.updatedAt,
      updatedBy: data.updatedBy,
      defaultModel: defaultModel ?? null,
      defaultProvider,
      metadata: data.metadata ?? null,
    };
  }

  static enumToProviderName(provider: AIProviderValue): ProviderName {
    const entry = Object.entries(PROVIDER_MAP).find(([, value]) => value.enum === provider);
    if (!entry) {
      throw new Error(`Provider non gestito: ${provider}`);
    }
    return entry[0] as ProviderName;
  }

  static buildMetadata(
    current: JsonValue | null,
    params: { changeReason?: string; updatedBy?: string }
  ): JsonObject | undefined {
    if (!params.changeReason) {
      return current && typeof current === 'object' && !Array.isArray(current)
        ? (current as JsonObject)
        : undefined;
    }

    const historyEntry = {
      reason: params.changeReason,
      updatedBy: params.updatedBy,
      updatedAt: new Date().toISOString(),
    };

    const currentObject: JsonObject =
      current && typeof current === 'object' && !Array.isArray(current)
        ? (current as JsonObject)
        : {};

    const historyValue = currentObject.history;
    const existingHistory: JsonArray = Array.isArray(historyValue)
      ? (historyValue as JsonArray)
      : [];
    const updatedHistory = [historyEntry as JsonValue, ...existingHistory].slice(
      0,
      20
    ) as JsonArray;

    return {
      ...currentObject,
      history: updatedHistory,
    };
  }

  static getProviderMeta(provider: ProviderName) {
    const entry = PROVIDER_MAP[provider];
    return {
      label: entry.label,
      env: entry.env,
    };
  }

  static listProviderMeta() {
    return Object.entries(PROVIDER_MAP).map(([name, entry]) => ({
      provider: name as ProviderName,
      label: entry.label,
      env: entry.env,
      defaultModel: null as string | null,
    }));
  }
}
