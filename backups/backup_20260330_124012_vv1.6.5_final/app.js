/**
 * Controle de Abastecimento - V1.6.5
 * Sincronização em tempo real com Firebase
 */

const DB_KEY = 'fleet_monitor_db_v3';

// CONFIGURAÇÃO DO FIREBASE (NUVEM)
const firebaseConfig = {
    apiKey: "AIzaSyBwBVdTfsGfveG1a5Z94UUIo9DgYu3qS4s",
    authDomain: "controle-de-frota-b8c8c.firebaseapp.com",
    databaseURL: "https://controle-de-frota-b8c8c-default-rtdb.firebaseio.com",
    projectId: "controle-de-frota-b8c8c",
    storageBucket: "controle-de-frota-b8c8c.firebasestorage.app",
    messagingSenderId: "829635363225",
    appId: "1:829635363225:web:86606bdea341f737ef5308"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

const LOGO_URL = "https://www.essencio.com.br/wp-content/uploads/2024/05/Essencio_principal-2024-1-1024x225.png";
const VERSION = '1.6.5';

class FleetManager {
    constructor() {
        this.data = null;
        this.dbRef = db.ref('fleet_data');
    }

    async init() {
        // Tenta carregar dados locais imediatamente para resposta rápida
        const localData = localStorage.getItem(DB_KEY);
        if (localData) {
            try {
                this.data = JSON.parse(localData);
            } catch (e) { console.error("Erro ao ler dados locais:", e); }
        }

        return new Promise((resolve) => {
            // Se já temos dados locais, renderiza imediatamente para o app não travar
            if (this.data && window.App) {
                if (App.localUser) App.render(App.views.Dashboard);
                else App.render(App.views.Login);
                resolve(this.data);
            }

            this.dbRef.on('value', (snapshot) => {
                const cloudData = snapshot.val();
                if (cloudData) {
                    this.data = cloudData;
                    localStorage.setItem(DB_KEY, JSON.stringify(this.data));
                } else if (!this.data) {
                    // Se Firebase vazio e não há cache, cria dados base
                    this.data = {
                        vehicles: [
                            { id: 1, name: 'Hilux - ABC-1234', type: 'car', lastVal: 15200 },
                            { id: 2, name: 'Barco Turbo', type: 'boat', lastVal: 450 }
                        ],
                        drivers: [
                            { id: 1, name: 'João Silva' },
                            { id: 2, name: 'Maria Santos' },
                            { id: 3, name: 'Leandro Felipe', isAdmin: true }
                        ],
                        usageLogs: [], fuelLogs: [], activeSessions: {}
                    };
                    this.saveData();
                }
                
                // Re-renderiza garantindo que loading suma
                if (window.App) {
                    if (App.currentView && App.currentView !== App.views.Login) {
                        App.render(App.currentView, App.currentProps);
                    } else if (!App.localUser) {
                        App.render(App.views.Login);
                    }
                }
                resolve(this.data);
            });

            // Timeout de segurança
            setTimeout(() => {
                if (!this.data) {
                    console.log("Firebase sync timeout - Usando fallback.");
                    this.data = { vehicles: [], drivers: [], usageLogs: [], fuelLogs: [], activeSessions: {} };
                    if (window.App) App.render(App.views.Login);
                }
                resolve(this.data);
            }, 4000);
        });
    }

    async saveData() {
        if (!this.data) return;
        return this.dbRef.set(this.data);
    }
}

const manager = new FleetManager();

const App = {
    localUser: null,
    currentPhoto: null,
    currentView: null,
    currentProps: {},

    async init() {
        App.localUser = localStorage.getItem('fleet_user_id') || null;
        await manager.init();
    },

    updateSyncStatus() {
        // Implementação visual se necessário
    },

    render(view, props = {}) {
        App.currentView = view;
        App.currentProps = props;
        const root = document.getElementById('app');
        if (!manager.data) return;

        // Se não logado, forçar Login
        if (!App.localUser && view !== App.views.Login) {
            root.innerHTML = App.views.Login();
            return;
        }

        // Layout Wide para Admin
        const main = document.querySelector('.main-app-container');
        if (main) {
            if (view === App.views.AdminPanel) main.classList.add('wide-layout');
            else main.classList.remove('wide-layout');
        }

        root.innerHTML = view(props);
        window.scrollTo(0, 0);
    },

    // --- FUNÇÕES DE NEGÓCIO ---

    login() {
        const id = document.getElementById('login-driver-select').value;
        const pass = document.getElementById('login-pass-input').value;
        const user = manager.data.drivers.find(d => d.id == id);
        
        if (!id) return alert("Selecione um usuário");
        const userPass = user?.password || 'Essencio123';
        
        if (pass === userPass) {
            App.localUser = id;
            localStorage.setItem('fleet_user_id', id);
            App.render(App.views.Dashboard);
        } else {
            alert("Senha incorreta!");
        }
    },

    logout() {
        if (confirm("Sair do sistema?")) {
            App.localUser = null;
            localStorage.removeItem('fleet_user_id');
            App.render(App.views.Login);
        }
    },

    async getGPS() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) return resolve(null);
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                () => resolve(null),
                { timeout: 5000 }
            );
        });
    },

    showMap(lat, lng) { window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank'); },

    handleVehicleChange(vId, targetId) {
        const vehicle = manager.data.vehicles.find(v => v.id == vId);
        const container = document.getElementById(targetId);
        if (!vehicle || !container) return;

        const lastValLabel = `
            <div class="card" style="background: rgba(0,188,193,0.1); margin-bottom: 15px; border: 1px solid var(--accent)">
                <p style="margin:0; font-size: 0.9rem">Último Registro: <strong>${vehicle.lastVal || 0}</strong> ${vehicle.type === 'boat' ? 'horas' : 'km'}</p>
            </div>
        `;

        if (targetId === 'checkin-fields') {
            container.innerHTML = `
                ${lastValLabel}
                ${vehicle.type === 'car' ? '<div class="form-group"><label>KM Inicial</label><input type="number" id="start-val" value="${vehicle.lastVal || 0}"></div>' : ''}
                <div class="form-group"><label>Local de Saída</label><input type="text" id="start-local" placeholder="Ex: Garagem, Obra..."></div>
                <label class="photo-preview" id="photo-preview" style="cursor:pointer; display:flex;">
                    <input type="file" accept="image/*" capture="environment" style="display:none" onchange="App.handlePhotoUpload(event, 'photo-preview')">
                    <span id="photo-preview-text">📸 Tirar Foto do Painel</span>
                </label>
                <button onclick="App.submitCheckIn()">Iniciar Uso</button>
            `;
        } else if (targetId === 'fuel-form-fields') {
            container.innerHTML = `
                ${lastValLabel}
                <div class="form-group"><label>KM/Horas Atual</label><input type="number" id="fuel-val" value="${vehicle.lastVal || 0}"></div>
                <div class="form-group"><label>Local do Abastecimento</label><input type="text" id="fuel-local" placeholder="Ex: Posto..."></div>
                <label class="photo-preview" id="photo-preview" style="cursor:pointer; display:flex;">
                    <input type="file" accept="image/*" capture="environment" style="display:none" onchange="App.handlePhotoUpload(event, 'photo-preview')">
                    <span id="photo-preview-text">📸 Foto do Comprovante</span>
                </label>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px">
                    <div class="form-group"><label>Litros</label><input type="number" step="0.01" id="fuel-liters" oninput="App.calcFuelTotal()"></div>
                    <div class="form-group"><label>R$/L</label><input type="number" step="0.01" id="fuel-price-l" oninput="App.calcFuelTotal()"></div>
                </div>
                <div class="form-group"><label>Total R$</label><input type="number" id="fuel-total"></div>
                <div class="form-group"><label>Tipo de Combustível</label>
                    <select id="fuel-type">
                        <option value="Gasolina Comum">Gasolina Comum</option>
                        <option value="Gasolina Aditivada">Gasolina Aditivada</option>
                        <option value="Etanol">Etanol</option>
                        <option value="Diesel S10">Diesel S10</option>
                        <option value="Diesel Comum">Diesel Comum</option>
                    </select>
                </div>
                <label style="display:flex; align-items:center; gap:5px; margin-bottom:15px"><input type="checkbox" id="fuel-full" checked> Tanque Cheio?</label>
                <button onclick="App.submitFuel()">Salvar Abastecimento</button>
            `;
        }
    },

    handlePhotoUpload(event, previewId) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800;
                const scale = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scale;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                App.currentPhoto = canvas.toDataURL('image/jpeg', 0.7);
                const preview = document.getElementById(previewId);
                if (preview) preview.innerHTML = `<img src="${App.currentPhoto}" style="width:100%; height:80px; object-fit:cover; border-radius:8px">`;
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    calcFuelTotal() {
        const l = parseFloat(document.getElementById('fuel-liters').value || 0);
        const p = parseFloat(document.getElementById('fuel-price-l').value || 0);
        document.getElementById('fuel-total').value = (l * p).toFixed(2);
    },

    async submitCheckIn() {
        const vId = document.getElementById('vehicle-select').value;
        const val = parseFloat(document.getElementById('start-val')?.value || 0);
        const local = document.getElementById('start-local').value;
        if (!vId || !App.currentPhoto) return alert("Preencha tudo e tire a foto!");
        
        const gps = await App.getGPS();
        manager.data.activeSessions[App.localUser] = { 
            id: Date.now(), driverId: App.localUser, vehicleId: vId, startTime: new Date().toISOString(), 
            startVal: val, startPhoto: App.currentPhoto, startLocal: local, 
            startLat: gps?.lat || null, startLng: gps?.lng || null 
        };
        await manager.saveData();
        App.currentPhoto = null;
        App.render(App.views.Dashboard);
    },

    async submitCheckOut() {
        const session = manager.data.activeSessions[App.localUser];
        const v = manager.data.vehicles.find(v => v.id == session.vehicleId);
        const endVal = v.type === 'boat' ? (parseFloat(session.startVal) + ((new Date() - new Date(session.startTime)) / 3600000)).toFixed(2) : parseFloat(document.getElementById('end-val').value);
        
        if (!App.currentPhoto || isNaN(endVal)) return alert("Tire a foto e preencha o valor!");
        
        const local = prompt("Local de Chegada (Devolução):") || "—";
        const desc = prompt("Descreva a movimentação final (Opcional):") || "—";
        const gps = await App.getGPS();
        
        manager.data.usageLogs.push({ 
            ...session, endTime: new Date().toISOString(), endVal, endPhoto: App.currentPhoto, 
            endLocal: local, endLat: gps?.lat || null, endLng: gps?.lng || null,
            sessionDiff: (endVal - session.startVal).toFixed(2), description: desc
        });
        
        const vIdx = manager.data.vehicles.findIndex(vec => vec.id == v.id);
        manager.data.vehicles[vIdx].lastVal = endVal;
        
        delete manager.data.activeSessions[App.localUser];
        await manager.saveData();
        App.currentPhoto = null;
        App.render(App.views.Dashboard);
    },

    async submitSegment() {
        const session = manager.data.activeSessions[App.localUser];
        const v = manager.data.vehicles.find(v => v.id == session.vehicleId);
        const endVal = parseFloat(document.getElementById('seg-end-val').value);
        const local = document.getElementById('seg-local').value;
        const desc = document.getElementById('seg-desc')?.value || '—';
        
        if (!App.currentPhoto || isNaN(endVal) || !local) return alert("Preencha todos os campos e tire a foto!");
        
        const gps = await App.getGPS();
        
        manager.data.usageLogs.push({ 
            ...session, endTime: new Date().toISOString(), endVal, endPhoto: App.currentPhoto, 
            endLocal: local, endLat: gps?.lat || null, endLng: gps?.lng || null,
            sessionDiff: (endVal - session.startVal).toFixed(2), description: desc
        });
        
        const vIdx = manager.data.vehicles.findIndex(vec => vec.id == v.id);
        manager.data.vehicles[vIdx].lastVal = endVal;
        
        // START NEW SEGMENT SEAMLESSLY
        manager.data.activeSessions[App.localUser] = {
            id: Date.now(), driverId: App.localUser, vehicleId: session.vehicleId, startTime: new Date().toISOString(),
            startVal: endVal, startPhoto: App.currentPhoto, startLocal: local,
            startLat: gps?.lat || null, startLng: gps?.lng || null
        };
        
        await manager.saveData();
        App.currentPhoto = null;
        App.render(App.views.Dashboard);
    },

    async submitFuel() {
        const vId = document.getElementById('fuel-vehicle-select').value;
        const val = parseFloat(document.getElementById('fuel-val').value);
        const liters = parseFloat(document.getElementById('fuel-liters').value);
        const total = document.getElementById('fuel-total').value;
        const type = document.getElementById('fuel-type').value;
        const local = document.getElementById('fuel-local').value;
        
        if (!vId || !App.currentPhoto || isNaN(val)) return alert("Preencha tudo e tire a foto!");
        
        const gps = await App.getGPS();
        manager.data.fuelLogs.push({
            id: Date.now(), driverId: App.localUser, vehicleId: vId, date: new Date().toISOString(),
            val, liters, total, fuelType: type, localName: local,
            isFull: document.getElementById('fuel-full').checked, photo: App.currentPhoto,
            lat: gps?.lat || null, lng: gps?.lng || null
        });
        
        const vIdx = manager.data.vehicles.findIndex(v => v.id == vId);
        if (val > manager.data.vehicles[vIdx].lastVal) manager.data.vehicles[vIdx].lastVal = val;
        
        await manager.saveData();
        App.currentPhoto = null;
        App.render(App.views.Dashboard);
    },

    // --- ADMIN PANEL (1.6.5 MODAL-LIKE TABS) ---

    switchAdminTab(tab) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const btns = Array.from(document.querySelectorAll('.tab-btn'));
        const target = btns.find(b => b.innerText.toLowerCase().includes(tab.slice(0,3)));
        if (target) target.classList.add('active');

        const content = document.getElementById('admin-content');
        if (tab === 'logs') content.innerHTML = App.renderAdminLogs();
        if (tab === 'vehicles') content.innerHTML = App.renderAdminVehicles();
        if (tab === 'drivers') content.innerHTML = App.renderAdminDrivers();
        if (tab === 'sessions') content.innerHTML = App.renderAdminSessions();
    },

    calcFuelMetrics(vehicleId, currentEntry, allLogs) {
        const logs = allLogs.filter(l => l.vehicleId == vehicleId).sort((a,b) => new Date(a.date) - new Date(b.date));
        const idx = logs.findIndex(l => l.id === currentEntry.id);
        const isBoat = manager.data.vehicles.find(v => v.id == vehicleId)?.type === 'boat';
        const unit = isBoat ? 'L/h' : 'Km/l';
        
        let periodFrom = '—', periodTo = '—', dateFrom = '—', dateTo = '—', avgThis = '—';
        
        if (currentEntry.isFull && idx > 0) {
            let prevFullIdx = -1;
            for (let i = idx-1; i >= 0; i--) if (logs[i].isFull) { prevFullIdx = i; break; }
            if (prevFullIdx >= 0) {
                const prev = logs[prevFullIdx];
                const kmDiff = currentEntry.val - prev.val;
                let liters = 0;
                for (let i = prevFullIdx + 1; i <= idx; i++) liters += parseFloat(logs[i].liters);
                periodFrom = prev.val;
                periodTo = currentEntry.val;
                dateFrom = new Date(prev.date).toLocaleDateString();
                dateTo = new Date(currentEntry.date).toLocaleDateString();
                if (liters > 0 && kmDiff > 0) avgThis = isBoat ? (liters / kmDiff).toFixed(2) : (kmDiff / liters).toFixed(2);
            }
        }
        
        let avgHistoric = '—';
        const fulls = logs.filter(l => l.isFull);
        if (fulls.length >= 2) {
            let tk = 0, tl = 0;
            for (let i = 1; i < fulls.length; i++) { tk += fulls[i].val - fulls[i-1].val; tl += parseFloat(fulls[i].liters); }
            if (tl > 0 && tk > 0) avgHistoric = isBoat ? (tl / tk).toFixed(2) : (tk / tl).toFixed(2);
        }
        
        return { periodFrom, periodTo, dateFrom, dateTo, avgThis, avgHistoric, unit };
    },

    renderAdminLogs() {
        const fuel = (manager.data.fuelLogs || []).slice().reverse();
        const usage = (manager.data.usageLogs || []).slice().reverse();
        
        let h = `<h4>⛽ Abastecimentos</h4><div class="log-table-wrap"><table class="log-table"><thead><tr>
            <th>Data</th><th>Veículo</th><th>Motorista</th><th>KM/h</th><th>Tipo</th><th>Litros</th><th>R$</th>
            <th>KM De</th><th>KM Até</th><th>Data De</th><th>Data Até</th><th>Média Abast.</th><th>Média Hist.</th><th>Ações</th>
        </tr></thead><tbody>`;
        
        h += fuel.map(l => {
            const v = manager.data.vehicles.find(v => v.id == l.vehicleId);
            const d = manager.data.drivers.find(d => d.id == l.driverId);
            const m = App.calcFuelMetrics(l.vehicleId, l, manager.data.fuelLogs);
            const map = l.lat ? `<button class="secondary btn-small" onclick="App.showMap(${l.lat},${l.lng})">🗺️</button>` : '—';
            return `<tr>
                <td>${new Date(l.date).toLocaleString()}</td>
                <td>${v?.name || '—'}</td>
                <td>${d?.name || '—'}</td>
                <td>${l.val}</td>
                <td>${l.fuelType || '—'}</td>
                <td>${l.liters}</td>
                <td>${l.total}</td>
                <td>${m.periodFrom}</td>
                <td>${m.periodTo}</td>
                <td>${m.dateFrom}</td>
                <td>${m.dateTo}</td>
                <td>${m.avgThis} ${m.unit}</td>
                <td>${m.avgHistoric} ${m.unit}</td>
                <td>
                    ${map}
                    <button class="secondary btn-small" onclick="App.editFuelLog('${l.id}')">✏️</button>
                    <button class="danger btn-small" onclick="App.deleteFuelLog('${l.id}')">🗑️</button>
                </td>
            </tr>`;
        }).join('');
        h += `</tbody></table></div>`;
        
        h += `<h4 style="margin-top:20px">🚗 Uso</h4><div class="log-table-wrap"><table class="log-table"><thead><tr>
            <th>Veículo</th><th>Motorista</th><th>Local Saída</th><th>Início</th><th>Local Chegada</th><th>Fim</th><th>KM Percorrido</th><th>Desc</th><th>Ações</th>
        </tr></thead><tbody>`;
        h += usage.map(l => {
            const v = manager.data.vehicles.find(v => v.id == l.vehicleId);
            const d = manager.data.drivers.find(d => d.id == l.driverId);
            const ms = l.startLat ? `<button class="secondary btn-small" onclick="App.showMap(${l.startLat},${l.startLng})">🗺️</button>` : '';
            const me = l.endLat ? `<button class="secondary btn-small" onclick="App.showMap(${l.endLat},${l.endLng})">🗺️</button>` : '';
            return `<tr>
                <td>${v?.name || '—'}</td>
                <td>${d?.name || '—'}</td>
                <td>${l.startLocal || '—'} ${ms}</td>
                <td>${new Date(l.startTime).toLocaleString()}</td>
                <td>${l.endLocal || '—'} ${me}</td>
                <td>${new Date(l.endTime).toLocaleString()}</td>
                <td>${l.sessionDiff}</td>
                <td>${l.description || ''}</td>
                <td>
                    <button class="secondary btn-small" onclick="App.editUsageLog('${l.id}')">✏️</button>
                    <button class="danger btn-small" onclick="App.deleteUsageLog('${l.id}')">🗑️</button>
                </td>
            </tr>`;
        }).join('');
        h += `</tbody></table></div>`;
        return h;
    },

    async editFuelLog(logId) {
        const idx = manager.data.fuelLogs.findIndex(l => l.id == logId);
        if(idx === -1) return;
        const l = manager.data.fuelLogs[idx];
        const val = prompt("Editar KM do Abastecimento:", l.val);
        if(val === null) return;
        const liters = prompt("Editar Litros Abastecidos:", l.liters);
        if(liters === null) return;
        const total = prompt("Editar Valor Total (R$):", l.total);
        if(total === null) return;
        
        manager.data.fuelLogs[idx] = { ...l, val: parseFloat(val), liters: parseFloat(liters), total: parseFloat(total) };
        await manager.saveData();
        App.switchAdminTab('logs');
    },

    async editUsageLog(logId) {
        const idx = manager.data.usageLogs.findIndex(l => l.id == logId);
        if(idx === -1) return;
        const l = manager.data.usageLogs[idx];
        
        const sVal = prompt("Editar KM Inicial do trecho:", l.startVal);
        if(sVal === null) return;
        const eVal = prompt("Editar KM Final do trecho:", l.endVal);
        if(eVal === null) return;
        const desc = prompt("Editar Descrição / Observação:", l.description || "");
        
        manager.data.usageLogs[idx] = { 
            ...l, 
            startVal: parseFloat(sVal), 
            endVal: parseFloat(eVal), 
            sessionDiff: (parseFloat(eVal) - parseFloat(sVal)).toFixed(2),
            description: desc !== null ? desc : l.description
        };
        await manager.saveData();
        App.switchAdminTab('logs');
    },

    async deleteFuelLog(logId) {
         if(!confirm("Tem certeza que deseja EXCLUIR permanentemente este registro de abastecimento?")) return;
         manager.data.fuelLogs = manager.data.fuelLogs.filter(l => l.id != logId);
         await manager.saveData();
         App.switchAdminTab('logs');
    },

    async deleteUsageLog(logId) {
         if(!confirm("Tem certeza que deseja EXCLUIR permanentemente este registro de uso/movimentação?")) return;
         manager.data.usageLogs = manager.data.usageLogs.filter(l => l.id != logId);
         await manager.saveData();
         App.switchAdminTab('logs');
    },

    renderAdminSessions() {
        const active = Object.entries(manager.data.activeSessions || {});
        let h = `<h4>Sessões Ativas</h4><div class="log-table-wrap"><table class="log-table"><thead><tr><th>Motorista</th><th>Veículo</th><th>Início</th><th>Ações</th></tr></thead><tbody>`;
        h += active.map(([uId, s]) => {
            const d = manager.data.drivers.find(d => d.id == uId);
            const v = manager.data.vehicles.find(v => v.id == s.vehicleId);
            return `<tr><td>${d?.name}</td><td>${v?.name}</td><td>${new Date(s.startTime).toLocaleString()}</td><td><button class="danger btn-small" onclick="App.forceCloseSession('${uId}')">Encerrar</button></td></tr>`;
        }).join('');
        if (active.length === 0) h += `<tr><td colspan="4" style="text-align:center; color:var(--text-muted)">Nenhuma sessão ativa</td></tr>`;
        h += `</tbody></table></div>`;
        return h;
    },

    renderAdminVehicles() { 
        let h = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <h4>Veículos</h4>
                    <button class="btn-small" onclick="App.showAddVehicleModal()">+ Novo Veículo</button>
                 </div><ul class="admin-list">`;
        h += manager.data.vehicles.map(v => 
            `<li style="display:flex; justify-content:space-between; align-items:center;">
                <span>${v.name} (${v.type}) - KM/H: ${v.lastVal}</span>
                <div style="display:flex; gap:5px;">
                   <button class="secondary btn-small" onclick="App.showExportModal('${v.id}')">📊 Boletim</button>
                   <button class="danger btn-small" onclick="App.deleteVehicle('${v.id}')">🗑️</button>
                </div>
            </li>`
        ).join('');
        return h + `</ul>`; 
    },
    renderAdminDrivers() { 
        let h = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <h4>Usuários</h4>
                    <button class="btn-small" onclick="App.showAddDriverModal()">+ Novo Usuário</button>
                 </div><ul class="admin-list">`;
        h += manager.data.drivers.map(d => 
            `<li style="display:flex; flex-direction:column; gap:5px; margin-bottom:10px; border-bottom:1px solid var(--border); padding-bottom:10px;">
                 <span style="font-weight:bold">${d.name} ${d.isAdmin ? '<span style="color:var(--accent); font-size:0.8rem">(Admin)</span>' : ''}</span>
                 <div style="display:flex; gap:5px; flex-wrap:wrap; align-items:center; margin-top:5px;">
                     <button class="secondary btn-small" onclick="App.showDriverVehiclesModal('${d.id}')">🚗 Liberar Veículos</button>
                     <button class="secondary btn-small" onclick="App.resetPassword('${d.id}')">🔑 Zerar Senha</button>
                     <button class="danger btn-small" onclick="App.deleteDriver('${d.id}')">🗑️</button>
                 </div>
             </li>`
        ).join('');
        return h + `</ul>`; 
    },

    async resetPassword(id) {
        if(confirm("Deseja resetar a senha deste usuário para 'Essencio123'?")) {
            const dIdx = manager.data.drivers.findIndex(d => d.id == id);
            if(dIdx !== -1) {
                manager.data.drivers[dIdx].password = "Essencio123";
                await manager.saveData();
                alert("Senha resetada com sucesso para: Essencio123");
            }
        }
    },

    showDriverVehiclesModal(id) {
        const d = manager.data.drivers.find(d => d.id == id);
        const allowed = d.allowedVehicles || [];
        
        const html = `
            <h3>Veículos Permitidos</h3>
            <p><strong>${d.name}</strong> poderá ver apenas:</p>
            <div style="text-align:left; margin-bottom:15px; max-height: 250px; overflow-y:auto; border: 1px solid var(--border); padding: 10px; border-radius: 8px;">
                ${manager.data.vehicles.map(v => `
                    <label style="display:flex; align-items:center; gap:8px; margin-bottom:8px">
                        <input type="checkbox" class="veh-allow-cb" value="${v.id}" ${allowed.includes(v.id.toString()) || allowed.includes(v.id) ? 'checked' : ''}>
                        ${v.name}
                    </label>
                `).join('')}
            </div>
            <p style="font-size:0.8rem; color:var(--text-muted); text-align:left; margin-bottom:15px; line-height:1.2">
                * Se TODOS estiverem desmarcados, ele poderá ver TODOS os veículos do sistema livremente.
            </p>
            <button onclick="App.saveDriverVehicles('${id}')">Salvar Permissões</button>
        `;
        App.showModal(html);
    },
    
    async saveDriverVehicles(id) {
        const dIdx = manager.data.drivers.findIndex(d => d.id == id);
        if(dIdx === -1) return;
        
        const cbs = document.querySelectorAll('.veh-allow-cb:checked');
        const allowed = Array.from(cbs).map(cb => cb.value);
        
        manager.data.drivers[dIdx].allowedVehicles = allowed;
        await manager.saveData();
        App.closeModal();
        App.switchAdminTab('drivers');
    },

    showAddVehicleModal() {
        App.showModal(`
            <h3>Adicionar Veículo</h3>
            <div class="form-group"><label>Nome (Marca/Placa)</label><input type="text" id="add-veh-name"></div>
            <div class="form-group"><label>Tipo</label><select id="add-veh-type"><option value="car">Carro (KM)</option><option value="boat">Barco (Horas)</option></select></div>
            <div class="form-group"><label>KM/Horas Inicial</label><input type="number" id="add-veh-val" value="0"></div>
            <button onclick="App.addVehicle()">Salvar Veículo</button>
        `);
    },
    async addVehicle() {
        const name = document.getElementById('add-veh-name').value;
        const type = document.getElementById('add-veh-type').value;
        const val = parseFloat(document.getElementById('add-veh-val').value) || 0;
        if (!name) return alert("Preencha o nome!");
        manager.data.vehicles.push({ id: Date.now().toString(), name, type, lastVal: val });
        await manager.saveData();
        App.closeModal();
        App.switchAdminTab('vehicles');
    },
    async deleteVehicle(id) {
        if(confirm("Desativar/Deletar este veículo permanentemente?")) {
            manager.data.vehicles = manager.data.vehicles.filter(v => v.id != id);
            await manager.saveData();
            App.switchAdminTab('vehicles');
        }
    },

    showAddDriverModal() {
        App.showModal(`
            <h3>Adicionar Usuário / Motorista</h3>
            <div class="form-group"><label>Nome</label><input type="text" id="add-drv-name"></div>
            <div class="form-group"><label>Senha Provisória</label><input type="text" id="add-drv-pw" value="Essencio123"></div>
            <label style="display:flex; align-items:center; gap:5px; margin-top:10px; margin-bottom:15px;">
               <input type="checkbox" id="add-drv-admin"> Conceder acesso Administrador?
            </label>
            <button onclick="App.addDriver()">Salvar Usuário</button>
        `);
    },
    async addDriver() {
        const name = document.getElementById('add-drv-name').value;
        const pass = document.getElementById('add-drv-pw').value;
        const isAdmin = document.getElementById('add-drv-admin').checked;
        if (!name || !pass) return alert("Preencha o nome e senha!");
        manager.data.drivers.push({ id: Date.now().toString(), name, password: pass, isAdmin });
        await manager.saveData();
        App.closeModal();
        App.switchAdminTab('drivers');
    },
    async deleteDriver(id) {
        if(confirm("Deletar este usuário do sistema permanentemente?")) {
            manager.data.drivers = manager.data.drivers.filter(d => d.id != id);
            await manager.saveData();
            App.switchAdminTab('drivers');
        }
    },

    async forceCloseSession(uId) {
        if(confirm("Encerrar sessão forçadamente?")) { delete manager.data.activeSessions[uId]; await manager.saveData(); App.switchAdminTab('sessions'); }
    },

    showExportModal(vehicleId) {
        const v = manager.data.vehicles.find(v => v.id == vehicleId);
        const tf = new Date().toISOString().split('T')[0];
        const ti = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        App.showModal(`
            <h3>Boletim: ${v.name}</h3>
            <p>Selecione o período do relatório:</p>
            <div class="form-group"><label>Data Inicial</label><input type="date" id="exp-start" value="${ti}"></div>
            <div class="form-group"><label>Data Final</label><input type="date" id="exp-end" value="${tf}"></div>
            <button onclick="App.exportExcel('${vehicleId}')">Gerar Planilha em Excel</button>
        `);
    },

    async exportExcel(vehicleId) {
        const v = manager.data.vehicles.find(v => v.id == vehicleId);
        
        const dStart = document.getElementById('exp-start') ? new Date(document.getElementById('exp-start').value + 'T00:00:00').getTime() : 0;
        const dEnd = document.getElementById('exp-end') ? new Date(document.getElementById('exp-end').value + 'T23:59:59').getTime() : Date.now();
        
        App.closeModal();

        const logs = (manager.data.usageLogs || []).filter(l => l.vehicleId == vehicleId && new Date(l.startTime).getTime() >= dStart && new Date(l.endTime).getTime() <= dEnd).sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
        const fuels = manager.data.fuelLogs || [];

        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Boletim Diário');

        ws.columns = [
            { header: 'DIA', key: 'dia', width: 12 },
            { header: 'CONDUTOR', key: 'condutor', width: 25 },
            { header: 'HORA PART.', key: 'horaPart', width: 15 },
            { header: 'KM INICIAL', key: 'kmInicial', width: 15 },
            { header: 'PERCURSO PARTIDA', key: 'partida', width: 30 },
            { header: 'PERCURSO CHEGADA', key: 'chegada', width: 30 },
            { header: 'DESCRIÇÃO', key: 'desc', width: 35 },
            { header: 'HORA CHEGADA', key: 'horaChegada', width: 15 },
            { header: 'KM FINAL', key: 'kmFinal', width: 15 },
            { header: 'KM ABAST.', key: 'kmAbast', width: 15 },
            { header: 'LITROS', key: 'litros', width: 15 },
            { header: 'VALOR', key: 'valor', width: 15 }
        ];

        ws.getRow(1).font = { bold: true };
        ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

        logs.forEach(l => {
            const d = manager.data.drivers.find(d => d.id == l.driverId);
            const dateObj = new Date(l.startTime);
            const dia = dateObj.toLocaleDateString('pt-BR');
            const horaP = dateObj.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
            const horaC = new Date(l.endTime).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});

            let kmAbast = "", litros = "", valor = "";
            let relatedFuel = fuels.filter(f => f.vehicleId == vehicleId && f.val >= l.startVal && f.val <= l.endVal && new Date(f.date).toLocaleDateString('pt-BR') === dia);
            if(relatedFuel.length > 0) {
                kmAbast = relatedFuel[0].val;
                litros = relatedFuel[0].liters;
                valor = relatedFuel[0].total;
            }

            ws.addRow({
                dia, condutor: d?.name || '—', horaPart: horaP, kmInicial: l.startVal,
                partida: l.startLocal || '—', chegada: l.endLocal || '—', desc: l.description || '—',
                horaChegada: horaC, kmFinal: l.endVal, kmAbast, litros, valor
            });
        });

        const buf = await wb.xlsx.writeBuffer();
        const blob = new Blob([buf], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Boletim_Diario_${v.name.replace(/\s+/g, '_')}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    // --- VIEWS ---

    views: {
        Login: () => `
            <div class="container slide-up" style="text-align: center; margin-top: 40px">
                <img src="${LOGO_URL}" style="width:200px; margin-bottom:20px">
                <h1>Bem-vindo!</h1>
                <div class="card">
                    <select id="login-driver-select" style="margin-bottom:10px">
                        <option value="">Selecione seu usuário</option>
                        ${(manager.data.drivers || []).map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
                    </select>
                    <input type="password" id="login-pass-input" placeholder="Senha de Acesso">
                    <button onclick="App.login()" style="margin-top:20px">Entrar</button>
                    <div style="margin-top: 15px; display: flex; flex-direction: column; gap: 8px;">
                        <button class="secondary btn-small" onclick="App.repairSystem()" style="font-size: 0.7rem; opacity: 0.7;">🔧 Reparar Sistema (Limpar Cache)</button>
                        <div style="font-size:0.6rem; color:var(--text-muted);">Versão ${VERSION}</div>
                    </div>
                </div>
            </div>
        `,
        Dashboard: () => {
            const user = manager.data.drivers.find(d => d.id == App.localUser);
            const active = manager.data.activeSessions[App.localUser];
            return `
            <div class="container slide-up">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px">
                    <h2>Olá, ${user?.name}</h2>
                    <button class="secondary btn-small" onclick="App.logout()">Sair</button>
                </div>
                <div style="display:grid; gap:12px">
                    ${active ? 
                        `<div class="card" style="background:var(--accent-light); border: 2px solid var(--accent)">
                            <h3 style="margin-bottom:10px;">Veículo sob sua posse</h3>
                            <button onclick="App.render(App.views.SegmentView)">Nova Movimentação (Check-in)</button>
                            <button class="danger" onclick="App.render(App.views.CheckOutView)" style="margin-top:10px;">Encerrar o Dia (Devolver)</button>
                        </div>` :
                        `<button onclick="App.render(App.views.CheckInView)">Iniciar Retirada (Check-in)</button>`
                    }
                    <button class="secondary" onclick="App.render(App.views.FuelView)">⛽ Registrar Abastecimento</button>
                    ${(user?.isAdmin || user?.name === 'Leandro Felipe') ? `<button class="secondary" onclick="App.render(App.views.AdminPanel)">📊 Painel Administrativo</button>` : ''}
                </div>
            </div>
        `},
        SegmentView: () => {
            const session = manager.data.activeSessions[App.localUser];
            const v = manager.data.vehicles.find(v => v.id == session.vehicleId);
            return `
            <div class="container slide-up">
                <button class="secondary btn-small" onclick="App.render(App.views.Dashboard)">← Voltar</button>
                <h1>Nova Movimentação</h1>
                <p>Veículo: <strong>${v.name}</strong></p>
                <div class="form-group"><label>KM / Horas Final (Trecho Concluído)</label><input type="number" id="seg-end-val"></div>
                <div class="form-group"><label>Local de Chegada (É a sua nova Saída)</label><input type="text" id="seg-local" placeholder="Ex: Obra 2..."></div>
                <div class="form-group"><label>Motivo / Descrição</label><input type="text" id="seg-desc" placeholder="Ex: Ida ao cliente"></div>
                <label class="photo-preview" id="photo-preview" style="cursor:pointer; display:flex;">
                    <input type="file" accept="image/*" capture="environment" style="display:none" onchange="App.handlePhotoUpload(event, 'photo-preview')">
                    <span id="photo-preview-text">📸 Tirar Foto</span>
                </label>
                <button onclick="App.submitSegment()">Registrar Deslocamento</button>
            </div>
            `;
        },
        CheckInView: () => {
            const user = manager.data.drivers.find(d => d.id == App.localUser);
            const canSee = (v) => (!user.allowedVehicles || user.allowedVehicles.length === 0 || user.allowedVehicles.includes(v.id.toString()) || user.allowedVehicles.includes(v.id));
            const availableVehicles = manager.data.vehicles.filter(canSee);
            
            return `
            <div class="container slide-up">
                <button class="secondary btn-small" onclick="App.render(App.views.Dashboard)">← Voltar</button>
                <h1>Check-in</h1>
                <select id="vehicle-select" onchange="App.handleVehicleChange(this.value, 'checkin-fields')">
                    <option value="">Selecione o veículo</option>
                    ${availableVehicles.map(v => `<option value="${v.id}">${v.name}</option>`).join('')}
                </select>
                <div id="checkin-fields"></div>
            </div>
            `;
        },
        CheckOutView: () => {
            const session = manager.data.activeSessions[App.localUser];
            const v = manager.data.vehicles.find(v => v.id == session.vehicleId);
            return `
            <div class="container slide-up">
                <button class="secondary btn-small" onclick="App.render(App.views.Dashboard)">← Voltar</button>
                <h1>Check-out</h1>
                <p>Veículo: <strong>${v.name}</strong></p>
                ${v.type === 'car' ? '<div class="form-group"><label>KM Final</label><input type="number" id="end-val"></div>' : '<p>Horas calculadas automaticamente.</p>'}
                <label class="photo-preview" id="photo-preview" style="cursor:pointer; display:flex;">
                    <input type="file" accept="image/*" capture="environment" style="display:none" onchange="App.handlePhotoUpload(event, 'photo-preview')">
                    <span id="photo-preview-text">📸 Tirar Foto Final</span>
                </label>
                <button onclick="App.submitCheckOut()">Finalizar e Sincronizar</button>
            </div>
        `},
        FuelView: () => {
            const user = manager.data.drivers.find(d => d.id == App.localUser);
            const canSee = (v) => (!user.allowedVehicles || user.allowedVehicles.length === 0 || user.allowedVehicles.includes(v.id.toString()) || user.allowedVehicles.includes(v.id));
            const availableVehicles = manager.data.vehicles.filter(canSee);
            
            return `
            <div class="container slide-up">
                <button class="secondary btn-small" onclick="App.render(App.views.Dashboard)">← Voltar</button>
                <h1>Abastecimento</h1>
                <select id="fuel-vehicle-select" onchange="App.handleVehicleChange(this.value, 'fuel-form-fields')">
                    <option value="">Selecione o veículo</option>
                    ${availableVehicles.map(v => `<option value="${v.id}">${v.name}</option>`).join('')}
                </select>
                <div id="fuel-form-fields"></div>
            </div>
            `;
        },
        AdminPanel: () => `
            <div class="container slide-up">
                <button class="secondary btn-small" onclick="App.render(App.views.Dashboard)">← Voltar</button>
                <h1>Painel Admin</h1>
                <div class="admin-tabs" style="display:flex; gap:5px; margin-bottom:15px; overflow-x:auto">
                    <button class="tab-btn active btn-small" onclick="App.switchAdminTab('logs')">Logs</button>
                    <button class="tab-btn btn-small" onclick="App.switchAdminTab('vehicles')">Veículos</button>
                    <button class="tab-btn btn-small" onclick="App.switchAdminTab('drivers')">Usuários</button>
                    <button class="tab-btn btn-small" onclick="App.switchAdminTab('sessions')">Sessões</button>
                </div>
                <div id="admin-content" class="admin-list">${App.renderAdminLogs()}</div>
            </div>
        `
    },

    showModal(html) {
        const d = document.createElement('div');
        d.className = 'modal-overlay';
        d.innerHTML = `<div class="modal-content" style="max-height:90vh; overflow-y:auto">
            <button class="secondary btn-small" onclick="App.closeModal()" style="margin-bottom:15px; width:auto">✕ Fechar</button>
            ${html}
        </div>`;
        document.body.appendChild(d);
    },
    closeModal() { const m = document.querySelector('.modal-overlay'); if (m) m.remove(); },

    async repairSystem() {
        if (!confirm("Deseja reparar o sistema? Isso limpará o cache e sincronizará os dados novamente.")) return;
        
        // Limpa Service Workers
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let reg of registrations) await reg.unregister();
        }
        
        // Limpa Caches
        if ('caches' in window) {
            const keys = await caches.keys();
            for (let key of keys) await caches.delete(key);
        }

        alert("Sistema reparado! A página será recarregada.");
        window.location.reload(true);
    }
};

window.App = App;
App.init();
