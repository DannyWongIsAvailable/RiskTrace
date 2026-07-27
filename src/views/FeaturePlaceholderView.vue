<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const title = computed(() => String(route.meta.title ?? '功能模块'))
const description = computed(() =>
  String(
    route.meta.description ??
      '该模块已接入统一应用布局。后续业务页面应复用现有基础组件、设计令牌和 API 模块。',
  ),
)
</script>

<template>
  <div class="rt-page rt-page-stack">
    <PageHeader :title="title" :description="description" />
    <BaseCard padding="none">
      <EmptyState
        :title="`${title}尚未接入业务数据`"
        description="此处保留为清晰的业务边界，不使用虚假图表、随机占位图或 emoji 填充页面。实现功能前请先定义数据模型、接口契约与页面状态。"
        action-label="查看设计系统"
        @action="$router.push('/foundation')"
      />
    </BaseCard>
  </div>
</template>
