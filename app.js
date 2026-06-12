/* ============================================
   GoFive Case Ticket — Application Logic
   ============================================ */

// --- Constants ---
const GOOGLE_SHEET_ID = '1YLuRwlFbJeSItsdDL9hv1NcxxpqGkEvCrpshl465PEU';
const GOOGLE_SHEET_CSV_URL = `/proxy/sheet`;
const TOKEN_LIFETIME_MS = 60 * 60 * 1000; // 60 minutes in milliseconds

// --- State ---
let accessToken = '';
let tokenFetchedAt = null; // Date object when token was fetched
let credentials = null; // { subscriptionKey, clientId, clientSecret }
const activityNos = [];
const dealNos = [];

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    initDateFields();
    initTagInputs();
    initForms();
    createParticles();
    startApp();
});

// --- Main startup flow ---
async function startApp() {
    updateConnectionStatus('กำลังโหลด Credentials...', false, 'loading');

    // 1. Fetch credentials from Google Sheet
    const success = await fetchCredentialsFromSheet();
    if (!success) return;

    // 2. Display credentials info
    displayCredentials();

    // 3. Auto-fetch token
    updateConnectionStatus('กำลังดึง Token...', false, 'loading');
    await fetchToken();
}

// --- Fetch Credentials from Google Sheet ---
async function fetchCredentialsFromSheet() {
    try {
        const response = await fetch(GOOGLE_SHEET_CSV_URL);
        const csvText = await response.text();

        // Check if the response is an HTML page (e.g., 404 Not Found, or Google Login page due to permissions)
        if (csvText.trim().toLowerCase().startsWith('<!doctype') || csvText.trim().toLowerCase().startsWith('<html')) {
            updateConnectionStatus('ไม่พบ CSV', false, 'error');
            document.getElementById('authStatusText').textContent = 'พบหน้า HTML แทนที่จะเป็นไฟล์ CSV (อาจจะลืมตั้งค่า Proxy หรือ Sheet ติดสิทธิ์การเข้าถึง)';
            showToast('พบไฟล์ HTML: โปรดตรวจสอบการตั้งค่า /proxy/sheet บน Server จริง', 'error');
            console.error("Received HTML instead of CSV:", csvText.substring(0, 500));
            return false;
        }

        // Check if the response is JSON (like an API error)
        if (csvText.trim().startsWith('{') || csvText.trim().startsWith('[')) {
            updateConnectionStatus('ได้รับ JSON', false, 'error');
            document.getElementById('authStatusText').textContent = 'พบข้อมูล JSON (อาจจะเป็น Error จาก Server): ' + csvText.substring(0, 100);
            showToast('พบไฟล์ JSON แทนที่จะเป็น CSV', 'error');
            return false;
        }

        // Parse CSV
        const rows = parseCSV(csvText);
        
        // Find the first row that actually contains some data
        let dataRow = null;
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const cleanRow = row.map(cell => cell.replace(/\r/g, '').trim());
            
            // If the row has at least 3 columns and they are not all empty
            if (cleanRow.length >= 3 && (cleanRow[0] || cleanRow[1] || cleanRow[2])) {
                const combined = cleanRow.join('').toLowerCase();
                // Skip the row if it looks exactly like the header row
                if (combined.includes('subscription') || combined.includes('clientid') || combined.includes('clientsecret') || combined.includes('client_id')) {
                    continue;
                }
                dataRow = cleanRow;
                break;
            }
        }

        if (!dataRow) {
            updateConnectionStatus('ไม่พบข้อมูล', false, 'error');
            const preview = csvText.length > 50 ? csvText.substring(0, 50) + '...' : csvText;
            document.getElementById('authStatusText').textContent = `ดึงข้อมูลมาได้แต่ไม่ตรงรูปแบบ CSV (ข้อมูลที่ได้: ${preview})`;
            showToast('ไม่พบแถวข้อมูล Credentials ที่ถูกต้อง', 'error');
            console.error("Raw CSV Response:", csvText);
            
            // Show it in the response panel so user can see what's actually returned
            if (typeof showResponse === 'function') {
                showResponse('ข้อมูลที่ได้รับจาก /proxy/sheet', { rawText: csvText }, true);
            }
            return false;
        }

        credentials = {
            subscriptionKey: dataRow[0] || '',
            clientId: dataRow[1] || '',
            clientSecret: dataRow[2] || ''
        };

        if (!credentials.subscriptionKey || !credentials.clientId || !credentials.clientSecret) {
            updateConnectionStatus('Credentials ไม่ครบ', false, 'error');
            document.getElementById('authStatusText').textContent = `ข้อมูลไม่ครบ: (Key=${credentials.subscriptionKey ? 'มี' : 'ไม่มี'}, ID=${credentials.clientId ? 'มี' : 'ไม่มี'}, Secret=${credentials.clientSecret ? 'มี' : 'ไม่มี'})`;
            showToast('ข้อมูล Credentials ขาดหายไปบางส่วน', 'error');
            return false;
        }

        showToast('โหลด Credentials จาก Google Sheet สำเร็จ', 'info');
        return true;

    } catch (err) {
        updateConnectionStatus('โหลด Sheet ล้มเหลว', false, 'error');
        document.getElementById('authStatusText').textContent = `โหลด Google Sheet ล้มเหลว: ${err.message}`;
        showToast(`โหลด Google Sheet ล้มเหลว: ${err.message}`, 'error');
        return false;
    }
}

