
const firebaseConfig = {
    apiKey: "AIzaSyAdxgaXA0cJBESZnA679Ej2i0zo3e-40BA",
    authDomain: "lynx-auth-d17dd.firebaseapp.com",
    projectId: "lynx-auth-d17dd",
    storageBucket: "lynx-auth-d17dd.firebasestorage.app",
    messagingSenderId: "839612819820",
    appId: "1:839612819820:web:7576f107b7af280d776b49",
    measurementId: "G-RLZC3MPQL0"
};


if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();


const API_URL = "https://api.lynxauth.qzz.io";


let currentOwnerId = null;
let currentUserEmail = null;
let cachedApps = [];
let pendingAppRedirect = null;
let currentLang = 'cs';
let currentAppUsers = [];
let statusCheckInterval = null;


function formatLocalDateForInput(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    const pad = (num) => String(num).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatLocalDateOnly(dateStr) {
    if (!dateStr) return "N/A";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "N/A";
    const pad = (num) => String(num).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function updateStatus(isOnline) {
    const statusText = document.getElementById("status-text");
    const statusBadge = document.getElementById("status-badge");
    if (statusText && statusBadge) {
        statusText.innerText = isOnline ? "Online" : "Offline";
        if (isOnline) {
            statusBadge.classList.remove("offline");
        } else {
            statusBadge.classList.add("offline");
        }
    }
}

async function checkSystemStatus() {
    try {
        const response = await fetch(`${API_URL}/`);
        updateStatus(response.ok);
    } catch (e) {
        updateStatus(false);
    }
}


auth.onAuthStateChanged(async (user) => {
    if (user) {
        document.getElementById("auth-view").style.display = "none";
        document.getElementById("dashboard-view").style.display = "grid";

        currentUserEmail = user.email;
        document.getElementById("sidebar-email").innerText = user.email.length > 20 ? user.email.substring(0, 18) + '...' : user.email;

        await syncSeller(user);
        updateCodeView();
        applyCustomBg();

        if (!statusCheckInterval) {
            checkSystemStatus();
            statusCheckInterval = setInterval(checkSystemStatus, 60000);
        }
    } else {
        document.getElementById("auth-view").style.display = "flex";
        document.getElementById("dashboard-view").style.display = "none";
        if (statusCheckInterval) {
            clearInterval(statusCheckInterval);
            statusCheckInterval = null;
        }
    }
});

async function emailLogin() {
    const email = document.getElementById("login-email").value;
    const pass = document.getElementById("login-password").value;

    if (!email || !pass) return showPopup("Error", "Please fill in all fields.");

    try {
        await auth.signInWithEmailAndPassword(email, pass);
    } catch (e) {
        showPopup("Login Failed", e.message);
    }
}

async function emailRegister() {
    const email = document.getElementById("reg-email").value;
    const pass = document.getElementById("reg-password").value;

    if (!email || !pass) return showPopup("Error", "Please fill in all fields.");

    try {
        await auth.createUserWithEmailAndPassword(email, pass);
        showPopup("Success", "Account created! You are now logged in.");
    } catch (e) {
        showPopup("Registration Failed", e.message);
    }
}

async function googleLogin() {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
        await auth.signInWithPopup(provider);
    } catch (e) {
        showPopup("Google Login Failed", e.message);
    }
}

function logout() {
    auth.signOut();
    window.location.reload();
}

function deleteAccount() {
    if (confirm("Are you sure you want to delete your account? This will delete all apps and users.")) {
        apiCall("/seller/delete", { ownerid: currentOwnerId })
            .then(() => {
                const user = auth.currentUser;
                user.delete().then(() => window.location.reload());
            });
    }
}


function showRegisterForm() {
    document.getElementById("login-form").style.display = "none";
    document.getElementById("register-form").style.display = "block";
}

function showLoginForm() {
    document.getElementById("register-form").style.display = "none";
    document.getElementById("login-form").style.display = "block";
}

function showView(viewName) {
    document.querySelectorAll(".content-view").forEach(el => el.classList.remove("active"));
    document.getElementById(viewName + "-content").classList.add("active");

    document.querySelectorAll(".nav-btn-side").forEach(el => el.classList.remove("active"));
    const navMap = {
        'dashboard': 'nav-dash',
        'applications': 'nav-apps',
        'users': 'nav-users',
        'licenses': 'nav-licenses',
        'integration': 'nav-integration',
        'instructions': 'nav-instructions',
        'webhooks': 'nav-webhooks'
    };
    if (navMap[viewName]) document.getElementById(navMap[viewName]).classList.add("active");

    document.querySelector(".sidebar").classList.remove("open");
    document.getElementById("sidebar-overlay").style.display = "none";

    if (viewName === 'applications') loadApps();
    if (viewName === 'webhooks') populateWebhookDropdown();
    if (viewName === 'users') loadUsersViewDropdown();
    if (viewName === 'licenses') loadLicensesViewDropdown();
    if (viewName === 'integration') updateCodeView();
    
    applyCustomBg();
}

function toggleMobileMenu() {
    const sb = document.querySelector(".sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    if (sb.classList.contains("open")) {
        sb.classList.remove("open");
        overlay.style.display = "none";
    } else {
        sb.classList.add("open");
        overlay.style.display = "block";
    }
}

async function apiCall(endpoint, body) {
    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        if (response.status !== 200) throw new Error(data.detail || "Unknown Error");
        return data;
    } catch (e) {
        showPopup("API Error", e.message);
        throw e;
    }
}

