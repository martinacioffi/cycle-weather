import { arrowIcon } from './icons.js';

export let map = null;
export let routeLayerGroup = null;
export let weatherMarkersLayerGroup = null;
export let windMarkersLayerGroup = null;
export let breakMarkersLayerGroup = null;
export let tempLegendControl = null;
export let windLegendControl = null;
export let weatherLayerVisible = true;
export let windLayerVisible = true;
export let breakLayerVisible = true;

let openTopo, openCycle, openStreet;
let activeBaseLayer; // currently visible base layer
let activeTooltipMarker = null;

export function highlightMapPoint(weatherMarkers, index) {
  // Close previous tooltip
  if (activeTooltipMarker) {
    activeTooltipMarker.closeTooltip();

    // Reset its arrow back to normal size/opacity
    if (activeTooltipMarker._arrowBearing !== undefined) {
      activeTooltipMarker.setIcon(
        arrowIcon(activeTooltipMarker._arrowBearing, { scale: 1, opacity: 0.45 })
      );
    }

    activeTooltipMarker = null;
  }

  const marker = weatherMarkers[index];
  if (marker) {
    marker.openTooltip();

    // Enlarge + brighten arrow
    if (marker._arrowBearing !== undefined) {
      marker.setIcon(arrowIcon(marker._arrowBearing, { scale: 1.5, opacity: 0.9 }));
    }

    activeTooltipMarker = marker;
  }
}

// Utility to reset every arrow marker
export function resetAllArrows(weatherMarkers) {
  weatherMarkers.forEach(m => {
    if (m._arrowBearing !== undefined) {
      m.setIcon(arrowIcon(m._arrowBearing, { scale: 1, opacity: 0.45 }));
    }
  });
  activeTooltipMarker = null;
}

export function flagIconPoints(results, iconSpacingMeters, iconSpacingMinutes) {
  const flagged = [];
  let lastIdx = 0;
  flagged.push(results[0]); // always keep the first

  for (let i = 1; i < results.length; i++) {
    const distSinceLast = results[i].accumDist - results[lastIdx].accumDist;
    const timeSinceLast = results[i].accumTime - results[lastIdx].accumTime;

    if (distSinceLast >= iconSpacingMeters || timeSinceLast >= iconSpacingMinutes * 60) {
      flagged.push(results[i]);
      lastIdx = i;
    }
  }

  // always keep the last
  if (flagged[flagged.length - 1] !== results[results.length - 1]) {
    flagged.push(results[results.length - 1]);
  }

  // mark showIcon flag
  const iconSet = new Set(flagged.map(r => r.accumTime)); // or use index
  return results.map(r => ({
    ...r,
    showIcon: iconSet.has(r.accumTime)
  }));
}

export function ensureMap(provider, pictos) {
      if (map) return { map, layerControl: null, baseLayers: null, overlays: null };
      map = L.map("map", { zoomControl: true, fullscreenControl: true });
      routeLayerGroup = L.layerGroup().addTo(map);

      // Also add floating legend on map
      tempLegendControl = L.control({ position: "bottomright" });
      tempLegendControl.onAdd = function() {
        const div = L.DomUtil.create("div", "legend");
        div.innerHTML = `
          <div><strong>Temperature (°C)</strong></div>
          <div class="legend-bar" id="legendBarMap"></div>
          <div class="legend-ticks" id="legendTicksMap">
            <span>-</span><span>-</span><span>-</span><span>-</span><span>-</span>
          </div>
        `;
        return div;
      };

        // Wind legend control
      windLegendControl = L.control({ position: "bottomright" });
      windLegendControl.onAdd = function() {
        const div = L.DomUtil.create("div", "legend");
        div.innerHTML = `
          <div class="legend-labels">
          <span>Head wind</span>
          <span>Tail wind</span>
        </div>
          <div class="legend-bar" id="legendBarMapWind"></div>
          <div class="legend-ticks" id="legendTicksMapWind">
            <span>-</span><span>-</span><span>-</span><span>-</span><span>-</span>
          </div>
        `;
        return div;
      };

  const topoBase = 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap (CC-BY-SA)';
  const cycleBase = 'Maps © Thunderforest, Data © OpenStreetMap contributors';
  const streetBase = '&copy; OpenStreetMap';

  const dynamic = buildAttribution(provider, pictos);

  openTopo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: ''
  });
  openTopo.baseAttribution = topoBase;

  openCycle = L.tileLayer('https://{s}.tile.thunderforest.com/cycle/{z}/{x}/{y}.png?apikey=70a9b978ca5f485d82d655fbacc0eee0', {
    maxZoom: 18,
    attribution: ''
  });
  openCycle.baseAttribution = cycleBase;

  openStreet = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: ''
  });
  openStreet.baseAttribution = streetBase;

    // Add OpenTopoMap as default
    openTopo.addTo(map);
    activeBaseLayer = openTopo;

    // Layer control
    const baseLayers = {
      "OpenTopoMap": openTopo,
      "OpenCycleMap": openCycle,
      "OpenStreetMap": openStreet
    };

    map.on('baselayerchange', function(e) {
      activeBaseLayer = e.layer;
    });

    map.on('overlayadd', function(e) {
      if (e.name === "Temperature") {
        map.removeControl(windLegendControl);
        tempLegendControl.addTo(map);
      }
      if (e.name === "Wind") {
        map.removeControl(tempLegendControl);
        windLegendControl.addTo(map);
      }
    });

    tempLegendControl.addTo(map);

    const tempLayerGroup = L.layerGroup().addTo(map);
    const windLayerGroup = L.layerGroup();
    const overlays = {
       "Temperature": tempLayerGroup,
       "Wind": windLayerGroup
     };

    // Create a dedicated group for weather markers
    weatherMarkersLayerGroup = L.layerGroup().addTo(map);
    windMarkersLayerGroup = L.layerGroup().addTo(map);
    breakMarkersLayerGroup = L.layerGroup().addTo(map);

    const weatherToggle = new LayerToggleControl(weatherMarkersLayerGroup, {
      position: "topright",
      icon: "☀️",
      hideTitle: "Hide weather markers",
      showTitle: "Show weather markers",
    }).addTo(map);

    const windToggle = new LayerToggleControl(windMarkersLayerGroup, {
      position: "topright",
      icon: "➤", // - use ➤ or ▶.
      hideTitle: "Hide wind markers",
      showTitle: "Show wind markers",
    }).addTo(map);

    const breakToggle = new LayerToggleControl(breakMarkersLayerGroup, {
      position: "topright",
      icon: "📌",
      hideTitle: "Hide start/end and break markers",
      showTitle: "Show start/end and break markers",
    }).addTo(map);

    const layerControl = L.control.layers(baseLayers, overlays, { collapsed: true }).addTo(map);

    return { map, layerControl, baseLayers, overlays };
    }

