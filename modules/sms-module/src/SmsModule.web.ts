import { registerWebModule, NativeModule } from 'expo';

// SmsModule is not available on the web platform.
class SmsModule extends NativeModule<{}> {}

export default registerWebModule(SmsModule, 'SmsModule');
