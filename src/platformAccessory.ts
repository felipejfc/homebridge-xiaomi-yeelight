import { Service, PlatformAccessory, CharacteristicValue } from "homebridge";

import { XiaomiYeelightPlatform } from "./platform";
import miio from "miio-yeelight-x";

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Light {
  private service: Service;
  private connection: miio;

  private state = {
    Hue: 0,
    Saturation: 0,
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
        this.platform.log.info("opened connection to device", device);

        if (this.connection.matches("cap:colorable", "cap:color:temperature")) {
          this.service
            .getCharacteristic(this.platform.Characteristic.ColorTemperature)
            .onSet(this.setColorTemperature.bind(this))
            .onGet(this.getColorTemperature.bind(this));
        }

        if (this.connection.matches("cap:colorable", "cap:color:full")) {
          this.service
            .getCharacteristic(this.platform.Characteristic.Hue)
            .onSet(this.setHue.bind(this))
            .onGet(this.getHue.bind(this));

          this.service
            .getCharacteristic(this.platform.Characteristic.Saturation)
            .onSet(this.setSaturation.bind(this))
            .onGet(this.getSaturation.bind(this));
        }

        if (this.connection.matches("cap:dimmable", "cap:brightness")) {
          this.service
            .getCharacteristic(this.platform.Characteristic.Brightness)
            .onSet(this.setBrightness.bind(this))
            .onGet(this.getBrightness.bind(this));
        }
      })
      .catch((e) => this.platform.log.error(e));

    // set accessory information
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, "Xiaomi")
      .setCharacteristic(this.platform.Characteristic.Model, "Yeelight");

    this.service =
      this.accessory.getService(this.platform.Service.Lightbulb) ||
      this.accessory.addService(this.platform.Service.Lightbulb);

    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      accessory.context.device.name
    );

    this.service
      .getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));
  }

  get debugLogging(): boolean {
    return this.platform.config.debugLogging;
  }

  async setOn(value: CharacteristicValue) {
    if (this.debugLogging) {
      this.platform.log.info("setting power to", value);
    }

    try {
      await this.connection.setPower(value);

      if (this.debugLogging) {
        this.platform.log.info("power set successfully");
      }
    } catch (e: any) {
      this.platform.log.error(e);
    }
  }

  async getOn(): Promise<CharacteristicValue> {
    try {
      const isOn = await this.connection.power();

      return isOn;
    } catch (e: any) {
      this.platform.log.error(e);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
      );
    }
  }

  async setBrightness(value: CharacteristicValue) {
    if (this.debugLogging) {
      this.platform.log.info("setting brightness to", value);
    }

    try {
      await this.connection.setBrightness(value);

      if (this.debugLogging) {
        this.platform.log.info("brightness set successfully");
      }
    } catch (e: any) {
      this.platform.log.error(e);
    }
  }

  async getBrightness(): Promise<CharacteristicValue> {
    try {
      const brightness = await this.connection.brightness();
      return brightness;
    } catch (e: any) {
      this.platform.log.error(e);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
      );
    }
  }

  async setColorTemperature(value: CharacteristicValue) {
    const kelvin = `${Math.round(1000000 / (value as number))}K`;

    if (this.debugLogging) {
      this.platform.log.info(
        "setting color temp:",
        "mired =",
        value,
        "kelvin =",
        kelvin
      );
    }

    try {
      await this.connection.color(kelvin);
      if (this.debugLogging) {
        this.platform.log.info("color temp set successfully");
      }
    } catch (e: any) {
      this.platform.log.error(e);
    }
  }

  async getColorTemperature(): Promise<CharacteristicValue> {
    try {
      const color = await this.connection.color();
      let temp = color.temperature.mired.value;
      temp = Math.min(Math.max(temp, 140), 500);
      return temp;
    } catch (e: any) {
      this.platform.log.error(e);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
      );
    }
  }

  async setHue(value: CharacteristicValue) {
    this.state.Hue = value as number;
    if (this.debugLogging) {
      this.platform.log.info("setting hue to", value);
    }

    try {
      await this.connection.color(
        `hsl(${this.state.Hue}, ${this.state.Saturation}%, 100%)`
      );

      if (this.debugLogging) {
        this.platform.log.info("hue set successfully");
      }
    } catch (e: any) {
      this.platform.log.error(e);
    }
  }

  async getHue(): Promise<CharacteristicValue> {
    try {
      const color = await this.connection.color();
      return color.hsl.hue;
    } catch (e: any) {
      this.platform.log.error(e);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
      );
    }
  }

  async setSaturation(value: CharacteristicValue) {
    this.state.Saturation = value as number;
    if (this.debugLogging) {
      this.platform.log.info("setting saturation to", value);
    }

    try {
      await this.connection.color(
        `hsl(${this.state.Hue}, ${this.state.Saturation}%, 100%)`
      );
      if (this.debugLogging) {
        this.platform.log.info("saturation set successfully");
      }
    } catch (e: any) {
      this.platform.log.error(e);
    }
  }

  async getSaturation(): Promise<CharacteristicValue> {
    try {
      const color = await this.connection.color();
      return color.hsl.saturation;
    } catch (e: any) {
      this.platform.log.error(e);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
      );
    }
  }
}
