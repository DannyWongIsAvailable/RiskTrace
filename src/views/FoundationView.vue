<script setup lang="ts">
import { ref } from 'vue'

import { AppIcons } from '@/icons'
import type { DescriptionItem } from '@/types/ui'
import { showPendingIntegration } from '@/utils/interaction'

const keyword = ref('')
const riskLevel = ref('')
const loadingDemo = ref(false)
const errorDemo = ref(false)
const confirmDialogOpen = ref(false)
const page = ref(1)
const pageSize = ref(20)
const lastActionReason = ref('')

const descriptionItems: DescriptionItem[] = [
  { key: 'findingNo', label: '事项编号', value: 'RT-FINDING-2026-001' },
  { key: 'supplier', label: '供应商', value: '海岳精密设备有限公司' },
  { key: 'amount', label: '涉及金额', value: '¥1,331,100' },
  { key: 'owner', label: '复核负责人', value: '合规中心' },
  {
    key: 'summary',
    label: '风险摘要',
    value: '存在拆单规避审批、付款账户不一致与验收材料补录风险。',
    span: 2,
  },
]

function toggleLoadingDemo(): void {
  loadingDemo.value = !loadingDemo.value
  errorDemo.value = false
}

function toggleErrorDemo(): void {
  errorDemo.value = !errorDemo.value
  loadingDemo.value = false
}

function handleConfirmAction(reason: string): void {
  confirmDialogOpen.value = false
  lastActionReason.value = reason
}
</script>

