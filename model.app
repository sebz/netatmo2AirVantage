<?xml version="1.0" encoding="UTF-8"?>
<app:application xmlns:app="http://www.sierrawireless.com/airvantage/application/1.0" name="Roquettes" revision="1.0.3" type="RQT">
  <capabilities>
    <communication>
      <protocol comm-id="SERIAL" type="REST">
      </protocol>
    </communication>
    <data>
      <encoding type="REST">
          <asset default-label="Poelle à pellets" id="stove">
          <variable default-label="Loaded" path="loaded" type="int"/>
          <variable default-label="Started" path="started" type="int"/>
          <variable default-label="Stopped" path="stopped" type="int"/>
          <variable default-label="State" path="state" type="int"/>
          <node default-label="Data" path="data">        
            <variable default-label="Bags consumed" path="bagsCons" type="int"/>
          </node>
          <node default-label="Events" path="events">
            <event default-label="Loaded" path="loaded" type="int"/>
            <event default-label="Started" path="started" type="int"/>
            <event default-label="Stopped" path="stopped" type="int"/>
            <event default-label="State" path="state" type="int"/>
          </node>
        </asset>
        <asset default-label="Home" id="home">
          <variable default-label="Indoor temperature (°C)" path="indoor.temperature" type="int"/>
          <variable default-label="Indoor noise (dB)" path="indoor.noise" type="int"/>
          <variable default-label="Indoor humidity (%)" path="indoor.humidity" type="int"/>
          <variable default-label="Indoor carbon dioxide (ppm)" path="indoor.co2" type="int"/>
          <variable default-label="Indoor pressure (mb)" path="indoor.pressure" type="int"/>
          
          <variable default-label="Indoor upstairs temperature (°C)" path="indoor.upstairs.temperature" type="int"/>
          <variable default-label="Indoor upstairs humidity (%)" path="indoor.upstairs.humidity" type="int"/>
          <variable default-label="Indoor upstairs carbon dioxide (ppm)" path="indoor.upstairs.co2" type="int"/>

          <variable default-label="Outdoor temperature (°C)" path="outdoor.temperature" type="int"/>
          <variable default-label="Outdoor humidity (%)" path="outdoor.Humidity" type="int"/>
        </asset>
      </encoding>
    </data>
  </capabilities>
</app:application>
