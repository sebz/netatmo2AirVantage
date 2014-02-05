# Netatmo to AirVantage

> Small Nodejs script that synchronize your Netatmo urban weather station data with Sierra Wireless AirVantage Cloud platform.


## Getting started

1. `npm install`
2. Configure the script with a `config.json` configuration file
3. `node .`

## Features

All Netatmo data are synchronized every 15 minutes (Netatmo synchronizes every 5 minutes) :

* **Indoor**
  * Temperature
  * CO2
  * Noise
  * Pressure
  * Humidity
* **Outdoor**
  * Temperature
  * Humidity

## Next steps

Optimizations, currently there's an overlap of data sent to AirVantage.