async function syncSeller(user) {
    try {
        const data = await apiCall("/auth/sync", {
            firebase_uid: user.uid,
            email: user.email
        });

        if (data.status === "success") {
            currentOwnerId = data.ownerid;
            const group = data.seller_group;

            document.getElementById("ownerid-display").innerText = currentOwnerId;

            if (group === 2) {
                document.getElementById("stat-sub").innerText = "Gold Developer";
                document.getElementById("stat-sub").style.color = "#ffd700";
                document.getElementById("sidebar-name").innerText = "Gold Developer";
                document.getElementById("sidebar-name").style.color = "#ffd700";
            } else if (group === 1) {
                document.getElementById("stat-sub").innerText = "Silver Developer";
                document.getElementById("stat-sub").style.color = "#c0c0c0";
                document.getElementById("sidebar-name").innerText = "Silver Developer";
                document.getElementById("sidebar-name").style.color = "#c0c0c0";
            } else {
                document.getElementById("stat-sub").innerText = "Free Developer";
                document.getElementById("stat-sub").style.color = "#9ca3af";
                document.getElementById("sidebar-name").innerText = "Free Developer";
                document.getElementById("sidebar-name").style.color = "#9ca3af";
            }

            const redeemExpiry = document.getElementById("redeem-expiry-display");
            if (redeemExpiry) {
                if (data.plan_expires_at && group > 0) {
                    const planName = group === 2 ? "Gold Enterprise" : "Silver Partner";
                    redeemExpiry.querySelector("span").innerText = planName + " — Expires: " + formatLocalDateOnly(data.plan_expires_at);
                    redeemExpiry.style.display = "flex";
                } else if (group > 0) {
                    redeemExpiry.querySelector("span").innerText = (group === 2 ? "Gold Enterprise" : "Silver Partner") + " — Lifetime";
                    redeemExpiry.style.display = "flex";
                } else {
                    redeemExpiry.style.display = "none";
                }
            }

            updateStatus(true);
            loadApps(true);
        }
    } catch (e) {
        if (e.message && (e.message.includes("Failed to fetch") || e.message.includes("NetworkError"))) {
            updateStatus(false);
        }
    }
}

async function createApp() {
    const name = document.getElementById("app-name-input").value;
    if (!name) return showPopup("Error", "App name is required");

    try {
        await apiCall("/apps/create", { ownerid: currentOwnerId, app_name: name });
        document.getElementById("new-app-panel").style.display = "none";
        document.getElementById("app-name-input").value = "";
        showPopup("Success", "Application created successfully!");
        loadApps();
        syncSeller(auth.currentUser);
    } catch (e) { }
}

async function loadApps(updateStats = true) {
    try {
        const data = await apiCall("/apps/list", { ownerid: currentOwnerId });
        cachedApps = data.apps;

        const listContainer = document.getElementById("apps-list");
        listContainer.innerHTML = "";

        if (updateStats) {
            document.getElementById("stat-total-apps").innerText = cachedApps.length;
            const totalUsers = cachedApps.reduce((sum, app) => sum + (app.user_count || 0), 0);
            const totalUsersEl = document.getElementById("stat-total-users");
            if (totalUsersEl) {
                totalUsersEl.innerText = totalUsers;
            }
        }

        cachedApps.forEach(app => {
            const div = document.createElement("div");
            div.className = "app-row";
            div.id = `app-row-${app.appid}`;
            div.innerHTML = `
                <div class="app-row-header" onclick="this.parentElement.classList.toggle('expanded')">
                    <div class="app-title"><i class="fa-solid fa-cube"></i> ${app.name}</div>
                    <div style="display:flex; align-items:center; gap:12px;">
                        <span class="app-meta" style="background: rgba(96, 165, 250, 0.1); color: #60a5fa; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 500;">${app.user_count || 0} users</span>
                        <span class="app-meta">ID: ${app.appid.substring(0, 8)}...</span>
                        <i class="fa-solid fa-chevron-down" style="color:#555"></i>
                    </div>
                </div>
                <div class="app-row-details">
                    <div class="secret-box">
                        <span>Secret: <span style="color:white;">${app.app_secret}</span></span>
                        <i class="fa-solid fa-copy copy-icon" onclick="copyToClipboard('${app.app_secret}')"></i>
                    </div>
                    <div style="display:flex; gap:10px; margin-bottom:20px; align-items:center; flex-wrap:wrap;">
                        <input id="u-name-${app.appid}" class="auth-input" style="margin:0; background:#111; flex:1; min-width:120px;" placeholder="Username">
                        <input id="u-pass-${app.appid}" class="auth-input" style="margin:0; background:#111; flex:1; min-width:120px;" placeholder="Password">
                        <input type="datetime-local" id="u-exp-${app.appid}" class="auth-input date-picker-fix" style="margin:0; background:#111; color:#fff; flex:1; min-width:160px;">
                        <button class="btn-primary-sm" onclick="createUser('${app.appid}')">Create User</button>
                    </div>
                    <div style="display:flex; justify-content:space-between; border-top:1px solid #222; padding-top:15px;">
                        <button class="btn-ghost-sm" onclick="openUsersModal('${app.appid}', '${app.name}')">Manage Users</button>
                        <button class="btn-danger-sm" onclick="deleteApp('${app.appid}')">Delete App</button>
                    </div>
                </div>
            `;
            listContainer.appendChild(div);
        });

        // Handle pending redirection from Users page
        if (pendingAppRedirect) {
            const row = document.getElementById(`app-row-${pendingAppRedirect}`);
            if (row) {
                // Ensure all others are closed
                document.querySelectorAll('.app-row').forEach(r => r.classList.remove('expanded'));
                // Open our target
                row.classList.add('expanded');
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });

                const input = document.getElementById(`u-name-${pendingAppRedirect}`);
                if (input) input.focus();
            }
            pendingAppRedirect = null; // Clear state
        }
    } catch (e) {
        console.error(e);
    }
}

async function deleteApp(appid) {
    if (!confirm("Are you sure? This deletes all users in this app.")) return;
    try {
        await apiCall("/apps/delete", { appid: appid });
        showPopup("Success", "App deleted.");
        loadApps(true);
    } catch (e) { }
}

async function createUser(appid) {
    const userEl = document.getElementById(`u-name-${appid}`);
    const passEl = document.getElementById(`u-pass-${appid}`);
    const expEl = document.getElementById(`u-exp-${appid}`);

    const username = userEl.value;
    const password = passEl.value;
    const expireStr = expEl.value;

    if (!username || !password) return showPopup("Error", "Username and Password required.");

    const payload = {
        ownerid: currentOwnerId,
        appid: appid,
        username: username,
        password: password,
        days: 0
    };

    if (expireStr) {
        payload.expire_str = new Date(expireStr).toISOString();
    }

    try {
        await apiCall("/users/create", payload);
        showPopup("Success", `User ${username} created!`);
        userEl.value = "";
        passEl.value = "";
        expEl.value = "";

        loadApps(true);

        const currentFilter = document.getElementById("user-app-filter").value;
        if (currentFilter === appid) {
            loadUsersForSelectedApp();
        }
    } catch (e) { }
}



