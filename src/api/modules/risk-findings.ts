import { ApiError, http } from '@/api/request'
import type {
  CompleteRiskFindingInput,
  RiskFinding,
  RiskFindingAttachment,
  RiskFindingAttachmentUploadSession,
  RiskFindingAttachmentUploadSessionFile,
  RiskFindingListData,
  RiskFindingStatus,
} from '@/types/risk-finding'

interface RiskFindingListQuery {
  page?: number
  pageSize?: number
  status?: RiskFindingStatus
}

interface AttachmentFileDescriptor {
  fileName: string
  mimeType: string
  sizeBytes: number
}

export function listRiskFindings(
  query: RiskFindingListQuery = {},
  signal?: AbortSignal,
): Promise<RiskFindingListData> {
  return http.get<RiskFindingListData>('/api/risk-findings', {
    query: {
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
    },
    signal,
    timeoutMs: 30_000,
  })
}

export function completeRiskFinding(
  findingId: string,
  input: CompleteRiskFindingInput,
  signal?: AbortSignal,
): Promise<RiskFinding> {
  return http.patch<RiskFinding, CompleteRiskFindingInput>(
    `/api/risk-findings/${findingId}`,
    input,
    { signal, timeoutMs: 30_000 },
  )
}

export function createRiskFindingAttachmentUploadSession(
  findingId: string,
  files: AttachmentFileDescriptor[],
  signal?: AbortSignal,
): Promise<RiskFindingAttachmentUploadSession> {
  return http.post<
    RiskFindingAttachmentUploadSession,
    { files: AttachmentFileDescriptor[] }
  >(
    `/api/risk-findings/${findingId}/attachments/upload-sessions`,
    { files },
    { signal, timeoutMs: 30_000 },
  )
}

export function confirmRiskFindingAttachmentUpload(
  findingId: string,
  attachmentId: string,
  signal?: AbortSignal,
): Promise<RiskFindingAttachment> {
  return http.post<RiskFindingAttachment>(
    `/api/risk-findings/${findingId}/attachments/${attachmentId}/complete`,
    undefined,
    { signal, timeoutMs: 30_000 },
  )
}

const RISK_ATTACHMENT_UPLOAD_TIMEOUT_MS = 5 * 60_000

export function uploadRiskFindingAttachment(
  target: RiskFindingAttachmentUploadSessionFile,
  file: File,
  onProgress: (progress: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    let settled = false

    const cleanup = (): void => signal?.removeEventListener('abort', handleAbort)
    const succeed = (): void => {
      if (settled) return
      settled = true
      cleanup()
      onProgress(100)
      resolve()
    }
    const fail = (message: string, code: string, status = request.status): void => {
      if (settled) return
      settled = true
      cleanup()
      reject(new ApiError(message, status, code))
    }
    const handleAbort = (): void => {
      if (!settled) request.abort()
    }

    if (signal?.aborted) {
      fail('证明材料上传已取消', 'REQUEST_CANCELLED', 0)
      return
    }

    request.open(target.method, target.uploadUrl)
    request.timeout = RISK_ATTACHMENT_UPLOAD_TIMEOUT_MS
    Object.entries(target.headers).forEach(([name, value]) => request.setRequestHeader(name, value))

    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)))
      }
    })
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        succeed()
        return
      }
      fail('证明材料上传失败', 'RISK_ATTACHMENT_UPLOAD_FAILED')
    })
    request.addEventListener('error', () =>
      fail('证明材料上传网络异常', 'RISK_ATTACHMENT_UPLOAD_NETWORK_ERROR', 0),
    )
    request.addEventListener('timeout', () =>
      fail(
        '证明材料上传超时，请检查网络后重试',
        'RISK_ATTACHMENT_UPLOAD_TIMEOUT',
        408,
      ),
    )
    request.addEventListener('abort', () =>
      fail('证明材料上传已取消', 'REQUEST_CANCELLED', 0),
    )

    signal?.addEventListener('abort', handleAbort, { once: true })
    request.send(file)
  })
}
