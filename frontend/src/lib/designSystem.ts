import type { ThemeConfig } from 'antd'
import { theme } from 'antd'

export type SeasonKey = 'spring' | 'summer' | 'autumn' | 'winter'
export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night'

type RGB = { r: number; g: number; b: number }

interface SeasonalBase {
  primary: string
  secondary: string
  accent: string
  ink: string
  textSecondary: string
  layoutBg: string
  layoutBgAlt: string
  containerBg: string
  panelBg: string
  borderSoft: string
  success: string
  warning: string
  error: string
}

export interface SeasonalAppearance extends SeasonalBase {
  season: SeasonKey
  nextSeason: SeasonKey
  phase: DayPhase
  seasonLabel: string
  phaseLabel: string
  seasonBlend: number
  bodyGradient: string
  shellGradient: string
  cardGradient: string
  topbarBg: string
  siderBg: string
  shadow: string
  shadowSoft: string
  shellStroke: string
  heroGlow: string
}

const seasonLabels: Record<SeasonKey, string> = {
  spring: '春',
  summer: '夏',
  autumn: '秋',
  winter: '冬',
}

const phaseLabels: Record<DayPhase, string> = {
  dawn: '晨光',
  day: '日晴',
  dusk: '暮色',
  night: '夜色',
}

const seasonalAnchors: Record<SeasonKey, SeasonalBase> = {
  spring: {
    primary: '#2f7a68',
    secondary: '#78c3a1',
    accent: '#d9f2e7',
    ink: '#18342d',
    textSecondary: '#59776f',
    layoutBg: '#edf8f3',
    layoutBgAlt: '#f8fdfb',
    containerBg: 'rgba(255, 255, 255, 0.90)',
    panelBg: 'rgba(239, 249, 245, 0.84)',
    borderSoft: 'rgba(68, 132, 111, 0.16)',
    success: '#2f8a66',
    warning: '#5f98c5',
    error: '#c55b4d',
  },
  summer: {
    primary: '#2b6f9b',
    secondary: '#63afc3',
    accent: '#d8f1f1',
    ink: '#18354a',
    textSecondary: '#5e7988',
    layoutBg: '#edf7f9',
    layoutBgAlt: '#f8fcfd',
    containerBg: 'rgba(255, 252, 250, 0.90)',
    panelBg: 'rgba(238, 247, 249, 0.84)',
    borderSoft: 'rgba(74, 128, 152, 0.16)',
    success: '#3f8b6e',
    warning: '#5d95c8',
    error: '#c75e5e',
  },
  autumn: {
    primary: '#31578d',
    secondary: '#6c93cb',
    accent: '#dbe8ff',
    ink: '#1c3051',
    textSecondary: '#657da0',
    layoutBg: '#eef4fc',
    layoutBgAlt: '#fafcff',
    containerBg: 'rgba(255, 254, 249, 0.90)',
    panelBg: 'rgba(241, 246, 253, 0.84)',
    borderSoft: 'rgba(84, 117, 164, 0.16)',
    success: '#4b8970',
    warning: '#6e8fc4',
    error: '#c86737',
  },
  winter: {
    primary: '#6c88a6',
    secondary: '#d7e7f2',
    accent: '#b8d4e8',
    ink: '#283240',
    textSecondary: '#708291',
    layoutBg: '#f0f6fb',
    layoutBgAlt: '#fbfdff',
    containerBg: 'rgba(255, 255, 255, 0.92)',
    panelBg: 'rgba(244, 248, 252, 0.84)',
    borderSoft: 'rgba(172, 189, 207, 0.18)',
    success: '#6f9f86',
    warning: '#d2a26c',
    error: '#cf7474',
  },
}

const seasonalStarts = [
  { season: 'spring' as const, month: 2, day: 1 },
  { season: 'summer' as const, month: 5, day: 1 },
  { season: 'autumn' as const, month: 8, day: 1 },
  { season: 'winter' as const, month: 11, day: 1 },
]

