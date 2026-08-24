import type { ReviewToolPresentationKind } from '@/types/review-activity'

export interface ReviewToolPresentation {
  title: string
  kind: ReviewToolPresentationKind
}

export function getReviewToolPresentation(name: string): ReviewToolPresentation {
  const normalized = name.trim().toLowerCase()

  if (normalized === 'run_code') return { title: '执行 Harness Code Mode', kind: 'execute' }
  if (normalized === 'web_search') return { title: '检索外部信息', kind: 'search' }
  if (normalized === 'web_fetch') return { title: '读取网页', kind: 'fetch' }
  if (/mineru|parse|extract/.test(normalized)) return { title: '解析文档', kind: 'read' }
  if (/grep|search|find/.test(normalized)) return { title: '检索内容', kind: 'search' }
  if (/read|file|document|fs/.test(normalized)) return { title: '读取材料', kind: 'read' }
  if (/edit|write|replace|patch/.test(normalized)) return { title: '编辑文件', kind: 'edit' }
  if (/bash|shell|execute|command|code/.test(normalized)) return { title: '执行工具', kind: 'execute' }

  return { title: `执行 ${name || '工具'}`, kind: 'other' }
}
