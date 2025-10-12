async function loadPart(id, file) {
  const response = await fetch(file);
  document.getElementById(id).innerHTML = await response.text();
}

// Load header + footer, then set sub text
async function loadLayout() {
  await loadPart("header", "./header.html");
  await loadPart("footer", "./footer.html");

  // Now that header is in the DOM, set the sub text
  const subText = document.body.dataset.sub;
  const subDiv = document.getElementById("pageSub");
  if (subDiv && subText) {
    subDiv.textContent = subText;
  }

  const demoBtn = document.getElementById("demoBtn");
  if (demoBtn && document.body.dataset.demo !== "true") {
    demoBtn.style.display = "none";
  }

  const compareBtn = document.getElementById("compareBtn");
  if (compareBtn && document.body.dataset.compare !== "true") {
    compareBtn.style.display = "none";
  }

  document.dispatchEvent(new Event("layoutReady"));
}

document.addEventListener("DOMContentLoaded", loadLayout);