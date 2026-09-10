// Community Games
// Shared community data is designed for Supabase. Add your project's URL/key below.

const SUPABASE_URL = "https://cougubqofgoygufuoxyx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Sq_pH4Lt8-LHL1yAC0wCXA_FPJAzg1x";
const BEANS_GOAL = 20000;
const COOLDOWN_MS = 60 * 1000;

// Unicode's official emoji-test data can be used to populate this in the next step.
// Keeping the sequence in the database means every visitor shares exactly one position.
const FALLBACK_EMOJIS = ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🤩", "🥳"];

const hasSupabaseConfig = !SUPABASE_URL.includes("YOUR_SUPABASE") && !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE");

// The username screen is local UI and must not depend on a third-party script
// loading successfully. If the CDN is unavailable, keep the app usable and
// explain the connection state instead of stopping before start() can run.
function createSupabaseClient() {
  if (!hasSupabaseConfig) return null;
  if (!window.supabase?.createClient) {
    console.warn("The Supabase browser client did not load.");
    return null;
  }
  try {
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (error) {
    console.error("Unable to create the Supabase client.", error);
    return null;
  }
}

const supabase = createSupabaseClient();

const state = {
  username: localStorage.getItem("communityGamesUsername") || "",
  beansTotal: 0,
  countingNumber: 0,
  emojiIndex: 0,
  emojiSequence: FALLBACK_EMOJIS,
  cooldowns: { counting: 0, emoji: 0 }
};

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}

function showUsernameModal(force = false) {
  $("usernameModal").classList.remove("hidden");
  $("usernameInput").value = state.username;
  if (!force) setTimeout(() => $("usernameInput").focus(), 50);
}

function hideUsernameModal() {
  $("usernameModal").classList.add("hidden");
}

function setStatus(text, connected) {
  $("connectionStatus").textContent = text;
  $("connectionStatus").previousElementSibling.style.background = connected ? "#12b76a" : "#f79009";
}

function renderChallengeStats() {
  $("beansTotal").textContent = state.beansTotal.toLocaleString();
  $("beansGoalLabel").textContent = `/ ${BEANS_GOAL.toLocaleString()} beans`;
  const percent = Math.min(100, (state.beansTotal / BEANS_GOAL) * 100);
  $("beansProgress").style.width = `${percent}%`;
  $("beansProgressText").textContent = `${percent.toFixed(percent === 100 ? 0 : 1)}% of the community goal`;

  $("countingNumber").textContent = state.countingNumber.toLocaleString();
  $("nextNumber").textContent = (state.countingNumber + 1).toLocaleString();

  $("emojiProgressNumber").textContent = state.emojiIndex.toLocaleString();
  $("emojiTotalLabel").textContent = `of ${state.emojiSequence.length.toLocaleString()} loaded emojis`;
  $("emojiNext").textContent = state.emojiSequence[state.emojiIndex] || "🎉";
}

function renderFeed(elementId, messages, formatter) {
  const feed = $(elementId);
  if (!messages.length) {
    feed.innerHTML = '<div class="empty">No messages yet. Be the first!</div>';
    return;
  }
  feed.innerHTML = messages.map(formatter).join("");
}

function messageMarkup(message, extra = "") {
  return `<div class="message">
    <div class="message-top"><span class="username">${escapeHtml(message.username)}</span><span class="time">${escapeHtml(formatTime(message.created_at))}</span></div>
    <div class="message-body">${escapeHtml(message.content)}</div>
    ${extra ? `<div class="message-meta">${escapeHtml(extra)}</div>` : ""}
  </div>`;
}

async function loadState() {
  if (!supabase) {
    setStatus(hasSupabaseConfig ? "Community connection unavailable — retry shortly" : "Demo mode — connect Supabase to share data", false);
    $("welcomeText").textContent = `You're signed in as ${state.username || "a guest"}. Community data will be shared after Supabase is configured.`;
    renderChallengeStats();
    renderMessages([]);
    return;
  }

  const [{ data: challenge, error: stateError }, { data: messages, error: messageError }] = await Promise.all([
    supabase.from("challenge_state").select("*").eq("id", 1).maybeSingle(),
    supabase.from("challenge_messages").select("*").order("created_at", { ascending: false }).limit(60)
  ]);

  if (stateError || messageError) {
    setStatus("Community connection needs attention", false);
    console.error(stateError || messageError);
    renderChallengeStats();
    renderMessages([]);
    return;
  }

  if (challenge) {
    state.beansTotal = challenge.beans_total ?? 0;
    state.countingNumber = challenge.counting_number ?? 0;
    state.emojiIndex = challenge.emoji_index ?? 0;
    if (Array.isArray(challenge.emoji_sequence) && challenge.emoji_sequence.length) state.emojiSequence = challenge.emoji_sequence;
  }
  renderChallengeStats();
  renderMessages(messages || []);
  setStatus("Live community connected", true);
}

function renderMessages(messages) {
  renderFeed("beansFeed", messages.filter(m => m.challenge === "beans"), m => messageMarkup(m, `+${m.amount || 0} beans`));
  renderFeed("countingFeed", messages.filter(m => m.challenge === "counting"), m => messageMarkup(m, `Community count: ${m.challenge_value}`));
  renderFeed("emojiFeed", messages.filter(m => m.challenge === "emoji"), m => messageMarkup(m, `Emoji #${m.challenge_value}`));
}

async function getCooldown(challenge) {
  if (!supabase || !state.username) return 0;
  const { data, error } = await supabase.from("challenge_cooldowns").select("next_allowed_at").eq("username", state.username).eq("challenge", challenge).maybeSingle();
  if (error || !data) return 0;
  return Math.max(0, new Date(data.next_allowed_at).getTime() - Date.now());
}

