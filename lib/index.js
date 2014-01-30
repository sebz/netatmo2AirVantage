var _ = require("underscore"),
    request = require("request"),
    async = require("async"),
    querystring = require("querystring"),
    moment = require("moment"),
    nconf = require("nconf");


nconf.file('./config.json');

var airvantageConf = nconf.get("airvantage");
var netatmoConf = nconf.get("netatmo");

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
    AV_INDOOR_TEMP_PATH = airvantageConf.system.indoorTempPath,
    avToken = null,
    avLastMoment = null;

// Netatmo constants
var NETATMO_BASE_URL = "https://api.netatmo.net",
    NETATMO_AUTH_URL = NETATMO_BASE_URL + "/oauth2/token",
    NETATMO_BASE_API_URL = NETATMO_BASE_URL + "/api",
    NETATMO_CLIENT_ID = netatmoConf.clientId,
    NETATMO_CLIENT_SECRET = netatmoConf.clientSecret,
    NETATMO_EMAIL = netatmoConf.email,
    NETATMO_PASSWORD = netatmoConf.password,
    NETATMO_DEVICE_ID = netatmoConf.deviceId,
    netatmoToken = null;

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

function checkAVIndorTemperature(callback) {
    checkAirVantage(AV_INDOOR_TEMP_PATH, callback);
}

function checkAirVantage(dataId, callback) {
    var lastDataUrl = AV_BASE_API_URL + "/systems/" + AV_SYSTEM_UID + "/data?ids=" + dataId + "&access_token=" + avToken;

    request.get({
        uri: lastDataUrl,
        json: true
    }, function(error, response, lastData) {
        if (lastData && _.isArray(lastData[dataId]) && lastData[dataId].length > 0) {
            avLastMoment = moment(lastData[dataId][0].timestamp);
            console.log("# Last synchronized temperature ", formatMoment(avLastMoment));
        }
        callback(null);
    });
}

function getNetatmoTempMesures(callback) {
    getNetatmoLastMesures("Temperature", callback);
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

function syncIndoorTempMesures(mesures, callback) {

    var avDataPoints = [];

    _.each(mesures, function(values, timestamp) {
        var mesureMoment = moment(timestamp, "X");
        if (mesureMoment.isAfter(avLastMoment)) {
            console.log("# Synchronize value", values[0], "@", formatMoment(mesureMoment));
            avDataPoints.push(buildAVDataPoint(timestamp, values[0]));
        }
    });

    if (avDataPoints.length === 0) {
        console.log("# Nothing to synchronize.");
        callback(null);
        return;
    }

    console.log('# Netatmo data to sync >>', avDataPoints.length);

    var points = {};
    points[AV_INDOOR_TEMP_PATH] = avDataPoints;

    var data = [points];


    request.post({
        uri: AV_DEVICE_URL,
        auth: {
            username: AV_SYSTEM_COMM_ID,
            password: AV_SYSTEM_COMM_PWD
        },
        json: data
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

// Check last indoor temperature data on AirVantage
tasks.push(checkAVIndorTemperature);

// Get last indoor temperature from Netatmo
tasks.push(getNetatmoTempMesures);

tasks.push(syncIndoorTempMesures);

function synchronize(callback) {
    console.log("");
    console.log("");
    console.log("################################");
    console.log("# Start synchonization", formatNow());

    async.waterfall(tasks, function(err, result) {
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
