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
    NETATMO_DEVICE_ID = netatmoConf.deviceId;


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
    AIRVANTAGE_INDOOR_DATA = [
        "home.indoor.temperature",
        "home.indoor.co2",
        "home.indoor.humidity",
        "home.indoor.pressure",
        "home.indoor.noise"
    ];

// Last synchro with AirVantage for each data
var airvantageLastMoments = [];

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

function checkAVIndorData(callback) {
    checkAirVantage(AIRVANTAGE_INDOOR_DATA.join(","), callback);
}

function checkAirVantage(dataId, callback) {
    var lastDataUrl = AV_BASE_API_URL + "/systems/" + AV_SYSTEM_UID + "/data?ids=" + dataId + "&access_token=" + avToken;

    request.get({
        uri: lastDataUrl,
        json: true
    }, function(error, response, lastData) {
        if (lastData) {
            _.each(lastData, function(values, dataPath) {
                if (values) {
                    var dataMoment = moment(values[0].timestamp);
                    airvantageLastMoments.push(dataMoment);
                    console.log("# Last synchronized", "'" + dataPath + "'", "@", formatMoment(dataMoment));
                }
            });
        }
        callback(null);
    });
}

function getNetatmoIndoorMesures(callback) {
    getNetatmoLastMesures(NETATMO_INDOOR_DATA.join(","), callback);
}

function getNetatmoLastMesures(data, callback) {
    var getMesuresUrl = "/getmeasure";
    getMesuresUrl += "?access_token=" + netatmoToken;
    getMesuresUrl += "&device_id=" + NETATMO_DEVICE_ID;
    getMesuresUrl += "&scale=max";
    getMesuresUrl += "&date_end=" + Date.now();
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

function syncIndoorMesures(mesures, callback) {

    var points = {},
        dataToSync = 0;

    // Loop through all the asked data
    _.each(NETATMO_INDOOR_DATA, function(netatmoDataName, dataIndex) {
        var avDataPath = AIRVANTAGE_INDOOR_DATA[dataIndex];
        points[avDataPath] = [];
        // Loop through the netatmo mesures
        _.each(mesures, function(values, timestamp) {
            // Keep the current mesure moment
            var mesureMoment = moment(timestamp, "X");

            // Check if the data has already been synchronized
            if (!airvantageLastMoments[dataIndex] ||  mesureMoment.isAfter(airvantageLastMoments[dataIndex])) {
                console.log("# Synchronize", formatData(dataIndex), values[dataIndex], "@", formatMoment(mesureMoment));
                points[avDataPath].push(buildAVDataPoint(timestamp, values[dataIndex]));
                dataToSync++;
            }
        });

    });

    if (dataToSync === 0) {
        console.log("# Nothing to synchronize.");
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

function formatData(index) {
    return NETATMO_INDOOR_DATA[index] + " => " + AIRVANTAGE_INDOOR_DATA[index];
}

function formatMoment(mom) {
    return mom.format("ddd MMM Do YYYY HH:mm");
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
tasks.push(checkAVIndorData);

// Get last indoor mesures from Netatmo
tasks.push(getNetatmoIndoorMesures);

tasks.push(syncIndoorMesures);

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
