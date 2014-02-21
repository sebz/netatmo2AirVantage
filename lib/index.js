var _ = require("underscore"),
    request = require("request"),
    async = require("async"),
    querystring = require("querystring"),
    moment = require("moment"),
    nconf = require("nconf");


// Get all settings
nconf.file('./config.json');
var airvantageConf = nconf.get("airvantage"),
    netatmoConf = nconf.get("netatmo");

// AirVantage constants
var AV_BASE_URL = airvantageConf.url,
    AV_AUTH_URL = AV_BASE_URL + "/api/oauth/token",
    AV_BASE_API_URL = AV_BASE_URL + "/api/v1",
    AV_CLIENT_ID = airvantageConf.clientId,
    AV_CLIENT_SECRET = airvantageConf.clientSecret,
    AV_EMAIL = airvantageConf.email,
    AV_PASSWORD = airvantageConf.password,
    AV_DEVICE_URL = AV_BASE_URL + "/device/messages",
    AV_SYSTEM_UID = airvantageConf.system.uid,
    AV_SYSTEM_COMM_ID = airvantageConf.system.commId,
    AV_SYSTEM_COMM_PWD = airvantageConf.system.commPassword,
    AV_INDOOR_TEMP_PATH = airvantageConf.system.indoorTempPath;

// Netatmo constants
var NETATMO_BASE_URL = "https://api.netatmo.net",
    NETATMO_AUTH_URL = NETATMO_BASE_URL + "/oauth2/token",
    NETATMO_BASE_API_URL = NETATMO_BASE_URL + "/api",
    NETATMO_CLIENT_ID = netatmoConf.clientId,
    NETATMO_CLIENT_SECRET = netatmoConf.clientSecret,
    NETATMO_EMAIL = netatmoConf.email,
    NETATMO_PASSWORD = netatmoConf.password,
    NETATMO_DEVICE_ID = netatmoConf.deviceId,
    NETATMO_MODULE_ID = netatmoConf.outdoorModuleId;


// Platforms' tokens
var avToken = null,
    netatmoToken = null;

// Netatmo and AirVantage data name/path
var NETATMO_INDOOR_DATA = [
    "Temperature",
    "CO2",
    "Humidity",
    "Pressure",
    "Noise"
],
    NETATMO_OUTDOOR_DATA = [
        "Temperature",
        "Humidity"
    ],
    AIRVANTAGE_INDOOR_DATA = [
        "home.indoor.temperature",
        "home.indoor.co2",
        "home.indoor.humidity",
        "home.indoor.pressure",
        "home.indoor.noise"
    ],
    AIRVANTAGE_OUTDOOR_DATA = [
        "home.outdoor.temperature",
        "home.outdoor.humidity",
    ];

// Last synchro with AirVantage for each data
var avIndoorLastMoments = [];
var avOutdoorLastMoments = [];

var synchroInterval = nconf.get("synchroInterval");

function avAuthenticate(callback) {
    var authParams = {
        grant_type: 'password',
        client_id: AV_CLIENT_ID,
        client_secret: AV_CLIENT_SECRET,
        username: AV_EMAIL,
        password: AV_PASSWORD
    };

    request.get({
        url: AV_AUTH_URL + "?" + querystring.stringify(authParams),
        json: true
    }, function(error, response, body) {
        avToken = body.access_token;
        callback(null);
    });
}

function netatmoAuthenticate(callback) {
    var authParams = {
        grant_type: "password",
        client_id: NETATMO_CLIENT_ID,
        client_secret: NETATMO_CLIENT_SECRET,
        username: NETATMO_EMAIL,
        password: NETATMO_PASSWORD
    };

    request.post({
        uri: NETATMO_AUTH_URL,
        json: true,
        form: authParams
    }, function(error, response, body) {
        if (body.access_token) {
            netatmoToken = body.access_token;
        }
        callback(null);
    });
}

function checkAVIndoorData(callback) {
    avIndoorLastMoments = [];
    console.log("# ---- INDOOR ----");
    checkAirVantage({
        dataId: AIRVANTAGE_INDOOR_DATA.join(","),
        lastMoments: avIndoorLastMoments
    }, callback);
}

function checkAVOutdoorData(callback) {
    avOutdoorLastMoments = [];
    console.log("# ---- OUTDOOR ----");
    checkAirVantage({
        dataId: AIRVANTAGE_OUTDOOR_DATA.join(","),
        lastMoments: avOutdoorLastMoments
    }, callback);
}

function checkAirVantage(options, callback) {
    var lastDataUrl = AV_BASE_API_URL + "/systems/" + AV_SYSTEM_UID + "/data?ids=" + options.dataId + "&access_token=" + avToken;

    request.get({
        uri: lastDataUrl,
        json: true
    }, function(error, response, lastData) {
        if (lastData) {
            _.each(lastData, function(values, dataPath) {
                if (values) {
                    var dataMoment = moment(values[0].timestamp);
                    options.lastMoments.push(dataMoment);
                    console.log("# Last synchronized", "'" + dataPath + "'", "@", formatMoment(dataMoment));
                }
            });
        }
        callback(null);
    });
}

function getNetatmoIndoorMesures(callback) {
    getNetatmoLastMesures(NETATMO_INDOOR_DATA.join(","), avIndoorLastMoments, null, callback);
}

