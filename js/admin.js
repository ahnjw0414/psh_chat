import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, addDoc, onSnapshot, query, orderBy, where, serverTimestamp, doc, getDoc, updateDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const studentListDiv = document.getElementById("student-list");
const chatMessages = document.getElementById("admin-chat-messages");
const messageInput = document.getElementById("admin-message-input");
const sendBtn = document.getElementById("admin-send-btn");
const targetStudentInfo = document.getElementById("target-student-info");
const targetStudentEmail = document.getElementById("target-student-email");
const controlPanel = document.getElementById("control-panel");
const inputArea = document.getElementById("admin-input-area");

const roleSelect = document.getElementById("student-role-select");
const saveRoleBtn = document.getElementById("save-role-btn");
const blockUserBtn = document.getElementById("block-user-btn");
const logoutBtn = document.getElementById("admin-logout-btn");

let currentAdmin = null;
let activeRoomId = null; // 현재 관리자가 보고 있는 학생의 UID
let unsubscribeChat = null;

/**
 * 1. 관리자 권한 체크
 */
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists() && userDoc.data().role === "admin") {
            currentAdmin = user;
            loadStudentRooms(); // 대화방 목록 불러오기
        } else {
            alert("관리자 권한이 없습니다.");
            window.location.href = "index.html";
        }
    } else {
        window.location.href = "index.html";
    }
});

/**
 * 2. 대화가 개설된 학생 방 목록 실시간 감지
 */
function loadStudentRooms() {
    // 모든 메시지를 감시하여 고유한 roomId(학생들)를 추출
    const q = query(collection(db, "messages"), orderBy("timestamp", "desc"));
    
    onSnapshot(q, async (snapshot) => {
        const roomIds = new Set();
        snapshot.forEach(doc => {
            roomIds.add(doc.data().roomId);
        });

        studentListDiv.innerHTML = ""; // 목록 비우기

        if (roomIds.size === 0) {
            studentListDiv.innerHTML = `<div style="padding:20px; color:#999; text-align:center;">활성화된 채팅방이 없습니다.</div>`;
            return;
        }

        // 각 Room ID에 해당하는 학생의 실제 정보(이메일 등)를 가져와서 리스트 생성
        for (let roomId of roomIds) {
            const userDoc = await getDoc(doc(db, "users", roomId));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                const item = document.createElement("div");
                item.classList.add("student-item");
                if (roomId === activeRoomId) item.classList.add("active");
                
                // 부서가 있으면 이름 옆에 표시 (예: 홍길동 [학생부회장])
                const roleTag = userData.role !== "student" && userData.role !== "admin" ? ` [${userData.role}]` : "";
                item.textContent = userData.name ? `${userData.name}${roleTag}` : userData.email;
                
                item.addEventListener("click", () => selectRoom(roomId, userData));
                studentListDiv.appendChild(item);
            }
        }
    });
}

/**
 * 3. 특정 학생 방 선택 시 채팅 내역 로드 및 제어 활성화
 */
function selectRoom(roomId, userData) {
    activeRoomId = roomId;
    
    // 리스트 하이라이트 변경
    document.querySelectorAll(".student-item").forEach(el => el.classList.remove("active"));
    
    targetStudentInfo.textContent = userData.name ? `${userData.name} 학생` : "이름 미설정 학생";
    targetStudentEmail.textContent = `(${userData.email})`;
    
    // 제어판 및 입력창 표시
    controlPanel.style.display = "flex";
    inputArea.style.display = "block";
    
    // 현재 유저의 설정값 세팅
    roleSelect.value = userData.role;
    blockUserBtn.textContent = userData.isBlocked ? "차단 해제" : "이 학생 차단";

    // 1:1 메시지 실시간 로드
    if (unsubscribeChat) unsubscribeChat();
    
    const q = query(collection(db, "messages"), where("roomId", "==", roomId), orderBy("timestamp", "asc"));
    unsubscribeChat = onSnapshot(q, (snapshot) => {
        chatMessages.innerHTML = "";
        snapshot.forEach(doc => {
            const msg = doc.data();
            const isMine = msg.senderUid === currentAdmin.uid;

            const wrapper = document.createElement("div");
            wrapper.classList.add("message-wrapper", isMine ? "mine" : "other");

            const sender = document.createElement("div");
            sender.classList.add("message-sender");
            // 관리자가 볼 때는 학생이 익명이어도 실제 생성된 익명 닉네임을 표시해 줌
            sender.textContent = isMine ? "관리자 (나)" : msg.senderName;
            wrapper.appendChild(sender);

            const bubble = document.createElement("div");
            bubble.classList.add("message-bubble");
            
            if(msg.text) bubble.appendChild(document.createTextNode(msg.text));
            if(msg.imageUrl) {
                const img = document.createElement("img");
                img.src = msg.imageUrl;
                bubble.appendChild(img);
            }

            wrapper.appendChild(bubble);
            chatMessages.appendChild(wrapper);
        });
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
}

/**
 * 4. 관리자 답장 전송
 */
async function adminSendMessage() {
    const text = messageInput.value.trim();
    if (!text || !activeRoomId) return;

    await addDoc(collection(db, "messages"), {
        roomId: activeRoomId, // 대화 중인 학생의 방 ID
        senderUid: currentAdmin.uid,
        senderName: "교내 관리자",
        isAnonymous: false,
        text: text,
        imageUrl: "",
        timestamp: serverTimestamp()
    });
    messageInput.value = "";
    messageInput.focus();
}

sendBtn.addEventListener("click", adminSendMessage);
messageInput.addEventListener("keypress", (e) => { if (e.key === "Enter") adminSendMessage(); });

/**
 * 5. [요구사항] 학생 권한/부서 변경 기능
 */
saveRoleBtn.addEventListener("click", async () => {
    if (!activeRoomId) return;
    const selectedRole = roleSelect.value;
    await updateDoc(doc(db, "users", activeRoomId), { role: selectedRole });
    alert("해당 학생의 권한/부서가 변경되었습니다.");
});

/**
 * 6. [요구사항] 학생 차단 / 차단 해제 기능 (사유 입력)
 */
blockUserBtn.addEventListener("click", async () => {
    if (!activeRoomId) return;
    
    const userDoc = await getDoc(doc(db, "users", activeRoomId));
    const isBlockedCurrently = userDoc.data().isBlocked;

    if (isBlockedCurrently) {
        // 차단 해제
        if (confirm("이 학생의 차단을 해제하시겠습니까?")) {
            await updateDoc(doc(db, "users", activeRoomId), { isBlocked: false, blockReason: "" });
            alert("차단이 해제되었습니다.");
            blockUserBtn.textContent = "이 학생 차단";
        }
    } else {
        // 차단 실행
        const reason = prompt("차단 사유를 입력해주세요 (학생 로그인 시 공지됨):");
        if (reason === null) return; // 취소 누른 경우
        
        await updateDoc(doc(db, "users", activeRoomId), {
            isBlocked: true,
            blockReason: reason || "운영정책 위반"
        });
        alert("해당 학생이 즉시 차단되었습니다.");
        blockUserBtn.textContent = "차단 해제";
    }
});

// 로그아웃
logoutBtn.addEventListener("click", () => {
    auth.signOut().then(() => window.location.href = "index.html");
});