function loadUsersViewDropdown() {
    const listContainer = document.getElementById("dropdown-options-list");
    const hiddenInput = document.getElementById("user-app-filter");
    const triggerText = document.getElementById("dropdown-selected-text");


    listContainer.innerHTML = "";

    const currentVal = hiddenInput.value;
    const currentApp = cachedApps.find(a => a.appid === currentVal);

    if (currentApp) {
        triggerText.innerText = currentApp.name;
        triggerText.style.color = "#fff";
    } else {
        triggerText.innerText = "Select Application";
        triggerText.style.color = "#888";
    }


    cachedApps.forEach(app => {
        const div = document.createElement("div");
        div.className = "dropdown-option";
        div.innerHTML = `<span>${app.name}</span> <i class="fa-solid fa-check"></i>`;

        div.onclick = () => {
            selectAppOption(app.appid, app.name);
        };

        listContainer.appendChild(div);
    });
}


function toggleAppDropdown() {
    const container = document.getElementById("dropdown-options-list");
    const trigger = document.querySelector(".dropdown-trigger");


    container.classList.toggle("open");
    trigger.classList.toggle("active");
}

function selectAppOption(appid, appName) {

    const textEl = document.getElementById("dropdown-selected-text");
    textEl.innerText = appName;
    textEl.style.color = "#fff";


    document.getElementById("user-app-filter").value = appid;


    toggleAppDropdown();


    loadUsersForSelectedApp();
}


window.addEventListener('click', function (e) {
    const dropdown = document.getElementById('custom-app-dropdown');
    const container = document.getElementById("dropdown-options-list");
    const trigger = document.querySelector(".dropdown-trigger");

    if (dropdown && !dropdown.contains(e.target)) {
        if (container.classList.contains('open')) {
            container.classList.remove('open');
            trigger.classList.remove('active');
        }
    }

    const licDropdown = document.getElementById('custom-license-dropdown');
    const licContainer = document.getElementById("license-dropdown-options-list");
    const licTrigger = document.querySelector("#custom-license-dropdown .dropdown-trigger");

    if (licDropdown && !licDropdown.contains(e.target)) {
        if (licContainer && licContainer.classList.contains('open')) {
            licContainer.classList.remove('open');
            licTrigger.classList.remove('active');
        }
    }
});

function openUsersModal(appid, appName) {
    showView('users');
    const sel = document.getElementById("user-app-filter");
    sel.value = appid;
    loadUsersForSelectedApp();
}

async function loadUsersForSelectedApp() {
    const appid = document.getElementById("user-app-filter").value;
    const container = document.getElementById("users-table-body");

    if (!appid) {
        container.innerHTML = '<div class="empty-state">Select an application to view users.</div>';
        return;
    }

    container.innerHTML = '<div class="empty-state">Loading users...</div>';

    try {
        const data = await apiCall("/users/list", { appid: appid });
        currentAppUsers = data.users;
        renderUsers(currentAppUsers);
    } catch (e) {
        container.innerHTML = '<div class="empty-state">Failed to load users.</div>';
    }
}

function renderUsers(users) {
    const container = document.getElementById("users-table-body");
    const appid = document.getElementById("user-app-filter").value;

    if (users.length === 0) {
        container.innerHTML = '<div class="empty-state">No users found.</div>';
        return;
    }

    container.innerHTML = "";

    users.forEach(u => {
        let datePart = "Never";
        if (u.expires_at) datePart = formatLocalDateOnly(u.expires_at);

        const isLocked = u.hwid_locked !== false;
        const hwidDisplay = u.hwid ? "Linked" : "Not Linked";
        const hwidColor = u.hwid ? "#10b981" : "#666";

        const row = document.createElement("div");
        row.className = "user-list-item";
        row.innerHTML = `
            <div style="flex:1; font-weight:500; display:flex; gap:8px; align-items:center;">
                ${u.username}
                ${isLocked ? '<i class="fa-solid fa-lock" style="font-size:0.7rem; color:var(--primary);" title="Secure"></i>' : '<i class="fa-solid fa-lock-open" style="font-size:0.7rem; color:#666;" title="Unlocked"></i>'}
            </div>
            
            <div style="flex:1; font-size:0.8rem;">
                <span style="color:${hwidColor};">● ${hwidDisplay}</span>
            </div>
            
            <div style="flex:1; font-size:0.85rem; color:#888;">${datePart}</div>
            
            <div style="width:120px; text-align:right;">
                <div class="action-btn-wrapper action-container">
                    
                    <!-- 1. Three Dots (Opens Central Modal) -->
                    <button class="btn-icon" onclick="openSettingsModal('${u.id}', '${u.username}', '${u.expires_at || ''}', ${isLocked})">
                        <i class="fa-solid fa-ellipsis-vertical"></i>
                    </button>

                    <!-- 2. Separate Delete Button -->
                    <button class="btn-danger-sm" style="padding:6px 10px;" onclick="deleteUser('${u.id}', '${appid}', '')">
                        <i class="fa-solid fa-trash"></i>
                    </button>

                </div>
            </div>
        `;
        container.appendChild(row);
    });
}


// Removed duplicated toggleMenu and click listeners (handled later in the file)

// Removed duplicated toggleHwidLock and resetHWID (handled later in the file)

function openTimeModal(uid) {
    document.getElementById("time-user-id").value = uid;
    document.getElementById("time-modal").style.display = "flex";
    document.getElementById(`menu-${uid}`).classList.remove('show');
}

function closeTimeModal(e) {
    if (e.target.id === "time-modal") document.getElementById("time-modal").style.display = "none";
}

// Removed duplicated submitTimeUpdate (handled later in the file)

function filterUsers() {
    const query = document.getElementById("user-search").value.toLowerCase();
    const filtered = currentAppUsers.filter(u => u.username.toLowerCase().includes(query));
    renderUsers(filtered);
}

