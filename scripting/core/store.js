// Storage and Keychain are native runtime globals, not SDK exports.
import {
  DEFAULT_PREFERENCES,
  KEYCHAIN_KEYS,
  STORAGE_KEYS,
  WIDGET_STYLES,
  THEMES
} from "./config";

function safeKeychainGet(key) {
  try {
    return String(Keychain.get(key) || "");
  } catch (_) {
    return "";
  }
}

function safeKeychainSet(key, value) {
  const ok = Keychain.set(key, String(value ?? ""));
  if (ok === false) throw new Error("无法安全保存到系统钥匙串");
}

export function getAccount() {
  return {
    username: safeKeychainGet(KEYCHAIN_KEYS.USERNAME),
    password: safeKeychainGet(KEYCHAIN_KEYS.PASSWORD),
    deviceId: safeKeychainGet(KEYCHAIN_KEYS.DEVICE_ID),
    configured: !!(
      safeKeychainGet(KEYCHAIN_KEYS.USERNAME) &&
      safeKeychainGet(KEYCHAIN_KEYS.PASSWORD) &&
      safeKeychainGet(KEYCHAIN_KEYS.DEVICE_ID)
    )
  };
}

export function saveAccount(account) {
  const username = String(account?.username || "").trim();
  const password = String(account?.password || "");
  const deviceId = String(account?.deviceId || "").trim();
  if (!username || !password || !deviceId) {
    throw new Error("账号、密码和设备 ID 都必须填写");
  }

  const previous = getAccount();
  const changed = previous.username !== username ||
    previous.password !== password ||
    previous.deviceId !== deviceId;

  safeKeychainSet(KEYCHAIN_KEYS.USERNAME, username);
  safeKeychainSet(KEYCHAIN_KEYS.PASSWORD, password);
  safeKeychainSet(KEYCHAIN_KEYS.DEVICE_ID, deviceId);

  if (changed) {
    Keychain.remove(KEYCHAIN_KEYS.TOKEN);
    Storage.remove(STORAGE_KEYS.TODAY_SNAPSHOT);
    // Live Activity must be ended by the foreground caller before replacing credentials.
    for (const key of Storage.keys()) {
      if (/^attendance-helper-(schedule9|near9|target-reached|notice-v2)-/.test(key)) Storage.remove(key);
      if (key.startsWith(STORAGE_KEYS.HISTORY_PREFIX + previous.username + ":")) Storage.remove(key);
    }
  }
  return { ...getAccount(), changed };
}

export function getToken() {
  return safeKeychainGet(KEYCHAIN_KEYS.TOKEN).trim();
}

export function setToken(token) {
  if (!token) throw new Error("登录接口没有返回有效 Token");
  safeKeychainSet(KEYCHAIN_KEYS.TOKEN, token);
}

export function clearToken() {
  Keychain.remove(KEYCHAIN_KEYS.TOKEN);
}

export function getPreferences() {
  const saved = Storage.get(STORAGE_KEYS.PREFERENCES) || {};
  return {
    theme: THEMES.includes(saved.theme) ? saved.theme : DEFAULT_PREFERENCES.theme,
    remindMinutes: Number.isInteger(Number(saved.remindMinutes)) && saved.remindMinutes != null && Number(saved.remindMinutes) >= 0 && Number(saved.remindMinutes) <= 180
      ? Number(saved.remindMinutes)
      : DEFAULT_PREFERENCES.remindMinutes,
    liveActivityEnabled: saved.liveActivityEnabled !== false,
    checkoutReminderEnabled: saved.checkoutReminderEnabled !== false,
    widgetStyleSmall: WIDGET_STYLES.includes(saved.widgetStyleSmall)
      ? saved.widgetStyleSmall : DEFAULT_PREFERENCES.widgetStyleSmall,
    widgetStyleMedium: WIDGET_STYLES.includes(saved.widgetStyleMedium)
      ? saved.widgetStyleMedium : DEFAULT_PREFERENCES.widgetStyleMedium,
    widgetStyleLarge: WIDGET_STYLES.includes(saved.widgetStyleLarge)
      ? saved.widgetStyleLarge : DEFAULT_PREFERENCES.widgetStyleLarge
  };
}

