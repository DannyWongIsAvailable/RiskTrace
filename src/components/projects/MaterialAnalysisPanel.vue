<script setup lang="ts">
import { computed, ref } from 'vue'

import type { MaterialAnalysis, MaterialCategory } from '@/types/project'
import type { StatusTone } from '@/types/ui'

const props = defineProps<{
  analysis: MaterialAnalysis
}>()

const activeCategories = ref<string[]>([])

const categoryOrder: MaterialCategory[] = [
  '采购立项与审批',
  '供应商与寻源',
  '合同与补充协议',
  '订单与执行',
  '交付与验收',
  '发票与付款',
  '其他材料',
  '无法判断',
]

const completenessMeta = {
  complete: { label: '材料基本完整', tone: 'success' as StatusTone },
  incomplete: { label: '材料不完整', tone: 'warning' as StatusTone },
  uncertain: { label: '完整性待确认', tone: 'neutral' as StatusTone },
}

const groupedMaterials = computed(() => {
  const groups = new Map<MaterialCategory, MaterialAnalysis['materials']>()

  for (const material of props.analysis.materials) {
    const items = groups.get(material.category) ?? []
    items.push(material)
    groups.set(material.category, items)
  }

  return categoryOrder
    .filter((category) => groups.has(category))
    .map((category) => ({
      category,
      materials: groups.get(category) ?? [],
    }))
})
</script>

<template>
  <div class="material-analysis-panel">
    <BaseCard title="材料理解摘要">
      <p class="material-analysis-panel__summary">{{ analysis.summary }}</p>
    </BaseCard>

    <BaseCard
      title="逐文件分类"
      description="按材料类别归组展示；点击类别标题可展开或收起对应文件。"
    >
      <el-collapse
        v-if="groupedMaterials.length"
        v-model="activeCategories"
        class="material-analysis-panel__collapse"
      >
        <el-collapse-item
          v-for="group in groupedMaterials"
          :key="group.category"
          :name="group.category"
        >
          <template #title>
            <div class="material-analysis-panel__category-title">
              <strong>{{ group.category }}</strong>
              <span>{{ group.materials.length }} 个文件</span>
            </div>
          </template>

          <div class="material-analysis-panel__material-list">
            <div
              v-for="material in group.materials"
              :key="material.documentId"
              class="material-analysis-panel__material-row"
            >
              <div class="material-analysis-panel__material-main">
                <strong>{{ material.materialName }}</strong>
                <span>{{ material.fileName }}</span>
              </div>
              <p>{{ material.summary }}</p>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>

      <p v-else class="material-analysis-panel__empty">暂无逐文件分类结果。</p>
    </BaseCard>

    <BaseCard title="材料完整性">
      <div class="material-analysis-panel__completeness">
        <StatusTag
          :label="completenessMeta[analysis.completeness.result].label"
          :tone="completenessMeta[analysis.completeness.result].tone"
        />
        <p>{{ analysis.completeness.summary }}</p>
      </div>

      <div
        v-if="analysis.completeness.missingMaterials.length"
        class="material-analysis-panel__missing"
      >
        <span>缺失材料</span>
        <div class="material-analysis-panel__tag-list">
          <el-tag
            v-for="item in analysis.completeness.missingMaterials"
            :key="item"
            type="warning"
            effect="light"
          >
            {{ item }}
          </el-tag>
        </div>
      </div>
    </BaseCard>
  </div>
</template>

<style scoped>
.material-analysis-panel {
  display: flex;
  flex-direction: column;
  gap: var(--rt-space-4);
}

.material-analysis-panel__summary,
.material-analysis-panel__material-row p,
.material-analysis-panel__completeness p,
.material-analysis-panel__empty {
  margin: 0;
  color: var(--rt-text-secondary);
  line-height: var(--rt-line-height-base);
}

.material-analysis-panel__collapse {
  border-top: 0;
}

.material-analysis-panel__category-title {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  gap: var(--rt-space-4);
  padding-right: var(--rt-space-3);
}

.material-analysis-panel__category-title strong {
  overflow: hidden;
  color: var(--rt-text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.material-analysis-panel__category-title span {
  flex: 0 0 auto;
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-xs);
  font-weight: 500;
}

.material-analysis-panel__material-list {
  display: flex;
  flex-direction: column;
  gap: var(--rt-space-2);
  padding-bottom: var(--rt-space-2);
}

.material-analysis-panel__material-row {
  display: grid;
  grid-template-columns: minmax(180px, 0.8fr) minmax(0, 1.6fr);
  gap: var(--rt-space-5);
  padding: var(--rt-space-3) var(--rt-space-4);
  border: 1px solid var(--rt-border-subtle);
  border-radius: var(--rt-radius-md);
}

.material-analysis-panel__material-main {
  min-width: 0;
}

.material-analysis-panel__material-main strong,
.material-analysis-panel__material-main span {
  display: block;
}

.material-analysis-panel__material-main strong {
  overflow: hidden;
  color: var(--rt-text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.material-analysis-panel__material-main span {
  overflow: hidden;
  margin-top: var(--rt-space-1);
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.material-analysis-panel__material-row p {
  font-size: var(--rt-font-size-sm);
}

.material-analysis-panel__completeness {
  display: flex;
  align-items: flex-start;
  gap: var(--rt-space-4);
}

.material-analysis-panel__missing {
  margin-top: var(--rt-space-5);
}

.material-analysis-panel__missing > span {
  display: block;
  margin-bottom: var(--rt-space-2);
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-xs);
  font-weight: 700;
}

.material-analysis-panel__tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--rt-space-2);
}

.material-analysis-panel__empty {
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-sm);
}

@media (max-width: 760px) {
  .material-analysis-panel__material-row {
    grid-template-columns: 1fr;
    gap: var(--rt-space-2);
  }

  .material-analysis-panel__completeness {
    flex-direction: column;
  }
}
</style>
