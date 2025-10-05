export function applyUserDefaults(document, settings) {
  console.log('in applyuserdef, ', settings)
  // if (settings.startTime) startTimeInput.value = settings.startTime;
  if (settings.speed) document.getElementById('speed').value = settings.speed;
  if (settings.speedUp) document.getElementById('speedUp').value = settings.speedUp;
  if (settings.speedDown) document.getElementById('speedDown').value = settings.speedDown;
  if (settings.speedUnit) document.getElementById('speedUnit').value = settings.speedUnit;
  if (settings.maxCalls) document.getElementById('maxCalls').value = settings.maxCalls;
  if (settings.sampleMeters) document.getElementById('sampleMeters').value = settings.sampleMeters;
  if (settings.sampleMinutes) document.getElementById('sampleMinutes').value = settings.sampleMinutes;
  if (settings.sampleMetersSelectDense) document.getElementById('sampleMetersDense').value = settings.sampleMetersSelectDense;
  if (settings.sampleMinutesSelectDense) document.getElementById('sampleMinutesDense').value = settings.sampleMinutesSelectDense;
  if (settings.provider) document.getElementById('provider').value = settings.provider;
  if (settings.pictogramProvider) document.getElementById('pictogramsProvider').value = settings.pictogramProvider;
  if (settings.meteoblueKey) document.getElementById('meteoblueKey').value = settings.meteoblueKey;
  if (settings.optStartTimeMin) document.getElementById('optStartTimeMin').value = settings.optStartTimeMin;
  if (settings.optStartTimeMax) document.getElementById('optStartTimeMax').value = settings.optStartTimeMax;
  if (settings.rainSlider) document.getElementById('rainSlider').value = settings.rainSlider;
  if (settings.maxAcceptableRain) document.getElementById('maxAcceptableRain').value = settings.maxAcceptableRain;
  if (settings.windMaxSlider) document.getElementById('windMaxSlider').value = settings.windMaxSlider;
  if (settings.maxAcceptableWindMax) document.getElementById('maxAcceptableWindMax').value = settings.maxAcceptableWindMax;
  if (settings.windAvgSlider) document.getElementById('windAvgSlider').value = settings.windAvgSlider;
  if (settings.maxAcceptableWindAvg) document.getElementById('maxAcceptableWindAvg').value = settings.maxAcceptableWindAvg;
  if (settings.tempSliderHot) document.getElementById('tempSliderHot').value = settings.tempSliderHot;
  if (settings.maxAcceptableTemp) document.getElementById('maxAcceptableTemp').value = settings.maxAcceptableTemp;
  if (settings.tempSliderCold) document.getElementById('tempSliderCold').value = settings.tempSliderCold;
  if (settings.minAcceptableTemp) document.getElementById('minAcceptableTemp').value = settings.minAcceptableTemp;
  if (settings.granularityMinutes) document.getElementById('granularityMinutes').value = settings.granularityMinutes;
}