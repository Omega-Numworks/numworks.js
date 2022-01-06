
var WebDFU = require("webdfu");
var DFU = WebDFU.DFU;
var DFUse = WebDFU.DFUse;

var Storage = require("./Storage");
var Recovery = require("./Recovery");

const AUTOCONNECT_DELAY = 1000;

/**
 * Class handling communication with a Numworks
 * calculator using WebUSB and the WebDFU lib.
 *
 * @author Maxime "M4x1m3" FRIESS
 * @license MIT
 */
class Numworks {
    constructor() {
        this.device = null;
        this.transferSize = 2048;
        this.manifestationTolerant = false;
        this.autoconnectId = null;
    }
    
    /**
     * Get the model of the calculator.
     *
     * @param   exclude_modded  Only include calculator which can be officially purchased from Numworks.
     *                          This includes "0100" and "0110". If a modded Numworks is found, it'll show
     *                          the unmoded version (eg. "0100-8M" becomes "0100").
     *
     * @return  "0110" for an unmodified n0110 (64K internal 8M external).                      "0110" is returned with {exclude_modded}.
     *          "0110-0M" for a modified n0110 (64K internal, no external).                     "????" is returned with {exclude_modded}.
     *          "0110-16M" for a modified n0110 (64K internal, 16M external).                   "0110" is returned with {exclude_modded}.
     *          "0100" for unmodified n0100 (1M internal, no external).                         "0100" is returned with {exclude_modded}.
     *          "0100-8M"  for a "Numworks++" with 8M external (1M internal, 8M external).      "0100" is returned with {exclude_modded}.
     *          "0100-16M" for a "Numworks++" with 16M external (1M internal, 16M external).    "0100" is returned with {exclude_modded}.
     *
     *          Other flash sizes don't exist for the packaging the Numworks (SOIC-8) uses, so it's safe to assume
     *          we'll only encounter 0M, 8M and 16M versions.
     *
     *          "????" if can't be determined (maybe the user plugged a DFU capable device which isn't a Numworks).
     */
    getModel(exclude_modded = true) {
        var internal_size = 0;
        var external_size = 0;
        
        for (let i = 0; i < this.device.memoryInfo.segments.length; i++) {
            
            if (this.device.memoryInfo.segments[i].start >= 0x08000000 && this.device.memoryInfo.segments[i].start <= 0x080FFFFF) {
                internal_size += this.device.memoryInfo.segments[i].end - this.device.memoryInfo.segments[i].start;
            }
            
            if (this.device.memoryInfo.segments[i].start >= 0x90000000 && this.device.memoryInfo.segments[i].start <= 0x9FFFFFFF) {
                external_size += this.device.memoryInfo.segments[i].end - this.device.memoryInfo.segments[i].start;
            }
        }
        
        if (internal_size === 0x10000) {
            if (external_size === 0) {
                return (exclude_modded ? "????" : "0110-0M");
            } else if (external_size === 0x800000) {
                return "0110";
            } else if (external_size === 0x1000000) {
                return (exclude_modded ? "0110" : "0110-16M");
            } else {
                return "????";
            }
        } else if (internal_size === 0x100000) {
            if (external_size === 0) {
                return "0100";
            } else if (external_size === 0x800000) {
                return (exclude_modded ? "0100" : "0100-8M");
            } else if (external_size === 0x1000000) {
                return (exclude_modded ? "0100" : "0100-16M");
            } else {
                return "????";
            }
        } else {
            return "????";
        }
    }
    
    /**
     * Flash buffer to internal flash.
     *
     * @param   buffer      ArrayBuffer to flash.
     */
    async flashInternal(buffer) {
        this.device.startAddress = 0x08000000;
        await this.device.do_download(this.transferSize, buffer, true);
    }
    
    /**
     * Flash buffer to external flash.
     *
     * @param   buffer      ArrayBuffer to flash.
     */
    async flashExternal(buffer) {
        this.device.startAddress = 0x90000000;
        await this.device.do_download(this.transferSize, buffer, false);
    }
    