const LayerToggleControl = L.Control.extend({
  initialize: function(layerGroup, options) {
    this._layerGroup = layerGroup;
    L.setOptions(this, options);
  },
  onAdd: function(map) {
    const container = L.DomUtil.create("div", "leaflet-bar leaflet-control");
    const btn = L.DomUtil.create("a", "", container);
    btn.innerHTML = this.options.icon || "❓";
    btn.href = "#";
    btn.title = this.options.hideTitle || "Hide layer";
    btn.style.width = "44px";
    btn.style.display = "block";
    btn.style.textAlign = "center";

    let visible = true;

    L.DomEvent.on(btn, "click", (e) => {
      L.DomEvent.stopPropagation(e);
      L.DomEvent.preventDefault(e);

      /*if (visible) {
        map.removeLayer(this._layerGroup);
        btn.style.opacity = "0.5";
        btn.title = this.options.showTitle || "Show layer";
      } else {
        map.addLayer(this._layerGroup);
        btn.style.opacity = "1";
        btn.title = this.options.hideTitle || "Hide layer";
      }*/
      // The above removes the layer. We instead make the icons transparent so that tooltips still work
      if (visible) {
          // fade out all markers in the group
          this._layerGroup.eachLayer(layer => {
            if (layer.setOpacity) {
              layer.setOpacity(0);   // fully transparent
            }
          });
          btn.style.opacity = "0.5";
          btn.title = this.options.showTitle || "Show layer";
          if (this._layerGroup === weatherMarkersLayerGroup) {
                weatherLayerVisible = false;
              } else if (this._layerGroup === windMarkersLayerGroup) {
                windLayerVisible = false;
              } else if (this._layerGroup === breakMarkersLayerGroup) {
                breakLayerVisible = false;
              }
        } else {
          // fade them back in
          this._layerGroup.eachLayer(layer => {
            if (layer.setOpacity) {
              layer.setOpacity(layer._baseVisible ? 1 : 0);   // fully visible
            }
          });
          btn.style.opacity = "1";
          btn.title = this.options.hideTitle || "Hide layer";
            if (this._layerGroup === weatherMarkersLayerGroup) {
                weatherLayerVisible = true;
              } else if (this._layerGroup === windMarkersLayerGroup) {
                windLayerVisible = true;
              } else if (this._layerGroup === breakMarkersLayerGroup) {
                breakLayerVisible = true;
              }
      }
      visible = !visible;
    });

    return container;
  }
});

function buildAttribution(provider, pictos) {
  const weatherAttr = provider === "meteoblue"
    ? ' | Weather data © <a href="https://www.meteoblue.com/" target="_blank">Meteoblue</a>'
    : ' | Weather data © <a href="https://open-meteo.com/" target="_blank">Open-Meteo</a>';

  const pictoAttr = pictos === "meteoblue"
    ? ' | Pictograms © <a href="https://docs.meteoblue.com/en/meteo/variables/pictograms" target="_blank">Meteoblue</a>'
    : ' | Weather symbols © <a href="https://nrkno.github.io/yr-weather-symbols/" target="_blank">MET Norway</a>';

  return weatherAttr + pictoAttr;
}

export function updateMapAttribution(provider, pictos) {
  if (!activeBaseLayer || !map) return;

  const dynamic = buildAttribution(provider, pictos);
  const base = activeBaseLayer.baseAttribution || "";
  const full = base + dynamic;

  const attributionEl = map._controlContainer?.querySelector(".leaflet-control-attribution");
  if (attributionEl) {
    attributionEl.innerHTML = full;
  } else {
    console.warn("Attribution element not found");
  }
}