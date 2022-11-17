import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { XiaomiYeelightPlatform } from './platform';
import miio from 'miio-yeelight22';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Light {
  private service: Service;
  private connection: miio;

  private state = {
    hue: 0,
    saturation: 0,
  };

  private configs = {
    minTemp: 154,
    maxTemp: 370,
  };

  constructor(
    private readonly platform: XiaomiYeelightPlatform,
    private readonly accessory: PlatformAccessory
  ) {
    miio
      .device({
        address: accessory.context.device.ipAddress,
        token: accessory.context.device.token,
      })
      .then((device) => {
        this.connection = device;
        this.platform.log.info('opened connection to device', device);

        if (this.connection.matches('cap:colorable', 'cap:color:temperature')) {
          this.service
            .getCharacteristic(this.platform.Characteristic.ColorTemperature)
            .setProps({
              maxValue: this.configs.maxTemp,
              minValue: this.configs.minTemp,
            })
            .onSet(this.setColorTemperature.bind(this));

          this.connection.on('colorChanged', (colorTmp) => {
            if (
              colorTmp.model !== 'temperature' &&
              colorTmp.model !== 'mired'
            ) {
              return;
            }

            this.service
              .getCharacteristic(this.platform.Characteristic.ColorTemperature)
              .updateValue(colorTmp.mired.value);

            this.updateHueAndSaturation(colorTmp);
          });
        }

        if (this.connection.matches('cap:colorable', 'cap:color:full')) {
          this.service
            .getCharacteristic(this.platform.Characteristic.Hue)
            .onSet(this.setHue.bind(this));

          this.service
            .getCharacteristic(this.platform.Characteristic.Saturation)
            .onSet(this.setSaturation.bind(this));

          this.connection.on('colorChanged', (color) => {
            if (color.model === 'temperature' || color.model === 'mired') {
              return;
            }

            this.updateHueAndSaturation(color);
          });
        }

        if (this.connection.matches('cap:dimmable', 'cap:brightness')) {
          this.service
            .getCharacteristic(this.platform.Characteristic.Brightness)
            .onSet(this.setBrightness.bind(this));

          this.connection.on('brightnessChanged', (bright) =>
            this.service
              .getCharacteristic(this.platform.Characteristic.Brightness)
              .updateValue(bright)
          );
        }

        this.connection.on('powerChanged', (power) =>
          this.service
            .getCharacteristic(this.platform.Characteristic.On)
            .updateValue(power)
        );
      })
      .catch((e) => this.platform.log.error(e));

    // set accessory information
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Xiaomi')
      .setCharacteristic(this.platform.Characteristic.Model, 'Yeelight');

    this.service =
      this.accessory.getService(this.platform.Service.Lightbulb) ||
      this.accessory.addService(this.platform.Service.Lightbulb);

    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      accessory.context.device.name
    );

    this.service
      .getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this));
  }

  get debugLogging(): boolean {
    return this.platform.config.debugLogging;
  }

  async setOn(value: CharacteristicValue) {
    if (this.debugLogging) {
      this.platform.log.info('setting power to', value);
    }

    try {
      await this.connection.setPower(value);
      if (this.debugLogging) {
        this.platform.log.info('power set successfully');
      }
    } catch (e: any) {
      this.platform.log.error(e);
    }
  }

  async setBrightness(value: CharacteristicValue) {
    if (this.debugLogging) {
      this.platform.log.info('setting brightness to', value);
    }

    try {
      await this.connection.setBrightness(value);
      if (this.debugLogging) {
        this.platform.log.info('brightness set successfully');
      }
    } catch (e: any) {
      this.platform.log.error(e);
    }
  }

  async setColorTemperature(value: CharacteristicValue) {
    const kelvin = `${Math.round(1000000 / (value as number))}K`;

    if (this.debugLogging) {
      this.platform.log.info(
        'setting color temp:',
        'mired =',
        value,
        'kelvin =',
        kelvin
      );
    }

    try {
      await this.connection.color(kelvin);
      if (this.debugLogging) {
        this.platform.log.info('color temp set successfully');
      }
    } catch (e: any) {
      this.platform.log.error(e);
    }
  }

  async setHue(value: CharacteristicValue) {
    const oldHue = this.state.hue;
    this.state.hue = value as number;
    if (this.debugLogging) {
      this.platform.log.info('setting hue to', value);
    }

    try {
      await this.connection.color(
        `hsl(${this.state.hue}, ${this.state.saturation}%, 100%)`
      );

      if (this.debugLogging) {
        this.platform.log.info('hue set successfully');
      }
    } catch (e: any) {
      this.state.hue = oldHue;
      this.platform.log.error(e);
    }
  }

  async setSaturation(value: CharacteristicValue) {
    const oldSat = this.state.saturation;
    this.state.saturation = value as number;
    if (this.debugLogging) {
      this.platform.log.info('setting saturation to', value);
    }

    try {
      await this.connection.color(
        `hsl(${this.state.hue}, ${this.state.saturation}%, 100%)`
      );

      if (this.debugLogging) {
        this.platform.log.info('saturation set successfully');
      }
    } catch (e: any) {
      this.state.saturation = oldSat;
      this.platform.log.error(e);
    }
  }

  private updateHueAndSaturation(color) {
    color = color.hsv;

    this.state.hue = color.hue;
    this.service
      .getCharacteristic(this.platform.Characteristic.Hue)
      .updateValue(color.hue);

    this.state.saturation = color.saturation;
    this.service
      .getCharacteristic(this.platform.Characteristic.Saturation)
      .updateValue(color.saturation);
  }
}
