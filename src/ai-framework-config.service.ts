/**
 * AI Framework Configuration Service
 *
 * Gestisce le configurazioni avanzate del framework agentico:
 * - Consensus system (multi-model voting)
 * - Skills system (universal skills registry)
 * - Learning feedback loop (adaptive thresholds)
 * - Mode selection intelligence
 * - Decomposition strategies
 */

import { ServiceRegistry, REPO_TOKENS } from '@giulio-leone/core';
import type { IAiFrameworkConfigRepository } from '@giulio-leone/core/repositories';
import { toPrismaJsonValue } from '@giulio-leone/lib-shared';
import type { AiFrameworkConfig, AiFrameworkConfigHistory } from '@giulio-leone/core/repositories';
import {
  FrameworkFeature,
  type ConsensusConfig,
  type SkillsConfig,
  type LearningConfig,
  type ModeSelectionConfig,
  type AutoDecompositionConfig,
  type AdaptiveRecoveryConfig,
  type CostMonitoringConfig,
  type TracingConfig,
  type WorkoutGenerationRetryConfig,
  type ImportModelsConfig,
  type GenerationRecoveryConfig,
} from './types';

const FEATURE_ALIASES: Partial<Record<string, FrameworkFeature>> = {
  workout_import: FrameworkFeature.IMPORT_MODELS,
} as const;

function normalizeFeature(feature: string): FrameworkFeature {
  return FEATURE_ALIASES[feature as any] ?? (feature as FrameworkFeature);
}

/**
 * Type guard per config types
 */
type FeatureConfigMap = {
  [FrameworkFeature.CONSENSUS_SYSTEM]: ConsensusConfig;
  [FrameworkFeature.SKILLS_SYSTEM]: SkillsConfig;
  [FrameworkFeature.LEARNING_FEEDBACK_LOOP]: LearningConfig;
  [FrameworkFeature.INTELLIGENT_MODE_SELECTION]: ModeSelectionConfig;
  [FrameworkFeature.AUTO_DECOMPOSITION]: AutoDecompositionConfig;
  [FrameworkFeature.ADAPTIVE_RECOVERY]: AdaptiveRecoveryConfig;
  [FrameworkFeature.COST_MONITORING]: CostMonitoringConfig;
  [FrameworkFeature.ORCHESTRATION_TRACING]: TracingConfig;
  [FrameworkFeature.WORKOUT_GENERATION_RETRY]: WorkoutGenerationRetryConfig;
  [FrameworkFeature.IMPORT_MODELS]: ImportModelsConfig;
  [FrameworkFeature.GENERATION_RECOVERY]: GenerationRecoveryConfig;
};

/**
 * Union type of all possible config types
 */
type AllConfigTypes =
  | ConsensusConfig
  | SkillsConfig
  | LearningConfig
  | ModeSelectionConfig
  | AutoDecompositionConfig
  | AdaptiveRecoveryConfig
  | CostMonitoringConfig
  | TracingConfig
  | WorkoutGenerationRetryConfig
  | ImportModelsConfig
  | GenerationRecoveryConfig;

const IMPORT_MODELS_DEFAULT: ImportModelsConfig = {
  spreadsheetModel: '',
  imageModel: '',
  pdfModel: '',
  documentModel: '',
  fallbackModel: '',
  creditCosts: {
    image: 8,
    pdf: 10,
    document: 8,
    spreadsheet: 6,
  },
  maxRetries: 2,
  retryDelayBaseMs: 1000,
};

/**
 * Default configurations per feature
 */
