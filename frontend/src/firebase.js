import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

// TODO: Replace these with your actual Firebase Project Configuration
// You can get this by going to Firebase Console -> Project Settings -> General -> Web Apps
const firebaseConfig = {
  apiKey: "AIzaSyCK8zwQGKJwaO5eToPv6bWPkUv7RfFVNho",
  authDomain: "chatify-b4564.firebaseapp.com",
  projectId: "chatify-b4564",
  storageBucket: "chatify-b4564.firebasestorage.app",
  messagingSenderId: "215689418984",
  appId: "1:215689418984:web:4c1fbe19f0ea73a879115d",
  measurementId: "G-51G4QVBN3D"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const storage = getStorage(app);
