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
    const currentPage = window.location.pathname.split("/").pop();

    // --- Event Listeners ---
    if (settingsOption) {
        settingsOption.addEventListener("click", () => {
        avatarMenu.style.display = "none";
        window.location.href = "./settings.html";
     });
     }

    if (loginBtn) {
      loginBtn.addEventListener("click", () => {
        loginModal.style.display = "block";
        ui.reset();
        ui.start('#firebaseui-auth-container', uiConfig);
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
        if (currentPage === "settings.html") {
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

// --- Auth State Handling ---
firebase.auth().onAuthStateChanged(user => {
  if (user) {
    // Show avatar, hide login button
    loginBtn.style.display = "none";
    userAvatar.style.display = "inline-block";

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
  } else {
    // Show login button, hide avatar and menu
    loginBtn.style.display = "inline-block";
    userAvatar.style.display = "none";
    avatarMenu.style.display = "none";
  }
});
});