function getNetatmoOutdoorMesures(callback) {
    getNetatmoLastMesures(NETATMO_OUTDOOR_DATA.join(","), avOutdoorLastMoments, NETATMO_MODULE_ID, callback);
}

function getNetatmoLastMesures(data, lastMoments, moduleId, callback) {
    var getMesuresUrl = "/getmeasure";
    getMesuresUrl += "?access_token=" + netatmoToken;
    getMesuresUrl += "&device_id=" + NETATMO_DEVICE_ID;
    if (moduleId) {
        getMesuresUrl += "&module_id=" + moduleId;
    }
    getMesuresUrl += "&scale=max";
    getMesuresUrl += "&date_begin=" + getOldestMoment(lastMoments).unix();
    getMesuresUrl += "&type=" + data;
    getMesuresUrl += "&optimize=false";

    request.get({
        uri: NETATMO_BASE_API_URL + getMesuresUrl,
        json: true
    }, function(error, response, body) {
        var mesures = body.body;

        callback(null, mesures);
    });
}

function getOldestMoment(lastMoments) {
    var oldestMoment = null;

    _.each(lastMoments, function(lastMoment) {
        if (!oldestMoment ||  lastMoment.isBefore(oldestMoment)) {
            oldestMoment = lastMoment;
        }
    });

    return oldestMoment;
}

function syncIndoorMesures(mesures, callback) {
    syncMesures({
        mesures: mesures,
        netatmoData: NETATMO_INDOOR_DATA,
        airvantageData: AIRVANTAGE_INDOOR_DATA,
        lastMoments: avIndoorLastMoments
    }, callback);
}

function syncOutdoorMesures(mesures, callback) {
    syncMesures({
        mesures: mesures,
        netatmoData: NETATMO_OUTDOOR_DATA,
        airvantageData: AIRVANTAGE_OUTDOOR_DATA,
        lastMoments: avOutdoorLastMoments
    }, callback);
}

function syncMesures(options, callback) {
    var points = {},
        dataToSync = 0;

    // Loop through all the asked data
    _.each(options.netatmoData, function(netatmoDataName, dataIndex) {
        var avDataPath = options.airvantageData[dataIndex];
        points[avDataPath] = [];
        // Loop through the netatmo mesures
        _.each(options.mesures, function(values, timestamp) {
            // Keep the current mesure moment
            var mesureMoment = moment(timestamp, "X");

            // Check if the data has already been synchronized
            if (!options.lastMoments[dataIndex] ||  mesureMoment.isAfter(options.lastMoments[dataIndex], "minute")) {
                // console.log("    lastMoment", formatMoment(options.lastMoments[dataIndex]),
                //     "vs. data moment", formatMoment(mesureMoment));
                points[avDataPath].push(buildAVDataPoint(timestamp, values[dataIndex]));
                dataToSync++;
            }
        });
        console.log("# Synchronize",
            formatData(options.netatmoData, options.airvantageData, dataIndex),
            " - ", points[avDataPath].length, "mesures");
    });

    if (dataToSync === 0) {
        console.log("# Nothing to synchronize.");
        console.log("#");
        callback(null);
        return;
    }

    console.log('# Netatmo data to sync >>', dataToSync);
    request.post({
        uri: AV_DEVICE_URL,
        auth: {
            username: AV_SYSTEM_COMM_ID,
            password: AV_SYSTEM_COMM_PWD
        },
        json: [points]
    }, function(error, response, body) {
        callback(null);
    });
}

function buildAVDataPoint(netatmoTimestamp, value) {
    return {
        timestamp: parseInt(netatmoTimestamp) * 1000,
        value: value
    };
}

function formatData(netatmoData, airvantageData, index) {
    return netatmoData[index] + " => " + airvantageData[index];
}

function formatMoment(mom) {
    return (mom ? mom.format("ddd MMM Do YYYY HH:mm") : "Never");
}

function formatNow() {
    return formatMoment(moment());
}

function formatNextSynchro() {
    return moment.duration(synchroInterval, "seconds").humanize();
}

var tasks = [];
tasks.push(avAuthenticate);
tasks.push(netatmoAuthenticate);

// Check last indoor data on AirVantage
tasks.push(checkAVIndoorData);
// Get last indoor mesures from Netatmo
tasks.push(getNetatmoIndoorMesures);
tasks.push(syncIndoorMesures);

// Check last outdoor data on AirVantage
tasks.push(checkAVOutdoorData);
// Get last outdoor mesures from Netatmo
tasks.push(getNetatmoOutdoorMesures);
tasks.push(syncOutdoorMesures);

function synchronize(callback) {
    console.log("");
    console.log("");
    console.log("################################");
    console.log("# Start synchonization", formatNow());

    async.waterfall(tasks, function(err, result) {
        if (err) {
            console.log(">>>>> Err", err);
            console.log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>");
            return;
        }
        console.log("# Synchronized @ ", formatNow());
        console.log("# Next synchronization in", formatNextSynchro());
        console.log("################################");

        if (callback) {
            callback();
        }
    });
}

synchronize(function()  {
    setInterval(function()  {
        synchronize();
    }, synchroInterval * 1000);
});
