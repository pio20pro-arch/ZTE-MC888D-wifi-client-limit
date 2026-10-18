/*
 * ZTE MC888D (Orange firmware) - safe Wi-Fi client limit helper.
 *
 * Usage:
 *   1. Log in at http://192.168.0.1/ and reload the page after using any
 *      "show hidden settings" script.
 *   2. Paste this whole file into the browser developer console.
 *   3. Read the current values:
 *          await mc888dWifiLimitInfo()
 *   4. Set a new combined limit (the current firmware exposes 1..32):
 *          await mc888dSetWifiLimit(20)
 *   5. Set only the 2.4 GHz guest limit (main Wi-Fi and 5 GHz stay intact):
 *          await mc888dSetGuestWifiLimit(12)
 *   6. Enable or disable only the 5 GHz guest network:
 *          await mc888dSetGuest5GHz(true)
 *          await mc888dSetGuest5GHz(false)
 *
 * The helper uses the router's own service module. It preserves the current
 * radio mode, country, channel, bandwidth and 5 GHz sub-limit.
 */
(function installMc888dWifiLimitHelper() {
    "use strict";

    const EXPECTED_MODEL = "MC888D";

    function loadRouterModules() {
        return new Promise((resolve, reject) => {
            if (typeof window.require !== "function") {
                reject(new Error("Otworz panel routera (http://192.168.0.1/) i zaloguj sie przed wklejeniem skryptu."));
                return;
            }

            window.require(["service", "config/config"], (service, config) => {
                resolve({ service, config });
            }, reject);
        });
    }

    function readState(service, config) {
        if (typeof window.wifiFilterAPInfo !== "function") {
            throw new Error("Panel nie zaladowal jeszcze funkcji Wi-Fi. Odswiez strone, zaloguj sie i sprobuj ponownie.");
        }

        const sessionParams = service.getParams({ nv: ["loginfo"] });
        if (!sessionParams || String(sessionParams.loginfo).toLowerCase() !== "ok") {
            throw new Error("Sesja administratora nie jest aktywna. Zaloguj sie w panelu, a potem wklej skrypt ponownie.");
        }

        const moduleState = service.getWifiModuleSwitchStatus();
        const rawAccessPoints = service.getWifiAccessPointInfo();
        const wifiParams = service.getParams({ nv: ["wifi_lbd_enable"] });
        const accessPoints = Array.isArray(rawAccessPoints)
            ? rawAccessPoints
            : rawAccessPoints && typeof rawAccessPoints === "object"
                ? Object.values(rawAccessPoints).filter(item =>
                    item && typeof item === "object" && item.ChipIndex !== undefined
                )
                : [];

        if (accessPoints.length === 0) {
            throw new Error(`Router nie zwrocil punktow dostepowych: ${JSON.stringify(rawAccessPoints)}`);
        }

        const ap24 = window.wifiFilterAPInfo(
            moduleState,
            accessPoints,
            config.WIFICHIPINDEX.FIRST,
            config.ACCESSPOINTINDEX.FIRST,
            config.WIFICHIPINDEX,
            config.ACCESSPOINTINDEX
        );
        const ap5 = window.wifiFilterAPInfo(
            moduleState,
            accessPoints,
            config.WIFICHIPINDEX.SECOND,
            config.ACCESSPOINTINDEX.FIRST,
            config.WIFICHIPINDEX,
            config.ACCESSPOINTINDEX
        );
        const guest24 = window.wifiFilterAPInfo(
            moduleState,
            accessPoints,
            config.WIFICHIPINDEX.FIRST,
            config.ACCESSPOINTINDEX.SECOND,
            config.WIFICHIPINDEX,
            config.ACCESSPOINTINDEX
        );
        const guest5 = window.wifiFilterAPInfo(
            moduleState,
            accessPoints,
            config.WIFICHIPINDEX.SECOND,
            config.ACCESSPOINTINDEX.SECOND,
            config.WIFICHIPINDEX,
            config.ACCESSPOINTINDEX
        );

        if (!ap24 || !ap5 || ap24.ApMaxStationNumber === undefined || ap5.ApMaxStationNumber === undefined) {
            throw new Error("Firmware zwrocil niepelne dane Wi-Fi; nic nie zostalo zmienione.");
        }

        const maxCombined = config.MAX_STATION_NUMBER_24G_5G_SEPARETE
            ? 32
            : Number(config.MAX_STATION_NUMBER) + Number(config.MAX_STATION_NUMBER_5G);

        return {
            ap24,
            ap5,
            guest24,
            guest5,
            bandSteeringEnabled: String(wifiParams.wifi_lbd_enable) === "1",
            maxCombined
        };
    }

    function printableState(config, state) {
        return {
            model: config.DEVICE_MODEL || "nieznany",
            bandSteering: state.bandSteeringEnabled ? "wlaczony (2,4 + 5 GHz)" : "wylaczony",
            glownaNazwa24GHz: state.ap24.SSID,
            glownaLimitLaczny: Number(state.ap24.ApMaxStationNumber),
            glownaLimit5GHz: Number(state.ap5.ApMaxStationNumber),
            goscNazwa24GHz: state.guest24.SSID,
            goscWlaczony24GHz: String(state.guest24.AccessPointSwitchStatus) === "1",
            goscLimit24GHz: Number(state.guest24.ApMaxStationNumber),
            goscNazwa5GHz: state.guest5.SSID,
            goscWlaczony5GHz: String(state.guest5.AccessPointSwitchStatus) === "1",
            goscLimit5GHz: Number(state.guest5.ApMaxStationNumber),
            maksimumPanelu: state.maxCombined,
            pasmo24GHz: state.ap24.Band,
            pasmo5GHz: state.ap5.Band
        };
    }

    async function getChannel5ForSave(service, ap5) {
        let channel = String(ap5.Channel);

        // The native MC888D UI stores a special allowed-channel range for PL.
        // Preserve it when 5 GHz is set to Auto instead of resetting the range.
        if (String(ap5.CountryCode).toUpperCase() === "PL" && channel === "0") {
            const params = service.getParams({ nv: ["wifi_chip2_ssid1_channel_range"] });
            const range = params && params.wifi_chip2_ssid1_channel_range;
            const encodedRanges = {
                ch36to64_ch100to140: "3664100140",
                ch36to64_ch100to112_ch132to140: "3664100112132140",
                ch36to48: "3648"
            };
            channel = encodedRanges[range] || channel;
        }

        return channel;
    }

    window.mc888dWifiLimitInfo = async function mc888dWifiLimitInfo() {
        const { service, config } = await loadRouterModules();
        const state = readState(service, config);
        const result = printableState(config, state);
        console.table(result);
        return result;
    };

    window.mc888dSetWifiLimit = async function mc888dSetWifiLimit(limit) {
        const requested = Number(limit);
        if (!Number.isInteger(requested)) {
            throw new TypeError("Limit musi byc liczba calkowita, np. 20.");
        }

        const { service, config } = await loadRouterModules();
        const state = readState(service, config);

        if (config.DEVICE_MODEL && config.DEVICE_MODEL !== EXPECTED_MODEL) {
            throw new Error(`Ten skrypt jest przeznaczony dla ${EXPECTED_MODEL}, a panel zglasza ${config.DEVICE_MODEL}.`);
        }
        if (requested < 1 || requested > state.maxCombined) {
            throw new RangeError(`Ten firmware przyjmuje limit od 1 do ${state.maxCombined}.`);
        }

        const channel5 = await getChannel5ForSave(service, state.ap5);
        const payload = {
            ChipIndex: "8",
            WirelessMode: state.ap24.WirelessMode,
            CountryCode: state.ap24.CountryCode,
            Channel: state.ap24.Channel,
            rate: state.ap24.rate,
            Band: state.ap24.Band,
            BandWidth: state.ap24.BandWidth,
            WirelessMode_5G: state.ap5.WirelessMode,
            CountryCode_5G: state.ap5.CountryCode,
            Channel_5G: channel5,
            rate_5G: state.ap5.rate,
            Band_5G: state.ap5.Band,
            BandWidth_5G: state.ap5.BandWidth,
            ApMaxStationNumber: String(requested),
            ApMaxStationNumber_5G: String(state.ap5.ApMaxStationNumber)
        };

        console.info(`MC888D: zapis limitu ${requested}; Wi-Fi moze zrestartowac sie na kilkanascie sekund.`);

        const response = await new Promise((resolve, reject) => {
            service.setWifiWholeChipAdvanceInfo(payload, result => {
                if (result && result.result === "success") {
                    resolve(result);
                } else {
                    reject(new Error(`Router odrzucil zapis: ${JSON.stringify(result)}`));
                }
            });
        });

        console.info("MC888D: router potwierdzil zapis. Odczyt kontrolny za 18 sekund...", response);
        await new Promise(resolve => setTimeout(resolve, 18000));

        const verified = await window.mc888dWifiLimitInfo();
        if (verified.glownaLimitLaczny !== requested) {
            throw new Error(`Weryfikacja nie powiodla sie: zapisano ${requested}, router zwraca ${verified.glownaLimitLaczny}.`);
        }

        console.info(`MC888D: limit ${requested} zostal zapisany i odczytany poprawnie.`);
        return verified;
    };

    window.mc888dSetGuestWifiLimit = async function mc888dSetGuestWifiLimit(limit) {
        const requested = Number(limit);
        if (!Number.isInteger(requested)) {
            throw new TypeError("Limit goscia musi byc liczba calkowita, np. 12.");
        }

        const { service, config } = await loadRouterModules();
        const before = readState(service, config);
        const guestMaximum = Number(config.MAX_STATION_NUMBER);

        if (config.DEVICE_MODEL && config.DEVICE_MODEL !== EXPECTED_MODEL) {
            throw new Error(`Ten skrypt jest przeznaczony dla ${EXPECTED_MODEL}, a panel zglasza ${config.DEVICE_MODEL}.`);
        }
        if (requested < 1 || requested > guestMaximum) {
            throw new RangeError(`Ten firmware przyjmuje dla goscia 2,4 GHz limit od 1 do ${guestMaximum}.`);
        }
        if (String(before.guest24.AccessPointSwitchStatus) !== "1") {
            throw new Error("Siec goscia 2,4 GHz jest wylaczona; nic nie zostalo zmienione.");
        }

        const unchanged = {
            mainCombined: String(before.ap24.ApMaxStationNumber),
            main5: String(before.ap5.ApMaxStationNumber),
            guest5Enabled: String(before.guest5.AccessPointSwitchStatus),
            guest5Limit: String(before.guest5.ApMaxStationNumber)
        };

        const channel5 = await getChannel5ForSave(service, before.ap5);
        const payload = {
            goformId: "setAccessPointInfo_24G_5G_ALL",
            ChipIndex: "9",
            AccessPointIndex: String(config.ACCESSPOINTINDEX.SECOND),
            WirelessMode: before.ap24.WirelessMode,
            CountryCode: before.ap24.CountryCode,
            Channel: before.ap24.Channel,
            rate: before.ap24.rate,
            Band: before.ap24.Band,
            BandWidth: before.ap24.BandWidth,
            WirelessMode_5G: before.ap5.WirelessMode,
            CountryCode_5G: before.ap5.CountryCode,
            Channel_5G: channel5,
            rate_5G: before.ap5.rate,
            Band_5G: before.ap5.Band,
            BandWidth_5G: before.ap5.BandWidth,
            ApMaxStationNumber: String(requested),
            ApMaxStationNumber_5G: String(before.guest5.ApMaxStationNumber)
        };

        console.info(
            `MC888D: zapis limitu goscia 2,4 GHz ${requested}; glowna siec i gosc 5 GHz pozostaja bez zmian.`
        );

        const response = await new Promise((resolve, reject) => {
            service.setWifiWholeChipAdvanceInfo(payload, result => {
                if (result && result.result === "success") {
                    resolve(result);
                } else {
                    reject(new Error(`Router odrzucil zapis limitu goscia: ${JSON.stringify(result)}`));
                }
            });
        });

        console.info("MC888D: router potwierdzil zapis goscia. Odczyt kontrolny za 18 sekund...", response);
        await new Promise(resolve => setTimeout(resolve, 18000));

        const after = readState(service, config);
        const result = printableState(config, after);
        console.table(result);

        if (Number(after.guest24.ApMaxStationNumber) !== requested) {
            throw new Error(
                `Limit goscia nie zostal utrwalony: zapisano ${requested}, router zwraca ${after.guest24.ApMaxStationNumber}.`
            );
        }

        const protectedSettingsChanged =
            String(after.ap24.ApMaxStationNumber) !== unchanged.mainCombined ||
            String(after.ap5.ApMaxStationNumber) !== unchanged.main5 ||
            String(after.guest5.AccessPointSwitchStatus) !== unchanged.guest5Enabled ||
            String(after.guest5.ApMaxStationNumber) !== unchanged.guest5Limit;

        if (protectedSettingsChanged) {
            throw new Error("Router zmienil dodatkowe ustawienie Wi-Fi. Sprawdz tabele kontrolna powyzej.");
        }

        console.info(
            `MC888D: gosc 2,4 GHz ma limit ${requested}; glowna siec i wylaczony gosc 5 GHz pozostaly bez zmian.`
        );
        return result;
    };

    window.mc888dSetGuest5GHz = async function mc888dSetGuest5GHz(enabled) {
        if (typeof enabled !== "boolean") {
            throw new TypeError("Podaj true, aby wlaczyc goscia 5 GHz, albo false, aby go wylaczyc.");
        }

        const { service, config } = await loadRouterModules();
        const before = readState(service, config);

        if (config.DEVICE_MODEL && config.DEVICE_MODEL !== EXPECTED_MODEL) {
            throw new Error(`Ten skrypt jest przeznaczony dla ${EXPECTED_MODEL}, a panel zglasza ${config.DEVICE_MODEL}.`);
        }
        if (!before.guest5 || before.guest5.AccessPointSwitchStatus === undefined) {
            throw new Error("Firmware nie zwrocil konfiguracji goscia 5 GHz; nic nie zostalo zmienione.");
        }

        const desiredStatus = enabled ? "1" : "0";
        const currentStatus = String(before.guest5.AccessPointSwitchStatus);
        if (currentStatus === desiredStatus) {
            const unchangedResult = printableState(config, before);
            console.info(`MC888D: gosc 5 GHz jest juz ${enabled ? "wlaczony" : "wylaczony"}.`);
            console.table(unchangedResult);
            return unchangedResult;
        }

        const protectedSettings = {
            mainCombined: String(before.ap24.ApMaxStationNumber),
            main5: String(before.ap5.ApMaxStationNumber),
            guest24Enabled: String(before.guest24.AccessPointSwitchStatus),
            guest24Limit: String(before.guest24.ApMaxStationNumber),
            guest5Limit: String(before.guest5.ApMaxStationNumber)
        };
        const extraParams = service.getParams({
            nv: ["lan_sec_ssid_control", "wifi_syncparas_flag"]
        }) || {};
        const payload = {
            ChipIndex: String(config.WIFICHIPINDEX.SECOND),
            AccessPointIndex: String(config.ACCESSPOINTINDEX.SECOND),
            AccessPointSwitchStatus: desiredStatus,
            originAccessPointSwitchStatus: currentStatus
        };

        ["QrImageShow"].forEach(key => {
            if (before.guest5[key] !== undefined && before.guest5[key] !== null) {
                payload[key] = String(before.guest5[key]);
            }
        });
        ["lan_sec_ssid_control", "wifi_syncparas_flag"].forEach(key => {
            if (extraParams[key] !== undefined && extraParams[key] !== null) {
                payload[key] = String(extraParams[key]);
            }
        });

        console.info(
            `MC888D: ${enabled ? "wlaczanie" : "wylaczanie"} goscia 5 GHz; pozostale sieci i limity pozostaja bez zmian.`
        );

        const response = await new Promise((resolve, reject) => {
            service.setWifiAccessPointInfo(payload, result => {
                if (result && result.result === "success") {
                    resolve(result);
                } else {
                    reject(new Error(`Router odrzucil zmiane stanu goscia 5 GHz: ${JSON.stringify(result)}`));
                }
            });
        });

        console.info("MC888D: router potwierdzil zmiane. Odczyt kontrolny za 18 sekund...", response);
        await new Promise(resolve => setTimeout(resolve, 18000));

        const after = readState(service, config);
        const result = printableState(config, after);
        console.table(result);

        if (String(after.guest5.AccessPointSwitchStatus) !== desiredStatus) {
            throw new Error(
                `Nie udalo sie ${enabled ? "wlaczyc" : "wylaczyc"} goscia 5 GHz; router zwraca stan ${after.guest5.AccessPointSwitchStatus}.`
            );
        }

        const protectedSettingsChanged =
            String(after.ap24.ApMaxStationNumber) !== protectedSettings.mainCombined ||
            String(after.ap5.ApMaxStationNumber) !== protectedSettings.main5 ||
            String(after.guest24.AccessPointSwitchStatus) !== protectedSettings.guest24Enabled ||
            String(after.guest24.ApMaxStationNumber) !== protectedSettings.guest24Limit ||
            String(after.guest5.ApMaxStationNumber) !== protectedSettings.guest5Limit;

        if (protectedSettingsChanged) {
            throw new Error("Router zmienil dodatkowe ustawienie Wi-Fi. Sprawdz tabele kontrolna powyzej.");
        }

        console.info(`MC888D: gosc 5 GHz zostal ${enabled ? "wlaczony" : "wylaczony"}.`);
        return result;
    };

    console.info(
        "Pomocnik MC888D gotowy. Odczyt: await mc888dWifiLimitInfo(); glowna: await mc888dSetWifiLimit(20); gosc 2,4 GHz: await mc888dSetGuestWifiLimit(12); gosc 5 GHz: await mc888dSetGuest5GHz(true);"
    );
}());