async function setCooldown(challenge) {
  if (!supabase || !state.username) return;
  const next = new Date(Date.now() + COOLDOWN_MS).toISOString();
  await supabase.from("challenge_cooldowns").upsert({ username: state.username, challenge, next_allowed_at: next }, { onConflict: "username,challenge" });
}

async function addMessage(message) {
  const { error } = await supabase.from("challenge_messages").insert(message);
  if (error) throw error;
}

async function refreshState() {
  if (!supabase) return;
  const { data } = await supabase.from("challenge_state").select("*").eq("id", 1).maybeSingle();
  if (data) {
    state.beansTotal = data.beans_total ?? state.beansTotal;
    state.countingNumber = data.counting_number ?? state.countingNumber;
    state.emojiIndex = data.emoji_index ?? state.emojiIndex;
    if (Array.isArray(data.emoji_sequence) && data.emoji_sequence.length) state.emojiSequence = data.emoji_sequence;
    renderChallengeStats();
  }
}

async function addBeans(content) {
  const amount = [...content].filter(char => char === "🫘").length;
  if (!amount) throw new Error("Your message needs at least one 🫘.");
  if (!supabase) {
    state.beansTotal += amount;
    renderChallengeStats();
    return;
  }

  // The production-safe version should perform this increment in a Postgres RPC
  // transaction so simultaneous messages cannot overwrite each other.
  const { error } = await supabase.rpc("add_beans", { bean_amount: amount, sender_username: state.username, message_content: content });
  if (error) throw error;
  await refreshState();
}

async function submitCount(value) {
  if (!Number.isInteger(value) || value < 1) throw new Error("Enter a whole number.");
  const cooldown = await getCooldown("counting");
  if (cooldown > 0) throw new Error(`You're on cooldown for ${Math.ceil(cooldown / 1000)} more seconds.`);

  await refreshState();
  if (value !== state.countingNumber + 1) throw new Error(`Wrong number. The community needs ${state.countingNumber + 1}.`);
  if (!supabase) {
    state.countingNumber = value;
    renderChallengeStats();
    state.cooldowns.counting = Date.now() + COOLDOWN_MS;
    return;
  }
  const { error } = await supabase.rpc("submit_count", { submitted_number: value, sender_username: state.username });
  if (error) throw error;
  await setCooldown("counting");
  await refreshState();
}

function isOneEmoji(value) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const segments = [...trimmed];
  // Allow a single grapheme/emoji sequence, while rejecting ordinary multi-character text.
  return segments.length <= 8 && /\p{Extended_Pictographic}/u.test(trimmed);
}

async function submitEmoji(value) {
  const emoji = value.trim();
  if (!isOneEmoji(emoji)) throw new Error("Send one emoji.");
  const cooldown = await getCooldown("emoji");
  if (cooldown > 0) throw new Error(`You're on cooldown for ${Math.ceil(cooldown / 1000)} more seconds.`);

  await refreshState();
  const expected = state.emojiSequence[state.emojiIndex];
  if (emoji !== expected) throw new Error(`Not the next emoji. The community needs ${expected}.`);
  if (!supabase) {
    state.emojiIndex += 1;
    renderChallengeStats();
    state.cooldowns.emoji = Date.now() + COOLDOWN_MS;
    return;
  }
  const { error } = await supabase.rpc("submit_emoji", { submitted_emoji: emoji, sender_username: state.username });
  if (error) throw error;
  await setCooldown("emoji");
  await refreshState();
}

function showFormError(input, error) {
  input.setCustomValidity(error.message);
  input.reportValidity();
  input.setCustomValidity("");
}

$("usernameForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const username = $("usernameInput").value.trim();
  if (!/^[A-Za-z0-9_ -]{2,24}$/.test(username)) {
    $("usernameError").textContent = "Use 2–24 letters, numbers, spaces, hyphens, or underscores.";
    return;
  }
  state.username = username;
  localStorage.setItem("communityGamesUsername", username);
  $("usernameError").textContent = "";
  hideUsernameModal();
  $("welcomeText").textContent = `You're playing as ${username}.`;
});

$("changeUsername").addEventListener("click", () => showUsernameModal(true));

$("beansForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("beansInput");
  if (!state.username) return showUsernameModal();
  try { await addBeans(input.value.trim()); input.value = ""; await loadState(); }
  catch (error) { showFormError(input, error); }
});

$("countingForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("countingInput");
  if (!state.username) return showUsernameModal();
  try { await submitCount(Number(input.value)); input.value = ""; $("countingCooldown").textContent = "Count accepted! Your 60-second cooldown has started."; await loadState(); }
  catch (error) { $("countingCooldown").textContent = error.message; }
});

$("emojiForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("emojiInput");
  if (!state.username) return showUsernameModal();
  try { await submitEmoji(input.value); input.value = ""; $("emojiCooldown").textContent = "Emoji accepted! Your 60-second cooldown has started."; await loadState(); }
  catch (error) { $("emojiCooldown").textContent = error.message; }
});

async function start() {
  if (!state.username) showUsernameModal();
  else $("welcomeText").textContent = `You're playing as ${state.username}.`;

  try {
    await loadState();
  } catch (error) {
    // Never let a failed network request prevent the local username flow.
    console.error("Unable to load the community state.", error);
    setStatus("Community connection unavailable — retry shortly", false);
    renderChallengeStats();
    renderMessages([]);
  }

  if (supabase) {
    supabase.channel("community-games-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "challenge_messages" }, () => loadState())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "challenge_state" }, () => loadState())
      .subscribe();
  }
}

start();
