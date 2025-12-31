
const firebaseConfig = {
    apiKey: "AIzaSyAdxgaXA0cJBESZnA679Ej2i0zo3e-40BA",
    authDomain: "lynx-auth-d17dd.firebaseapp.com",
    projectId: "lynx-auth-d17dd",
    storageBucket: "lynx-auth-d17dd.firebasestorage.app",
    messagingSenderId: "839612819820",
    appId: "1:839612819820:web:7576f107b7af280d776b49",
    measurementId: "G-RLZC3MPQL0"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const API_URL = 'https://lynxauth.onrender.com';
let currentOwnerId = null;

// --- popup msg ---
function showToast(msg, type='success') {
    const overlay = document.getElementById('popup-overlay');
    const title = document.getElementById('popup-title');
    const message = document.getElementById('popup-message');
    const iconArea = document.getElementById('popup-icon');

    // reset icon
    iconArea.innerHTML = '';
    
    if(type === 'success') {
        title.innerText = 'Success!';
        title.style.color = 'var(--success)';
        iconArea.innerHTML = '<i class="fa-regular fa-circle-check" style="color:var(--success)"></i>';
    } else {
        title.innerText = 'Error';
        title.style.color = 'var(--danger)';
        iconArea.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:var(--danger)"></i>';
    }

    message.innerText = msg;
    overlay.style.display = 'flex';
}

function closePopup() {
    document.getElementById('popup-overlay').style.display = 'none';
}

function closePopupBackground(e) {
    if(e.target.id === 'popup-overlay') {
        closePopup();
    }
}

// --- STATUS BADGE LOGIC ---
function setBackendStatus(online) {
    const badge = document.getElementById('status-badge');
    const text = document.getElementById('status-text');
    if(online) {
        badge.classList.remove('offline');
        text.innerText = "Online";
    } else {
        badge.classList.add('offline');
        text.innerText = "Backend Offline";
    }
}

// --- auth ---
auth.onAuthStateChanged(async (u) => {
    if(u) {
        document.getElementById('auth-view').style.display='none';
        document.getElementById('dashboard-view').style.display='grid';
        document.getElementById('sidebar-email').innerText = u.email;
        await syncUser(u);
    } else {
        document.getElementById('dashboard-view').style.display='none';
        document.getElementById('auth-view').style.display='flex';
    }
});

async function syncUser(u) {
    try {
        const res = await fetch(`${API_URL}/auth/sync`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({firebase_uid:u.uid, email:u.email})});
        const data = await res.json();
        if(data.status==='success') {
            currentOwnerId = data.ownerid;
            document.getElementById('ownerid-display').innerText = currentOwnerId;
            setBackendStatus(true);
            loadApps();
            updateCodeView(); 
        }
    } catch(e) { 
        setBackendStatus(false);
    }
}