function closeModal() {
    document.getElementById("manage-users-modal").style.display = "none";
}

async function deleteUser(userId, appid, appName) {
    if (!confirm("Delete this user?")) return;
    try {
        await apiCall("/users/delete", { user_id: userId });

        loadUsersForSelectedApp();
    } catch (e) { }
}


function toggleWhDropdown() {
    const display = document.getElementById("wh-select-display");
    const options = document.getElementById("wh-select-options");
    const isOpen = display.classList.contains("open");
    if (isOpen) {
        display.classList.remove("open");
        options.classList.remove("open");
    } else {
        display.classList.add("open");
        options.classList.add("open");
    }
}

function selectWhOption(value, label) {
    // Update hidden native select
    const sel = document.getElementById("wh-app-select");
    sel.value = value;

    // Update display text
    document.getElementById("wh-select-text").textContent = label;

    // Update option highlight
    document.querySelectorAll(".wh-select-option").forEach(el => {
        el.classList.toggle("selected", el.dataset.value === value);
    });

    // Close dropdown
    document.getElementById("wh-select-display").classList.remove("open");
    document.getElementById("wh-select-options").classList.remove("open");

    // Trigger load
    loadWebhookSettings();
}

document.addEventListener("click", function (e) {
    const wrapper = document.getElementById("wh-custom-select-wrapper");
    if (wrapper && !wrapper.contains(e.target)) {
        document.getElementById("wh-select-display")?.classList.remove("open");
        document.getElementById("wh-select-options")?.classList.remove("open");
    }
});

function populateWebhookDropdown() {
    const sel = document.getElementById("wh-app-select");
    const optionsContainer = document.getElementById("wh-select-options");
    if (!optionsContainer) return;

    // Reset hidden select
    sel.innerHTML = '<option value="" disabled selected>Select an App...</option>';

    // Reset custom dropdown
    optionsContainer.innerHTML = '';
    document.getElementById("wh-select-text").textContent = "Select an App...";

    // Add placeholder
    const placeholder = document.createElement("div");
    placeholder.className = "wh-select-option placeholder";
    placeholder.textContent = "Select an App...";
    placeholder.onclick = () => {
        document.getElementById("wh-select-display").classList.remove("open");
        document.getElementById("wh-select-options").classList.remove("open");
    };
    optionsContainer.appendChild(placeholder);

    cachedApps.forEach(app => {
        // Add to hidden select
        const opt = document.createElement("option");
        opt.value = app.appid;
        opt.innerText = app.name;
        sel.appendChild(opt);

        // Add to custom dropdown
        const div = document.createElement("div");
        div.className = "wh-select-option";
        div.dataset.value = app.appid;
        div.textContent = app.name;
        div.onclick = () => selectWhOption(app.appid, app.name);
        optionsContainer.appendChild(div);
    });
}

function loadWebhookSettings() {
    const appid = document.getElementById("wh-app-select").value;
    const app = cachedApps.find(a => a.appid === appid);
    if (!app) return;

    const conf = app.webhook_config || {};
    document.getElementById("wh-url").value = conf.url || "";
    document.getElementById("wh-enabled").checked = !!conf.enabled;
    document.getElementById("wh-show-app").checked = !!conf.show_app;
    document.getElementById("wh-show-hwid").checked = !!conf.show_hwid;
    document.getElementById("wh-show-exp").checked = !!conf.show_expiry;
}

async function saveWebhook() {
    const appid = document.getElementById("wh-app-select").value;
    if (!appid) return showPopup("Error", "Select an app first.");

    const config = {
        appid: appid,
        webhook_url: document.getElementById("wh-url").value,
        enabled: document.getElementById("wh-enabled").checked,
        show_app: document.getElementById("wh-show-app").checked,
        show_hwid: document.getElementById("wh-show-hwid").checked,
        show_expiry: document.getElementById("wh-show-exp").checked
    };

    try {
        await apiCall("/apps/webhook/save", config);
        showPopup("Success", "Webhook settings saved.");
        const app = cachedApps.find(a => a.appid === appid);
        if (app) app.webhook_config = config;
    } catch (e) { }
}



const CODE_CS = `using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;
using System;
using System.Net.Http;
using System.Threading.Tasks;

namespace LynxAuth
{
    public class Auth
    {
        private readonly string OwnerId;
        private readonly string Secret;
        private readonly string ApiUrl;
        private static readonly HttpClient client = new HttpClient();

        public Auth(string ownerid, string secret, string apiUrl = "https://api.lynxauth.qzz.io")
        {
            OwnerId = ownerid;
            Secret = secret;

            if (apiUrl.EndsWith("/"))
                apiUrl = apiUrl.TrimEnd('/');

            ApiUrl = $"\${apiUrl}/api/1.0/user_login";
        }

        private static string GetHwid()
        {
            var input = $"\${Environment.MachineName}-\${Environment.UserName}-\${Environment.ProcessorCount}";
            using (var sha256 = SHA256.Create())
            {
                var bytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(input));
                return BitConverter.ToString(bytes).Replace("-", "").ToLowerInvariant();
            }
        }

        public async Task<dynamic> Login(string username, string password)
        {
            var payload = new
            {
                ownerid = OwnerId,
                app_secret = Secret,
                username = username,
                password = password,
                hwid = GetHwid()
            };

            var json = JsonConvert.SerializeObject(payload);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            try
            {
                var response = await client.PostAsync(ApiUrl, content);
                var result = await response.Content.ReadAsStringAsync();
                return JsonConvert.DeserializeObject(result);
            }
            catch (HttpRequestException e)
            {
                return new { success = false, message = $"Connection Error: \${e.Message}" };
            }
        }
    }
}`;

const CODE_PY = `import requests
import platform
import hashlib

class LynxAuthAPI:
    def __init__(self, ownerid, secret, api_url="https://api.lynxauth.qzz.io"):
        if api_url.endswith("/"):
            api_url = api_url[:-1]
        
        self.ownerid = ownerid
        self.secret = secret
        self.api_url = f"{api_url}/api/1.0/user_login"

    def get_hwid(self):
        return hashlib.sha256(f"{platform.node()}-{platform.processor()}".encode()).hexdigest()

    def login(self, username, password):
        payload = {
            "ownerid": self.ownerid,
            "app_secret": self.secret,
            "username": username,
            "password": password,
            "hwid": self.get_hwid()
        }
        try:
            response = requests.post(self.api_url, json=payload)
            return response.json()
        except requests.exceptions.RequestException as e:
            return {"success": False, "message": f"Connection Error: {e}"}
`;

