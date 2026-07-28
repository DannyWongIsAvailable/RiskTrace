<script setup lang="ts">
import { mainNavigation, supportNavigation } from '@/constants/navigation'
import { AppIcons } from '@/icons'

const emit = defineEmits<{
  navigate: []
  toggle: []
}>()

withDefaults(
  defineProps<{
    collapsed?: boolean
    mobile?: boolean
  }>(),
  {
    collapsed: false,
    mobile: false,
  },
)
</script>

<template>
  <aside
    class="app-sidebar"
    :class="{
      'app-sidebar--collapsed': collapsed,
      'app-sidebar--mobile': mobile,
    }"
  >
    <div class="app-sidebar__brand">
      <AppLogo :compact="collapsed && !mobile" />
    </div>

    <nav class="app-sidebar__navigation" aria-label="主导航">
      <div class="app-sidebar__group">
        <span v-if="!collapsed || mobile" class="app-sidebar__group-label">工作台</span>
        <RouterLink
          v-for="item in mainNavigation"
          :key="item.key"
          class="app-sidebar__link"
          :to="item.to"
          :title="collapsed && !mobile ? item.label : undefined"
          @click="emit('navigate')"
        >
          <el-icon class="app-sidebar__link-icon" aria-hidden="true">
            <component :is="item.icon" />
          </el-icon>
          <span v-if="!collapsed || mobile" class="app-sidebar__link-copy">
            <span class="app-sidebar__link-label">{{ item.label }}</span>
            <span v-if="item.description" class="app-sidebar__link-description">
              {{ item.description }}
            </span>
          </span>
          <span v-if="item.badge && (!collapsed || mobile)" class="app-sidebar__badge">
            {{ item.badge }}
          </span>
        </RouterLink>
      </div>

      <div class="app-sidebar__group app-sidebar__group--support">
        <span v-if="!collapsed || mobile" class="app-sidebar__group-label">工程支持</span>
        <RouterLink
          v-for="item in supportNavigation"
          :key="item.key"
          class="app-sidebar__link"
          :to="item.to"
          :title="collapsed && !mobile ? item.label : undefined"
          @click="emit('navigate')"
        >
          <el-icon class="app-sidebar__link-icon" aria-hidden="true">
            <component :is="item.icon" />
          </el-icon>
          <span v-if="!collapsed || mobile" class="app-sidebar__link-copy">
            <span class="app-sidebar__link-label">{{ item.label }}</span>
            <span v-if="item.description" class="app-sidebar__link-description">
              {{ item.description }}
            </span>
          </span>
        </RouterLink>
      </div>
    </nav>

    <div v-if="!mobile" class="app-sidebar__footer">
      <button
        class="app-sidebar__collapse-button"
        type="button"
        :title="collapsed ? '展开导航' : '收起导航'"
        @click="emit('toggle')"
      >
        <el-icon class="app-sidebar__collapse-icon" aria-hidden="true">
          <component :is="collapsed ? AppIcons.layout.expand : AppIcons.layout.collapse" />
        </el-icon>
        <span v-if="!collapsed">收起导航</span>
        <span v-else class="rt-sr-only">展开导航</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.app-sidebar {
  display: flex;
  width: var(--rt-sidebar-width);
  height: 100%;
  min-height: 0;
  flex-direction: column;
  border-right: 1px solid var(--rt-border-subtle);
  background: var(--rt-bg-panel);
  transition: width var(--rt-duration-base) var(--rt-ease-standard);
}

.app-sidebar--collapsed {
  width: var(--rt-sidebar-collapsed-width);
}

.app-sidebar--mobile {
  width: min(88vw, 320px);
  border-right: 0;
}

.app-sidebar__brand {
  display: flex;
  min-height: var(--rt-topbar-height);
  align-items: center;
  padding: 0 var(--rt-space-5);
  border-bottom: 1px solid var(--rt-border-subtle);
}

.app-sidebar--collapsed:not(.app-sidebar--mobile) .app-sidebar__brand {
  justify-content: center;
  padding: 0;
}

.app-sidebar__navigation {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: var(--rt-space-5) var(--rt-space-3);
}

.app-sidebar__group + .app-sidebar__group {
  margin-top: var(--rt-space-6);
}

.app-sidebar__group--support {
  padding-top: var(--rt-space-5);
  border-top: 1px solid var(--rt-border-subtle);
}

.app-sidebar__group-label {
  display: block;
  margin-bottom: var(--rt-space-2);
  padding: 0 var(--rt-space-3);
  color: var(--rt-text-tertiary);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
}

.app-sidebar__link {
  position: relative;
  display: flex;
  min-height: 54px;
  align-items: center;
  gap: var(--rt-space-3);
  margin-bottom: var(--rt-space-1);
  padding: 9px var(--rt-space-3);
  border-radius: var(--rt-radius-md);
  color: var(--rt-text-secondary);
  transition:
    color var(--rt-duration-fast) var(--rt-ease-standard),
    background-color var(--rt-duration-fast) var(--rt-ease-standard);
}

.app-sidebar__link:hover {
  background: var(--rt-bg-hover);
  color: var(--rt-text-primary);
}

//.app-sidebar__link.router-link-active {
//  background: var(--rt-bg-selected);
//  color: var(--rt-color-primary-800);
//}
//
//.app-sidebar__link.router-link-active::before {
//  position: absolute;
//  top: 12px;
//  bottom: 12px;
//  left: 0;
//  width: 3px;
//  border-radius: var(--rt-radius-round);
//  background: var(--rt-color-primary-600);
//  content: '';
//}

.app-sidebar__link-icon {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--rt-border-default);
  border-radius: var(--rt-radius-sm);
  background: var(--rt-bg-panel);
  color: var(--rt-text-secondary);
  font-size: var(--rt-icon-size-md);
}

.router-link-active .app-sidebar__link-icon {
  border-color: var(--rt-color-primary-200);
  background: var(--rt-color-primary-50);
  color: var(--rt-color-primary-700);
}

.app-sidebar__link-copy {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
}

.app-sidebar__link-label {
  font-size: var(--rt-font-size-sm);
  font-weight: 700;
}

.app-sidebar__link-description {
  overflow: hidden;
  margin-top: 2px;
  color: var(--rt-text-tertiary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-sidebar__badge {
  padding: 3px 7px;
  border-radius: var(--rt-radius-round);
  background: var(--rt-color-danger-50);
  color: var(--rt-color-danger-600);
  font-size: 11px;
  font-weight: 800;
}

.app-sidebar--collapsed:not(.app-sidebar--mobile) .app-sidebar__link {
  justify-content: center;
  padding-right: 0;
  padding-left: 0;
}

.app-sidebar__footer {
  flex: 0 0 auto;
  padding: var(--rt-space-3);
  border-top: 1px solid var(--rt-border-subtle);
}

.app-sidebar__collapse-button {
  display: flex;
  width: 100%;
  min-height: 40px;
  align-items: center;
  justify-content: center;
  gap: var(--rt-space-2);
  border-radius: var(--rt-radius-md);
  background: transparent;
  color: var(--rt-text-tertiary);
  cursor: pointer;
  font-size: var(--rt-font-size-xs);
}

.app-sidebar__collapse-button:hover {
  background: var(--rt-bg-hover);
  color: var(--rt-text-primary);
}

.app-sidebar__collapse-icon {
  flex: 0 0 auto;
  color: currentColor;
  font-size: var(--rt-icon-size-sm);
}
</style>
