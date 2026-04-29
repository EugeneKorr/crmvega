import type { ThemeConfig } from 'antd';
import rawTokens from './tokens.json';

// Распарсить tokens.json (он содержит экранированные символы)
const tokens = typeof rawTokens === 'string'
  ? JSON.parse(JSON.parse(rawTokens))
  : rawTokens;

// Извлечь основные цвета из light theme
const lightColors = tokens.colors.light;
const semanticColors = tokens.colors.semantic;

export const theme: ThemeConfig = {
  token: {
    // Primary colors
    colorPrimary: lightColors.blue6,      // #1677ff
    colorSuccess: lightColors.green6,     // #52c41a
    colorWarning: lightColors.gold6,      // #faad14
    colorError: lightColors.red6,         // #f5222d
    colorInfo: lightColors.cyan6,         // #13c2c2
    colorTextBase: lightColors.gray8,     // основной текст

    // Border & Layout
    borderRadius: 6,
    controlHeight: 32,

    // Spacing (используется для отступов)
    margin: 16,
    marginXS: 8,
    marginSM: 12,
    marginLG: 24,
    marginXL: 32,

    padding: 16,
    paddingXS: 8,
    paddingSM: 12,
    paddingLG: 24,
    paddingXL: 32,

    // Typography
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSize: 14,
    fontSizeHeading1: 38,
    fontSizeHeading2: 30,
    fontSizeHeading3: 24,
    fontSizeHeading4: 20,
    fontSizeHeading5: 16,
    fontWeightStrong: 600,

    // Shadow
    boxShadow: '0 3px 6px -4px rgba(0, 0, 0, 0.12)',
    boxShadowSecondary: '0 6px 16px 0 rgba(0, 0, 0, 0.08)',
  },

  components: {
    Button: {
      borderRadius: 6,
      controlHeight: 32,
      primaryColor: lightColors.blue6,
    },
    Input: {
      borderRadius: 6,
      controlHeight: 32,
      colorBorder: lightColors.gray3,
    },
    Select: {
      borderRadius: 6,
      controlHeight: 32,
    },
    DatePicker: {
      borderRadius: 6,
      controlHeight: 32,
    },
    Table: {
      borderRadius: 6,
      headerBg: lightColors.gray1,
      headerColor: lightColors.gray8,
    },
    Card: {
      borderRadius: 6,
      boxShadow: '0 3px 6px -4px rgba(0, 0, 0, 0.12)',
    },
    Modal: {
      borderRadius: 8,
    },
    Drawer: {
      borderRadius: 8,
    },
  },
};

export const antdThemeConfig = theme;
