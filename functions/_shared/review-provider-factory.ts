import { DeepSeekHarnessReviewProvider } from './deepseek-harness-provider'
import type { ReviewProvider, ReviewProviderName } from './review-provider'

/**
 * Legacy import surface kept so older call sites continue compiling. RiskTrace now has exactly one
 * execution backend: DeepSeek Harness. REVIEW_PROVIDER is intentionally ignored.
 */
export function getConfiguredReviewProviderName(_env: Env): ReviewProviderName {
  return 'deepseek-harness'
}

export function createConfiguredReviewProvider(env: Env): ReviewProvider {
  return new DeepSeekHarnessReviewProvider(env)
}

export function isConfiguredReviewProviderAvailable(env: Env): boolean {
  try {
    createConfiguredReviewProvider(env)
    return true
  } catch {
    return false
  }
}