const DEFAULT_CONFIGS: Record<FrameworkFeature, AllConfigTypes> = {
  [FrameworkFeature.CONSENSUS_SYSTEM]: {
    votingStrategy: 'weighted',
    minModels: 2,
    maxModels: 3,
    confidenceThreshold: 0.7,
    modelTiers: ['fast', 'balanced'],
    timeoutMs: 30000,
  } as ConsensusConfig,

  [FrameworkFeature.SKILLS_SYSTEM]: {
    enableBuiltInSkills: true,
    enableDomainSkills: true,
    enableCustomSkills: false,
    autoDiscovery: false,
    skillTimeout: 10000,
  } as SkillsConfig,

  [FrameworkFeature.LEARNING_FEEDBACK_LOOP]: {
    enableAdaptiveThresholds: true,
    enableMetricsCollection: true,
    enableFeedbackLoop: false, // Disabled by default until fully tested
    thresholdAdjustmentRate: 0.1,
    metricsRetentionDays: 30,
    minSamplesForAdjustment: 100,
  } as LearningConfig,

  [FrameworkFeature.INTELLIGENT_MODE_SELECTION]: {
    useAISelection: true,
    enableCaching: true,
    fallbackMode: 'planning',
    minConfidenceThreshold: 0.6,
  } as ModeSelectionConfig,

  [FrameworkFeature.AUTO_DECOMPOSITION]: {
    enableAutoDecomposition: true,
    maxDepth: 5,
    minConfidenceThreshold: 0.6,
    enableCaching: true,
  } as AutoDecompositionConfig,

  [FrameworkFeature.ADAPTIVE_RECOVERY]: {
    enableAdaptiveRecovery: true,
    maxRetries: 3,
    strategies: ['regenerate', 'patch', 'escalate'],
    confidenceThreshold: 0.7,
  } as AdaptiveRecoveryConfig,

  [FrameworkFeature.COST_MONITORING]: {
    enableMonitoring: true,
    budgetLimit: 1000, // 1000 credits
    enableAlerts: true,
    alertThreshold: 80, // 80%
  } as CostMonitoringConfig,

  [FrameworkFeature.ORCHESTRATION_TRACING]: {
    enableTracing: true,
    enablePerformanceMetrics: true,
    enableDecisionLogging: true,
    retentionDays: 7,
  } as TracingConfig,

  [FrameworkFeature.WORKOUT_GENERATION_RETRY]: {
    count: 3,
  } as WorkoutGenerationRetryConfig,

  [FrameworkFeature.IMPORT_MODELS]: IMPORT_MODELS_DEFAULT,

  [FrameworkFeature.GENERATION_RECOVERY]: {
    enabled: true,
    maxRetries: 3,
    stateRetentionHours: 24,
    errorFeedbackLevel: 'detailed',
  } as GenerationRecoveryConfig,
};

/**
 * Feature descriptions
 */
const FEATURE_DESCRIPTIONS: Record<FrameworkFeature, string> = {
  [FrameworkFeature.CONSENSUS_SYSTEM]:
    'Multi-model voting system for improved accuracy and reliability',
  [FrameworkFeature.SKILLS_SYSTEM]: 'Universal skills registry for extensible agent capabilities',
  [FrameworkFeature.LEARNING_FEEDBACK_LOOP]:
    'Adaptive learning system that improves over time based on performance metrics',
  [FrameworkFeature.INTELLIGENT_MODE_SELECTION]:
    'AI-powered semantic mode selection for optimal task execution',
  [FrameworkFeature.AUTO_DECOMPOSITION]: 'Automatic task decomposition for complex operations',
  [FrameworkFeature.ADAPTIVE_RECOVERY]: 'Smart error recovery with multiple fallback strategies',
  [FrameworkFeature.COST_MONITORING]: 'Real-time cost tracking and budget management',
  [FrameworkFeature.ORCHESTRATION_TRACING]:
    'Distributed tracing for orchestration debugging and analytics',
  [FrameworkFeature.WORKOUT_GENERATION_RETRY]:
    'Configuration for workout generation retry attempts',
  [FrameworkFeature.IMPORT_MODELS]:
    'AI model configuration for import/parsing (CSV, XLSX, images, PDF, documents)',
  [FrameworkFeature.GENERATION_RECOVERY]:
    'AI generation state persistence for recovery. Resume from failure point with error feedback.',
};

/**
 * AI Framework Config Service
 */
export class AIFrameworkConfigService {
  private static getRepo(): IAiFrameworkConfigRepository {
    return ServiceRegistry.getInstance().resolve<IAiFrameworkConfigRepository>(REPO_TOKENS.AI_FRAMEWORK_CONFIG);
  }