    async __getDFUDescriptorProperties(device) {
        // Attempt to read the DFU functional descriptor
        // TODO: read the selected configuration's descriptor
        return device.readConfigurationDescriptor(0).then(
            data => {
                let configDesc = DFU.parseConfigurationDescriptor(data);
                let funcDesc = null;
                let configValue = device.settings.configuration.configurationValue;
                if (configDesc.bConfigurationValue === configValue) {
                    for (let desc of configDesc.descriptors) {
                        if (desc.bDescriptorType === 0x21 && desc.hasOwnProperty("bcdDFUVersion")) {
                            funcDesc = desc;
                            break;
                        }
                    }
                }

                if (funcDesc) {
                    return {
                        WillDetach:            ((funcDesc.bmAttributes & 0x08) !== 0),
                        ManifestationTolerant: ((funcDesc.bmAttributes & 0x04) !== 0),
                        CanUpload:             ((funcDesc.bmAttributes & 0x02) !== 0),
                        CanDnload:             ((funcDesc.bmAttributes & 0x01) !== 0),
                        TransferSize:          funcDesc.wTransferSize,
                        DetachTimeOut:         funcDesc.wDetachTimeOut,
                        DFUVersion:            funcDesc.bcdDFUVersion
                    };
                } else {
                    return {};
                }
            },
            error => {}
        );
    }
    
    /**
     * Detect a numworks calculator.
     *
     * @param   successCallback     Callback in case of success.
     * @param   errorCallback       Callback in case of error.
     */
    async detect(successCallback, errorCallback) {
        var _this = this;
        navigator.usb.requestDevice({ 'filters': [{'vendorId': 0x0483, 'productId': 0xa291}]}).then(
            async selectedDevice => {
                let interfaces = DFU.findDeviceDfuInterfaces(selectedDevice);
                await _this.__fixInterfaceNames(selectedDevice, interfaces);
                _this.device = await _this.__connect(new DFU.Device(selectedDevice, interfaces[0]));
                
                successCallback();
            }
        ).catch(error => {
            errorCallback(error);
        });
    }
    
    /**
     * Connect to a WebDFU device.
     *
     * @param   device      The WebUSB device to connect to.
     */
    async __connect(device) {
        try {
            await device.open();
        } catch (error) {
            // this.installInstance.calculatorError(true, error);
            throw error;
        }

        // Attempt to parse the DFU functional descriptor
        let desc = {};
        try {
            desc = await this.__getDFUDescriptorProperties(device);
        } catch (error) {
            // this.installInstance.calculatorError(true, error);
            throw error;
        }

        if (desc && Object.keys(desc).length > 0) {
            device.properties = desc;
            this.transferSize = desc.TransferSize;
            if (desc.CanDnload) {
                this.manifestationTolerant = desc.ManifestationTolerant;
            }

            if ((desc.DFUVersion === 0x100 || desc.DFUVersion === 0x011a) && device.settings.alternate.interfaceProtocol === 0x02) {
                device = new DFUse.Device(device.device_, device.settings);
                if (device.memoryInfo) {
                    // We have to add RAM manually, because the device doesn't expose that normally
                    device.memoryInfo.segments.unshift({
                        start: 0x20000000,
                        sectorSize: 1024,
                        end: 0x20040000,
                        readable: true,
                        erasable: false,
                        writable: true
                    });
                }
            }
        }

        // Bind logging methods
        device.logDebug = console.log;
        device.logInfo = console.info;
        device.logWarning = console.warn;
        device.logError = console.error;
        device.logProgress = console.log;
        
        return device;
    }
    
    __readFString(dv, index, len) {
        var out = "";
        for(var i = 0; i < len; i++) {
            var chr = dv.getUint8(index + i);
            
            if (chr === 0) {
                break;
            }
            
            out += String.fromCharCode(chr);
        }
        
        return out;
    }
    
