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
          yAxisID: "yTemp",
          tension: 0.25,
          pointStyle: false,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
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
          display: true,
          align: 'top',
          formatter: (value, ctx) => {
            if (ctx.datasetIndex === 0) {
              const i = ctx.dataIndex;
              return getWeatherIcon(series[i].tempC, series[i].precip);
            }
            return '';
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
        yTemp: {
          position: "left",
          title: { display: true, text: "°C", color: "#a5adba" },
          ticks: { color: "#e6e8ef" },
          grid: { color: "rgba(255,255,255,0.06)" }
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
          ticks: {
            color: "#e6e8ef",
            callback: v => new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          },
          grid: { color: "rgba(255,255,255,0.06)" },
          title: { display: true, text: "Time", color: "#a5adba" }
        },
        yPrecip: {
          position: "left",
          title: { display: true, text: "mm/h", color: "#a5adba" },
          ticks: { color: "#e6e8ef" },
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
      plugins: {
        legend: { labels: { color: "#e6e8ef" } },
        tooltip: {
          callbacks: {
            title: items => new Date(items[0].label).toLocaleString()
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
          ticks: { color: "#e6e8ef" },
          grid: { color: "rgba(255,255,255,0.06)" }
        }
      }
    },
    plugins: [ChartDataLabels]
  });
}