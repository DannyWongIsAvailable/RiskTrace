import { ApiError, http } from '@/api/request'
import type { PageQuery } from '@/types/api'
import type {
  CompleteUploadsResult,
  CreateProjectInput,
  DeleteProjectDocumentResult,
  DeleteProjectResult,
  ProjectDetail,
  ProjectDocument,
  ProjectListData,
  ProjectSummary,
  ReviewReport,
  UploadSession,
  UploadSessionFile,
} from '@/types/project'

interface UploadFileDescriptor {
  fileName: string
  mimeType: string
  sizeBytes: number
}

export function listProjects(
  query: PageQuery = {},
  signal?: AbortSignal,
): Promise<ProjectListData> {
  return http.get<ProjectListData>('/api/projects', {
    query: { page: query.page, pageSize: query.pageSize },
    signal,
  })
}

export function createProject(
  input: CreateProjectInput,
  signal?: AbortSignal,
): Promise<ProjectSummary> {
  return http.post<ProjectSummary, CreateProjectInput>('/api/projects', input, { signal })
}

export function getProject(projectId: string, signal?: AbortSignal): Promise<ProjectDetail> {
  return http.get<ProjectDetail>(`/api/projects/${projectId}`, { signal })
}

export function deleteProject(
  projectId: string,
  signal?: AbortSignal,
): Promise<DeleteProjectResult> {
  return http.delete<DeleteProjectResult>(`/api/projects/${projectId}`, {
    signal,
    timeoutMs: 30_000,
  })
}

export function deleteProjectDocument(
  projectId: string,
  documentId: string,
  signal?: AbortSignal,
): Promise<DeleteProjectDocumentResult> {
  return http.delete<DeleteProjectDocumentResult>(
    `/api/projects/${projectId}/documents/${documentId}`,
    { signal, timeoutMs: 30_000 },
  )
}

export function createUploadSession(
  projectId: string,
  files: UploadFileDescriptor[],
  signal?: AbortSignal,
): Promise<UploadSession> {
  return http.post<UploadSession, { files: UploadFileDescriptor[] }>(
    `/api/projects/${projectId}/upload-sessions`,
    { files },
    { signal, timeoutMs: 30_000 },
  )
}

export function confirmDocumentUpload(
  projectId: string,
  documentId: string,
  signal?: AbortSignal,
): Promise<ProjectDocument> {
  return http.post<ProjectDocument>(
    `/api/projects/${projectId}/documents/${documentId}/complete`,
    undefined,
    { signal, timeoutMs: 30_000 },
  )
}

export function completeProjectUploads(
  projectId: string,
  signal?: AbortSignal,
): Promise<CompleteUploadsResult> {
  return http.post<CompleteUploadsResult>(
    `/api/projects/${projectId}/uploads/complete`,
    undefined,
    { signal, timeoutMs: 30_000 },
  )
}

export function getProjectReport(
  projectId: string,
  signal?: AbortSignal,
): Promise<ReviewReport> {
  return http.get<ReviewReport>(`/api/projects/${projectId}/report`, { signal })
}

const R2_UPLOAD_TIMEOUT_MS = 5 * 60_000

export function uploadFileToSignedUrl(
  target: UploadSessionFile,
  file: File,
  onProgress: (progress: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    let settled = false

    const cleanup = (): void => {
      signal?.removeEventListener('abort', handleAbort)
    }
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
      fail('材料上传已取消', 'REQUEST_CANCELLED', 0)
      return
    }

    request.open(target.method, target.uploadUrl)
    request.timeout = R2_UPLOAD_TIMEOUT_MS
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
      fail('材料上传到对象存储失败', 'R2_UPLOAD_FAILED')
    })
    request.addEventListener('error', () =>
      fail('材料上传网络异常', 'R2_UPLOAD_NETWORK_ERROR', 0),
    )
    request.addEventListener('timeout', () =>
      fail('材料上传超时，请检查网络后重试', 'R2_UPLOAD_TIMEOUT', 408),
    )
    request.addEventListener('abort', () => fail('材料上传已取消', 'REQUEST_CANCELLED', 0))

    signal?.addEventListener('abort', handleAbort, { once: true })
    request.send(file)
  })
}