  /**
   * Get configuration for a specific feature
   */
  static async getConfig<F extends FrameworkFeature>(
    feature: F
  ): Promise<{
    isEnabled: boolean;
    config: FeatureConfigMap[F];
  }> {
    const normalizedFeature = normalizeFeature(feature);

    let record = await this.getRepo().findByFeature(normalizedFeature);

    if (!record) {
      // Return default configuration if not found
      return {
        isEnabled: false, // All features disabled by default
        config: DEFAULT_CONFIGS[normalizedFeature] as FeatureConfigMap[F],
      };
    }

    return {
      isEnabled: record.isEnabled,
      config:
        (record.config as unknown as FeatureConfigMap[F]) ||
        (DEFAULT_CONFIGS[normalizedFeature] as unknown as FeatureConfigMap[F]),
    };
  }

  /**
   * Get all feature configurations
   */
  static async getAllConfigs(): Promise<AiFrameworkConfig[]> {
    return await this.getRepo().findAll();
  }

  /**
   * Update configuration for a feature
   */
  static async updateConfig<F extends FrameworkFeature>(params: {
    feature: F;
    isEnabled?: boolean;
    config?: Partial<FeatureConfigMap[F]>;
    updatedBy: string;
    changeReason?: string;
  }): Promise<AiFrameworkConfig> {
    const { feature, isEnabled, config, updatedBy, changeReason } = params;
    const normalizedFeature = normalizeFeature(feature);

    // Get current config
    const current = await this.getConfig(normalizedFeature as F);

    // Merge with new config
    let mergedConfig = config ? { ...current.config, ...config } : current.config;

    // Deep-merge nested creditCosts per import models to avoid overwriting missing keys
    if (normalizedFeature === FrameworkFeature.IMPORT_MODELS && config && 'creditCosts' in config) {
      const currentConfig = current.config as ImportModelsConfig;
      const incomingCosts = (config as Partial<ImportModelsConfig>).creditCosts;

      if (incomingCosts) {
        mergedConfig = {
          ...mergedConfig,
          creditCosts: {
            ...(currentConfig?.creditCosts ||
              (DEFAULT_CONFIGS[FrameworkFeature.IMPORT_MODELS] as ImportModelsConfig).creditCosts),
            ...incomingCosts,
          },
        };
      }
    }

    // Upsert configuration
    const updated = await this.getRepo().upsert(
      normalizedFeature,
      {
        feature: normalizedFeature,
        isEnabled: isEnabled ?? false,
        config: toPrismaJsonValue(mergedConfig),
        description: FEATURE_DESCRIPTIONS[normalizedFeature],
        updatedBy,
      },
      {
        isEnabled: isEnabled ?? current.isEnabled,
        config: toPrismaJsonValue(mergedConfig),
        updatedBy,
        updatedAt: new Date(),
      }
    );

    // Create history record
    await this.createHistory({
      feature: normalizedFeature,
      isEnabled: updated.isEnabled,
      config: updated.config as Record<string, unknown>,
      changedBy: updatedBy,
      changeReason,
    });

    return updated;
  }

  /**
   * Check if a feature is enabled
   */
  static async isFeatureEnabled(feature: FrameworkFeature): Promise<boolean> {
    const { isEnabled } = await this.getConfig(feature);
    return isEnabled;
  }

  /**
   * Enable a feature
   */
  static async enableFeature(
    feature: FrameworkFeature,
    updatedBy: string,
    changeReason?: string
  ): Promise<AiFrameworkConfig> {
    return await this.updateConfig({
      feature,
      isEnabled: true,
      updatedBy,
      changeReason,
    });
  }

  /**
   * Disable a feature
   */
  static async disableFeature(
    feature: FrameworkFeature,
    updatedBy: string,
    changeReason?: string
  ): Promise<AiFrameworkConfig> {
    return await this.updateConfig({
      feature,
      isEnabled: false,
      updatedBy,
      changeReason,
    });
  }

  /**
   * Initialize default configurations
   */
  static async initializeDefaults(updatedBy: string = 'system'): Promise<void> {
    const handled = new Set<FrameworkFeature>();

    for (const feature of Object.values(FrameworkFeature)) {
      const normalizedFeature = normalizeFeature(feature);
      if (handled.has(normalizedFeature)) continue;
      handled.add(normalizedFeature);

      const existing = await this.getRepo().findByFeature(normalizedFeature);

      if (!existing) {
        await this.getRepo().create({
          feature: normalizedFeature,
          isEnabled: false,
          config: toPrismaJsonValue(DEFAULT_CONFIGS[normalizedFeature]),
          description: FEATURE_DESCRIPTIONS[normalizedFeature],
          updatedBy,
        });
      }
    }
  }

