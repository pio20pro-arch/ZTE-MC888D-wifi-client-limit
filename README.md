# ZTE MC888D Wi-Fi Limit Helper

A browser-console helper for managing Wi-Fi client limits on a ZTE MC888D with Orange firmware.

The script uses the router web interface's own JavaScript service module. It can:

- display the current main and guest Wi-Fi settings;
- change the client limit of the main combined 2.4/5 GHz network;
- change only the 2.4 GHz guest-network limit;
- enable or disable only the 5 GHz guest network;
- verify the result after each write operation;
- detect unexpected changes to protected Wi-Fi settings.

## File

The helper is contained in [`MC888D-wifi-limit.js`](./MC888D-wifi-limit.js).

## Requirements

- ZTE MC888D router with the compatible Orange web-interface firmware;
- administrator access to the router at `http://192.168.0.1/`;
- a browser with Developer Tools, such as Chrome, Edge, or Firefox.

This script is firmware-specific. Do not use it on another router model.

## Installation in the router console

1. Open `http://192.168.0.1/` and sign in as the router administrator.
2. If you previously used a script that reveals hidden router settings, reload the page first.
3. Open the browser Developer Tools and select **Console**.
4. Copy the entire contents of `MC888D-wifi-limit.js` and paste it into the console.
5. Press Enter.

The following Polish-language message confirms that the helper was loaded:

```text
Pomocnik MC888D gotowy...
```

The console may also print `undefined` after loading the file. This is normal: the installation wrapper does not return a value.

The helper exists only in the currently loaded browser page. After refreshing or reopening the router panel, paste the script again before using its commands.

## Commands

### Read the current state

```js
await mc888dWifiLimitInfo()
```

This displays a table containing the network names, enabled states, client limits, band-steering state, and the maximum value exposed by the firmware.

### Change the main-network limit

For example, set the combined main 2.4/5 GHz network limit to 12 clients:

```js
await mc888dSetWifiLimit(12)
```

Restore a limit of 6 clients:

```js
await mc888dSetWifiLimit(6)
```

On the tested firmware, the accepted range is 1 through 32. The function preserves the existing radio mode, country, channel, bandwidth, and internal 5 GHz limit.

### Change only the 2.4 GHz guest limit

For example, set the 2.4 GHz guest network limit to 12 clients:

```js
await mc888dSetGuestWifiLimit(12)
```

This operation leaves the main network and the 5 GHz guest-network state and limit unchanged.

### Enable the 5 GHz guest network

```js
await mc888dSetGuest5GHz(true)
```

The router enables the already stored 5 GHz guest profile, including its existing SSID, password, security mode, and client limit.

### Disable the 5 GHz guest network

```js
await mc888dSetGuest5GHz(false)
```

Disabling it does not erase its saved profile.

## Verification

Write operations wait 18 seconds and then read the configuration back from the router. A successful operation prints a table with the resulting values.

You can run an additional check at any time:

```js
await mc888dWifiLimitInfo()
```

To confirm that a setting was stored permanently, restart the router and run the read command again after signing in and loading the helper.

## Important behavior

- Wi-Fi may briefly disconnect while a setting is being applied.
- Run only one write command at a time and wait for it to finish.
- Keep the router page open until the verification table appears.
- A `result: "success"` response means the router accepted the request; the subsequent read-back confirms whether the requested value was actually applied.
- If the script reports that another protected setting changed, inspect the displayed table before making another modification.
- Enabling the 5 GHz guest network does not automatically rename it to match the 2.4 GHz guest network.

## Troubleshooting

### `mc888dWifiLimitInfo is not defined`

The helper is not loaded in the current page. Paste the complete JavaScript file into the console again.

### Administrator session error

Sign in to the router panel, reload the page, paste the helper again, and retry the command.

### The router returns `{"result":"failure"}`

Make sure the complete, current version of the script was pasted into the console and that the administrator session has not expired. Read the current state before retrying:

```js
await mc888dWifiLimitInfo()
```

### The browser blocks pasted console code

Some browsers display a self-XSS warning before allowing console pasting. Follow the browser's on-screen instruction only if you have reviewed and trust the script. Never paste unknown code into an authenticated router console.

## Disclaimer

This is an unofficial helper and is not provided by ZTE or Orange. Router firmware variants may expose different parameters or behave differently. Use it at your own risk and verify the configuration after every change.