const CODE_CPP = `#include <iostream>
#include <string>
#include <curl/curl.h>

class LynxAuth {
private:
    std::string ownerid;
    std::string secret;
    std::string base_url = "https://api.lynxauth.qzz.io";

    static size_t WriteCallback(void* contents, size_t size, size_t nmemb, void* userp) {
        ((std::string*)userp)->append((char*)contents, size * nmemb);
        return size * nmemb;
    }

    std::string post_request(const std::string& endpoint, const std::string& json_data) {
        CURL* curl = curl_easy_init();
        std::string response;
        if (curl) {
            struct curl_slist* headers = NULL;
            headers = curl_slist_append(headers, "Content-Type: application/json");
            curl_easy_setopt(curl, CURLOPT_URL, (base_url + endpoint).c_str());
            curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
            curl_easy_setopt(curl, CURLOPT_POSTFIELDS, json_data.c_str());
            curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, WriteCallback);
            curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
            curl_easy_perform(curl);
            curl_easy_cleanup(curl);
        }
        return response;
    }

public:
    LynxAuth(std::string oid, std::string sec) : ownerid(oid), secret(sec) {}

    std::string user_login(std::string username, std::string password, std::string hwid) {
        std::string payload = "{\\"ownerid\\":\\"" + ownerid + "\\",\\"app_secret\\":\\"" + secret + 
                              "\\",\\"username\\":\\"" + username + "\\",\\"password\\":\\"" + password + 
                              "\\",\\"hwid\\":\\"" + hwid + "\\"}";
        return post_request("/api/1.0/user_login", payload);
    }
};`;

const CODE_JS = `class LynxAuth {
    constructor(ownerid, secret) {
        this.ownerid = ownerid;
        this.secret = secret;
        this.baseUrl = "https://api.lynxauth.qzz.io";
    }

    async userLogin(username, password, hwid) {
        const res = await fetch(\`\${this.baseUrl}/api/1.0/user_login\`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ownerid: this.ownerid,
                app_secret: this.secret,
                username: username,
                password: password,
                hwid: hwid
            })
        });
        return res.json();
    }
}`;

const CODE_SH = `curl -X POST "https://api.lynxauth.qzz.io/api/1.0/user_login" \\
  -H "Content-Type: application/json" \\
  -d '{"ownerid":"YOUR_OWNER_ID","app_secret":"YOUR_APP_SECRET","username":"YOUR_USERNAME","password":"YOUR_PASSWORD","hwid":"YOUR_HWID"}'

curl -X POST "https://api.lynxauth.qzz.io/api/1.0/license_login" \\
  -H "Content-Type: application/json" \\
  -d '{"ownerid":"YOUR_OWNER_ID","app_secret":"YOUR_APP_SECRET","license_key":"YOUR_LICENSE_KEY","hwid":"YOUR_HWID"}'`;

function switchTab(lang) {
    currentLang = lang;
    document.querySelectorAll(".t-tab").forEach(el => el.classList.remove("active"));
    document.getElementById(`tab-${lang}`).classList.add("active");
    updateCodeView();
}

function updateCodeView() {
    let code = CODE_CS;
    if (currentLang === 'cs') code = CODE_CS;
    else if (currentLang === 'py') code = CODE_PY;
    else if (currentLang === 'cpp') code = CODE_CPP;
    else if (currentLang === 'js') code = CODE_JS;
    else if (currentLang === 'sh') code = CODE_SH;

    document.getElementById("code-view").innerText = code;
}

function downloadCurrentCode() {
    const extMap = {
        'cs': 'cs',
        'py': 'py',
        'cpp': 'cpp',
        'js': 'js',
        'sh': 'sh'
    };
    const ext = extMap[currentLang] || 'txt';
    const text = document.getElementById("code-view").innerText;
    const blob = new Blob([text], { type: "text/plain" });
    const anchor = document.createElement("a");
    anchor.download = `auth.${ext}`;
    anchor.href = window.URL.createObjectURL(blob);
    anchor.target = "_blank";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
}

function downloadProject(type) {
    const filePath = type === 'cs' ? 'Examples/csharp_example.rar' : 'Examples/python_example.rar';
    const link = document.createElement("a");
    link.href = filePath;
    link.download = filePath.split('/').pop();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showPopup("Download Started", "Your project files are downloading...");
}

function copyToClipboard(text) {
    if (text === 'ownerid-display') text = document.getElementById('ownerid-display').innerText;

    navigator.clipboard.writeText(text).then(() => {
        showPopup("Copied", "Copied to clipboard!");
    });
}

function showPopup(title, msg) {
    const overlay = document.getElementById("popup-overlay");
    document.getElementById("popup-title").innerText = title;
    document.getElementById("popup-message").innerText = msg;

    const iconDiv = document.getElementById("popup-icon");
    if (title.toLowerCase().includes("error") || title.toLowerCase().includes("failed")) {
        iconDiv.innerHTML = '<i class="fa-solid fa-circle-exclamation" style="color:var(--danger)"></i>';
    } else {
        iconDiv.innerHTML = '<i class="fa-solid fa-circle-check" style="color:var(--success)"></i>';
    }

    overlay.style.display = "flex";
}

function closePopup() {
    document.getElementById("popup-overlay").style.display = "none";
}

function closePopupBackground(event) {
    if (event.target.id === "popup-overlay") {
        closePopup();
    }
}


function toggleMenu(uid, event) {
    event.stopPropagation();

    document.querySelectorAll('.action-menu').forEach(el => {
        if (el.id !== `menu-${uid}`) el.classList.remove('show');
    });

    const menu = document.getElementById(`menu-${uid}`);
    menu.classList.toggle('show');
}

document.addEventListener('click', function (e) {
    if (!e.target.closest('.action-btn-wrapper')) {
        document.querySelectorAll('.action-menu').forEach(el => el.classList.remove('show'));
    }
});

