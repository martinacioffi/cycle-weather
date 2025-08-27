import { getWeatherIcon, dirArrow8 } from './map.js';

export function destroyChartById(canvasId) {
  const existing = Chart.getChart(canvasId);
  if (existing) existing.destroy();
}

export function resetChart() {
  if (Chart.getChart("tempChart")) Chart.getChart("tempChart").destroy();
  if (Chart.getChart("precipChart")) Chart.getChart("precipChart").destroy();
  if (Chart.getChart("windChart")) Chart.getChart("windChart").destroy();
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
          pointStyle: false,
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
              return getWeatherIcon(series[i].tempC, series[i].precip);
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
    plugins: [ChartDataLabels]
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
      datasets: [
        {
          type: "bar",
          label: "Precip (mm/h)",
          data: series.map(s => s.precip),
          backgroundColor: "#66d9ef",
          yAxisID: "yPrecip",
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'nearest', intersect: false },
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
    display: ctx => ctx.dataset.data[ctx.dataIndex] > 0, // Hide if value is 0
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
        }
      }
    },
  });
}

export function buildWindChart(series) {
  destroyChartById("windChart");
  const ctx = document.getElementById("windChart").getContext("2d");
  const xMin = Math.min(...series.map(s => +s.t));
  const xMax = Math.max(...series.map(s => +s.t));

  return new Chart(ctx, {
    type: "line",
    data: {
      labels: series.map(s => s.t),
      datasets: [
        {
          label: "Wind (km/h)",
          data: series.map(s => s.windKmh),
          borderColor: "#f97583",
          backgroundColor: "rgba(249,117,131,0.15)",
          yAxisID: "yWind",
          tension: 0.25,
          pointStyle: false,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'nearest', intersect: false },
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
          grid: { color: "rgba(255,255,255,0.06)" }
        }
      }
    },
    plugins: [ChartDataLabels]
  });
}