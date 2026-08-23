import { AppError } from './errors'
import { DeepSeekHarnessReviewProvider } from './deepseek-harness-provider'
import { MockReviewProvider } from './mock-review-service'
import type { ReviewProvider, ReviewProviderName } from './review-provider'
import { XingchenReviewProvider } from './xingchen-provider'

const DEFAULT_REVIEW_PROVIDER: ReviewProviderName = 'mock'

export function getConfiguredReviewProviderName(env: Env): ReviewProviderName {
  const raw = env.REVIEW_PROVIDER?.trim().toLowerCase()
  if (!raw) {
    return DEFAULT_REVIEW_PROVIDER
  }

  if (raw === 'mock') return 'mock'
  if (raw === 'xingchen' || raw === 'xfyun') return 'xingchen'
  if (raw === 'deepseek-harness' || raw === 'deepseek_harness' || raw === 'deepseek') {
    return 'deepseek-harness'
  }

  throw new AppError('WORKFLOW_PROVIDER_INVALID_CONFIG', '合规审查执行配置无效', 500)
}

export function createConfiguredReviewProvider(env: Env): ReviewProvider {
  switch (getConfiguredReviewProviderName(env)) {
    case 'mock':
      return new MockReviewProvider()
    case 'xingchen':
      return new XingchenReviewProvider(env)
    case 'deepseek-harness':
      return new DeepSeekHarnessReviewProvider(env)
  }
}

export function isConfiguredReviewProviderAvailable(env: Env): boolean {
  try {
    createConfiguredReviewProvider(env)
    return true
  } catch (error) {
    if (error instanceof AppError) {
      return false
    }
    throw error
  }
}
