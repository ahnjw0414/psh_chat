// 브라우저용 Firebase SDK 라이브러리 가져오기 (CDN 방식)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js"; // 이미지 업로드용 추가

// 지우님의 고유 파이어베이스 설정값
const firebaseConfig = {
  apiKey: "AIzaSyDpbqzFUXK2XkVMBRbg4eX0BY3oJWbMM0o",
  authDomain: "psh-chat-5d6b5.firebaseapp.com",
  projectId: "psh-chat-5d6b5",
  storageBucket: "psh-chat-5d6b5.firebasestorage.app",
  messagingSenderId: "777447224362",
  appId: "1:777447224362:web:49c4703815902b9d553f53",
  measurementId: "G-K4G10S7NZX"
};

// Firebase 초기화
const app = initializeApp(firebaseConfig);

// 다른 파일(auth.js, chat.js)에서 불러서 쓸 수 있도록 내보내기
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