const hexToRgb = (hex: string): RGB => {
  const normalized = hex.replace('#', '')
  const value = normalized.length === 3 ? normalized.split('').map((item) => item + item).join('') : normalized
  const num = Number.parseInt(value, 16)
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  }
}

const rgbToHex = ({ r, g, b }: RGB) =>
  `#${[r, g, b]
    .map((item) => Math.max(0, Math.min(255, Math.round(item))).toString(16).padStart(2, '0'))
    .join('')}`

const mixNumber = (from: number, to: number, ratio: number) => from + (to - from) * ratio

const mixColor = (from: string, to: string, ratio: number) => {
  const start = hexToRgb(from)
  const end = hexToRgb(to)
  return rgbToHex({
    r: mixNumber(start.r, end.r, ratio),
    g: mixNumber(start.g, end.g, ratio),
    b: mixNumber(start.b, end.b, ratio),
  })
}

const withAlpha = (hex: string, alpha: number) => {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const mixPalette = (from: SeasonalBase, to: SeasonalBase, ratio: number): SeasonalBase => ({
  primary: mixColor(from.primary, to.primary, ratio),
  secondary: mixColor(from.secondary, to.secondary, ratio),
  accent: mixColor(from.accent, to.accent, ratio),
  ink: mixColor(from.ink, to.ink, ratio),
  textSecondary: mixColor(from.textSecondary, to.textSecondary, ratio),
  layoutBg: mixColor(from.layoutBg, to.layoutBg, ratio),
  layoutBgAlt: mixColor(from.layoutBgAlt, to.layoutBgAlt, ratio),
  containerBg: ratio < 0.5 ? from.containerBg : to.containerBg,
  panelBg: ratio < 0.5 ? from.panelBg : to.panelBg,
  borderSoft: ratio < 0.5 ? from.borderSoft : to.borderSoft,
  success: mixColor(from.success, to.success, ratio),
  warning: mixColor(from.warning, to.warning, ratio),
  error: mixColor(from.error, to.error, ratio),
})

const getDayPhaseByHour = (hour: number): DayPhase => {
  if (hour >= 5 && hour < 10) return 'dawn'
  if (hour >= 10 && hour < 17) return 'day'
  if (hour >= 17 && hour < 20) return 'dusk'
  return 'night'
}

const getSeasonWindow = (date: Date) => {
  const year = date.getFullYear()
  const timestamp = date.getTime()

  const anchors = [
    new Date(year - 1, 11, 1).getTime(),
    ...seasonalStarts.map((item) => new Date(year, item.month, item.day).getTime()),
    new Date(year + 1, 2, 1).getTime(),
  ]

  const anchorSeasons: SeasonKey[] = ['winter', ...seasonalStarts.map((item) => item.season), 'spring']

  for (let index = 0; index < anchors.length - 1; index += 1) {
    if (timestamp >= anchors[index] && timestamp < anchors[index + 1]) {
      const span = anchors[index + 1] - anchors[index]
      const progress = span === 0 ? 0 : (timestamp - anchors[index]) / span
      return {
        current: anchorSeasons[index],
        next: anchorSeasons[index + 1],
        progress,
      }
    }
  }

  return {
    current: 'winter' as const,
    next: 'spring' as const,
    progress: 0,
  }
}

export const buildSeasonalAppearance = (date = new Date()): SeasonalAppearance => {
  const { current, next, progress } = getSeasonWindow(date)
  const phase = getDayPhaseByHour(date.getHours())
  const palette = mixPalette(seasonalAnchors[current], seasonalAnchors[next], progress)

  const dawnTint = mixColor(palette.layoutBgAlt, palette.accent, 0.18)
  const dayTint = mixColor(palette.layoutBgAlt, '#ffffff', 0.38)
  const duskTint = mixColor(palette.layoutBg, palette.secondary, 0.18)
  const nightBase = mixColor(palette.primary, '#08111d', 0.78)
  const nightDeep = mixColor(palette.ink, '#050914', 0.56)

  const phaseMap: Record<DayPhase, { skyA: string; skyB: string; glow: string; veil: string; topbar: string; sider: string }> = {
    dawn: {
      skyA: dawnTint,
      skyB: mixColor(palette.layoutBg, '#fff8ee', 0.26),
      glow: withAlpha(palette.secondary, 0.24),
      veil: withAlpha(palette.accent, 0.14),
      topbar: 'rgba(255, 255, 255, 0.74)',
      sider: palette.containerBg,
    },
    day: {
      skyA: dayTint,
      skyB: mixColor(palette.layoutBgAlt, '#ffffff', 0.2),
      glow: withAlpha(palette.secondary, 0.18),
      veil: withAlpha(palette.accent, 0.1),
      topbar: 'rgba(255, 255, 255, 0.72)',
      sider: palette.containerBg,
    },
    dusk: {
      skyA: duskTint,
      skyB: mixColor(palette.layoutBg, palette.accent, 0.1),
      glow: withAlpha(palette.primary, 0.2),
      veil: withAlpha(palette.secondary, 0.12),
      topbar: 'rgba(255, 252, 248, 0.7)',
      sider: palette.containerBg,
    },
    night: {
      skyA: nightBase,
      skyB: nightDeep,
      glow: withAlpha(palette.secondary, 0.22),
      veil: withAlpha(palette.accent, 0.12),
      topbar: 'rgba(11, 17, 30, 0.7)',
      sider: 'rgba(17, 24, 38, 0.88)',
    },
  }

  const phaseTone = phaseMap[phase]

  return {
    ...palette,
    season: current,
    nextSeason: next,
    phase,
    seasonLabel: seasonLabels[current],
    phaseLabel: phaseLabels[phase],
    seasonBlend: progress,
    bodyGradient: `radial-gradient(circle at 16% 20%, ${phaseTone.glow}, transparent 24%), radial-gradient(circle at 84% 12%, ${phaseTone.veil}, transparent 22%), linear-gradient(180deg, ${phaseTone.skyA} 0%, ${palette.layoutBgAlt} 48%, ${phaseTone.skyB} 100%)`,
    shellGradient: `linear-gradient(180deg, ${palette.layoutBgAlt} 0%, ${palette.layoutBg} 100%)`,
    cardGradient: `linear-gradient(145deg, ${palette.containerBg} 0%, ${palette.panelBg} 100%)`,
    topbarBg: phaseTone.topbar,
    siderBg: phaseTone.sider,
    shadow: `0 24px 80px ${phase === 'night' ? 'rgba(6, 10, 20, 0.34)' : withAlpha(palette.primary, 0.14)}`,
    shadowSoft: `0 14px 32px ${phase === 'night' ? 'rgba(6, 10, 20, 0.22)' : withAlpha(palette.primary, 0.08)}`,
    shellStroke: phase === 'night' ? 'rgba(255,255,255,0.08)' : withAlpha(palette.primary, 0.12),
    heroGlow:
      phase === 'night'
        ? `radial-gradient(circle at 20% 16%, ${withAlpha(palette.secondary, 0.18)} 0%, transparent 28%), radial-gradient(circle at 84% 12%, ${withAlpha(
            palette.accent,
            0.12,
          )} 0%, transparent 24%)`
        : `radial-gradient(circle at 20% 16%, ${withAlpha(palette.secondary, 0.18)} 0%, transparent 28%), radial-gradient(circle at 84% 12%, ${withAlpha(
            palette.accent,
            0.16,
          )} 0%, transparent 24%)`,
  }
}

const buildDocumentThemeVariables = (appearance: SeasonalAppearance, isDark: boolean): Record<string, string> => {
  if (!isDark) {
    return {
      '--brand-primary': appearance.primary,
      '--brand-secondary': appearance.secondary,
      '--brand-accent': appearance.accent,
      '--brand-ink': appearance.ink,
      '--brand-muted': appearance.textSecondary,
      '--brand-layout': appearance.layoutBg,
      '--brand-layout-alt': appearance.layoutBgAlt,
      '--brand-surface': appearance.containerBg,
      '--brand-surface-soft': appearance.panelBg,
      '--brand-border': appearance.borderSoft,
      '--brand-body-gradient': appearance.bodyGradient,
      '--brand-shell-gradient': appearance.shellGradient,
      '--brand-card-gradient': appearance.cardGradient,
      '--brand-topbar': appearance.topbarBg,
      '--brand-sider': appearance.siderBg,
      '--brand-shadow': appearance.shadow,
      '--brand-shadow-soft': appearance.shadowSoft,
      '--brand-shell-stroke': appearance.shellStroke,
      '--brand-hero-glow': appearance.heroGlow,
    }
  }

  const darkPrimary = mixColor(appearance.secondary, '#ffffff', 0.16)
  const darkSecondary = mixColor(appearance.primary, '#8fd5cf', 0.42)
  const darkAccent = withAlpha(darkPrimary, 0.2)

  return {
    '--brand-primary': darkPrimary,
    '--brand-secondary': darkSecondary,
    '--brand-accent': darkAccent,
    '--brand-ink': '#f3f6f0',
    '--brand-muted': '#aebbb7',
    '--brand-layout': '#101419',
    '--brand-layout-alt': '#151a21',
    '--brand-surface': 'rgba(28, 34, 42, 0.96)',
    '--brand-surface-soft': 'rgba(35, 43, 52, 0.9)',
    '--brand-border': 'rgba(220, 235, 230, 0.14)',
    '--brand-body-gradient': `radial-gradient(circle at 18% 16%, ${withAlpha(darkPrimary, 0.14)} 0%, transparent 24%), radial-gradient(circle at 86% 10%, ${withAlpha(
      appearance.warning,
      0.08,
    )} 0%, transparent 22%), linear-gradient(180deg, #151a21 0%, #101419 52%, #0d1015 100%)`,
    '--brand-shell-gradient': 'linear-gradient(180deg, #151a21 0%, #101419 100%)',
    '--brand-card-gradient': 'linear-gradient(145deg, rgba(30, 37, 46, 0.96) 0%, rgba(22, 27, 34, 0.94) 100%)',
    '--brand-topbar': 'rgba(21, 26, 33, 0.9)',
    '--brand-sider': 'rgba(19, 24, 31, 0.96)',
    '--brand-shadow': '0 24px 80px rgba(0, 0, 0, 0.38)',
    '--brand-shadow-soft': '0 14px 34px rgba(0, 0, 0, 0.26)',
    '--brand-shell-stroke': 'rgba(220, 235, 230, 0.12)',
    '--brand-hero-glow': `radial-gradient(circle at 20% 16%, ${withAlpha(darkPrimary, 0.18)} 0%, transparent 28%), radial-gradient(circle at 84% 12%, ${withAlpha(
      appearance.warning,
      0.1,
    )} 0%, transparent 24%)`,
  }
}

export const applySeasonToDocument = (appearance: SeasonalAppearance, isDark = false) => {
  if (typeof document === 'undefined') {
    return
  }

  const root = document.documentElement
  root.setAttribute('data-theme', isDark ? 'dark' : 'light')
  root.setAttribute('data-season', appearance.season)
  root.setAttribute('data-phase', appearance.phase)
  Object.entries(buildDocumentThemeVariables(appearance, isDark)).forEach(([key, value]) => {
    root.style.setProperty(key, value)
  })
}

export const buildAppTheme = (isDark: boolean, appearance: SeasonalAppearance): ThemeConfig => {
  const darkPrimary = mixColor(appearance.secondary, '#ffffff', 0.16)
  const darkSecondary = mixColor(appearance.primary, '#8fd5cf', 0.42)

  return {
    algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: isDark ? darkPrimary : appearance.primary,
      colorInfo: isDark ? darkPrimary : appearance.primary,
      colorSuccess: appearance.success,
      colorWarning: appearance.warning,
      colorError: appearance.error,
      borderRadius: 8,
      borderRadiusLG: 12,
      borderRadiusSM: 6,
      fontFamily: "'Manrope', 'PingFang SC', 'Microsoft YaHei', sans-serif",
      colorTextBase: isDark ? '#f3f6f0' : appearance.ink,
      colorTextSecondary: isDark ? '#aebbb7' : appearance.textSecondary,
      colorBgLayout: isDark ? '#101419' : appearance.layoutBg,
      colorBgContainer: isDark ? '#1c222a' : appearance.containerBg,
      colorBgElevated: isDark ? '#232b34' : appearance.containerBg,
      colorBorder: isDark ? 'rgba(220, 235, 230, 0.16)' : appearance.borderSoft,
      colorBorderSecondary: isDark ? 'rgba(220, 235, 230, 0.1)' : appearance.borderSoft,
      colorFillAlter: isDark ? 'rgba(255,255,255,0.05)' : appearance.panelBg,
      colorLink: isDark ? darkPrimary : appearance.primary,
      boxShadowSecondary: isDark ? '0 14px 34px rgba(0, 0, 0, 0.26)' : appearance.shadowSoft,
    },
    components: {
      Layout: {
        siderBg: isDark ? '#13181f' : appearance.containerBg,
        headerBg: isDark ? 'rgba(21, 26, 33, 0.9)' : appearance.topbarBg,
        bodyBg: isDark ? '#101419' : appearance.layoutBg,
      },
      Menu: {
        itemBg: 'transparent',
        itemBorderRadius: 8,
        itemSelectedBg: isDark ? 'rgba(143, 213, 207, 0.16)' : 'rgba(255, 255, 255, 0.82)',
        itemSelectedColor: isDark ? '#f3f6f0' : appearance.primary,
        itemColor: isDark ? 'rgba(243, 246, 240, 0.8)' : appearance.textSecondary,
        itemHoverBg: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(255, 255, 255, 0.56)',
        iconSize: 16,
      },
      Table: {
        headerBg: isDark ? '#232b34' : appearance.panelBg,
        headerColor: isDark ? '#f3f6f0' : appearance.ink,
        borderColor: isDark ? 'rgba(220,235,230,0.1)' : appearance.borderSoft,
        rowHoverBg: isDark ? 'rgba(143,213,207,0.08)' : 'rgba(255,255,255,0.72)',
      },
      Card: {
        colorBgContainer: isDark ? '#1c222a' : appearance.containerBg,
        boxShadowTertiary: isDark ? '0 14px 34px rgba(0, 0, 0, 0.26)' : appearance.shadowSoft,
      },
      Button: {
        borderRadius: 8,
        primaryShadow: `0 18px 30px ${withAlpha(isDark ? darkPrimary : appearance.primary, 0.2)}`,
        controlHeight: 38,
      },
      Input: {
        borderRadius: 8,
        controlHeight: 40,
        activeBorderColor: isDark ? darkPrimary : appearance.primary,
        hoverBorderColor: isDark ? darkSecondary : appearance.secondary,
      },
      Select: {
        borderRadius: 8,
        controlHeight: 40,
      },
      Modal: {
        borderRadiusLG: 16,
      },
      Drawer: {
        borderRadiusLG: 16,
      },
      Tabs: {
        inkBarColor: isDark ? darkPrimary : appearance.primary,
        itemSelectedColor: isDark ? darkPrimary : appearance.primary,
        itemHoverColor: isDark ? darkSecondary : appearance.secondary,
      },
      Tag: {
        defaultBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)',
        borderRadiusSM: 8,
      },
    },
  }
}
