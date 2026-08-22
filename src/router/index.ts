import { createRouter, createWebHistory } from 'vue-router'

import { AppIcons } from '@/icons'
import AppLayout from '@/layouts/AppLayout.vue'
import DashboardView from '@/views/DashboardView.vue'
import NotFoundView from '@/views/NotFoundView.vue'
import ProjectCreateView from '@/views/ProjectCreateView.vue'
import ProjectListView from '@/views/ProjectListView.vue'
import ProviderCheckView from '@/views/ProviderCheckView.vue'
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
          redirect: '/dashboard',
        },
        {
          path: 'dashboard',
          name: 'dashboard',
          component: DashboardView,
          meta: {
            title: '审查总览',
            description: '查看采购项目、审查进度与风险统计。',
            navigation: {
              group: 'main',
              order: 10,
              label: '审查总览',
              icon: AppIcons.navigation.dashboard,
              description: '项目进度与风险统计',
            },
          },
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
              order: 20,
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
        {
          path: 'provider-check',
          name: 'provider-check',
          component: ProviderCheckView,
          meta: {
            title: 'Provider 检查',
            description: '检查 Pages Functions、FastAPI 与 DeepSeek Harness 全链路。',
            navigation: {
              group: 'support',
              order: 10,
              label: 'Provider 检查',
              icon: AppIcons.navigation.rules,
              description: 'Functions / FastAPI / Harness 联调',
            },
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
