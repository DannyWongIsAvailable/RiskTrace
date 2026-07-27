export interface ApiMeta {
  requestId?: string
  timestamp?: string
}

export interface ApiSuccess<T> {
  success: true
  data: T
  message?: string
  meta?: ApiMeta
}

export interface ApiFailure {
  success: false
  code: string
  message: string
  details?: unknown
  meta?: ApiMeta
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure

export interface PageQuery {
  page?: number
  pageSize?: number
}

export interface PaginationMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface PaginatedData<T> {
  items: T[]
  pagination: PaginationMeta
}
