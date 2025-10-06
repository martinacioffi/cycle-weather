import { updateLabels } from './utils.js';
// --- List of known settings keys ---
const fields = [
  "provider", "pictogramProvider", "meteoblueKey",
  "startTime", "speed", "speedUnit", "speedUp", "speedDown",
  "sampleMeters", "sampleMinutes", "maxCalls",
  "sampleMetersDense", "sampleMinutesDense",
  "optStartTimeMin", "optStartTimeMax",
  "rainSlider", "maxAcceptableRain",
  "windMaxSlider", "maxAcceptableWindMax",
  "windAvgSlider", "maxAcceptableWindAvg",
  "tempSliderHot", "maxAcceptableTemp",
  "tempSliderCold", "minAcceptableTemp",
  "granularityMinutes"
];

// --- Apply settings to form inputs (works on both pages) ---
function applyUserDefaults(settings) {
  Object.entries(settings).forEach(([key, value]) => {
    const el = document.getElementById(`def-${key}`) || document.getElementById(key);
    if (el) {
      if (el.type === "datetime-local" && /^\d{2}:\d{2}$/.test(value)) {
        // value looks like "16:00", expand it
        const now = new Date();
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const pad = n => n.toString().padStart(2, "0");
        const dateStr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
        el.value = `${dateStr}T${value}`;
      } else {
        el.value = value;
      }
    }
  });
}

// --- Set default start time (tomorrow + user time or 07:00) ---
function setStartTimeTomorrow(userTime = "07:00") {
  const startTimeInput = document.getElementById("startTime");
  if (!startTimeInput) return;

  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const pad = n => n.toString().padStart(2, "0");

  const dateStr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
  startTimeInput.value = `${dateStr}T${userTime}`;
}

// --- Save settings (only works if def- fields exist) ---
window.saveUserSettings = function () {
  const user = firebase.auth().currentUser;
  if (!user) {
    alert("You must be signed in to save settings.");
    return;
  }

  const settings = {};
  fields.forEach(key => {
    const el = document.getElementById(`def-${key}`);
    if (el) settings[key] = el.value;
  });

  firebase.firestore().collection("userSettings").doc(user.uid).set(settings)
    .then(() => {
      alert("Settings saved to cloud!");
      applyUserDefaults(settings);
      updateLabels();
    })
    .catch(error => {
      console.error("Error saving settings:", error);
      alert("Failed to save settings.");
    });
};

// --- Load settings on auth state change ---
firebase.auth().onAuthStateChanged(user => {
  console.log("Auth state changed, user:", user);
  if (!user) return;

  firebase.firestore().collection("userSettings").doc(user.uid).get()
    .then(doc => {
      if (doc.exists) {
        const settings = doc.data();
        applyUserDefaults(settings);
        updateLabels();
        setStartTimeTomorrow(settings.startTime);
      } else {
        setStartTimeTomorrow();
      }
    })
    .catch(error => {
      console.error("Error loading settings:", error);
      setStartTimeTomorrow();
    });
});