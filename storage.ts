export type StorageSubset = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const browserStorage = (): StorageSubset | null => {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
};

export const safeStorageGet = (
  key: string,
  storage: StorageSubset | null = browserStorage(),
): string | null => {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

export const safeStorageSet = (
  key: string,
  value: string,
  storage: StorageSubset | null = browserStorage(),
): boolean => {
  try {
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

export const safeStorageRemove = (
  key: string,
  storage: StorageSubset | null = browserStorage(),
): boolean => {
  try {
    if (!storage) return false;
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

export const safeStorageJson = <T>(
  key: string,
  fallback: T,
  storage: StorageSubset | null = browserStorage(),
): T => {
  const value = safeStorageGet(key, storage);
  if (value === null) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};
