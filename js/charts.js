import { getWeatherIcon, dirArrow8, getWeatherPictogram } from './map.js';

export function destroyChartById(canvasId) {
  const existing = Chart.getChart(canvasId);
  if (existing) existing.destroy();
}

export function resetChart() {
  if (Chart.getChart("tempChart")) Chart.getChart("tempChart").destroy();
  if (Chart.getChart("precipChart")) Chart.getChart("precipChart").destroy();
  if (Chart.getChart("windChart")) Chart.getChart("windChart").destroy();
}

function getBreakRanges(series) {
  const ranges = [];
  let start = null;

  for (let i = 0; i < series.length; i++) {
    if (series[i].isBreak) {
      if (start === null) start = i;
    } else {
      if (start !== null) {
        ranges.push([start, i - 1]);
        start = null;
      }
    }
  }
  if (start !== null) {
    ranges.push([start, series.length - 1]);
  }
  return ranges;
}

const BreakShadingPlugin = {
  id: 'breakShading',
  afterDraw(chart) {
    const { ctx, chartArea } = chart;
    const series = chart.data.series;
    if (!series || !chartArea || chartArea.width === 0) return;

    const ranges = getBreakRanges(series);
    if (!ranges.length) return;

    const xScale = chart.scales.x;

    // --- Create a diagonal line pattern ---
    const patternCanvas = document.createElement('canvas');
    patternCanvas.width = 8;   // tile size
    patternCanvas.height = 8;
    const pctx = patternCanvas.getContext('2d');

    pctx.strokeStyle = 'rgba(200, 200, 200, 0.4)'; // line color
    pctx.lineWidth = 0.5;
    pctx.beginPath();
    pctx.moveTo(0, 8);
    pctx.lineTo(8, 0);
    pctx.stroke();

    const pattern = ctx.createPattern(patternCanvas, 'repeat');

    // --- Draw each break range with the pattern ---
    ctx.save();
    ctx.fillStyle = pattern;

    ranges.forEach(([startIdx, endIdx]) => {
      const xStart = xScale.getPixelForValue(+series[startIdx].t);
      const xEnd = xScale.getPixelForValue(+series[endIdx].t);
      ctx.fillRect(xStart, chartArea.top, xEnd - xStart, chartArea.bottom - chartArea.top);
    });

    ctx.restore();
  }
};

const DaylightShadingPlugin = {
  id: 'daylightShading',
  afterDraw(chart) {
    const { ctx, chartArea } = chart;
    const series = chart.data.series;
    if (!series || !chartArea || chartArea.width === 0) return;

    // Find all [start, end] index ranges where isDay === 1
    const ranges = [];
    let start = null;
    for (let i = 0; i < series.length; i++) {
      if (series[i].isDay === 1) {
        if (start === null) start = i;
      } else {
        if (start !== null) {
          ranges.push([start, i - 1]);
          start = null;
        }
      }
    }
    if (start !== null) ranges.push([start, series.length - 1]);

    const xScale = chart.scales.x;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 230, 50, 0.18)'; // semi-transparent yellow

    ranges.forEach(([startIdx, endIdx]) => {
      const xStart = xScale.getPixelForValue(+series[startIdx].t);
      const xEnd = xScale.getPixelForValue(+series[endIdx].t);
      ctx.fillRect(xStart, chartArea.top, xEnd - xStart, chartArea.bottom - chartArea.top);
    });

    ctx.restore();
  }
};

