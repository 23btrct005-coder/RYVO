// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBfK5o61sdk2NUSu35uT2Lj4C50uQGBnM8",
  authDomain: "ryvo-7addb.firebaseapp.com",
  projectId: "ryvo-7addb",
  storageBucket: "ryvo-7addb.firebasestorage.app",
  messagingSenderId: "676787706675",
  appId: "1:676787706675:web:a9c3e3dcd06f87731cbc46",
  measurementId: "G-R3PL5TSWV8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});
export const auth = getAuth(app);
export const storage = getStorage(app);