async function apiCall(ep, body) {
    try {
        const res = await fetch(API_URL+ep, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
        setBackendStatus(true);
        return await res.json();
    } catch(e) { 
        setBackendStatus(false); 
        return null; 
    }
}

// --- apps ui ---
async function createApp() {
    const name = document.getElementById('app-name-input').value;
    if(!name) return showToast("Name required", "danger");
    const res = await apiCall('/apps/create', {ownerid:currentOwnerId, app_name:name});
    if(res && res.status==='success') {
        showToast("App Created Successfully");
        document.getElementById('new-app-panel').style.display='none';
        loadApps();
    }
}

let cachedApps = [];


async function loadApps() {
    const list = document.getElementById('apps-list');
    list.innerHTML = '<div style="text-align:center; padding:20px; color:#666;">Loading...</div>';
    
    const res = await apiCall('/apps/list', {ownerid:currentOwnerId});
    list.innerHTML = '';
    
    if(res && res.apps) {
        cachedApps = res.apps; 
        

        const sel = document.getElementById('wh-app-select');
        sel.innerHTML = '<option value="" disabled selected>Select an App...</option>';
        cachedApps.forEach(a => {
            const opt = document.createElement('option');
            opt.value = a.appid;
            opt.innerText = a.name;
            sel.appendChild(opt);
        });

        document.getElementById('stat-total-apps').innerText = res.apps.length;
        

        res.apps.forEach(app => {

             const div = document.createElement('div');
             div.className = 'app-row';
             div.innerHTML = `
                <div class="app-row-header" onclick="this.parentElement.classList.toggle('expanded')">
                    <div class="app-title"><i class="fa-solid fa-cube"></i> ${app.name}</div>
                    <div style="display:flex; align-items:center;">
                        <span class="app-meta">ID: ${app.appid.substring(0,8)}...</span>
                        <i class="fa-solid fa-chevron-down" style="color:#555"></i>
                    </div>
                </div>
                <div class="app-row-details">
                    <div class="secret-box">
                        <span>${app.app_secret}</span>
                        <i class="fa-solid fa-copy copy-icon" onclick="copyToClipboard('${app.app_secret}', true)"></i>
                    </div>
                    <div style="display:flex; gap:10px; margin-bottom:20px; align-items:center; flex-wrap:wrap;">
                        <input id="u-name-${app.appid}" class="auth-input" style="margin:0; background:#111; flex:1; min-width:120px;" placeholder="Username">
                        <input id="u-pass-${app.appid}" class="auth-input" style="margin:0; background:#111; flex:1; min-width:120px;" placeholder="Password">
                        <input type="datetime-local" id="u-exp-${app.appid}" class="auth-input" style="margin:0; background:#111; color:#fff; flex:1; min-width:160px;">
                        <button class="btn-primary-sm" onclick="createUser('${app.appid}')">Create User</button>
                    </div>
                    <div style="display:flex; justify-content:space-between; border-top:1px solid #222; padding-top:15px;">
                        <button class="btn-ghost-sm" onclick="openUsersModal('${app.appid}', '${app.name}')">Manage Users</button>
                        <button class="btn-danger-sm" onclick="deleteApp('${app.appid}')">Delete App</button>
                    </div>
                </div>
            `;
            list.appendChild(div);
        });
    }
}


function loadWebhookSettings() {
    const appid = document.getElementById('wh-app-select').value;
    const app = cachedApps.find(a => a.appid === appid);
    
    if(app && app.webhook_config) {
        const c = app.webhook_config;
        document.getElementById('wh-url').value = c.url || '';
        document.getElementById('wh-enabled').checked = c.enabled || false;
        document.getElementById('wh-show-hwid').checked = c.show_hwid || false;
        document.getElementById('wh-show-app').checked = c.show_app || false;
        document.getElementById('wh-show-exp').checked = c.show_expiry || false;
    } else {
        document.getElementById('wh-url').value = '';
        document.querySelectorAll('#webhooks-content input[type="checkbox"]').forEach(i => i.checked = false);
    }
}

async function saveWebhook() {
    const appid = document.getElementById('wh-app-select').value;
    if(!appid) return showToast("Select an app first", "danger");
    
    const body = {
        appid: appid,
        webhook_url: document.getElementById('wh-url').value,
        enabled: document.getElementById('wh-enabled').checked,
        show_hwid: document.getElementById('wh-show-hwid').checked,
        show_app: document.getElementById('wh-show-app').checked,
        show_expiry: document.getElementById('wh-show-exp').checked
    };
    
    const res = await apiCall('/apps/webhook/save', body);
    if(res.status === 'success') {
        showToast("Webhook Configuration Saved");

        const app = cachedApps.find(a => a.appid === appid);
        if(app) app.webhook_config = { url: body.webhook_url, enabled: body.enabled, show_hwid: body.show_hwid, show_app: body.show_app, show_expiry: body.show_expiry };
    }
}

async function createUser(appid) {
    const u = document.getElementById(`u-name-${appid}`).value;
    const p = document.getElementById(`u-pass-${appid}`).value;
    const exp = document.getElementById(`u-exp-${appid}`).value; // specific time
    
    if(!u || !p) return showToast("Enter credentials", "danger");
    

    const res = await apiCall('/users/create', {
        ownerid: currentOwnerId, 
        appid: appid, 
        username: u, 
        password: p, 
        days: 30, 
        expire_str: exp 
    });
    
    if(res.status==='success') showToast("User Created Successfully");
}

async function deleteApp(appid) {
    if(!confirm("Delete app?")) return;
    await apiCall('/apps/delete', {appid});
    loadApps();
}

async function openUsersModal(appid, name) {
    document.getElementById('manage-users-modal').style.display='flex';
    const cont = document.getElementById('user-list-container');
    cont.innerHTML = 'Loading...';
    const res = await apiCall('/users/list', {appid});
    cont.innerHTML = '';
    if(res.users) {
        res.users.forEach(u => {
            const div = document.createElement('div');
            div.className = 'user-row';
            div.innerHTML = `<div><div style="font-weight:500">${u.username}</div><div style="font-size:0.8rem; color:#666;">Expires: ${u.expires_at.replace('T', ' ')}</div></div><button class="icon-danger" onclick="deleteUser('${u.id}', '${appid}', '${name}')"><i class="fa-solid fa-trash"></i></button>`;
            cont.appendChild(div);
        });
    }
}
async function deleteUser(uid, aid, name) { await apiCall('/users/delete', {user_id:uid}); openUsersModal(aid, name); }



// --- code example ---

let currentLang = 'cs';
const getCode = (lang) => {
    const oid = currentOwnerId || "YOUR_OWNER_ID";
    if(lang === 'cs') return `using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;
using System;
using System.Net.Http;
using System.Threading.Tasks;

namespace LynxAuth
{
    /// <summary>
    /// LynxAuth authentication handler
    /// </summary>
    public class Auth
    {
        private readonly string OwnerId;
        private readonly string Secret;
        private readonly string ApiUrl;
        private static readonly HttpClient client = new HttpClient();

        public Auth(string ownerid, string secret, string apiUrl = "https://lynxauth.onrender.com")
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

    return `import requests
import platform
import hashlib

class LynxAuthAPI:
    def __init__(self, ownerid, secret, api_url="https://lynxauth.onrender.com"):
        if api_url.endswith("/"):
            api_url = api_url[:-1]
        
        self.ownerid = ownerid
        self.secret = secret
        self.api_url = f"https://lynxauth.onrender.com/api/1.0/user_login"

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
            return {"success": False, "message": f"Connection Error: {e}"}`;
};

function switchTab(lang) {
    currentLang = lang;
    document.querySelectorAll('.t-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${lang}`).classList.add('active');
    updateCodeView();
}

