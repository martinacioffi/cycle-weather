const db = firebase.firestore();

firebase.auth().onAuthStateChanged(async (user) => {
  const list = document.getElementById("routesList");
  list.innerHTML = "";

  if (!user) {
    list.innerHTML = "<li>Please sign in to see your saved routes.</li>";
    return;
  }

  const snapshot = await db.collection("usersFiles")
    .doc(user.uid)
    .collection("gpxFiles")
    .orderBy("uploadedAt", "desc")
    .get();

  if (snapshot.empty) {
    list.innerHTML = "<li>No saved routes yet.</li>";
    return;
  }

  snapshot.forEach((doc) => {
    const data = doc.data();
    const li = document.createElement("li");

    // Route name
    const nameSpan = document.createElement("span");
    nameSpan.className = "route-name";
    nameSpan.textContent = data.displayName || data.name;
    nameSpan.title = data.displayName || data.name;

    // Timestamp
    const tsSpan = document.createElement("span");
    tsSpan.className = "route-timestamp";
    if (data.uploadedAt && data.uploadedAt.toDate) {
      const date = data.uploadedAt.toDate();
      tsSpan.textContent = `Saved: ${date.toLocaleDateString()} ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
    } else {
      tsSpan.textContent = "Saved: unknown";
    }

    // Buttons container
    const btnGroup = document.createElement("div");
    btnGroup.className = "route-actions";

    // Rename button
    const renameBtn = document.createElement("button");
    renameBtn.textContent = "✏️ Rename";
    renameBtn.title = "Rename the route";
    renameBtn.onclick = async () => {
      const newName = prompt("Enter a new name for this route:", data.displayName || data.name);
      if (newName && newName.trim()) {
        await doc.ref.update({ displayName: newName.trim(), uploadedAt: firebase.firestore.FieldValue.serverTimestamp() });
        nameSpan.textContent = newName.trim();
        tsSpan.textContent = `Saved: just now`;
      }
    };

    // Download button
    const blob = new Blob([data.gpxContent], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);
    const downloadBtn = document.createElement("button");
    downloadBtn.textContent = "⬇️ Download";
    downloadBtn.title = "Download GPX";
    downloadBtn.onclick = () => {
      const a = document.createElement("a");
      a.href = url;
      a.download = data.name;
      a.click();
    };

    // Delete button
    const delBtn = document.createElement("button");
    delBtn.textContent = "🗑️ Delete";
    delBtn.title = "Delete the file";
    delBtn.onclick = async () => {
      await doc.ref.delete();
      li.remove();
    };

    btnGroup.appendChild(renameBtn);
    btnGroup.appendChild(downloadBtn);
    btnGroup.appendChild(delBtn);

    // Layout: name + timestamp on left, buttons on right
    const leftGroup = document.createElement("div");
    leftGroup.className = "route-info";
    leftGroup.appendChild(nameSpan);
    leftGroup.appendChild(tsSpan);

    li.appendChild(leftGroup);
    li.appendChild(btnGroup);
    list.appendChild(li);
  });
});