import type { ProjectRow, ProjectStage, ProjectStatus } from './domain'
import { AppError } from './errors'

export async function createProject(
  db: D1Database,
  input: { id: string; title: string; now: string },
): Promise<ProjectRow> {
  await db
    .prepare(
      `INSERT INTO projects (id, title, status, stage, created_at, updated_at)
       VALUES (?, ?, 'draft', 'waiting_for_upload', ?, ?)`,
    )
    .bind(input.id, input.title, input.now, input.now)
    .run()

  return requireProject(db, input.id)
}

export async function findProject(db: D1Database, projectId: string): Promise<ProjectRow | null> {
  return db.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<ProjectRow>()
}

export async function requireProject(db: D1Database, projectId: string): Promise<ProjectRow> {
  const project = await findProject(db, projectId)
  if (!project) {
    throw new AppError('PROJECT_NOT_FOUND', '未找到采购项目', 404)
  }

  return project
}

export async function listProjects(
  db: D1Database,
  input: { pageSize: number; offset: number },
): Promise<{ items: ProjectRow[]; total: number }> {
  const [itemsResult, countRow] = await Promise.all([
    db
      .prepare(
        `SELECT * FROM projects
         ORDER BY updated_at DESC, id DESC
         LIMIT ? OFFSET ?`,
      )
      .bind(input.pageSize, input.offset)
      .all<ProjectRow>(),
    db.prepare('SELECT COUNT(*) AS total FROM projects').first<{ total: number }>(),
  ])

  return {
    items: itemsResult.results,
    total: countRow?.total ?? 0,
  }
}

export async function updateProjectState(
  db: D1Database,
  input: {
    projectId: string
    status: ProjectStatus
    stage: ProjectStage
    now: string
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE projects
       SET status = ?, stage = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(input.status, input.stage, input.now, input.projectId)
    .run()
}
