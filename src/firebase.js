import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyDukFgu-9IOWequGuyX8SzY1hKA5r4PynE",
    authDomain: "dyslexaid-fa29f.firebaseapp.com",
    projectId: "dyslexaid-fa29f",
    storageBucket: "dyslexaid-fa29f.firebasestorage.app",
    messagingSenderId: "1077588092913",
    appId: "1:1077588092913:web:130ff9db7ab6448af38650"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Connect to local Firebase Emulators ONLY during local testing when explicitly enabled
if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true") {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
}