  /**
   * Create history record
   */
  private static async createHistory(params: {
    feature: string;
    isEnabled: boolean;
    config: Record<string, unknown>;
    changedBy: string;
    changeReason?: string;
  }): Promise<AiFrameworkConfigHistory> {
    return await this.getRepo().createHistoryEntry(params);
  }

  /**
   * Get configuration history for a feature
   */
  static async getHistory(feature: FrameworkFeature): Promise<AiFrameworkConfigHistory[]> {
    const normalizedFeature = normalizeFeature(feature);
    return await this.getRepo().findHistory(normalizedFeature);
  }

  /**
   * Get feature descriptions
   */
  static getFeatureDescription(feature: FrameworkFeature): string {
    return FEATURE_DESCRIPTIONS[normalizeFeature(feature)];
  }

  /**
   * Get all feature descriptions
   */
  static getAllFeatureDescriptions(): Record<FrameworkFeature, string> {
    return FEATURE_DESCRIPTIONS;
  }

  /**
   * Validate configuration
   */
  static validateConfig<F extends FrameworkFeature>(
    feature: F,
    config: unknown
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    switch (feature) {
      case FrameworkFeature.CONSENSUS_SYSTEM: {
        const c = config as ConsensusConfig;
        if (c.minModels < 2 || c.minModels > 5) {
          errors.push('minModels must be between 2 and 5');
        }
        if (c.maxModels < c.minModels || c.maxModels > 5) {
          errors.push('maxModels must be >= minModels and <= 5');
        }
        if (c.confidenceThreshold < 0 || c.confidenceThreshold > 1) {
          errors.push('confidenceThreshold must be between 0 and 1');
        }
        break;
      }

      case FrameworkFeature.LEARNING_FEEDBACK_LOOP: {
        const c = config as LearningConfig;
        if (c.thresholdAdjustmentRate < 0 || c.thresholdAdjustmentRate > 1) {
          errors.push('thresholdAdjustmentRate must be between 0 and 1');
        }
        if (c.metricsRetentionDays < 1 || c.metricsRetentionDays > 365) {
          errors.push('metricsRetentionDays must be between 1 and 365');
        }
        break;
      }

      case FrameworkFeature.AUTO_DECOMPOSITION: {
        const c = config as AutoDecompositionConfig;
        if (c.maxDepth < 1 || c.maxDepth > 10) {
          errors.push('maxDepth must be between 1 and 10');
        }
        break;
      }

      case FrameworkFeature.ADAPTIVE_RECOVERY: {
        const c = config as AdaptiveRecoveryConfig;
        if (c.maxRetries < 1 || c.maxRetries > 5) {
          errors.push('maxRetries must be between 1 and 5');
        }
        break;
      }

      case FrameworkFeature.COST_MONITORING: {
        const c = config as CostMonitoringConfig;
        if (c.budgetLimit < 0) {
          errors.push('budgetLimit must be >= 0');
        }
        if (c.alertThreshold < 0 || c.alertThreshold > 100) {
          errors.push('alertThreshold must be between 0 and 100');
        }
        break;
      }

      case FrameworkFeature.IMPORT_MODELS: {
        const c = config as ImportModelsConfig;
        if (c.maxRetries < 0 || c.maxRetries > 5) {
          errors.push('maxRetries must be between 0 and 5');
        }
        if (c.retryDelayBaseMs < 0) {
          errors.push('retryDelayBaseMs must be >= 0');
        }
        if (!c.creditCosts) {
          errors.push('creditCosts configuration is required');
          break;
        }
        (
          ['image', 'pdf', 'document', 'spreadsheet'] as Array<
            keyof NonNullable<ImportModelsConfig['creditCosts']>
          >
        ).forEach((key: keyof NonNullable<ImportModelsConfig['creditCosts']>) => {
          const value = c.creditCosts?.[key];
          if (value === undefined || Number.isNaN(Number(value)) || value < 0) {
            errors.push(`creditCosts.${key} must be >= 0`);
          }
        });
        break;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
