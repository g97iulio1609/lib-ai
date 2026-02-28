/**
 * OpenRouter Subkey Service
 *
 * Gestione subkey OpenRouter per utenti
 * Crea, revoca e salva subkey nel database
 */

import { ServiceRegistry, REPO_TOKENS } from '@giulio-leone/core';
import type { IUserApiKeyRepository } from '@giulio-leone/core/repositories';
import { logger } from '@giulio-leone/lib-core';
import { createId } from '@giulio-leone/lib-shared/id-generator';

const log = logger.child('OpenRouterSubkeyService');
import crypto from 'crypto';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_PROVISIONING_KEY = process.env.OPENROUTER_PROVISIONING_KEY;

export interface CreateSubkeyParams {
  userId: string;
  credits: number;
  paymentIntentId: string;
}

export interface SubkeyResult {
  keyLabel: string;
  keyHash: string;
  limit: number;
}

export interface SaveSubkeyParams {
  userId: string;
  provider: string;
  keyLabel: string;
  keyHash: string;
  limit: number;
  stripePaymentIntentId: string;
}

/**
 * OpenRouter Subkey Service
 */
export class OpenRouterSubkeyService {
  private static getRepo(): IUserApiKeyRepository {
    return ServiceRegistry.getInstance().resolve<IUserApiKeyRepository>(REPO_TOKENS.USER_API_KEY);
  }

  /**
   * Crea una subkey OpenRouter per l'utente
   * @param params Parametri per la creazione della subkey
   * @returns Informazioni sulla subkey creata
   */
  static async createSubkey(params: CreateSubkeyParams): Promise<SubkeyResult> {
    const { userId, credits } = params;

    if (!OPENROUTER_PROVISIONING_KEY) {
      throw new Error('OPENROUTER_PROVISIONING_KEY non configurata');
    }

    // Genera label univoca per la subkey
    const timestamp = Date.now();
    const keyLabel = `user-${userId}-${timestamp}`;

    // Crea la subkey via OpenRouter API
    const response = await fetch(`${OPENROUTER_BASE_URL}/keys`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_PROVISIONING_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXTAUTH_URL || 'http://localhost:3000',
        'X-Title': process.env.OPENROUTER_APP_NAME || 'onecoach',
      },
      body: JSON.stringify({
        label: keyLabel,
        limit: credits, // Limite crediti uguale ai crediti acquistati
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Errore creazione subkey OpenRouter: ${response.status} ${errorData.error || response.statusText}`
      );
    }

    const data = await response.json();
    const apiKey = data.key || data.id;

    if (!apiKey) {
      throw new Error('Subkey creata ma chiave non restituita da OpenRouter');
    }

    // Genera hash della chiave per sicurezza (non salviamo la chiave in chiaro)
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    return {
      keyLabel,
      keyHash,
      limit: credits,
    };
  }

  /**
   * Revoca una subkey OpenRouter
   * @param keyLabel Label della subkey da revocare
   */
  static async revokeSubkey(keyLabel: string): Promise<void> {
    if (!OPENROUTER_PROVISIONING_KEY) {
      throw new Error('OPENROUTER_PROVISIONING_KEY non configurata');
    }

    // Recupera la subkey dal database per ottenere l'ID
    const apiKeyRecord = await this.getRepo().findFirstActive({
      keyLabel,
    });

    if (!apiKeyRecord) {
      // Se non trovata nel DB, prova comunque a revocare via label
      log.warn(`Subkey ${keyLabel} non trovata nel database, tentativo revoca diretto`);
    }

    // OpenRouter API per revocare: DELETE /api/v1/keys/{keyId}
    // Usiamo la label come identificatore
    const response = await fetch(`${OPENROUTER_BASE_URL}/keys/${keyLabel}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${OPENROUTER_PROVISIONING_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok && response.status !== 404) {
      // 404 significa che la chiave non esiste più, non è un errore
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Errore revoca subkey OpenRouter: ${response.status} ${errorData.error || response.statusText}`
      );
    }

    // Aggiorna lo status nel database se esiste
    if (apiKeyRecord) {
      await this.getRepo().update(apiKeyRecord.id, { status: 'REVOKED', updatedAt: new Date() });
    }
  }

  /**
   * Salva una subkey nel database
   * @param params Parametri per il salvataggio
   * @param tx Optional duck-typed client for transactions (must have user_api_keys.create)
   * @returns Record della subkey salvata
   */
  static async saveSubkeyToDb(
    params: SaveSubkeyParams,
    tx?: { user_api_keys: { create: (args: Record<string, unknown>) => Promise<unknown> } }
  ): Promise<void> {
    const { userId, provider, keyLabel, keyHash, limit, stripePaymentIntentId } = params;

    const data = {
      id: createId(),
      userId,
      provider,
      keyLabel,
      keyHash,
      limit,
      status: 'ACTIVE',
      stripePaymentIntentId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (tx) {
      await tx.user_api_keys.create({ data });
    } else {
      await this.getRepo().create(data);
    }
  }

  /**
   * Verifica se esiste già una subkey attiva per un payment intent
   * @param stripePaymentIntentId ID del payment intent
   * @returns true se esiste, false altrimenti
   */
  static async hasSubkeyForPaymentIntent(stripePaymentIntentId: string): Promise<boolean> {
    const existing = await this.getRepo().findFirstActive({
      stripePaymentIntentId,
    });

    return !!existing;
  }
}