async function toggleHwidLock(uid, newState) {
    try {
        await apiCall("/users/action", {
            user_id: uid,
            action: "toggle_lock",
            lock_state: newState
        });
        showPopup("Success", newState ? "HWID Locked." : "HWID Unlocked.");
        loadUsersForSelectedApp();
    } catch (e) {
        showPopup("Error", "Failed to toggle lock.");
    }
}


async function resetHWID(uid) {
    if (!confirm("Are you sure you want to reset the HWID for this user?")) return;
    try {
        await apiCall("/users/action", { user_id: uid, action: "reset_hwid" });
        showPopup("Success", "HWID has been reset.");
        loadUsersForSelectedApp();
    } catch (e) {
        showPopup("Error", "Failed to reset HWID.");
    }
}


function openTimeModal(uid) {
    document.getElementById("time-user-id").value = uid;
    document.getElementById("time-modal").style.display = "flex";
    document.getElementById(`menu-${uid}`).classList.remove('show');
}

function closeTimeModal(e) {
    if (e.target.id === "time-modal") {
        document.getElementById("time-modal").style.display = "none";
    }
}

// Create User Modal Logic
async function openCreateUserModal() {
    const modal = document.getElementById("create-user-modal");
    const select = document.getElementById("cum-appid");

    // Pre-select the app if one is already chosen in the filter
    const activeApp = document.getElementById("user-app-filter").value;

    if (!cachedApps || cachedApps.length === 0) {
        select.innerHTML = '<option value="" disabled selected>Syncing apps...</option>';
        try {
            const data = await apiCall("/apps/list", { ownerid: currentOwnerId });
            cachedApps = data.apps;
        } catch (e) {
            return showPopup("Error", "Could not sync apps.");
        }
    }

    select.innerHTML = '<option value="" disabled selected>Select an App...</option>';
    cachedApps.forEach(app => {
        const opt = document.createElement("option");
        opt.value = app.appid;
        opt.innerText = app.name;
        // Auto-select the app that is currently active in the dashboard filter
        if (app.appid === activeApp) opt.selected = true;
        select.appendChild(opt);
    });

    // Reset other fields
    document.getElementById("cum-username").value = "";
    document.getElementById("cum-password").value = "";
    document.getElementById("cum-expiry").value = "";
    document.getElementById("cum-days").value = "0";

    modal.style.display = "flex";
}

function closeCreateUserModal(event) {
    if (event.target.id === "create-user-modal" || !event) {
        document.getElementById("create-user-modal").style.display = "none";
    }
}

