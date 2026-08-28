import { NativeModule, requireNativeModule } from 'expo';

declare class SmsModule extends NativeModule {
  getSmsInbox(limit: number, sinceDate: number, beforeDate: number, senderFilters: string[]): Promise<Array<{ address: string; body: string; date: number }>>;
  saveData(key: string, value: string): Promise<boolean>;
  getData(key: string): Promise<string>;
}

export default requireNativeModule<SmsModule>('SmsModule');
