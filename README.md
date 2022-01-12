# Numworks.js

[![NPM](https://img.shields.io/npm/v/numworks.js?style=flat-square)](https://www.npmjs.com/package/numworks.js)
![Version](https://img.shields.io/github/package-json/v/M4xi1m3/numworks.js?color=green&style=flat-square)
![License](https://img.shields.io/npm/l/numworks.js?color=blue&style=flat-square)

Utility classes to interact with a Numworks calculator using WebUSB.

## Running the example

```
npm install
npm start
```

## Getting started with Numworks.js

Numworks.js is simple and intuitive to use.

### Connecting to the calculator

There are two ways to connect to the calculator, either by using WebUSB's auto-detect feature or by manual connection.

#### Auto detection

```js
var calculator = new Numworks();

navigator.usb.addEventListener("disconnect", function(e) {
  calculator.onUnexpectedDisconnect(e, function() {
    // Do stuff when the calculator gets disconnected.
  });
});

calculator.autoConnect(function() {
  // Do stuff...
});
```

`autoConnect` will try to detect a NumWorks calculator once a second. You can use `stopAutoConnect` to make the loop stop.

#### Manual connection

```js
var calculator = new Numworks();

navigator.usb.addEventListener("disconnect", function(e) {
  calculator.onUnexpectedDisconnect(e, function() {
    // Do stuff when the calculator gets disconnected.
  });
});

calculator.detect(function() {
  // Do stuff...
}, function(error) {
  // Handle errors.
});
```

This code should be called in an event handler, such as a click handler.

#### Combining both methods

Both methods can be combined, making life easier for the user.

```js
var calculator = new Numworks();

navigator.usb.addEventListener("disconnect", function(e) {
  calculator.onUnexpectedDisconnect(e, function() {
    calculator.autoConnect(connectedHandler);

    // Do stuff when the calculator gets disconnected.
  });
});

calculator.autoConnect(connectedHandler);

calculator.autoConnect();

function someEventHandler(e) {
  calculator.detect(connectedHandler, function(error) {
    // Handle errors.
  });
}

function connectedHandler() {
  calculator.stopAutoConnect(); // It's connected, so autoConnect should stop.
  // Do stuff when the claculator gets connected.
}
```

### Accessing data from the calculator.

Now that we are connected to the NumWorks calculator, we can do stuff with it (YAY!)

#### Determining the model

The function `getModel` can be used to determine the model of the connected calculator. It returns either `0100` or `0110`.

#### Getting information about the software

`getPlatformInfo` can be used to get information about the software installed on the calculator. It returns an object, formatted as follows :

```js
{
  // Whether or not the software is valid, based on a magic number. If false, the rest of the structure is absent.
  "magik": true,
  // Whether or not the software is considered as old (< Epsilon 11).
  // This is primarely used by the parser itself to know where to read data.
  "oldplatform": false,
  // This part of the data is related to the Omega fork of Epsilon.
  "omega": {
    // Whether or not Omega is installed on the Numworks. If false, the rest of the Omega structure is absent
    "installed": true
    // The version of Omega detected on the calculator.
    "version": "1.19.2",
    // Username written in the system. "" if none.
    "user": "M4x1m3"
  },
  "upsilon": {
    // Whether or not Upsilon is installed on the Numworks. If false, the rest of the Upsilon structure is absent
    "installed": true
    // The version of Upsilon detected on the calculator.
    "version": "1.0.0",
    // The type of Upsilon : if it is a derivate or not
    "osType": "2020704889",
    // A more simple way to get if it is a derivate or not, it is based on the os type
    "official": true
  },
  // The version of Epsilon installed on the calculator.
  "version": "13.0.0",
  // The system's commit ID
  "commit": " 651abf9",
  "storage": {
    // Address of the script storage
    "address": 165467,
    // Size of the script storage
    "size": 65535
  }
}
```

#### Reading and writing to the script store

The script store can be read using `backupStorage` and can be written to using `installStorage`.
Here is an example of adding a script in the storage
```js
var storage = await calculator.backupStorage();
storage.records.push({"name": "test", "type": "py", "autoImport": true, position: 0, "code": "print('Hello World!')\n"});
await calculator.installStorage(storage, function() {
  // Do stuff after writing to the storage is done
});
```

#### Flashing an update

The methods `flashInternal` and `flashExternal` can be used to flash an update. They write to the internal and the external flash, respectively. Not that the external flash is not available on a N0100.

## Licensing

Numworks.js is released under the MIT license.

Numworks is a registered trademark of Numworks SAS, 24 Rue Godot de Mauroy, 75009 Paris, France. Numworks SAS isn't associated in any shape or form with this project.
