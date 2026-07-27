// src/icons/index.ts

import {
  Bell,
  CircleCheckFilled,
  Close,
  DataAnalysis,
  Delete,
  DocumentChecked,
  Download,
  EditPen,
  Expand,
  Filter,
  Finished,
  Fold,
  Grid,
  Loading,
  Menu,
  MoreFilled,
  Refresh,
  Search,
  Setting,
  Upload,
  User,
  View,
  WarningFilled,
} from '@element-plus/icons-vue'


export const AppIcons = {

  // 导航图标
  navigation: {
    dashboard: DataAnalysis,
    cases: DocumentChecked,
    tasks: Finished,
    rules: Setting,
    foundation: Grid,
  },


  // 操作图标
  action: {
    search: Search,
    filter: Filter,
    refresh: Refresh,
    upload: Upload,
    download: Download,
    view: View,
    edit: EditPen,
    delete: Delete,
    more: MoreFilled,
  },


  // 布局
  layout: {
    menu: Menu,
    collapse: Fold,
    expand: Expand,
    close: Close,
  },


  // 状态
  status: {
    success: CircleCheckFilled,
    warning: WarningFilled,
    loading: Loading,
  },


  // 用户
  account: {
    user: User,
    notification: Bell,
  },

} as const