async function submitCreateUserFromModal() {
    const appid = document.getElementById("cum-appid").value;
    const username = document.getElementById("cum-username").value;
    const password = document.getElementById("cum-password").value;
    const expiry = document.getElementById("cum-expiry").value;
    const days = document.getElementById("cum-days").value || 0;
    const btn = document.getElementById("cum-btn");

    if (!appid) return showPopup("Error", "Please select an app.");
    if (!username || !password) return showPopup("Error", "Username & Password required.");

    const originalText = btn.innerText;
    btn.innerText = "Creating...";
    btn.disabled = true;

    const payload = {
        ownerid: currentOwnerId,
        appid: appid,
        username: username,
        password: password,
        days: parseInt(days)
    };

    if (expiry) payload.expire_str = new Date(expiry).toISOString();

    try {
        await apiCall("/users/create", payload);
        showPopup("Success", `User ${username} created!`);

        document.getElementById("cum-username").value = "";
        document.getElementById("cum-password").value = "";
        document.getElementById("cum-expiry").value = "";
        document.getElementById("cum-days").value = "0";
        document.getElementById("create-user-modal").style.display = "none";

        const currentFilter = document.getElementById("user-app-filter").value;
        if (currentFilter === appid) {
            loadUsersForSelectedApp();
        }
    } catch (e) {

    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

async function submitTimeUpdate() {
    const uid = document.getElementById("time-user-id").value;
    const days = parseInt(document.getElementById("time-input").value);

    if (isNaN(days)) return showPopup("Error", "Invalid days.");

    try {
        await apiCall("/users/action", {
            user_id: uid,
            action: "add_time",
            value: days
        });
        document.getElementById("time-modal").style.display = "none";
        showPopup("Success", "Subscription updated.");
        loadUsersForSelectedApp();
    } catch (e) {
        showPopup("Error", "Failed to update time.");
    }
}


function openSettingsModal(uid, username, expiresAt, isLocked) {
    document.getElementById("usm-uid").value = uid;
    document.getElementById("usm-title").innerText = "Settings: " + username;


    document.getElementById("usm-lock-toggle").checked = isLocked;


    if (expiresAt) {
        document.getElementById("usm-date").value = formatLocalDateForInput(expiresAt);
    } else {
        document.getElementById("usm-date").value = "";
    }

    document.getElementById("user-settings-modal").style.display = "flex";
}

function closeSettingsModal(e) {
    if (e.target.id === "user-settings-modal") {
        document.getElementById("user-settings-modal").style.display = "none";
    }
}


async function updateLockStateFromModal() {
    const uid = document.getElementById("usm-uid").value;
    const isLocked = document.getElementById("usm-lock-toggle").checked;

    try {
        await apiCall("/users/action", {
            user_id: uid,
            action: "toggle_lock",
            lock_state: isLocked
        });

        loadUsersForSelectedApp();
    } catch (e) {
        showPopup("Error", "Failed to update lock state.");
    }
}


async function resetHwidFromModal() {
    const uid = document.getElementById("usm-uid").value;
    if (!confirm("Are you sure you want to reset HWID?")) return;

    try {
        await apiCall("/users/action", { user_id: uid, action: "reset_hwid" });
        showPopup("Success", "HWID has been reset.");
        loadUsersForSelectedApp();
    } catch (e) {
        showPopup("Error", "Failed to reset HWID.");
    }
}


async function saveExpiryFromModal() {
    const uid = document.getElementById("usm-uid").value;
    const dateStr = document.getElementById("usm-date").value;

    if (!dateStr) return showPopup("Error", "Please select a date.");

    try {
        await apiCall("/users/action", {
            user_id: uid,
            action: "set_expiry",
            expire_str: new Date(dateStr).toISOString()
        });
        showPopup("Success", "Expiration date updated.");
        loadUsersForSelectedApp();
        document.getElementById("user-settings-modal").style.display = "none";
    } catch (e) {
        showPopup("Error", "Failed to update date.");
    }
}

let currentAppLicenses = [];

function filterLicenses() {
    const query = document.getElementById("license-search").value.toLowerCase();
    const filtered = currentAppLicenses.filter(l => l.license_key.toLowerCase().includes(query));
    renderLicenses(filtered);
}

function toggleLicenseDropdown() {
    const container = document.getElementById("license-dropdown-options-list");
    const trigger = document.querySelector("#custom-license-dropdown .dropdown-trigger");
    container.classList.toggle("open");
    trigger.classList.toggle("active");
}

function selectLicenseAppOption(appid, appName) {
    const textEl = document.getElementById("license-dropdown-selected-text");
    textEl.innerText = appName;
    textEl.style.color = "#fff";
    document.getElementById("license-app-filter").value = appid;
    toggleLicenseDropdown();
    loadLicensesForSelectedApp();
}

async function loadLicensesViewDropdown() {
    const listContainer = document.getElementById("license-dropdown-options-list");
    const hiddenInput = document.getElementById("license-app-filter");
    const triggerText = document.getElementById("license-dropdown-selected-text");

    if (!cachedApps || cachedApps.length === 0) {
        try {
            const data = await apiCall("/apps/list", { ownerid: currentOwnerId });
            cachedApps = data.apps;
        } catch (e) {
            return;
        }
    }

    listContainer.innerHTML = "";
    const currentVal = hiddenInput.value;
    const currentApp = cachedApps.find(a => a.appid === currentVal);
    if (currentApp) {
        triggerText.innerText = currentApp.name;
        triggerText.style.color = "#fff";
    } else {
        triggerText.innerText = "Select Application";
        triggerText.style.color = "#888";
    }
    cachedApps.forEach(app => {
        const div = document.createElement("div");
        div.className = "dropdown-option";
        div.innerHTML = `<span>${app.name}</span> <i class="fa-solid fa-check"></i>`;
        div.onclick = () => {
            selectLicenseAppOption(app.appid, app.name);
        };
        listContainer.appendChild(div);
    });
}

async function loadLicensesForSelectedApp() {
    const appid = document.getElementById("license-app-filter").value;
    const container = document.getElementById("licenses-table-body");
    if (!appid) {
        container.innerHTML = '<div class="empty-state">Select an application to view licenses.</div>';
        return;
    }
    container.innerHTML = '<div class="empty-state">Loading licenses...</div>';
    try {
        const data = await apiCall("/licenses/list", { appid: appid });
        currentAppLicenses = data.licenses;
        renderLicenses(currentAppLicenses);
    } catch (e) {
        container.innerHTML = '<div class="empty-state">Failed to load licenses.</div>';
    }
}

function renderLicenses(licenses) {
    const container = document.getElementById("licenses-table-body");
    if (licenses.length === 0) {
        container.innerHTML = '<div class="empty-state">No licenses found.</div>';
        return;
    }
    container.innerHTML = "";
    licenses.forEach(l => {
        let datePart = "Never";
        if (l.expires_at) datePart = formatLocalDateOnly(l.expires_at);
        const isLocked = l.hwid_locked !== false;
        const hwidDisplay = l.hwid ? "Linked" : "Not Linked";
        const hwidColor = l.hwid ? "#10b981" : "#666";
        const row = document.createElement("div");
        row.className = "user-list-item";
        row.innerHTML = `
            <div style="flex:1.5; font-weight:500; display:flex; gap:8px; align-items:center; font-family:var(--font-code); font-size:0.85rem;">
                ${l.license_key}
                <i class="fa-solid fa-copy copy-icon" style="font-size:0.75rem;" onclick="copyToClipboard('${l.license_key}')"></i>
            </div>
            <div style="flex:1.5; font-size:0.8rem; display:flex; gap:8px; align-items:center;">
                <span style="color:${hwidColor};">● ${hwidDisplay}</span>
                ${isLocked ? '<i class="fa-solid fa-lock" style="font-size:0.7rem; color:var(--primary);" title="Locked"></i>' : '<i class="fa-solid fa-lock-open" style="font-size:0.7rem; color:#666;" title="Unlocked"></i>'}
            </div>
            <div style="flex:1.5; font-size:0.85rem; color:#888;">${datePart}</div>
            <div style="width:120px; text-align:right;">
                <div class="action-btn-wrapper action-container">
                    <button class="btn-icon" onclick="openLicenseSettingsModal('${l.id}', '${l.license_key}', ${isLocked}, '${l.expires_at || ''}')">
                        <i class="fa-solid fa-ellipsis-vertical"></i>
                    </button>
                    <button class="btn-danger-sm" style="padding:6px 10px;" onclick="deleteLicense('${l.id}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
        container.appendChild(row);
    });
}

function openCreateLicenseModal() {
    const sel = document.getElementById("clm-appid");
    sel.innerHTML = '<option value="" disabled selected>Select an App...</option>';
    cachedApps.forEach(app => {
        const opt = document.createElement("option");
        opt.value = app.appid;
        opt.innerText = app.name;
        sel.appendChild(opt);
    });
    const currentFilter = document.getElementById("license-app-filter").value;
    if (currentFilter) sel.value = currentFilter;
    const now = new Date();
    now.setMonth(now.getMonth() + 1);
    const dateStr = now.toISOString().slice(0, 16);
    document.getElementById("clm-expiry").value = dateStr;
    document.getElementById("clm-days").value = "0";
    document.getElementById("clm-key").value = "";
    document.getElementById("create-license-modal").style.display = "flex";
}

function closeCreateLicenseModal(e) {
    if (e.target.id === "create-license-modal") {
        document.getElementById("create-license-modal").style.display = "none";
    }
}

function generateRandomLicenseField() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let key = "LYNX-";
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            key += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        if (i < 3) key += "-";
    }
    document.getElementById("clm-key").value = key;
}

async function submitCreateLicenseFromModal() {
    const appid = document.getElementById("clm-appid").value;
    let key = document.getElementById("clm-key").value;
    const expiry = document.getElementById("clm-expiry").value;
    const days = parseInt(document.getElementById("clm-days").value);
    if (!appid) return showPopup("Error", "Select an application.");
    if (!key) {
        generateRandomLicenseField();
        key = document.getElementById("clm-key").value;
    }
    const btn = document.getElementById("clm-btn");
    const originalText = btn.innerText;
    btn.innerText = "Creating...";
    btn.disabled = true;
    const payload = {
        ownerid: currentOwnerId,
        appid: appid,
        license_key: key,
        days: days
    };
    if (expiry) payload.expire_str = new Date(expiry).toISOString();
    try {
        await apiCall("/licenses/create", payload);
        showPopup("Success", `License ${key} generated!`);
        document.getElementById("clm-key").value = "";
        document.getElementById("clm-expiry").value = "";
        document.getElementById("clm-days").value = "0";
        document.getElementById("create-license-modal").style.display = "none";
        loadApps(true);
        const currentFilter = document.getElementById("license-app-filter").value;
        if (currentFilter === appid) {
            loadLicensesForSelectedApp();
        }
    } catch (e) {
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

function openLicenseSettingsModal(id, key, isLocked, expiresAt) {
    document.getElementById("lsm-id").value = id;
    document.getElementById("lsm-title").innerText = "License: " + key;
    document.getElementById("lsm-lock-toggle").checked = isLocked;
    if (expiresAt) {
        document.getElementById("lsm-date").value = formatLocalDateForInput(expiresAt);
    } else {
        document.getElementById("lsm-date").value = "";
    }
    document.getElementById("license-settings-modal").style.display = "flex";
}

function closeLicenseSettingsModal(e) {
    if (e.target.id === "license-settings-modal") {
        document.getElementById("license-settings-modal").style.display = "none";
    }
}

async function updateLicenseLockStateFromModal() {
    const id = document.getElementById("lsm-id").value;
    const isLocked = document.getElementById("lsm-lock-toggle").checked;
    try {
        await apiCall("/licenses/action", {
            license_id: id,
            action: "toggle_lock",
            lock_state: isLocked
        });
        loadLicensesForSelectedApp();
    } catch (e) {
        showPopup("Error", "Failed to update lock state.");
    }
}

async function resetLicenseHwidFromModal() {
    const id = document.getElementById("lsm-id").value;
    if (!confirm("Are you sure you want to reset HWID for this license?")) return;
    try {
        await apiCall("/licenses/action", { license_id: id, action: "reset_hwid" });
        showPopup("Success", "HWID has been reset.");
        loadLicensesForSelectedApp();
    } catch (e) {
        showPopup("Error", "Failed to reset HWID.");
    }
}

async function saveLicenseExpiryFromModal() {
    const id = document.getElementById("lsm-id").value;
    const dateStr = document.getElementById("lsm-date").value;
    if (!dateStr) return showPopup("Error", "Please select a date.");
    try {
        await apiCall("/licenses/action", {
            license_id: id,
            action: "set_expiry",
            expire_str: new Date(dateStr).toISOString()
        });
        showPopup("Success", "Expiration date updated.");
        loadLicensesForSelectedApp();
        document.getElementById("license-settings-modal").style.display = "none";
    } catch (e) {
        showPopup("Error", "Failed to update date.");
    }
}

async function deleteLicense(licenseId) {
    if (!confirm("Delete this license?")) return;
    try {
        await apiCall("/licenses/delete", { license_id: licenseId });
        loadLicensesForSelectedApp();
        loadApps(true);
    } catch (e) { }
}

function triggerBgUpload() {
    document.getElementById("bg-upload-input").click();
}

function handleBgUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        localStorage.setItem("dashboard_bg", e.target.result);
        applyCustomBg();
    };
    reader.readAsDataURL(file);
}

function resetCustomBg() {
    localStorage.removeItem("dashboard_bg");
    applyCustomBg();
}

function updateBgBlur(val) {
    localStorage.setItem("dashboard_bg_blur", val);
    const bgEl = document.getElementById("dashboard-custom-bg");
    if (bgEl) {
        bgEl.style.filter = "blur(" + val + "px) brightness(0.6)";
    }
}

function applyCustomBg() {
    const bgEl = document.getElementById("dashboard-custom-bg");
    if (!bgEl) return;
    const savedBg = localStorage.getItem("dashboard_bg");
    if (savedBg) {
        bgEl.style.backgroundImage = "url(" + savedBg + ")";
        bgEl.style.opacity = "0.6";
        const savedBlur = localStorage.getItem("dashboard_bg_blur") || "20";
        bgEl.style.filter = "blur(" + savedBlur + "px) brightness(0.6)";
        const slider = document.getElementById("bg-blur-slider");
        if (slider) slider.value = savedBlur;
    } else {
        bgEl.style.opacity = "0";
        bgEl.style.backgroundImage = "none";
    }
}

function openBgCustomizerModal() {
    const modal = document.getElementById("bg-customizer-modal");
    if (modal) {
        modal.style.display = "flex";
        const savedBlur = localStorage.getItem("dashboard_bg_blur") || "20";
        const slider = document.getElementById("bg-blur-slider");
        if (slider) slider.value = savedBlur;
    }
}

function closeBgCustomizerModal(event) {
    const modal = document.getElementById("bg-customizer-modal");
    if (modal && event.target === modal) {
        modal.style.display = "none";
    }
}

async function redeemGiftCode() {
    const codeInput = document.getElementById("gift-code-input");
    const code = codeInput.value.trim();
    if (!code) return showPopup("Error", "Please enter a gift code.");
    try {
        const res = await apiCall("/seller/redeem_code", {
            ownerid: currentOwnerId,
            code: code
        });
        if (res.status === "success") {
            codeInput.value = "";
            await syncSeller(auth.currentUser);
            showPopup("Success", "Gift code redeemed! Your subscription has been upgraded.");
        }
    } catch (e) {
        showPopup("Error", e.message || "Invalid or already used gift code.");
    }
}
