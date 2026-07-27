<template>
  <div class="not-found">
    <BaseCard class="not-found__card" padding="lg">
      <p class="not-found__code">404</p>
      <h1 class="not-found__title">页面不存在</h1>
      <p class="not-found__description">当前地址无对应页面，请返回风险驾驶舱继续操作。</p>
      <el-button type="primary" @click="$router.replace('/dashboard')">返回风险驾驶舱</el-button>
    </BaseCard>
  </div>
</template>

<style scoped>
.not-found {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: var(--rt-space-6);
  background: var(--rt-bg-page);
}

.not-found__card {
  width: min(100%, 520px);
  text-align: center;
}

.not-found__code {
  color: var(--rt-color-primary-600);
  font-size: 64px;
  font-weight: 800;
  letter-spacing: -0.06em;
  line-height: 1;
}

.not-found__title {
  margin-top: var(--rt-space-4);
  font-size: var(--rt-font-size-2xl);
}

.not-found__description {
  margin: var(--rt-space-3) 0 var(--rt-space-6);
  color: var(--rt-text-tertiary);
}
</style>
