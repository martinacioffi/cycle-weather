# Cycle Weather
See weather forecast along a cycling route (.gpx file)

## Description
Cycle Weather is a simple HTML page that allows you to visualize the weather forecast along a cycling route defined in a GPX file. 

Given a starting timestamp and an average speed, it uses one of Open-Meteo API or MeteoBlue API to fetch weather data and displays it on a map.

In order to use the MeteoBlue API, you need to create an account and obtain an API key which you will need to paste in the apposite field in the app.
Register on the [MeteoBlue website](https://www.meteoblue.com/en/weather-api), confirm your email address, and find your key in the [API Key Management](https://www.meteoblue.com/en/weather-api/apikey/index) section of your account.

You can choose between two maps:
* OpenCycleMap
* OpenTopoMap

The app also allows you to insert breaks along the route, which will be displayed on the map. To insert a new break, you can either insert the km at which the break will start; or click on the map to select the position of the break. Then, insert the break's length in number of minutes.

At the bottom of the page, two graphs show, respectively, (i) the temperature and precipitations, and (ii) the wind speed and direction for the route.