export function savePreferences(next) {
  const current = getPreferences();
  const merged = { ...current, ...next };
  if (!THEMES.includes(merged.theme)) merged.theme = current.theme;
  if (!Number.isInteger(Number(merged.remindMinutes)) || Number(merged.remindMinutes) < 0 || Number(merged.remindMinutes) > 180) {
    merged.remindMinutes = current.remindMinutes;
  }
  for (const key of ["widgetStyleSmall", "widgetStyleMedium", "widgetStyleLarge"]) {
    if (!WIDGET_STYLES.includes(merged[key])) merged[key] = current[key];
  }
  merged.liveActivityEnabled = !!merged.liveActivityEnabled;
  merged.checkoutReminderEnabled = !!merged.checkoutReminderEnabled;
  merged.remindMinutes = Number(merged.remindMinutes);
  Storage.set(STORAGE_KEYS.PREFERENCES, merged);
  return merged;
}

export function getTodaySnapshot() {
  return Storage.get(STORAGE_KEYS.TODAY_SNAPSHOT) || null;
}

export function saveTodaySnapshot(snapshot) {
  if (!snapshot?.date) return;
  Storage.set(STORAGE_KEYS.TODAY_SNAPSHOT, snapshot);
}

function historyKey(dateKey) {
  const username = getAccount().username || "unconfigured";
  return STORAGE_KEYS.HISTORY_PREFIX + username + ":" + dateKey;
}

export function readHistorySnapshot(dateKey) {
  const owner = getAccount().username;
  if (!owner) return null;
  const snapshot = Storage.get(historyKey(dateKey));
  return snapshot?.owner === owner ? snapshot : null;
}

export function writeHistorySnapshot(snapshot) {
  if (!snapshot?.date) return;
  Storage.set(historyKey(snapshot.date), snapshot);
}

function reviewKey(dateKey) {
  const username = getAccount().username || "unconfigured";
  return STORAGE_KEYS.REVIEW_PREFIX + username + ":" + dateKey;
}

export function readReview(dateKey) {
  return Storage.get(reviewKey(dateKey)) || null;
}

export function writeReview(dateKey, review) {
  if (!review) Storage.remove(reviewKey(dateKey));
  else Storage.set(reviewKey(dateKey), review);
}

export function readHolidayDay(dateKey) {
  return Storage.get(STORAGE_KEYS.HOLIDAY_DAY_PREFIX + dateKey) || null;
}

export function writeHolidayDay(dateKey, value) {
  Storage.set(STORAGE_KEYS.HOLIDAY_DAY_PREFIX + dateKey, value);
}

export function readHolidayYear(year) {
  return Storage.get(STORAGE_KEYS.HOLIDAY_YEAR_PREFIX + year) || null;
}

export function writeHolidayYear(year, value) {
  Storage.set(STORAGE_KEYS.HOLIDAY_YEAR_PREFIX + year, value);
}

export function getLiveActivityId() {
  return String(Storage.get(STORAGE_KEYS.LIVE_ACTIVITY_ID) || "");
}

export function setLiveActivityId(id) {
  if (id) Storage.set(STORAGE_KEYS.LIVE_ACTIVITY_ID, id);
  else Storage.remove(STORAGE_KEYS.LIVE_ACTIVITY_ID);
}

export function getReminderFlag(name, dateKey) {
  return !!Storage.get(STORAGE_KEYS.REMINDER_PREFIX + name + ":" + dateKey);
}

export function setReminderFlag(name, dateKey) {
  Storage.set(STORAGE_KEYS.REMINDER_PREFIX + name + ":" + dateKey, true);
}

// Explicit local confirmation; account-scoped, never changes server attendance.
export function isMissedCheckoutConfirmed(dateKey) {
  const user = getAccount().username;
  return !!user && Storage.get("attendance-missed-checkout:" + user + ":" + dateKey) === true;
}
export function setMissedCheckoutConfirmed(dateKey, value) {
  const user = getAccount().username;
  if (!user) throw new Error("请先配置账号");
  const key = "attendance-missed-checkout:" + user + ":" + dateKey;
  if (value) Storage.set(key, true); else Storage.remove(key);
}