<template>
  <div class="rt-page rt-page-stack">
    <PageHeader
      eyebrow="Design foundation"
      title="前端设计系统"
      description="用于校验基础组件、状态表达、间距、文字层级和 Element Plus 主题。业务页面不得脱离这些约束自行创建另一套视觉语言。"
      :breadcrumbs="[{ label: '工程支持' }, { label: '设计系统' }]"
    >
      <template #actions>
        <el-button @click="toggleLoadingDemo">切换加载状态</el-button>
        <el-button @click="toggleErrorDemo">切换错误状态</el-button>
      </template>
    </PageHeader>

    <section>
      <SectionHeader
        title="状态标签"
        description="状态颜色只表达明确语义，不用于装饰。"
      />
      <BaseCard>
        <div class="foundation__inline-list">
          <StatusTag label="默认状态" />
          <StatusTag label="审查中" tone="primary" />
          <StatusTag label="已通过" tone="success" />
          <StatusTag label="需关注" tone="warning" />
          <StatusTag label="重大风险" tone="danger" />
        </div>
      </BaseCard>
    </section>

    <section>
      <SectionHeader
        title="筛选工具栏"
        description="页面筛选条件集中呈现，不散落在表格与标题之间。"
      />
      <FilterBar title="风险事项筛选" description="支持关键字与风险等级组合筛选">
        <el-input v-model="keyword" placeholder="事项编号、供应商或采购项目名称" clearable />
        <el-select v-model="riskLevel" placeholder="风险等级" clearable>
          <el-option label="重大风险" value="critical" />
          <el-option label="高风险" value="high" />
          <el-option label="中风险" value="medium" />
        </el-select>
        <template #actions>
          <el-button @click="showPendingIntegration">重置</el-button>
          <el-button type="primary" @click="showPendingIntegration">查询</el-button>
        </template>
      </FilterBar>
    </section>

    <section>
      <SectionHeader title="内容状态" description="所有数据区域必须覆盖加载、空、错误和成功状态。" />
      <div class="foundation__state-grid">
        <BaseCard title="加载状态" padding="none">
          <LoadingState v-if="loadingDemo" title="正在读取风险事项" :rows="5" />
          <EmptyState
            v-else
            compact
            title="点击上方按钮预览"
            description="加载骨架只用于真实等待过程，不得作为永久占位内容。"
          />
        </BaseCard>

        <BaseCard title="错误状态" padding="none">
          <ErrorState
            v-if="errorDemo"
            compact
            title="数据请求失败"
            description="保留明确的错误说明和可恢复操作。"
            @retry="toggleErrorDemo"
          />
          <EmptyState
            v-else
            compact
            title="点击上方按钮预览"
            description="错误信息应面向用户，不直接泄露堆栈或内部实现。"
          />
        </BaseCard>
      </div>
    </section>

    <section>
      <SectionHeader
        title="提示、详情与分页"
        description="高频业务模式应使用固定组件，不在页面内重复拼装。"
      />
      <div class="foundation__state-grid">
        <BaseCard title="上下文提示">
          <div class="foundation__notice-stack">
            <InlineNotice
              title="规则命中说明"
              description="系统发现三笔订单在 48 小时内创建，累计金额超过高级审批阈值。"
              tone="warning"
            />
            <InlineNotice
              v-if="lastActionReason"
              title="操作记录已生成"
              :description="lastActionReason"
              tone="success"
            />
            <InlineNotice
              title="处置要求"
              description="重大风险放行必须记录人工判断依据。"
              tone="danger"
            >
              <template #actions>
                <el-button type="danger" plain @click="confirmDialogOpen = true">
                  暂缓付款
                </el-button>
              </template>
            </InlineNotice>
          </div>
        </BaseCard>

        <BaseCard title="结构化详情">
          <DescriptionList :items="descriptionItems" />
        </BaseCard>
      </div>

      <BaseCard class="foundation__pagination-card" title="分页控件">
        <PaginationBar
          v-model:page="page"
          v-model:page-size="pageSize"
          :total="126"
        />
      </BaseCard>
    </section>

    <ConfirmActionDialog
      v-model="confirmDialogOpen"
      title="确认暂缓付款"
      description="该操作会阻止付款流程继续执行，并创建人工复核任务。"
      confirm-text="确认暂缓"
      confirm-type="danger"
      require-reason
      @confirm="handleConfirmAction"
    />

    <section>
      <SectionHeader title="按钮与表单" description="优先使用 Element Plus，并由全局主题统一外观。" />
      <BaseCard>
        <div class="foundation__form-grid">
          <el-input placeholder="请输入规则名称" />
          <el-select placeholder="请选择风险等级">
            <el-option label="低风险" value="low" />
            <el-option label="中风险" value="medium" />
            <el-option label="高风险" value="high" />
          </el-select>
          <el-date-picker type="daterange" start-placeholder="开始日期" end-placeholder="结束日期" />
        </div>
        <div class="foundation__button-row">
          <el-button @click="showPendingIntegration">取消</el-button>
          <el-button type="primary" plain @click="showPendingIntegration">保存草稿</el-button>
          <el-button type="primary" @click="showPendingIntegration">提交审批</el-button>
          <el-button type="danger" plain @click="showPendingIntegration">暂缓付款</el-button>
          <el-button :icon="AppIcons.action.refresh" @click="showPendingIntegration">刷新数据</el-button>
          <el-button :icon="AppIcons.action.view" @click="showPendingIntegration">查看详情</el-button>
          <el-button :icon="AppIcons.action.delete" type="danger" plain @click="showPendingIntegration">删除记录</el-button>
        </div>
      </BaseCard>
    </section>
  </div>
</template>

<style scoped>
.foundation__inline-list,
.foundation__button-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--rt-space-3);
}

.foundation__notice-stack {
  display: flex;
  flex-direction: column;
  gap: var(--rt-space-3);
}

.foundation__pagination-card {
  margin-top: var(--rt-space-4);
}

.foundation__state-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--rt-space-4);
}

.foundation__form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--rt-space-4);
}

.foundation__button-row {
  margin-top: var(--rt-space-5);
  padding-top: var(--rt-space-5);
  border-top: 1px solid var(--rt-border-subtle);
}

@media (max-width: 900px) {
  .foundation__state-grid,
  .foundation__form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