// --- Parse CSV (handles quoted fields) ---
function parseCSV(text) {
    const rows = [];
    const lines = text.trim().split('\n');
    for (const line of lines) {
        const row = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (inQuotes) {
                if (ch === '"' && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else if (ch === '"') {
                    inQuotes = false;
                } else {
                    current += ch;
                }
            } else {
                if (ch === '"') {
                    inQuotes = true;
                } else if (ch === ',') {
                    row.push(current);
                    current = '';
                } else {
                    current += ch;
                }
            }
        }
        row.push(current);
        rows.push(row);
    }
    return rows;
}

// --- Display Credentials in the panel ---
function displayCredentials() {
    if (!credentials) return;

    document.getElementById('credSubKey').textContent = maskString(credentials.subscriptionKey, 8);
    document.getElementById('credClientId').textContent = maskString(credentials.clientId, 12);
    document.getElementById('credClientSecret').textContent = '••••••••••••••••••••';
}

function maskString(str, showChars) {
    if (str.length <= showChars) return str;
    return str.substring(0, showChars) + '••••••••';
}

// --- Token Expiry Check ---
function isTokenValid() {
    if (!accessToken || !tokenFetchedAt) return false;
    const elapsed = Date.now() - tokenFetchedAt.getTime();
    return elapsed < TOKEN_LIFETIME_MS;
}

function getTokenRemainingMinutes() {
    if (!tokenFetchedAt) return 0;
    const elapsed = Date.now() - tokenFetchedAt.getTime();
    const remaining = TOKEN_LIFETIME_MS - elapsed;
    return Math.max(0, Math.ceil(remaining / 60000));
}

function getTokenExpiryTime() {
    if (!tokenFetchedAt) return null;
    return new Date(tokenFetchedAt.getTime() + TOKEN_LIFETIME_MS);
}

// --- Ensure valid token (auto-refresh if expired) ---
async function ensureValidToken() {
    if (isTokenValid()) {
        return true; // Token is still valid
    }

    // Token expired or not yet fetched
    showToast('Token หมดอายุ — กำลังดึงใหม่...', 'info');
    updateConnectionStatus('กำลังดึง Token ใหม่...', false, 'loading');
    return await fetchToken();
}