function updateCodeView() {
    document.getElementById('code-view').innerText = getCode(currentLang);
}

function downloadCurrentCode() {
    const text = getCode(currentLang);
    const blob = new Blob([text], {type: "text/plain"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentLang === 'cs' ? 'auth.cs' : 'auth.py';
    a.click();
}

function downloadProject(type) {
    const fileName = type === 'cs' ? 'csharp_example.rar' : 'python_example.rar';
    const filePath = `Examples/${fileName}`;
    
    const a = document.createElement('a');
    a.href = filePath;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// --- UTILS ---
function copyToClipboard(txt, isRaw=false) {
    const val = isRaw ? txt : document.getElementById(txt).innerText;
    navigator.clipboard.writeText(val);
    showToast("Copied to clipboard!");
}
function emailLogin() { auth.signInWithEmailAndPassword(document.getElementById('login-email').value, document.getElementById('login-password').value).catch(e=>showToast(e.message,'danger')); }
function emailRegister() { auth.createUserWithEmailAndPassword(document.getElementById('reg-email').value, document.getElementById('reg-password').value).catch(e=>showToast(e.message,'danger')); }
function googleLogin() { auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); }
function logout() { auth.signOut().then(()=>location.reload()); }
function deleteAccount() { if(confirm("DELETE ACCOUNT?")) apiCall('/seller/delete', {ownerid:currentOwnerId}).then(()=>auth.currentUser.delete().then(()=>location.reload())); }
window.showRegisterForm = () => { document.getElementById('login-form').style.display='none'; document.getElementById('register-form').style.display='block'; };
window.showLoginForm = () => { document.getElementById('register-form').style.display='none'; document.getElementById('login-form').style.display='block'; };
window.closeModal = () => document.getElementById('manage-users-modal').style.display='none';
window.showView = (v) => { 
    document.querySelectorAll('.content-view').forEach(e=>e.classList.remove('active')); 
    document.getElementById(v+'-content').classList.add('active'); 
    document.querySelectorAll('.nav-btn-side').forEach(e=>e.classList.remove('active')); 
    
    let navId = 'nav-dash';
    if(v === 'applications') navId = 'nav-apps';
    else if(v === 'integration') navId = 'nav-integration';
    else if(v === 'instructions') navId = 'nav-instructions';
    else if(v === 'webhooks') navId = 'nav-webhooks';
    
    document.getElementById(navId).classList.add('active');
};
window.toggleMobileMenu = () => { 
    document.querySelector('.sidebar').classList.toggle('open');
    document.getElementById('sidebar-overlay').classList.toggle('open');
};

