// -------------------------------------------------
// Offline Learning Assistant – core logic
// -------------------------------------------------
"use strict";

/* ---------- GLOBAL STATE ---------- */
const state = {
  files: [],          // [{path, content, category}]
  folderHandle: null,
  theme: "light"
};

/* ---------- THEME HANDLER ---------- */
const themeSelect = document.getElementById("theme-select");
themeSelect.addEventListener("change", e => setTheme(e.target.value));
function setTheme(name){
  document.body.dataset.theme = name;
  state.theme = name;
}

/* ---------- FOLDER SCANNING ---------- */
const chooseBtn = document.getElementById("choose-folder");
const folderStatus = document.getElementById("folder-status");
chooseBtn.addEventListener("click", async () => {
  try {
    const handle = await window.showDirectoryPicker();
    state.folderHandle = handle;
    folderStatus.textContent = "Membaca folder…";
    state.files = [];
    await walkFolder(handle);
    folderStatus.textContent = `✅ ${state.files.length} berkas dibaca.`;
  } catch (err) {
    folderStatus.textContent = "❌ Gagal: " + err.message;
  }
});

async function walkFolder(dirHandle, path = "") {
  for await (const entry of dirHandle.values()) {
    const entryPath = `${path}/${entry.name}`;
    if (entry.kind === "file") {
      const ext = entry.name.split('.').pop().toLowerCase();
      if (["txt","md","html"].includes(ext)) {
        const file = await entry.getFile();
        const text = await file.text();
        const category = path.split('/')
          .filter(Boolean)[0] || "Umum";
        state.files.push({path: entryPath, content: text, category});
      }
    } else if (entry.kind === "directory") {
      await walkFolder(entry, entryPath);
    }
  }
}

/* ---------- SIMPLE Q&A ---------- */
const chatWindow = document.getElementById("chat-window");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
sendBtn.addEventListener("click", handleUser);
userInput.addEventListener("keydown", e => { if (e.key === "Enter") handleUser(); });

function addMessage(text, from="user"){
  const div = document.createElement("div");
  div.className = `message ${from}`;
  const avatar = document.createElement("span");
  avatar.className = "avatar";
  avatar.innerHTML = from === "user" ? "👤" : "🤖";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  div.appendChild(avatar);
  div.appendChild(bubble);
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

async function answerQuestion(query){
  if (!state.files.length) return "⚠️ Belum ada materi. Pilih folder dulu.";
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scores = state.files.map(f => {
    const txt = f.content.toLowerCase();
    const match = words.reduce((c,w)=>c+(txt.includes(w)?1:0),0);
    return {file:f, score:match};
  }).filter(s=>s.score>0);
  if (scores.length){
    scores.sort((a,b)=>b.score-a.score);
    const best = scores[0].file;
    const idx = best.content.toLowerCase().indexOf(words[0]);
    const snippet = best.content.substring(Math.max(0, idx-80), idx+200);
    return `📚 Dari *${best.path}*:\n${snippet.trim()}…`;
  }
  // Fallback: fetch quick web info (DuckDuckGo Instant Answer)
  try {
    const resp = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`);
    const data = await resp.json();
    if (data.AbstractText){
      const source = data.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
      return `🔎 Info eksternal: ${data.AbstractText}\nSumber: ${source}`;
    }
    return "🤔 Tidak menemukan materi yang relevan di sumber lokal maupun web.";
  } catch(e){
    return "⚠️ Gagal mengambil info eksternal: " + e.message;
  }
}

async function handleUser(){
  const q = userInput.value.trim();
  if (!q) return;
  addMessage(q, "user");
  userInput.value = "";
  const reply = await answerQuestion(q);
  setTimeout(()=>addMessage(reply, "bot"), 300);
}

/* ---------- QUIZ GENERATOR ---------- */
const quizBtn = document.getElementById("generate-quiz");
const quizContainer = document.getElementById("quiz-container");
quizBtn.addEventListener("click", generateQuiz);

function generateQuiz(){
  if (!state.files.length){
    quizContainer.innerHTML = "<p>⚠️ Silakan pilih folder dulu.</p>";
    return;
  }
  const sentences = [];
  state.files.forEach(f => {
    const s = f.content.match(/[^.!?]+[.!?]/g) || [];
    sentences.push(...s.map(txt=>({txt, src:f.path})));
  });
  if (sentences.length < 5){
    quizContainer.innerHTML = "<p>💡 Tidak cukup kalimat untuk membuat kuiz.</p>";
    return;
  }
  const chosen = [];
  while (chosen.length < 5){
    const idx = Math.floor(Math.random()*sentences.length);
    if (!chosen.includes(sentences[idx])) chosen.push(sentences[idx]);
  }
  quizContainer.innerHTML = "";
  chosen.forEach((item,i)=>{
    const words = item.txt.split(" ");
    const blankIdx = Math.floor(Math.random()*words.length);
    const answer = words[blankIdx].replace(/[.,;:!?]$/g, "");
    const question = words.map((w,j)=>j===blankIdx?"_____" : w).join(" ");
    const distractors = [...new Set([
      answer.split('').reverse().join(''),
      answer.replace(/[aeiou]/gi, ""),
      answer + "nya"
    ])].slice(0,3);
    const options = [answer, ...distractors];
    shuffleArray(options);
    const html = `
      <div class="quiz-item" id="q${i}">
        <h3>Soal ${i+1}</h3>
        <p>${question}</p>
        <ul>
          ${options.map(opt=>`<li><label><input type="radio" name="q${i}" value="${opt}"> ${opt}</label></li>`).join("")}
        </ul>
        <button onclick="checkAnswer(${i}, '${answer}')">Periksa Jawaban</button>
        <div id="feedback${i}" class="feedback"></div>
      </div>`;
    quizContainer.insertAdjacentHTML('beforeend', html);
  });
}

function shuffleArray(arr){
  for(let i=arr.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
}

function checkAnswer(qIndex, correct){
  const radios = document.getElementsByName(`q${qIndex}`);
  let selected = null;
  radios.forEach(r=>{ if(r.checked) selected=r.value; });
  const feedback = document.getElementById(`feedback${qIndex}`);
  if (!selected){
    feedback.textContent = "⚠️ Pilih dulu satu jawaban.";
    return;
  }
  if (selected === correct){
    feedback.innerHTML = "<span style='color:green;'>✅ Benar! 🎉</span>";
  } else {
    feedback.innerHTML = `<span style='color:red;'>❌ Salah. Jawaban yang benar: <strong>${correct}</strong>.</span>`;
  }
}

// -------------------------------------------------
// End of script.js
// -------------------------------------------------
