import { auth, db, storage } from "./firebase-config.js";
import { onAuthStateChanged, updatePassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, addDoc, onSnapshot, query, orderBy, where, serverTimestamp, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// 익명 닉네임 조합용 배열
const adjectives = ["용감한", "신난", "배고픈", "똑똑한", "날쌘", "행복한", "침착한", "빛나는", "엉뚱한", "조용한"];
const animals = ["호랑이", "독수리", "돌고래", "쿼카", "판다", "다람쥐", "토끼", "펭귄", "사막여우", "나무늘보"];

// HTML 엘리먼트 가져오기
const chatMessages = document.getElementById("chat-messages");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const anonymousCheckbox = document.getElementById("anonymous-checkbox");
const imageInput = document.getElementById("image-input");
const fileNamePreview = document.getElementById("file-name-preview");
const userDisplayName = document.getElementById("user-display-name");
const logoutBtn = document.getElementById("logout-btn");

// 마이페이지 모달 관련
const mypageBtn = document.getElementById("mypage-btn");
const mypageModal = document.getElementById("mypage-modal");
const closeModalBtn = document.getElementById("close-modal-btn");
const profileNameInput = document.getElementById("profile-name");
const newPasswordInput = document.getElementById("new-password");
const saveProfileBtn = document.getElementById("save-profile-btn");

let currentUser = null;
let selectedFile = null;
let unsubscribeChat = null; // 채팅 실시간 리스너 해제용

/**
 * 1. 인증 상태 확인 및 유저 정보 로드
 */
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        
        // Firestore에서 유저 데이터(실명, 차단여부 등) 가져오기
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            
            // 만약 차단된 유저라면 튕겨내기
            if (userData.isBlocked) {
                alert("차단된 계정입니다.");
                auth.signOut();
                window.location.href = "index.html";
                return;
            }

            // 상단 헤더에 표시할 이름 결정 (설정한 실명이 없으면 이메일 표시)
            const displayName = userData.name ? `${userData.name} 학생` : user.email;
            userDisplayName.textContent = displayName;
            profileNameInput.value = userData.name || "";
            
            // [핵심] 학생 본인의 UID를 Room ID로 사용하여 해당 채팅방 메시지만 실시간 감시 시작
            loadMessages(user.uid);
        }
    } else {
        // 로그인 안 되어 있으면 로그인 페이지로 강제 이동
        window.location.href = "index.html";
    }
});

/**
 * 2. 실시간 메시지 불러오기
 */
