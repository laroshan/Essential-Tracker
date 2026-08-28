import SmsModule from '../../modules/sms-module/src/SmsModule';

export const storage = {
  async setItem(key: string, value: string): Promise<boolean> {
    try {
      if (SmsModule && SmsModule.saveData) {
        return await SmsModule.saveData(key, value);
      }
      return false;
    } catch (e) {
      console.error('Failed to save to native storage:', e);
      return false;
    }
  },

  async getItem(key: string): Promise<string | null> {
    try {
      if (SmsModule && SmsModule.getData) {
        const val = await SmsModule.getData(key);
        return val || null;
      }
      return null;
    } catch (e) {
      console.error('Failed to read from native storage:', e);
      return null;
    }
  },

  async getObject<T>(key: string): Promise<T | null> {
    const val = await this.getItem(key);
    if (!val) return null;
    try {
      return JSON.parse(val) as T;
    } catch {
      return null;
    }
  },

  async setObject<T>(key: string, value: T): Promise<boolean> {
    return await this.setItem(key, JSON.stringify(value));
  }
};
