import { updateLabels, normalizeDateTimeLocal, toLocalDateTimeString } from './utils.js';

const inputFields = [
  "provider", "pictogramProvider", "meteoblueKey",
  "startTime", "speed", "speedUnit", "speedUp", "speedDown",
  "sampleMeters", "sampleMinutes", "maxCalls",
  "sampleMetersDense", "sampleMinutesDense"
];

const optimizationFields = [
  "optStartTimeMin", "optStartTimeMax",
  "rainSlider", "maxAcceptableRain",
  "windMaxSlider", "maxAcceptableWindMax",
  "windAvgSlider", "maxAcceptableWindAvg",
  "tempSliderHot", "maxAcceptableTemp",
  "tempSliderCold", "minAcceptableTemp",
  "granularityMinutes"
];

function isSettingsPage() {
  return !!document.querySelector("[id^='def-']");
}

// Expand "HH:MM" into tomorrow’s date + that time
function expandTimeToTomorrow(timeStr) {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const pad = n => n.toString().padStart(2, "0");
  const dateStr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
  return `${dateStr}T${timeStr}`;
}

function applyUserDefaults(settings) {
  if (isSettingsPage()) {
    // settings.html: always show Firestore defaults
    Object.entries(settings).forEach(([key, value]) => {
      const el = document.getElementById(`def-${key}`);
      if (!el) return;
      if (key === "startTime" && el.type === "time") {
        // stored as "HH:MM"
        el.value = value || "07:00";
      } else {
        el.value = value;
      }
    });
  } else {
    // index.html
    inputFields.concat(optimizationFields).forEach(key => {
      const el = document.getElementById(key);
      if (!el) return;
      if (key === "startTime" && settings.startTime) {
        el.value = expandTimeToTomorrow(settings.startTime);
      } else {
        el.value = settings[key] ?? el.value;
      }
    });

    // Overlay sessionStorage for inputs only
    inputFields.forEach(key => {
      const val = sessionStorage.getItem(key);
      const el = document.getElementById(key);
      if (val !== null && el) {
        if (key === "startTime") {
          el.value = normalizeDateTimeLocal(val);
        } else {
          el.value = val;
        }
      }
    });
  }
  updateLabels();
}

window.saveUserSettings = function () {
  const user = firebase.auth().currentUser;
  if (!user) {
    alert("You must be signed in to save settings.");
    return;
  }

  const settings = {};
  inputFields.concat(optimizationFields).forEach(key => {
    const el = document.getElementById(`def-${key}`);
    if (!el) return;
    if (key === "startTime" && el.type === "time") {
      settings[key] = el.value; // just "HH:MM"
    } else {
      settings[key] = el.value;
    }
  });

  firebase.firestore().collection("userSettings").doc(user.uid).set(settings)
    .then(() => {
      alert("Settings saved to cloud!");
      // sessionStorage.clear(); // clear overrides
      inputFields.concat(optimizationFields).forEach(key => {
         sessionStorage.removeItem(key);
      });
      applyUserDefaults(settings);
      updateLabels();
    })
    .catch(error => {
      console.error("Error saving settings:", error);
      alert("Failed to save settings.");
    });
  updateLabels();
};

let lastUser = undefined;

firebase.auth().onAuthStateChanged(user => {
    if (!user) {
    if (lastUser !== null && lastUser !== undefined) {
        console.log("User logged out — restoring defaults");
        sessionStorage.clear();
    }

    [...inputFields, ...optimizationFields].forEach(key => {
      const el = document.getElementById(key) || document.getElementById(`def-${key}`);
      if (!el) return;

      // Reset to the default attribute value if present
      if (el.defaultValue !== undefined) {
        el.value = el.defaultValue;
      }

      // Special case: datetime-local startTime
      if (key === "startTime" && el.type === "datetime-local") {
        // fallback to tomorrow 07:00 if no defaultValue
        if (!el.defaultValue) {
          const pad = n => n.toString().padStart(2, "0");
          const now = new Date();
          const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
          el.value = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T07:00`;
        }
      }
    });

    updateLabels();
    return;
  }
  firebase.firestore().collection("userSettings").doc(user.uid).get()
    .then(doc => {
      const settings = doc.exists ? doc.data() : {};
      applyUserDefaults(settings);

      // If no startTime anywhere, set tomorrow 07:00
      const el = document.getElementById("startTime");
      if (el && !settings.startTime && !sessionStorage.getItem("startTime")) {
        el.value = expandTimeToTomorrow("07:00");
      }
    })
    .catch(error => {
      console.error("Error loading settings:", error);
    });
    updateLabels();
    lastUser = user ? user : null;
});

document.addEventListener("DOMContentLoaded", () => {
  updateLabels();
});