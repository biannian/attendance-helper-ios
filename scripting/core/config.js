export const CONFIG = Object.freeze({
  API_BASE: "https://api.hikiot.com/api-attendance/v1/statistics/v2/individual/single/daily",
  LOGIN_URL: "https://api.hikiot.com/api-saas/open/v1/pwdLogin",
  LOGIN_BASIC: "Basic bGluay13ZWI6bGluaw==",
  SEND_MESSAGE_URL: "https://api.hikiot.com/api-saas/open/v3/sendMessage",
  CODE_LOGIN_URL: "https://api.hikiot.com/api-saas/open/v1/codeLogin",
  ACCOUNT_DETAIL_URL: "https://api.hikiot.com/api-saas/v1/account/detail",
  TEAM_CHANGE_URL: "https://api.hikiot.com/api-link-saas/v3/team/change",
  NEW_DEVICE_CODE: 104004,
  COMPANY_NAME: "iGroup",
  TARGET_HOURS: 9,
  NEAR_MINUTES: 5,
  MORNING_REFRESH_START: "08:00",
  MORNING_REFRESH_END: "11:00",
  MORNING_REFRESH_MINUTES: 10,
  HOLIDAY_API_BASE: "https://timor.tech/api/holiday",
  HOLIDAY_CACHE_HOURS: 12,
  HOLIDAY_FALLBACK_TO_WEEKDAY: true,
  STATIC_ID: "myStatic",
  USER_AGENT: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Html5Plus/1.0 (Immersed/47) uni-app",
  APP_NO: "__UNI__89A1A02",
  VERSION_CODE: "1986"
});

export const KEYCHAIN_KEYS = Object.freeze({
  USERNAME: "attendance-helper-v11-username",
  PASSWORD: "attendance-helper-v11-password",
  DEVICE_ID: "attendance-helper-v11-device-id",
  TOKEN: "attendance-helper-v11-token"
});

export const STORAGE_KEYS = Object.freeze({
  PREFERENCES: "attendance-v11-preferences",
  TODAY_SNAPSHOT: "attendance-v11-today-snapshot",
  HISTORY_PREFIX: "attendance-v11-history:",
  REVIEW_PREFIX: "attendance-v11-review:",
  HOLIDAY_DAY_PREFIX: "attendance-v11-holiday-day:",
  HOLIDAY_YEAR_PREFIX: "attendance-v11-holiday-year:",
  LIVE_ACTIVITY_ID: "attendance-v11-live-activity-id",
  REMINDER_PREFIX: "attendance-v11-reminder:"
});

export const DEFAULT_PREFERENCES = Object.freeze({
  theme: "navy",
  remindMinutes: CONFIG.NEAR_MINUTES,
  liveActivityEnabled: true,
  widgetStyleSmall: "minimal",
  widgetStyleMedium: "fitness",
  widgetStyleLarge: "heatmap"
});

export const WIDGET_STYLES = Object.freeze(["cyber", "fitness", "minimal", "heatmap"]);
export const THEMES = Object.freeze(["navy", "teal", "slate"]);
