function compressText(text) {
  const compressed = pako.deflate(text); // returns Uint8Array
  let binary = '';
  const bytes = new Uint8Array(compressed);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary); // base64 string safe for Firestore
}

const savedRoutes = document.getElementById("savedRoutes");

// --- Firebase Config ---
const firebaseConfig = {
  apiKey: "AIzaSyBQGbCVJQW5JjKyYjzIwv_ThsQC73Zth6Q",
  authDomain: "cycle-weather-93125.firebaseapp.com",
  projectId: "cycle-weather-93125",
  storageBucket: "cycle-weather-93125.firebasestorage.app",
  messagingSenderId: "284158359959",
  appId: "1:284158359959:web:8275e2b7288fa5b97dacd2",
  measurementId: "G-PJJKWY2N5J"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// --- FirebaseUI Config ---
const uiConfig = {
  signInOptions: [
    firebase.auth.GoogleAuthProvider.PROVIDER_ID
    // You can add Email/Password or others here
    //{
    //  provider: firebase.auth.EmailAuthProvider.PROVIDER_ID,
    //  requireDisplayName: false
    //}
  ],
  signInFlow: 'popup',
  credentialHelper: firebaseui.auth.CredentialHelper.NONE,
  autoUpgradeAnonymousUsers: true,
  callbacks: {
    signInSuccessWithAuthResult: function(authResult) {
      document.getElementById("loginModal").style.display = "none";
      return false; // prevent redirect
    },
    signInFailure: function(error) {
      if (error.code === 'firebaseui/anonymous-upgrade-merge-conflict') {
        return firebase.auth().signInWithCredential(error.credential);
      }
      console.error("FirebaseUI error:", error);
      return Promise.resolve();
    }
  }
};

// Create or reuse FirebaseUI instance
let ui = firebaseui.auth.AuthUI.getInstance() || new firebaseui.auth.AuthUI(firebase.auth());

// --- Wait until header/footer are injected ---
document.addEventListener("layoutReady", () => {
    // --- DOM Elements ---
    const loginBtn = document.getElementById("loginBtn");
    const userAvatar = document.getElementById("userAvatar");
    const avatarMenu = document.getElementById("avatarMenu");
    const loginModal = document.getElementById("loginModal");
    const logoutOption = document.getElementById("logoutOption");
    const closeLogin = document.getElementById("closeLogin");
    const settingsOption = document.getElementById("settingsOption");
    const myRoutesOption = document.getElementById("myRoutesOption");
    const currentPage = window.location.pathname.split("/").pop();
    const gpxInput = document.getElementById("gpxFile");
    const saveOption = document.getElementById("saveGpxOption");
    const saveBtn = document.getElementById("saveGpxBtn");

      // Modal elements
  const saveModal = document.getElementById("saveGpxModal");
  const saveModalMsg = document.getElementById("saveGpxModalMessage");
  const closeSaveModal = document.getElementById("closeSaveModal");

  let currentFile = null;
  let currentUser = null;

    // --- Event Listeners ---
    if (settingsOption) {
        settingsOption.addEventListener("click", () => {
        avatarMenu.style.display = "none";
        window.location.href = "./settings.html";
        goatcounter.count({
            path: `/loadedSettings`,
            title: `Loaded Settings Page`,
            event: true
        });
     });
     }

     if (myRoutesOption) {
        myRoutesOption.addEventListener("click", () => {
        avatarMenu.style.display = "none";
        window.location.href = "./myroutes.html";
        goatcounter.count({
            path: `/loadedMyRoutes`,
            title: `Loaded My Routes Page`,
            event: true
        });
     });
     }

    if (loginBtn) {
      loginBtn.addEventListener("click", () => {
        loginModal.style.display = "block";
        ui.reset();
        ui.start('#firebaseui-auth-container', uiConfig);
        goatcounter.count({
            path: `/openedLoginModal`,
            title: `Opened Login Modal`,
            event: true
        });
      });
    }

  if (closeLogin) {
    closeLogin.addEventListener("click", () => {
      loginModal.style.display = "none";
    });
  }

  // Close modal when clicking outside
  window.addEventListener("click", (e) => {
    if (e.target === loginModal) {
      loginModal.style.display = "none";
    }
  });

  if (logoutOption) {
    logoutOption.addEventListener("click", () => {
      firebase.auth().signOut().then(() => {
        console.log("User signed out");
        if (avatarMenu) avatarMenu.style.display = "none";
        if (currentPage === "settings.html" || currentPage === "myroutes.html") {
          window.location.href = "./index.html";
        }
      }).catch(error => {
        console.error("Sign-out error:", error);
      });
    });
  }

document.addEventListener("click", (e) => {
  if (userAvatar && avatarMenu && !userAvatar.contains(e.target) && !avatarMenu.contains(e.target)) {
    avatarMenu.style.display = "none";
  }
});


  // Show modal helper
  function showSaveModal(message, isError = false) {
    saveModalMsg.textContent = message;
    // saveModalMsg.style.color = isError ? "red" : "green";
    saveModal.style.display = "flex";
  }

  // Close modal
  if ( closeSaveModal ) {
  closeSaveModal.onclick = () => saveModal.style.display = "none";
    }
  window.onclick = (e) => { if (e.target === saveModal) saveModal.style.display = "none"; };

async function populateSavedRoutes(user) {
  const db = firebase.firestore();
  try {
    const snapshot = await db.collection("usersFiles")
                             .doc(user.uid)
                             .collection("gpxFiles")
                             .orderBy("uploadedAt", "desc")
                             .get();

    if (!savedRoutes) return;

    savedRoutesSelect.innerHTML = '<option value="" disabled selected>💾 Choose from saved</option>';
    if (snapshot.empty) {
      // Add a disabled "no routes" option that only shows in the dropdown
      const opt = document.createElement("option");
      opt.disabled = true;
      opt.textContent = "No saved routes yet";
      savedRoutes.appendChild(opt);
      return;
    }

    snapshot.forEach(doc => {
      const data = doc.data();
      const opt = document.createElement("option");
      opt.value = doc.id;
      opt.textContent = data.displayName || "Unnamed route";
      savedRoutes.appendChild(opt);
    });

  } catch (err) {
    console.error("Error loading saved routes:", err);
    savedRoutes.innerHTML = '<option value="">(Error loading routes)</option>';
  }
}

window.populateSavedRoutes = populateSavedRoutes;

const savedRoutesSelect = document.getElementById("savedRoutes");
const currentRoute = document.getElementById("currentRoute");

if (savedRoutesSelect && currentRoute) {
savedRoutesSelect.addEventListener("change", async (e) => {
  const id = e.target.value;
  const user = firebase.auth().currentUser;
  if (!id || !user) return;

  const db = firebase.firestore();
  const doc = await db.collection("usersFiles")
                      .doc(user.uid)
                      .collection("gpxFiles")
                      .doc(id)
                      .get();

  if (doc.exists) {
    const data = doc.data();
    let text = data.gpxContent;
    if (data.isCompressed) text = decompressText(text);
    handleGpxLoad(data.displayName, text);

    // Update currentRoute display
    currentRoute.textContent = data.displayName || "Unnamed route";
    currentRoute.title = data.name || "Unnamed route";
    currentRoute.classList.add("active");

    // Reset dropdown back to placeholder
    savedRoutesSelect.selectedIndex = 0;
  }
    goatcounter.count({
       path: `/loadedSavedRoute`,
       title: `Loaded Route from Saved`,
       event: true
    });
});
}

// --- Auth State Handling ---
firebase.auth().onAuthStateChanged(async user => {
    currentUser = user;
    updateSaveVisibility();
  if (user) {
    // Show avatar, hide login button
    loginBtn.style.display = "none";
    userAvatar.style.display = "inline-block";
    if (savedRoutes) savedRoutes.style.display = "inline-block";

    // Use user's photo or fallback
    userAvatar.src = user.photoURL || "https://i.imgur.com/8Km9tLL.png";
    userAvatar.title = user.displayName || user.email;

    if (!user.photoURL) {
      const initials = (user.displayName || user.email || "?")[0].toUpperCase();
      userAvatar.alt = initials;
    }

    // Toggle dropdown on avatar click
    userAvatar.onclick = () => {
      avatarMenu.style.display = avatarMenu.style.display === "none" ? "block" : "none";
    };
    await populateSavedRoutes(user);
  } else {
    // Show login button, hide avatar and menu
    loginBtn.style.display = "inline-block";
    userAvatar.style.display = "none";
    avatarMenu.style.display = "none";
    if (savedRoutes) savedRoutes.style.display = "none";
  }
});

  // --- Track file selection ---
  if (gpxInput) {
      gpxInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (file) {
        const text = await file.text();
        sessionStorage.setItem("gpxFileName", file.name);
        sessionStorage.setItem("gpxFileContent", text);
        currentFile = file;
        updateSaveVisibility();
      }
    });
  }

  // --- Show/hide save button ---
  function updateSaveVisibility() {
    if (saveOption) {
      saveOption.style.display = (currentUser && currentFile) ? "block" : "none";
    }
  }
    // --- Handle save click ---
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      if (!currentUser || !currentFile) return;

      try {
        const text = await currentFile.text();
        const compressed = compressText(text); // your pako-based helper
        const db = firebase.firestore();
        await db.collection("usersFiles").doc(currentUser.uid).collection("gpxFiles").add({
          displayName: currentFile.name,
          name: currentFile.name,
          gpxContent: compressed,
          isCompressed: true,
          uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

      showSaveModal("✅ GPX file saved successfully");
      updateSaveVisibility();
      await populateSavedRoutes(currentUser);

      } catch (err) {
        console.error("Save error:", err);

      if (err.code === "invalid-argument" &&
          /longer than 1048487 bytes/.test(err.message)) {
        showSaveModal("❌ File exceeds maximum size of 1 MB", true);
      } else {
        showSaveModal("❌ Error saving file", true);
      }
    }
        goatcounter.count({
           path: `/savedRoute`,
           title: `Saved Route to Cloud`,
           event: true
        });
    });
  }

});