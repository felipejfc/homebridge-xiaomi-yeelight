import { PLATFORM_NAME } from './settings';
import { XiaomiYeelightPlatform } from './platform';
import { MiAPI } from './models';

/**
 * This method registers the platform with Homebridge
 */
export = (api: MiAPI) => {
  api.registerPlatform(PLATFORM_NAME, XiaomiYeelightPlatform);
};
