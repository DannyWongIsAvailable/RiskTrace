<script setup lang="ts">
import { computed } from 'vue'

import type { MaterialAnalysis } from '@/types/project'
import type { StatusTone } from '@/types/ui'

const props = defineProps<{
  analysis: MaterialAnalysis
}>()

const completenessMeta = computed<{ label: string; tone: StatusTone }>(() => {
  switch (props.analysis.completeness.result) {
    case 'complete':
      return { label: '材料基本完整', tone: 'success' }
    case 'incomplete':
      return { label: '材料不完整', tone: 'warning' }
    case 'uncertain':
      return { label: '完整性待确认', tone: 'neutral' }
  }
})
</script>

<template>
  <section class="material-analysis-panel">
    <SectionHeader
      title="Mock 材料分类"
      description="分类结果已先返回；系统会继续自动生成 Mock 合规审查报告。"
    />

    <div class="material-analysis-panel__summary-grid">
      <BaseCard title="项目摘要">
        <p class="material-analysis-panel__copy">{{ analysis.summary }}</p>
      </BaseCard>
      <BaseCard title="材料完整性">
        <div class="material-analysis-panel__completeness">
          <StatusTag
            :label="completenessMeta.label"
            :tone="completenessMeta.tone"
            size="large"
          />
          <p class="material-analysis-panel__copy">{{ analysis.completeness.summary }}</p>
        </div>
      </BaseCard>
    </div>

    <BaseCard
      v-if="analysis.completeness.missingMaterials.length"
      title="可能缺少的材料"
      description="该判断由 Mock 文件名分类生成，不代表已解析正文。"
    >
      <div class="material-analysis-panel__tags">
        <el-tag
          v-for="item in analysis.completeness.missingMaterials"
          :key="item"
          type="warning"
          effect="light"
        >
          {{ item }}
        </el-tag>
      </div>
    </BaseCard>

    <BaseCard
      title="逐文件分类"
      :description="`共 ${analysis.materials.length} 份材料`"
      padding="none"
    >
      <el-table :data="analysis.materials" row-key="documentId">
        <el-table-column label="文件名" min-width="220" prop="fileName" />
        <el-table-column label="材料名称" min-width="180" prop="materialName" />
        <el-table-column label="类别" min-width="170">
          <template #default="{ row }">
            <el-tag effect="plain">{{ row.category }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Mock 摘要" min-width="280" prop="summary" />
      </el-table>
    </BaseCard>
  </section>
</template>

<style scoped>
.material-analysis-panel {
  display: flex;
  flex-direction: column;
  gap: var(--rt-space-4);
}

.material-analysis-panel__summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--rt-space-4);
}

.material-analysis-panel__copy {
  color: var(--rt-text-secondary);
  line-height: var(--rt-line-height-base);
}

.material-analysis-panel__completeness {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--rt-space-3);
}

.material-analysis-panel__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--rt-space-2);
}

@media (max-width: 800px) {
  .material-analysis-panel__summary-grid {
    grid-template-columns: 1fr;
  }
}
</style>
