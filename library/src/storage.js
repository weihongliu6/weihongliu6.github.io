// Storage is optional: blocked/private-mode storage must never prevent reading.
export const storage = {
  get(key, fallback = null) {
    try { return JSON.parse(localStorage.getItem(`shadow-library:${key}`)) ?? fallback; }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`shadow-library:${key}`, JSON.stringify(value)); } catch { /* nonessential */ }
  }
};