// --- Fetch Token ---
async function fetchToken() {
    if (!credentials) {
        showToast('ยังไม่มี Credentials — กำลังโหลดจาก Google Sheet...', 'info');
        const loaded = await fetchCredentialsFromSheet();
        if (!loaded) return false;
        displayCredentials();
    }

    try {
        const body = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: credentials.clientId,
            client_secret: credentials.clientSecret
        });

        const response = await fetch('/proxy/api/authorization/connect/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Ocp-Apim-Subscription-Key': credentials.subscriptionKey
            },
            body: body.toString()
        });

        const data = await response.json();

        if (response.ok && data.access_token) {
            accessToken = data.access_token;
            tokenFetchedAt = new Date();

            // Show token result
            document.getElementById('tokenValue').textContent = accessToken;
            document.getElementById('tokenResult').classList.remove('hidden');

            // Update UI
            const expiryTime = getTokenExpiryTime();
            const remaining = getTokenRemainingMinutes();
            updateConnectionStatus('Authenticated', true, 'success');
            document.getElementById('authTokenBadge').classList.remove('hidden');
            document.getElementById('tokenBadgeText').textContent = `Token Active (${remaining} นาที)`;
            document.getElementById('authStatusText').textContent = `Token ใช้งานได้ — หมดอายุ ${formatTime(expiryTime)}`;
            document.getElementById('credTokenExpiry').textContent = formatTime(expiryTime);

            showToast('ดึง Access Token สำเร็จ!', 'success');

            // Start countdown timer
            startTokenCountdown();

            return true;
        } else {
            accessToken = '';
            tokenFetchedAt = null;
            const errorMsg = data.error_description || data.error || JSON.stringify(data);
            updateConnectionStatus('Token ล้มเหลว', false, 'error');
            document.getElementById('authTokenBadge').classList.add('hidden');
            document.getElementById('authStatusText').textContent = `Authentication ล้มเหลว: ${errorMsg}`;
            document.getElementById('credTokenExpiry').textContent = '—';
            showToast(`Authentication ล้มเหลว: ${errorMsg}`, 'error');
            showResponse('Authentication Error', data, true);
            return false;
        }
    } catch (err) {
        accessToken = '';
        tokenFetchedAt = null;
        updateConnectionStatus('เชื่อมต่อล้มเหลว', false, 'error');
        document.getElementById('authTokenBadge').classList.add('hidden');
        document.getElementById('authStatusText').textContent = `เชื่อมต่อล้มเหลว: ${err.message}`;
        document.getElementById('credTokenExpiry').textContent = '—';
        showToast(`เกิดข้อผิดพลาด: ${err.message}`, 'error');
        showResponse('Network Error', { error: err.message }, true);
        return false;
    }
}

// --- Token Countdown Timer ---
let countdownInterval = null;

function startTokenCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);

    countdownInterval = setInterval(() => {
        if (!tokenFetchedAt) {
            clearInterval(countdownInterval);
            return;
        }

        const remaining = getTokenRemainingMinutes();
        const badge = document.getElementById('tokenBadgeText');
        const expiry = document.getElementById('credTokenExpiry');

        if (remaining <= 0) {
            // Token expired
            clearInterval(countdownInterval);
            badge.textContent = 'Token Expired';
            document.getElementById('authTokenBadge').classList.add('hidden');
            updateConnectionStatus('Token หมดอายุ', false, 'warning');
            document.getElementById('authStatusText').textContent = 'Token หมดอายุแล้ว — จะดึงใหม่อัตโนมัติเมื่อสร้าง Case';
            expiry.textContent = 'หมดอายุแล้ว';
        } else {
            badge.textContent = `Token Active (${remaining} นาที)`;
        }
    }, 30000); // Update every 30 seconds
}

// --- Manual refresh token ---
async function manualRefreshToken() {
    const btn = document.getElementById('refreshTokenBtn');
    btn.classList.add('loading');

    // Re-fetch credentials from sheet (in case they changed)
    await fetchCredentialsFromSheet();
    displayCredentials();

    // Force new token
    accessToken = '';
    tokenFetchedAt = null;
    await fetchToken();

    btn.classList.remove('loading');
}