export function buildTempChartPictograms(series, provider) {
  destroyChartById("tempChart");
  const ctx = document.getElementById("tempChart").getContext("2d");

  const xMin = Math.min(...series.map(s => +s.t));
  const xMax = Math.max(...series.map(s => +s.t));
  const overallYMax = Math.max(...series.map(s => s.tempC), ...series.map(s => s.feltTempC));
  const overallYMin = Math.min(...series.map(s => s.tempC), ...series.map(s => s.feltTempC));

  // ---- Preload all pictograms for this series ----
  const pictogramCache = {};
  const uniquePictoNames = [
    ...new Set(series.map(s =>
      getWeatherPictogram(s.tempC, s.precip, s.cloudCover, s.cloudCoverLow, s.isDay, s.windKmH, s.gusts, s.pictocode, provider)
    ))
  ];

  uniquePictoNames.forEach(name => {
    const img = new Image();
    img.src = provider === "meteoblue" ? `images/meteoblue_pictograms/${name}.svg` : `images/yr_weather_symbols/${name}.svg`;
    pictogramCache[name] = img; // stored even before load — will draw when ready
  });

  // ---- Custom plugin to render pictograms every redraw ----
  const WeatherIconPlugin = {
    id: 'weatherIcons',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const iconDatasetIndex = chart.data.datasets.findIndex(ds => ds.label === "");
      if (iconDatasetIndex === -1) return;

      const meta = chart.getDatasetMeta(iconDatasetIndex);
      meta.data.forEach((point, i) => {
        const s = chart.data.series[i];
        if (!s) return;

        const pictoName = getWeatherPictogram(
          s.tempC, s.precip, s.cloudCover, s.cloudCoverLow, s.isDay, s.windKmH, s.gusts, s.pictocode, provider
        );

        const img = pictogramCache[pictoName];
        if (img && img.complete) {
          ctx.drawImage(img, point.x - 10, point.y - 30, 20, 20);
        }
      });
    }
  };

  // ---- Create chart ----
  return new Chart(ctx, {
    type: "bar",
    data: {
      labels: series.map(s => s.t),
      series, // store full series so plugin can access it
      datasets: [
        {
          type: "line",
          label: "Temp (°C)",
          data: series.map(s => s.tempC),
          borderColor: "#f9d349",
          backgroundColor: "rgba(249,211,73,0.15)",
          yAxisID: "y",
          datalabels: { display: false },
          tension: 0.25,
          pointStyle: false
        },
        {
          type: "line",
          label: "Felt Temp (°C)",
          data: series.map(s => s.feltTempC),
          borderColor: "#f96949",
          backgroundColor: "rgba(249,211,73,0.15)",
          yAxisID: "y",
          datalabels: { display: false },
          tension: 0.25,
          pointStyle: false
        },
        {
          type: "line",
          label: "", // Icons dataset
          data: series.map(s => ({ x: +s.t, y: overallYMax + 1 })),
          borderWidth: 0,
          pointRadius: 0,
          yAxisID: "y",
          datalabels: { display: false },
          tooltip: { enabled: false }
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: "#e6e8ef" } },
        tooltip: {
          enabled: true,
          callbacks: {
            title: items => new Date(items[0].parsed.x).toLocaleString()
          },
          filter: ctx => ctx.dataset.label !== "" // skip icons dataset
        }
      },
      scales: {
        x: {
          type: "linear",
          min: xMin,
          max: xMax,
          offset: false,
          ticks: {
            color: "#e6e8ef",
            callback: v => new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          },
          grid: { color: "rgba(255,255,255,0.06)" },
          title: { display: true, text: "Time", color: "#a5adba" }
        },
        y: {
          position: "left",
          title: { display: true, text: "°C", color: "#a5adba" },
          ticks: { color: "#e6e8ef", padding: 8 },
          grid: { color: "rgba(255,255,255,0.06)" },
          beginAtZero: false,
          suggestedMin: overallYMin - 1,
          suggestedMax: overallYMax + 2
        }
      }
    },
    plugins: [ChartDataLabels, WeatherIconPlugin, BreakShadingPlugin, DaylightShadingPlugin]
  });
}

export function buildTempChart(series) {
  destroyChartById("tempChart");
  const ctx = document.getElementById("tempChart").getContext("2d");
  const xMin = Math.min(...series.map(s => +s.t));
  const xMax = Math.max(...series.map(s => +s.t));
  const overallYMax = Math.max(
  ...series.map(s => s.tempC),
  ...series.map(s => s.feltTempC)
);
  const overallYMin = Math.min(
  ...series.map(s => s.tempC),
  ...series.map(s => s.feltTempC)
);

  return new Chart(ctx, {
    type: "bar",
    data: {
      labels: series.map(s => s.t),
      series,
      datasets: [
        {
          type: "line",
          label: "Temperature (°C)",
          data: series.map(s => s.tempC),
          borderColor: "#f9d349",
          backgroundColor: "rgba(249,211,73,0.15)",
          yAxisID: "y",
          datalabels: { display: false },
          tension: 0.25,
          pointStyle: false,
        },
        {
          type: "line",
          label: "Felt Temperature (°C)",
          data: series.map(s => s.feltTempC),
          borderColor: "#f96949",
          backgroundColor: "rgba(249,211,73,0.15)",
          yAxisID: "y",
          datalabels: { display: false },
          tension: 0.25,
          pointStyle: false,
        },
        {
          type: "line",
          label: "", // Icons on top
          data: series.map(s => ({ x: +s.t, y: overallYMax + 1 })), // fixed y-value
          borderWidth: 0,
          pointRadius: 0,
          yAxisID: "y",
          datalabels: {
            display: true,
            align: "top",
            anchor: "top",
            clip: false,
            formatter: (value, ctx) => {
              const i = ctx.dataIndex;
              return getWeatherIcon(series[i].tempC, series[i].precip, series[i].isDay);
            },
            font: { size: 18 }
           },
          tooltip: { enabled: false }
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { color: "#e6e8ef" }
        },
        tooltip: {
          enabled: true,
          callbacks: {
            title: items => new Date(items[0].parsed.x).toLocaleString()
          },
            filter: (ctx) => {
            // Only include datasets with a label (i.e., exclude icons)
            return ctx.dataset.label !== "";
          }
        },
      },
      scales: {
        x: {
          type: "linear",
          min: xMin,
          max: xMax,
          offset: false,
          ticks: {
            color: "#e6e8ef",
            callback: v => new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          },
          grid: { color: "rgba(255,255,255,0.06)" },
          title: { display: true, text: "Time", color: "#a5adba" }
        },
        y: {
          position: "left",
          title: { display: true, text: "°C", color: "#a5adba" },
          ticks: { color: "#e6e8ef" , padding: 8},
          grid: { color: "rgba(255,255,255,0.06)" },
          beginAtZero: false, // Let Chart.js auto-scale
          suggestedMin: overallYMin - 1,
          suggestedMax: overallYMax + 2
        },
      }
    },
    plugins: [ChartDataLabels, BreakShadingPlugin, DaylightShadingPlugin]
  });
}

