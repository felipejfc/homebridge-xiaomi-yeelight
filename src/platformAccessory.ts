import { Characteristic, CharacteristicValue } from 'homebridge';

import { XiaomiYeelightPlatform } from './platform';
import miio from 'miio-yeelight-x';
import { color } from 'abstract-things/values';
import { LightCharacteristics, MiLightPlatformAccesory } from './models';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */

export class Light {
  private connection: miio;

  private state = {
    hue: 0,
    saturation: 0,
  };

  private configs = {
    minTemp: 154,
    maxTemp: 370,
  };

  private lightCharacteristics: LightCharacteristics;
  private nightModeSwitchOn: Characteristic;

  constructor(
    private readonly platform: XiaomiYeelightPlatform,
    private readonly accessory: MiLightPlatformAccesory,
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
          this.lightCharacteristics.colorTmp = service
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

            const tmp = Math.min(
              Math.max(colorTmp.mired.value, this.configs.minTemp),
              this.configs.maxTemp,
            );

            if (
              this.lightCharacteristics.colorTmp &&
              tmp !== this.lightCharacteristics.colorTmp?.value
            ) {
              this.lightCharacteristics.colorTmp.updateValue(tmp);

              this.updateHueAndSaturation(colorTmp);
            }
          });
        }

        if (this.connection.matches('cap:colorable', 'cap:color:full')) {
          this.lightCharacteristics.hue = service
            .getCharacteristic(this.platform.Characteristic.Hue)
            .onSet(this.setHue.bind(this));

          this.lightCharacteristics.sat = service
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
          this.lightCharacteristics.brightness = service
            .getCharacteristic(this.platform.Characteristic.Brightness)
            .onSet(this.setBrightness.bind(this));

          this.connection.on('brightnessChanged', (bright) => {
            if (
              this.lightCharacteristics.brightness &&
              bright !== this.lightCharacteristics.brightness?.value
            ) {
              this.lightCharacteristics.brightness.updateValue(bright);
            }
          });
        }

        this.connection.on('powerChanged', (power) => {
          if (power !== this.lightCharacteristics.power.value) {
            this.lightCharacteristics.power.updateValue(power);
          }
        });
      })
      .catch((e) => this.platform.log.error(e));

    // set accessory information
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Xiaomi')
      .setCharacteristic(this.platform.Characteristic.Model, 'Yeelight');

    const service =
      this.accessory.getService(this.platform.Service.Lightbulb) ||
      this.accessory.addService(this.platform.Service.Lightbulb);

    const nightModeSwitch =
      this.accessory.getService(
        `${accessory.context.device.name} Night Mode`,
      ) ||
      this.accessory.addService(
        this.platform.Service.Switch,
        `${accessory.context.device.name} Night Mode`,
      );

    service.setCharacteristic(
      this.platform.Characteristic.Name,
      accessory.context.device.name,
    );

    this.nightModeSwitchOn = nightModeSwitch
      .getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setNightMode.bind(this));

    this.lightCharacteristics = {
      power: service
        .getCharacteristic(this.platform.Characteristic.On)
        .onSet(this.setOn.bind(this)),
    };
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

      if (!value && this.nightModeSwitchOn.value) {
        this.nightModeSwitchOn.updateValue(false);
      }
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
      if (this.nightModeSwitchOn.value) {
        this.nightModeSwitchOn.updateValue(false);
      }
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
        kelvin,
      );
    }

    try {
      await this.connection.color(kelvin);
      if (this.nightModeSwitchOn.value) {
        this.nightModeSwitchOn.updateValue(false);
      }
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
        `hsl(${this.state.hue}, ${this.state.saturation}%, 100%)`,
      );
      if (this.nightModeSwitchOn.value) {
        this.nightModeSwitchOn.updateValue(false);
      }
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
        `hsl(${this.state.hue}, ${this.state.saturation}%, 100%)`,
      );
      if (this.nightModeSwitchOn.value) {
        this.nightModeSwitchOn.updateValue(false);
      }
      if (this.debugLogging) {
        this.platform.log.info('saturation set successfully');
      }
    } catch (e: any) {
      this.state.saturation = oldSat;
      this.platform.log.error(e);
    }
  }

  async setNightMode(value: CharacteristicValue) {
    if (value) {
      await this.connection.call('set_scene', ['nightlight', 10]);
      const nightLightColor = color.rgb(255, 152, 0);

      this.updateHueAndSaturation(nightLightColor);
      this.lightCharacteristics.brightness!.updateValue(1);
      this.lightCharacteristics.power.updateValue(true);
    } else {
      setTimeout(() => this.nightModeSwitchOn.updateValue(true), 0);
    }
  }

  async startColorFlow() {
    try {
      const props = await this.connection.loadProperties(['flowing']);

      if (props.flowing === '1') {
        await this.connection.call('stop_cf');
        return;
      }

      const colors = [
        255 * 65536 + 36 * 256 + 0,
        232 * 65536 + 29 * 256 + 29,
        232 * 65536 + 183 * 256 + 29,
        227 * 65536 + 232 * 256 + 29,
        29 * 65536 + 232 * 256 + 64,
        29 * 65536 + 221 * 256 + 232,
        43 * 65536 + 29 * 256 + 232,
        221 * 65536 + 0 * 256 + 243,
      ];

      const tuples = colors.map((color) => `2250,1,${color},100`);

      await this.connection.call('set_scene', ['cf', 0, 0, tuples.join(', ')]);
    } catch (e: any) {
      this.platform.log.error(e);
    }
  }

  private updateHueAndSaturation(color: color) {
    color = color.hsv;

    if (
      this.lightCharacteristics.hue &&
      color.hue !== this.lightCharacteristics.hue?.value
    ) {
      this.state.hue = color.hue;
      this.lightCharacteristics.hue.updateValue(color.hue);
    }

    if (
      this.lightCharacteristics.sat &&
      color.hue !== this.lightCharacteristics.sat?.value
    ) {
      this.state.saturation = color.saturation;
      this.lightCharacteristics.sat.updateValue(color.saturation);
    }
  }
}
