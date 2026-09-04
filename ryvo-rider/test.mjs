import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, query, where } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBfK5o61sdk2NUSu35uT2Lj4C50uQGBnM8",
  authDomain: "ryvo-7addb.firebaseapp.com",
  projectId: "ryvo-7addb",
  storageBucket: "ryvo-7addb.firebasestorage.app",
  messagingSenderId: "676787706675",
  appId: "1:676787706675:web:a9c3e3dcd06f87731cbc46"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function test() {
  console.log("Adding doc...");
  try {
    const docRef = await addDoc(collection(db, "rides"), { status: "pending", test: true });
    console.log("Added doc!", docRef.id);
    
    console.log("Querying docs...");
    const q = query(collection(db, "rides"), where("status", "==", "pending"));
    const snapshot = await getDocs(q);
    console.log("Found", snapshot.docs.length, "docs");
    process.exit(0);
  } catch (e) {
    console.error("Error!", e);
    process.exit(1);
  }
}
test();