export function buildPrecipChart(series) {
  destroyChartById("precipChart");
  const ctx = document.getElementById("precipChart").getContext("2d");
  const xMin = Math.min(...series.map(s => +s.t));
  const xMax = Math.max(...series.map(s => +s.t));

  return new Chart(ctx, {
    type: "bar",
    data: {
      labels: series.map(s => s.t),
      series,
      datasets: [
        {
          type: "line",
          label: "Precipitation Probability (%)",
          data: series.map(s => s.precipProb),
          borderColor: "#003366",
          backgroundColor: "#003366",
          yAxisID: "yProb",
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 4,
        },
          {
          type: "bar",
          label: "Precipitations (mm/h)",
          data: series.map(s => s.precip),
          backgroundColor: "#66d9ef",
          yAxisID: "yPrecip",
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { color: "#e6e8ef" }
        },
        tooltip: {
          callbacks: {
            title: items => new Date(items[0].parsed.x).toLocaleString()
          }
        },
          datalabels: {
    color: "#e6e8ef",
    // display: ctx => ctx.dataset.data[ctx.dataIndex] > 0, // Hide if value is 0
    anchor: "end",
    align: "top",
    font: {
      weight: "bold"
    }
  }
      },
      scales: {
        x: {
          type: "linear",
          min: xMin,
          max: xMax,
          offset: false,
          ticks: {
            color: "#e6e8ef",
            callback: v => new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          },
          grid: { color: "rgba(255,255,255,0.06)" },
          title: { display: true, text: "Time", color: "#a5adba" }
        },
        yPrecip: {
          position: "left",
          beginAtZero: true,
          suggestedMax: Math.ceil(Math.max(...series.map(s => s.precip))),
          title: { display: true, text: "mm/h", color: "#a5adba" },
          ticks: {
          padding: 8,
          stepSize: 1,
          callback: function(value) {if (value % 1 === 0) {return value;}},
          color: "#e6e8ef" },
          grid: { drawOnChartArea: false }
        },
        yProb: {
          position: "right",
          beginAtZero: true,
          max: 100,
          title: { display: true, text: "Probability", color: "#a5adba" },
          ticks: {
            color: "#e6e8ef",
            callback: v => `${v}%`
          },
          grid: { drawOnChartArea: false }
        }
      }
    },
    plugins: [BreakShadingPlugin, DaylightShadingPlugin]
  });
}

export function buildWindChart(series) {
  destroyChartById("windChart");
  const ctx = document.getElementById("windChart").getContext("2d");
  const xMin = Math.min(...series.map(s => +s.t));
  const xMax = Math.max(...series.map(s => +s.t));
    const overallYMax = Math.max(
  ...series.map(s => s.windKmh),
  ...series.map(s => s.gusts)
);
  const overallYMin = Math.min(
  ...series.map(s => s.windKmh),
  ...series.map(s => s.gusts)
);

  return new Chart(ctx, {
    type: "line",
    data: {
      labels: series.map(s => s.t),
      series,
      datasets: [
        {
          label: "Wind (km/h)",
          data: series.map(s => s.windKmh),
          borderColor: "#f975f2",
          backgroundColor: "rgba(249,117,131,0.15)",
          yAxisID: "yWind",
          tension: 0.25,
          pointStyle: false,
        },
        {
          label: "Wind Gusts (km/h)",
          data: series.map(s => s.gusts),
          borderColor: "#6a06c2",
          backgroundColor: "rgba(255,209,102,0.15)",
          yAxisID: "yWind",
          tension: 0.25,
          pointStyle: false,
          datalabels: { display: false }
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: "#e6e8ef" } },
        tooltip: {
          callbacks: {
            title: items => new Date(items[0].parsed.x).toLocaleString()
          }
        },
        datalabels: {
          display: true,
          align: 'top',
          formatter: (value, ctx) => {
            const i = ctx.dataIndex;
            return dirArrow8(series[i].windDeg);
          },
          font: { size: 18 }
        }
      },
      scales: {
        x: {
          type: "linear",
          min: xMin,
          max: xMax,
          offset: false,
          ticks: {
            color: "#e6e8ef",
            callback: v => new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          },
          grid: { color: "rgba(255,255,255,0.06)" },
          title: { display: true, text: "Time", color: "#a5adba" }
        },
        yWind: {
          position: "left",
          title: { display: true, text: "km/h", color: "#a5adba" },
          ticks: { color: "#e6e8ef" , padding: 8},
          grid: { color: "rgba(255,255,255,0.06)" },
          beginAtZero: true,
          suggestedMin: overallYMin - 1,
          suggestedMax: overallYMax + 2
        }
      }
    },
    plugins: [ChartDataLabels, BreakShadingPlugin, DaylightShadingPlugin]
  });
}