// --- Format time ---
function formatTime(date) {
    if (!date) return '—';
    const pad = n => String(n).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())} น.`;
}

// --- Auth Panel Toggle ---
let authPanelOpen = false;

function toggleAuthPanel() {
    if (authPanelOpen) {
        closeAuthPanel();
    } else {
        openAuthPanel();
    }
}

function openAuthPanel() {
    authPanelOpen = true;
    document.getElementById('authPanelBody').classList.add('open');
    document.getElementById('authChevron').classList.add('rotated');
}

function closeAuthPanel() {
    authPanelOpen = false;
    document.getElementById('authPanelBody').classList.remove('open');
    document.getElementById('authChevron').classList.remove('rotated');
}

// --- Date Fields: default to now ---
function initDateFields() {
    const now = new Date();
    const localISO = toLocalISOString(now);
    document.getElementById('dateCase').value = localISO;
    document.getElementById('dateDue').value = localISO;
}

function toLocalISOString(date) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// --- Tag Inputs ---
function initTagInputs() {
    setupTagInput('activityInput', 'activityTags', activityNos);
    setupTagInput('dealInput', 'dealTags', dealNos);
}

function setupTagInput(inputId, tagsContainerId, dataArray) {
    const input = document.getElementById(inputId);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const value = input.value.trim();
            if (value && !dataArray.includes(value)) {
                dataArray.push(value);
                renderTags(tagsContainerId, dataArray);
                input.value = '';
            }
        }
    });
}

function renderTags(containerId, dataArray) {
    const container = document.getElementById(containerId);
    container.innerHTML = dataArray.map((tag, index) => `
        <span class="tag">
            ${escapeHtml(tag)}
            <button type="button" class="tag-remove" onclick="removeTag('${containerId}', ${index})" aria-label="Remove">&times;</button>
        </span>
    `).join('');
}

function removeTag(containerId, index) {
    const dataArray = containerId === 'activityTags' ? activityNos : dealNos;
    dataArray.splice(index, 1);
    renderTags(containerId, dataArray);
}

// --- Forms ---
function initForms() {
    document.getElementById('caseForm').addEventListener('submit', handleCreateCase);
}

// --- Create Case ---
async function handleCreateCase(e) {
    e.preventDefault();

    if (!credentials) {
        showToast('ยังไม่มี Credentials — กำลังโหลด...', 'error');
        await startApp();
        return;
    }

    // Ensure token is valid (auto-refresh if expired)
    const tokenReady = await ensureValidToken();
    if (!tokenReady) {
        showToast('ไม่สามารถดึง Token ได้ กรุณาลองใหม่', 'error');
        return;
    }

    const caseType = parseInt(document.getElementById('caseType').value);
    const subject = document.getElementById('subject').value.trim();
    const customerCode = document.getElementById('customerCode').value.trim();
    const categoryId = parseInt(document.getElementById('categoryId').value);
    const dateCase = toISOWithTimezone(document.getElementById('dateCase').value);
    const dateDue = toISOWithTimezone(document.getElementById('dateDue').value);
    const note = document.getElementById('note').value.trim();
    const assignedToUserId = document.getElementById('assignedToUserId').value.trim();

    if (!subject || !customerCode || !categoryId) {
        showToast('กรุณากรอกข้อมูลที่จำเป็นให้ครบ', 'error');
        return;
    }

    const payload = {
        caseType,
        subject,
        customerCode,
        categoryId,
        dateCase,
        dateDue,
        activityNos: [...activityNos],
        dealNos: [...dealNos]
    };

    if (note) {
        payload.note = note;
    }

    if (assignedToUserId) {
        payload.assignedToUserId = assignedToUserId;
    }

    const btn = document.getElementById('caseBtn');
    btn.classList.add('loading');

    try {
        const response = await fetch('/proxy/api/v1/case', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Ocp-Apim-Subscription-Key': credentials.subscriptionKey,
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok) {
            showToast('สร้าง Case Ticket สำเร็จ!', 'success');
            showResponse('Case Created Successfully', data, false);
        } else {
            const errorMsg = data.message || data.title || JSON.stringify(data);
            showToast(`สร้าง Case ล้มเหลว: ${errorMsg}`, 'error');
            showResponse('Create Case Error', data, true);
        }
    } catch (err) {
        showToast(`เกิดข้อผิดพลาด: ${err.message}`, 'error');
        showResponse('Network Error', { error: err.message }, true);
    } finally {
        btn.classList.remove('loading');
    }
}

// --- Helpers ---
function toISOWithTimezone(datetimeLocal) {
    if (!datetimeLocal) return '';
    const date = new Date(datetimeLocal);
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const pad = n => String(Math.abs(n)).padStart(2, '0');
    const hours = pad(Math.floor(offset / 60));
    const minutes = pad(offset % 60);
    return date.toISOString().replace('Z', '') + `${sign}${hours}:${minutes}`;
}

function showResponse(title, data, isError) {
    const panel = document.getElementById('responsePanel');
    const icon = document.getElementById('responseIcon');
    const titleEl = document.getElementById('responseTitle');
    const subtitleEl = document.getElementById('responseSubtitle');
    const body = document.getElementById('responseBody');

    panel.classList.remove('hidden');
    titleEl.textContent = title;
    subtitleEl.textContent = isError ? 'เกิดข้อผิดพลาดในการเรียก API' : 'ผลลัพธ์สำเร็จจากการเรียก API';
    body.textContent = JSON.stringify(data, null, 2);

    if (isError) {
        icon.classList.add('error');
    } else {
        icon.classList.remove('error');
    }

    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function updateConnectionStatus(text, authenticated, type) {
    const status = document.getElementById('connectionStatus');
    const dot = document.getElementById('statusDot');
    const textEl = document.getElementById('statusText');

    textEl.textContent = text;

    // Reset classes
    dot.className = 'status-dot';
    status.className = 'header-badge';

    if (type === 'success') {
        status.classList.add('badge-success');
        dot.classList.add('dot-success');
    } else if (type === 'error') {
        status.classList.add('badge-error');
        dot.classList.add('dot-error');
    } else if (type === 'warning') {
        status.classList.add('badge-warning');
        dot.classList.add('dot-warning');
    } else if (type === 'loading') {
        status.classList.add('badge-loading');
        dot.classList.add('dot-loading');
    }
}

function copyToken() {
    if (accessToken) {
        navigator.clipboard.writeText(accessToken).then(() => {
            showToast('คัดลอก Token แล้ว!', 'info');
        });
    }
}

function showToast(message, type = 'info') {
    // Remove existing toasts
    document.querySelectorAll('.toast').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.transition = 'opacity 300ms, transform 300ms';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// --- Background Particles ---
function createParticles() {
    const container = document.getElementById('bgParticles');
    for (let i = 0; i < 25; i++) {
        const particle = document.createElement('div');
        const size = Math.random() * 3 + 1;
        particle.style.cssText = `
            position: absolute;
            width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            background: rgba(99, 102, 241, ${Math.random() * 0.15 + 0.03});
            left: ${Math.random() * 100}%;
            top: ${Math.random() * 100}%;
            animation: floatParticle ${Math.random() * 15 + 10}s ease-in-out infinite;
            animation-delay: ${Math.random() * -20}s;
        `;
        container.appendChild(particle);
    }

    // Add keyframes for particles
    const style = document.createElement('style');
    style.textContent = `
        @keyframes floatParticle {
            0%, 100% { transform: translate(0, 0); opacity: 0.5; }
            25% { transform: translate(${rand(-50, 50)}px, ${rand(-50, 50)}px); opacity: 1; }
            50% { transform: translate(${rand(-30, 30)}px, ${rand(-30, 30)}px); opacity: 0.3; }
            75% { transform: translate(${rand(-60, 60)}px, ${rand(-60, 60)}px); opacity: 0.8; }
        }
    `;
    document.head.appendChild(style);
}

function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