function loadMessages(roomId) {
    // 기존에 켜져있던 리스너가 있다면 끄기
    if (unsubscribeChat) unsubscribeChat();

    const q = query(
        collection(db, "messages"),
        where("roomId", "==", roomId),
        orderBy("timestamp", "asc")
    );

    // 대화방에 변화가 생길 때마다 실시간으로 화면 리렌더링
    unsubscribeChat = onSnapshot(q, (snapshot) => {
        chatMessages.innerHTML = ""; // 화면 초기화
        
        snapshot.forEach((doc) => {
            const msg = doc.data();
            const isMine = msg.senderUid === currentUser.uid;

            // 말풍선 틀 만들기
            const wrapper = document.createElement("div");
            wrapper.classList.add("message-wrapper", isMine ? "mine" : "other");

            // 작성자 이름 표시 (내가 보낸 게 아닐 때만 혹은 익명 여부에 따라)
            const senderEme = document.createElement("div");
            senderEme.classList.add("message-sender");
            
            if (isMine) {
                senderEme.textContent = msg.isAnonymous ? `${msg.senderName} (나)` : `${msg.senderName} (나)`;
            } else {
                // 상대방(관리자)이 보낸 메시지인 경우
                senderEme.textContent = msg.senderName;
            }
            wrapper.appendChild(senderEme);

            // 말풍선 내용물
            const bubble = document.createElement("div");
            bubble.classList.add("message-bubble");

            // 텍스트가 있으면 추가
            if (msg.text) {
                const textNode = document.createTextNode(msg.text);
                bubble.appendChild(textNode);
            }

            // 이미지가 있으면 추가
            if (msg.imageUrl) {
                const img = document.createElement("img");
                img.src = msg.imageUrl;
                img.alt = "전송된 이미지";
                bubble.appendChild(img);
            }

            wrapper.appendChild(bubble);
            chatMessages.appendChild(wrapper);
        });

        // 스크롤을 항상 가장 아래로 내리기
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
}

/**
 * 3. 메시지 및 이미지 전송 함수
 */
async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text && !selectedFile) return; // 둘 다 없으면 전송 안 함

    sendBtn.disabled = true; // 도배 방지 버튼 비활성화
    let imageUrl = "";

    try {
        // 파일이 선택되어 있다면 파이어베이스 스토리지에 먼저 업로드
        if (selectedFile) {
            fileNamePreview.textContent = "업로드 중...";
            const fileRef = ref(storage, `chat_images/${Date.now()}_${selectedFile.name}`);
            await uploadBytes(fileRef, selectedFile);
            imageUrl = await getDownloadURL(fileRef); // 이미지 다운로드 주소 획득
            selectedFile = null;
            fileNamePreview.textContent = "";
            imageInput.value = ""; // 파일 인풋 초기화
        }

        // 유저의 최신 가입 정보 읽기 (실명 발송 시 사용)
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        const userData = userDoc.data();

        // [요구사항] 익명 선택 시 랜덤 조합 이름 생성, 실명 선택 시 설정한 이름(없으면 이메일)
        let finalSenderName = "";
        if (anonymousCheckbox.checked) {
            const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
            const randomAnimal = animals[Math.floor(Math.random() * animals.length)];
            finalSenderName = `${randomAdj} ${randomAnimal}`;
        } else {
            finalSenderName = userData.name || currentUser.email.split("@")[0];
        }

        // Firestore에 메시지 데이터 저장
        await addDoc(collection(db, "messages"), {
            roomId: currentUser.uid,          // 내 UID가 곧 방 번호
            senderUid: currentUser.uid,
            senderEmail: currentUser.email,    // [요구사항] 익명이어도 관리자가 볼 수 있게 이메일 저장
            senderName: finalSenderName,
            isAnonymous: anonymousCheckbox.checked,
            text: text,
            imageUrl: imageUrl,
            timestamp: serverTimestamp()
        });

        messageInput.value = ""; // 입력창 비우기
        messageInput.focus();

    } catch (error) {
        console.error(error);
        alert("메시지 전송 실패: " + error.message);
    } finally {
        sendBtn.disabled = false;
    }
}

// 전송 버튼 클릭 및 엔터키 이벤트
sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
});

// 파일 선택 시 프리뷰 텍스트 띄우기
imageInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
        selectedFile = e.target.files[0];
        fileNamePreview.textContent = `선택됨: ${selectedFile.name}`;
    }
});

/**
 * 4. 마이페이지 팝업 및 유저 정보 수정
 */
mypageBtn.addEventListener("click", () => mypageModal.classList.add("active"));
closeModalBtn.addEventListener("click", () => mypageModal.classList.remove("active"));

saveProfileBtn.addEventListener("click", async () => {
    const newName = profileNameInput.value.trim();
    const newPassword = newPasswordInput.value;

    try {
        // [요구사항] 이름 설정/변경 가능
        if (newName) {
            await updateDoc(doc(db, "users", currentUser.uid), { name: newName });
        }

        // [요구사항] 비밀번호 변경 가능
        if (newPassword) {
            if (newPassword.length < 6) {
                alert("새 비밀번호는 6자리 이상이어야 합니다.");
                return;
            }
            await updatePassword(currentUser, newPassword);
        }

        alert("회원 정보가 성공적으로 수정되었습니다. 새로고침합니다.");
        location.reload();

    } catch (error) {
        console.error(error);
        alert("정보 수정에 실패했습니다: " + error.message);
    }
});

/**
 * 5. 로그아웃
 */
logoutBtn.addEventListener("click", () => {
    if (confirm("로그아웃 하시겠습니까?")) {
        auth.signOut().then(() => {
            window.location.href = "index.html";
        });
    }
});