    __parsePlatformInfo(array) {
        var dv = new DataView(array);
        var data = {};
        
        data["magik"] = dv.getUint32(0x00, false) === 0xF00DC0DE;
        
        data["magik"] = dv.getUint32(0x00, false) === 0xF00DC0DE;
        
        if (data["magik"]) {
            data["oldplatform"] = !(dv.getUint32(0x1C, false) === 0xF00DC0DE);
            
            data["omega"] = {};
            
            if (data["oldplatform"]) {
                data["omega"]["installed"] = dv.getUint32(0x1C + 8, false) === 0xF00DC0DE || dv.getUint32(0x1C + 16, false) === 0xDEADBEEF || dv.getUint32(0x1C + 32, false) === 0xDEADBEEF;
                if (data["omega"]["installed"]) {
                    data["omega"]["version"] = this.__readFString(dv, 0x0C, 16);
                    
                    data["omega"]["user"] = "";
                    
                }
                
                data["version"] = this.__readFString(dv, 0x04, 8);
                var offset = 0;
                if (dv.getUint32(0x1C + 8, false) === 0xF00DC0DE) {
                    offset = 8;
                } else if (dv.getUint32(0x1C + 16, false) === 0xF00DC0DE) {
                    offset = 16;
                } else if (dv.getUint32(0x1C + 32, false) === 0xF00DC0DE) {
                    offset = 32;
                }
                
                data["commit"] = this.__readFString(dv, 0x0C + offset, 8);
                data["storage"] = {};
                data["storage"]["address"] = dv.getUint32(0x14 + offset, true);
                data["storage"]["size"] = dv.getUint32(0x18 + offset, true);
            } else {
                // Omega part
                data["omega"]["installed"] = dv.getUint32(0x20, false) === 0xDEADBEEF && dv.getUint32(0x44, false) === 0xDEADBEEF;
                if (data["omega"]["installed"]) {
                    data["omega"]["version"] = this.__readFString(dv, 0x24, 16);
                    data["omega"]["user"] = this.__readFString(dv, 0x34, 16);
                }
                // Upsilon part
                data["upsilon"] = {};
                data["upsilon"]["installed"] = dv.getUint32(0x48, false) === 0x69737055 && dv.getUint32(0x60, false) === 0x69737055;
                if (data["upsilon"]["installed"]) {
                    data["upsilon"]["version"] = this.__readFString(dv, 0x4C, 16);
                    data["upsilon"]["osType"] =  dv.getUint32(0x5C, false);
                    if (data["upsilon"]["osType"] == 0x78718279) {
                        data["upsilon"]["official"] = true
                    } else {
                        data["upsilon"]["official"] = false
                    }
                    
                }
                // Global part
                data["version"] = this.__readFString(dv, 0x04, 8);
                data["commit"] = this.__readFString(dv, 0x0C, 8);
                data["storage"] = {};
                data["storage"]["address"] = dv.getUint32(0x14, true);
                data["storage"]["size"] = dv.getUint32(0x18, true);
            }
        } else {
            data["omega"] = false;
        }
        return data;
    }
    
    /**
     * Get the platforminfo section of the calculator.
     *
     * @return  an object representing the platforminfo.
     */
    async getPlatformInfo() {
        this.device.startAddress = 0x080001c4;
        const blob = await this.device.do_upload(this.transferSize, 0x64);
        return this.__parsePlatformInfo(await blob.arrayBuffer());
    }
    
    async __autoConnectDevice(device) {
        let interfaces = DFU.findDeviceDfuInterfaces(device.device_);
        await this.__fixInterfaceNames(device.device_, interfaces);
        device = await this.__connect(new DFU.Device(device.device_, interfaces[0]));
        return device;
    }
    
    /**
     * Autoconnect a numworks calculator
     *
     * @param   serial      Serial number. If ommited, any will work.
     */
    autoConnect(callback, serial) {
        var _this = this;
        var vid = 0x0483, pid = 0xa291;
        
        DFU.findAllDfuInterfaces().then(async dfu_devices => {
            let matching_devices = _this.__findMatchingDevices(vid, pid, serial, dfu_devices);
            
            if (matching_devices.length !== 0) {
                this.stopAutoConnect();
                
                this.device = await this.__autoConnectDevice(matching_devices[0]);
                
                await callback();
            }
        });
        
        this.autoconnectId = setTimeout(this.autoConnect.bind(this, callback, serial), AUTOCONNECT_DELAY);
    }
    
