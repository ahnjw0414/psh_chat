// firebase-config.js에서 설정한 auth(인증)와 db(데이터베이스) 가져오기
import { auth, db } from "./firebase-config.js";
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    sendPasswordResetEmail 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    doc, 
    setDoc, 
    getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// HTML 엘리먼트 가져오기
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("login-btn");
const signupBtn = document.getElementById("signup-btn");
const forgotPasswordLink = document.getElementById("forgot-password");

/**
 * 1. 회원가입 기능 (@ps.hs.kr 도메인 제한)
 */
signupBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        alert("이메일과 비밀번호를 모두 입력해주세요.");
        return;
    }

    // [요구사항] @ps.hs.kr 도메인 체크
    if (!email.endsWith("@ps.hs.kr")) {
        alert("풍생고등학교 공식 계정(@ps.hs.kr)으로만 가입할 수 있습니다.");
        return;
    }

    if (password.length < 6) {
        alert("비밀번호는 최소 6자리 이상이어야 합니다.");
        return;
    }

    try {
        // Firebase Auth에 계정 생성
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Firestore 데이터베이스에 학생 기본 정보 저장
        await setDoc(doc(db, "users", user.uid), {
            email: email,
            name: "",              // 초기 이름은 빈칸 (마이페이지에서 설정)
            role: "student",       // 기본 권한은 'student' (관리자는 DB에서 직접 변경 가능)
            isBlocked: false,      // 차단 여부 기본값 false
            blockReason: ""        // 차단 사유 기본값 빈칸
        });

        alert("풍생고 익명 채팅방에 가입 완료되었습니다! 자동으로 로그인합니다.");
        window.location.href = "chat.html"; // 학생 채팅 페이지로 이동

    } catch (error) {
        console.error(error);
        if (error.code === "auth/email-already-in-use") {
            alert("이미 가입된 이메일입니다.");
        } else {
            alert("회원가입 중 오류가 발생했습니다: " + error.message);
        }
    }
});

/**
 * 2. 로그인 기능 (권한 분기 및 차단 확인)
 */
loginBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        alert("이메일과 비밀번호를 입력해주세요.");
        return;
    }

    try {
        // Firebase Auth 로그인 진행
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 로그인 성공 후 DB에서 해당 유저의 권한 및 차단 상태 확인
        const userDoc = await getDoc(doc(db, "users", user.uid));
        
        if (userDoc.exists()) {
            const userData = userDoc.data();

            // [요구사항] 사용자 차단 여부 검사
            if (userData.isBlocked) {
                alert(`접속이 차단된 계정입니다.\n사유: ${userData.blockReason}`);
                await auth.signOut(); // 즉시 로그아웃 처리
                return;
            }

            // [요구사항] 관리자/학생 페이지 이동 분기
            if (userData.role === "admin") {
                alert("관리자 계정으로 로그인했습니다.");
                window.location.href = "admin.html"; // 관리자 페이지로 이동
            } else {
                alert("풍생고 익명 채팅방에 오신 것을 환영합니다!");
                window.location.href = "chat.html"; // 학생 페이지로 이동
            }
        } else {
            alert("사용자 정보가 데이터베이스에 존재하지 않습니다.");
        }

    } catch (error) {
        console.error(error);
        alert("이메일 혹은 비밀번호가 일치하지 않거나 오류가 발생했습니다.");
    }
});

/**
 * 3. 비밀번호 찾기 (변경 이메일 발송)
 */
forgotPasswordLink.addEventListener("click", async (e) => {
    e.preventDefault(); // 링크 기본 이동 막기
    const email = emailInput.value.trim();

    if (!email) {
        alert("비밀번호를 재설정할 이메일을 입력창에 먼저 적어주세요.");
        emailInput.focus();
        return;
    }

    try {
        // 입력한 이메일로 비밀번호 재설정 링크 발송
        await sendPasswordResetEmail(auth, email);
        alert(`${email} 계정으로 비밀번호 변경 이메일을 보냈습니다. 받은편지함(또는 스팸함)을 확인해주세요.`);
    } catch (error) {
        console.error(error);
        alert("비밀번호 재설정 이메일 전송 중 오류가 발생했습니다. 이메일 주소를 다시 확인해주세요.");
    }
});
