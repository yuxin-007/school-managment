import type { ThemeConfig } from 'antd'
import { theme } from 'antd'

export const brandPalette = {
  primary: '#9f3a2b',
  secondary: '#d07a2c',
  ink: '#2f241d',
  textSecondary: '#746253',
  layoutBg: '#f7f1ea',
  layoutBgAlt: '#fcfaf6',
  containerBg: '#fffdfa',
  borderSoft: 'rgba(118, 87, 62, 0.14)',
}

export const buildAppTheme = (isDark: boolean): ThemeConfig => ({
  algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
  token: {
    colorPrimary: brandPalette.primary,
    colorInfo: brandPalette.primary,
    colorSuccess: '#4f8a2f',
    colorWarning: '#c97818',
    colorError: '#c2472d',
    borderRadius: 16,
    borderRadiusLG: 24,
    fontFamily: "'PingFang SC', 'Microsoft YaHei', sans-serif",
    colorTextBase: isDark ? '#f3ede6' : brandPalette.ink,
    colorTextSecondary: isDark ? 'rgba(243, 237, 230, 0.72)' : brandPalette.textSecondary,
    colorBgLayout: isDark ? '#181412' : brandPalette.layoutBg,
    colorBgContainer: isDark ? '#221c19' : brandPalette.containerBg,
    colorBorderSecondary: isDark ? 'rgba(255, 255, 255, 0.08)' : brandPalette.borderSoft,
  },
  components: {
    Layout: {
      siderBg: isDark ? '#201a17' : brandPalette.containerBg,
      headerBg: isDark ? 'rgba(32, 26, 23, 0.9)' : 'rgba(255, 253, 250, 0.86)',
      bodyBg: isDark ? '#181412' : brandPalette.layoutBg,
    },
    Menu: {
      itemBg: 'transparent',
      itemBorderRadius: 14,
      itemSelectedBg: isDark ? 'rgba(208, 122, 44, 0.16)' : 'rgba(208, 122, 44, 0.14)',
      itemSelectedColor: isDark ? '#ffd2a3' : '#8d3a21',
      itemColor: isDark ? 'rgba(243, 237, 230, 0.82)' : '#5f493a',
    },
    Table: {
      headerBg: isDark ? '#2b2420' : '#f8f1e8',
      headerColor: isDark ? '#f3ede6' : '#5b4535',
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(118, 87, 62, 0.14)',
    },
  },
})
