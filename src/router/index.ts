import { createRouter, createWebHistory } from 'vue-router'

import { AppIcons } from '@/icons'
import AppLayout from '@/layouts/AppLayout.vue'
import NotFoundView from '@/views/NotFoundView.vue'
import ProjectCreateView from '@/views/ProjectCreateView.vue'
import ProjectListView from '@/views/ProjectListView.vue'
import ProjectReportView from '@/views/ProjectReportView.vue'
import ProjectUploadView from '@/views/ProjectUploadView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: AppLayout,
      children: [
        {
          path: '',
          redirect: '/projects',
        },
        {
          path: 'projects',
          name: 'projects',
          component: ProjectListView,
          meta: {
            title: '采购项目',
            description: '创建采购项目、上传材料并查看合规审查报告。',
            navigation: {
              group: 'main',
              order: 10,
              icon: AppIcons.navigation.projects,
              description: '项目、材料与审查报告',
            },
          },
        },
        {
          path: 'projects/new',
          name: 'project-create',
          component: ProjectCreateView,
          meta: {
            title: '新建采购项目',
            description: '填写项目标题并进入材料上传。',
          },
        },
        {
          path: 'projects/:projectId/upload',
          name: 'project-upload',
          component: ProjectUploadView,
          meta: {
            title: '上传项目材料',
            description: '批量上传项目材料并生成报告。',
          },
        },
        {
          path: 'projects/:projectId/report',
          name: 'project-report',
          component: ProjectReportView,
          meta: {
            title: '合规审查报告',
            description: '查看采购项目合规审查报告。',
          },
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: NotFoundView,
      meta: {
        title: '页面不存在',
      },
    },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

router.afterEach((to) => {
  const title = String(to.meta.title ?? 'RiskTrace')
  document.title = `${title} · RiskTrace`
})

export default router