    /**
     * Stop autoconnection.
     */
    stopAutoConnect() {
        if (this.autoconnectId === null) return;
        
        clearTimeout(this.autoconnectId);
        
        this.autoconnectId = null;
    }
    
    async __fixInterfaceNames(device_, interfaces) {
        // Check if any interface names were not read correctly
        if (interfaces.some(intf => (intf.name === null))) {
            // Manually retrieve the interface name string descriptors
            let tempDevice = new DFU.Device(device_, interfaces[0]);
            await tempDevice.device_.open();
            let mapping = await tempDevice.readInterfaceNames();
            await tempDevice.close();

            for (let intf of interfaces) {
                if (intf.name === null) {
                    let configIndex = intf.configuration.configurationValue;
                    let intfNumber = intf["interface"].interfaceNumber;
                    let alt = intf.alternate.alternateSetting;
                    intf.name = mapping[configIndex][intfNumber][alt];
                }
            }
        }
    }
    
    __findMatchingDevices(vid, pid, serial, dfu_devices) {
        let matching_devices = [];
        for (let dfu_device of dfu_devices) {
            if (serial) {
                if (dfu_device.device_.serialNumber === serial) {
                    matching_devices.push(dfu_device);
                }
            } else {
                if (
                    (!pid && vid > 0 && dfu_device.device_.vendorId  === vid) ||
                    (!vid && pid > 0 && dfu_device.device_.productId === pid) ||
                    (vid > 0 && pid > 0 && dfu_device.device_.vendorId  === vid && dfu_device.device_.productId === pid)
                   )
                {
                    matching_devices.push(dfu_device);
                }
            }
        }
        
        return matching_devices;
    }
    
    /**
     * Get storage from the calculator.
     *
     * @param   address     Storage address
     * @param   size        Storage size.
     *
     * @return  The storage, as a Blob.
     */
    async __retrieveStorage(address, size) {
        this.device.startAddress = address;
        return await this.device.do_upload(this.transferSize, size + 8);
    }
    
    /**
     * Flash storage to the calculator.
     *
     * @param   address     Storage address
     * @param   data        Storage data.
     */
    async __flashStorage(address, data) {
        this.device.startAddress = address;
        await this.device.do_download(this.transferSize, data, false);
    }
    
    /**
     * Install new storage in calculator
     *
     * @param   storage     Storage class, representing the storage.
     * @param   callback    Callback to be called when done.
     *
     * @throw   Error       If storage is too big.
     */
    async installStorage(storage, callback) {
        let pinfo = await this.getPlatformInfo();
        
        let storage_blob = await storage.encodeStorage(pinfo["storage"]["size"], pinfo["upsilon"]["installed"]);
        await this.__flashStorage(pinfo["storage"]["address"], await storage_blob.arrayBuffer());
        
        callback();
    }
    
    /**
     * Get and parse storage on the calculator.
     *
     * @return  Storage class describing the storage of the calculator.
     */
    async backupStorage() {
        let pinfo = await this.getPlatformInfo();
        
        let storage_blob = await this.__retrieveStorage(pinfo["storage"]["address"], pinfo["storage"]["size"]);
        
        let storage = new Numworks.Storage();
        
        await storage.parseStorage(storage_blob, pinfo["upsilon"]["installed"]);
        
        return storage;
    }
    
    onUnexpectedDisconnect(event, callback) {
        if (this.device !== null && this.device.device_ !== null) {
            if (this.device.device_ === event.device) {
                this.device.disconnected = true;
                callback(event);
                this.device = null;
            }
        }
    }
}

Numworks.Recovery = Recovery;
Numworks.Storage = Storage;

module.exports = Numworks;

