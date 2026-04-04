/**
 * Controle de Abastecimento - V1.6.9 (Restauração 1.6.5 + Edição)
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
const VERSION = '1.6.9';

class FleetManager {
    constructor() {
        this.data = null;
        this.dbRef = db.ref('fleet_data');
    }

    async init() {
        // Tenta carregar dados locais imediatamente para resposta rápida (v1.6.9 Fix)
        const localData = localStorage.getItem(DB_KEY);
        if (localData) {
            try {
                this.data = JSON.parse(localData);
            } catch (e) { console.error("Erro ao ler dados locais:", e); }
        }

        return new Promise((resolve) => {
            // Se já temos dados locais, resolvemos IMEDIATAMENTE para o app renderizar e o carregamento sumir
            if (this.data) resolve(this.data);

            this.dbRef.on('value', (snapshot) => {
                const cloudData = snapshot.val();
                if (cloudData) {
                    this.data = cloudData;
                    // Atualiza cache local para persistência offline
                    localStorage.setItem(DB_KEY, JSON.stringify(this.data));
                }
                
                // Re-renderiza a view atual se houver mudança nos dados vindo da nuvem
                if (App.currentView && App.currentView !== App.views.Login) {
                    App.render(App.currentView, App.currentProps);
                } else if (!App.localUser) {
                    App.render(App.views.Login);
                }
                
                // Resolve o carregamento inicial (se ainda não resolvido pelo localData)
                resolve(this.data);
            });

            // Timeout de segurança: Se o Firebase demorar ou estiver offline, 
            // liberamos o app com o que tivermos (ou nulo) após 4 segundos
            setTimeout(() => {
                console.log("Firebase sync timeout - procedendo com dados disponíveis");
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
                ${vehicle.type === 'car' ? '<div class="form-group"><label>Leitura Inicial (KM)</label><input type="number" id="start-val" value="${vehicle.lastVal || 0}"></div>' : ''}
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
                <div class="form-group"><label>Leitura Atual</label><input type="number" id="fuel-val" value="${vehicle.lastVal || 0}"></div>
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
        
        const local = prompt("Local de Chegada:") || "—";
        const gps = await App.getGPS();
        
        manager.data.usageLogs.push({ 
            ...session, endTime: new Date().toISOString(), endVal, endPhoto: App.currentPhoto, 
            endLocal: local, endLat: gps?.lat || null, endLng: gps?.lng || null,
            sessionDiff: (endVal - session.startVal).toFixed(2)
        });
        
        const vIdx = manager.data.vehicles.findIndex(vec => vec.id == v.id);
        manager.data.vehicles[vIdx].lastVal = endVal;
        
        delete manager.data.activeSessions[App.localUser];
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
            <th>Data</th><th>Veículo</th><th>Motorista</th><th>Leitura</th><th>Tipo</th><th>Litros</th><th>R$</th>
            <th>KM De</th><th>KM Até</th><th>Data De</th><th>Data Até</th><th>Média Abast.</th><th>Média Hist.</th><th>Mapa</th><th>Ações</th>
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
                <td>${map}</td>
                <td><button class="secondary btn-small" onclick="App.showEditFuelModal('${l.id}')">✏️</button></td>
            </tr>`;
        }).join('');
        h += `</tbody></table></div>`;
        
        h += `<h4 style="margin-top:20px">🚗 Uso</h4><div class="log-table-wrap"><table class="log-table"><thead><tr>
            <th>Veículo</th><th>Motorista</th><th>Local Saída</th><th>Mapa Saída</th><th>Início</th><th>Local Chegada</th><th>Mapa Chegada</th><th>Fim</th><th>Percorrido</th><th>Ações</th>
        </tr></thead><tbody>`;
        h += usage.map(l => {
            const v = manager.data.vehicles.find(v => v.id == l.vehicleId);
            const d = manager.data.drivers.find(d => d.id == l.driverId);
            const ms = l.startLat ? `<button class="secondary btn-small" onclick="App.showMap(${l.startLat},${l.startLng})">🗺️</button>` : '—';
            const me = l.endLat ? `<button class="secondary btn-small" onclick="App.showMap(${l.endLat},${l.endLng})">🗺️</button>` : '—';
            return `<tr>
                <td>${v?.name || '—'}</td>
                <td>${d?.name || '—'}</td>
                <td>${l.startLocal || '—'}</td>
                <td>${ms}</td>
                <td>${new Date(l.startTime).toLocaleString()}</td>
                <td>${l.endLocal || '—'}</td>
                <td>${me}</td>
                <td>${new Date(l.endTime).toLocaleString()}</td>
                <td>${l.sessionDiff}</td>
                <td><button class="secondary btn-small" onclick="App.showEditUsageModal('${l.id}')">✏️</button></td>
            </tr>`;
        }).join('');
        h += `</tbody></table></div>`;
        return h;
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

    renderAdminVehicles() { return `<h4>Veículos</h4><ul class="admin-list">${manager.data.vehicles.map(v => `<li>${v.name} (${v.type}) - KM/H: ${v.lastVal}</li>`).join('')}</ul>`; },
    renderAdminDrivers() { return `<h4>Usuários</h4><ul class="admin-list">${manager.data.drivers.map(d => `<li>${d.name} ${d.isAdmin ? '(Admin)' : ''}</li>`).join('')}</ul>`; },

    async forceCloseSession(uId) {
        if(confirm("Encerrar sessão forçadamente?")) { delete manager.data.activeSessions[uId]; await manager.saveData(); App.switchAdminTab('sessions'); }
    },

    // --- EDIÇÃO DE LOGS ---

    showEditFuelModal(id) {
        const l = manager.data.fuelLogs.find(f => f.id == id);
        if (!l) return;
        App.showModal(`
            <h3>Editar Abastecimento</h3>
            <div class="form-group"><label>Leitura (KM/H)</label><input type="number" id="edit-fuel-val" value="${l.val}"></div>
            <div class="form-group"><label>Litros</label><input type="number" step="0.01" id="edit-fuel-liters" value="${l.liters}"></div>
            <div class="form-group"><label>Total R$</label><input type="number" step="0.01" id="edit-fuel-total" value="${l.total}"></div>
            <button onclick="App.saveEditFuel('${id}')">Salvar</button>
            <button class="secondary" onclick="App.deleteFuelLog('${id}')" style="margin-top:10px; color:var(--danger)">Excluir Registro</button>
        `);
    },

    async saveEditFuel(id) {
        const idx = manager.data.fuelLogs.findIndex(f => f.id == id);
        manager.data.fuelLogs[idx].val = parseFloat(document.getElementById('edit-fuel-val').value);
        manager.data.fuelLogs[idx].liters = parseFloat(document.getElementById('edit-fuel-liters').value);
        manager.data.fuelLogs[idx].total = parseFloat(document.getElementById('edit-fuel-total').value);
        await manager.saveData();
        App.closeModal();
        App.switchAdminTab('logs');
    },

    async deleteFuelLog(id) {
        if(confirm("Deseja EXCLUIR este registro permanentemente?")) { 
            manager.data.fuelLogs = manager.data.fuelLogs.filter(f => f.id != id); 
            await manager.saveData(); 
            App.closeModal(); 
            App.switchAdminTab('logs'); 
        }
    },

    showEditUsageModal(id) {
        const l = manager.data.usageLogs.find(f => f.id == id);
        if(!l) return;
        App.showModal(`
            <h3>Editar Uso</h3>
            <div class="form-group"><label>Leitura Início</label><input type="number" id="edit-use-start" value="${l.startVal}"></div>
            <div class="form-group"><label>Leitura Fim</label><input type="number" id="edit-use-end" value="${l.endVal}"></div>
            <button onclick="App.saveEditUsage('${id}')">Salvar</button>
            <button class="secondary" onclick="App.deleteUsageLog('${id}')" style="margin-top:10px; color:var(--danger)">Excluir Registro</button>
        `);
    },

    async saveEditUsage(id) {
        const idx = manager.data.usageLogs.findIndex(f => f.id == id);
        const s = parseFloat(document.getElementById('edit-use-start').value);
        const e = parseFloat(document.getElementById('edit-use-end').value);
        manager.data.usageLogs[idx].startVal = s;
        manager.data.usageLogs[idx].endVal = e;
        manager.data.usageLogs[idx].sessionDiff = (e - s).toFixed(2);
        await manager.saveData();
        App.closeModal();
        App.switchAdminTab('logs');
    },

    async deleteUsageLog(id) {
        if(confirm("Deseja EXCLUIR este registro permanentemente?")) { 
            manager.data.usageLogs = manager.data.usageLogs.filter(f => f.id != id); 
            await manager.saveData(); 
            App.closeModal(); 
            App.switchAdminTab('logs'); 
        }
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
                            <h3>Sessão Ativa</h3>
                            <button class="danger" onclick="App.render(App.views.CheckOutView)">Finalizar Uso do Veículo</button>
                        </div>` :
                        `<button onclick="App.render(App.views.CheckInView)">Iniciar Check-in</button>`
                    }
                    <button class="secondary" onclick="App.render(App.views.FuelView)">⛽ Registrar Abastecimento</button>
                    ${(user?.isAdmin || user?.name === 'Leandro Felipe') ? `<button class="secondary" onclick="App.render(App.views.AdminPanel)">📊 Painel Administrativo</button>` : ''}
                </div>
            </div>
        `},
        CheckInView: () => `
            <div class="container slide-up">
                <button class="secondary btn-small" onclick="App.render(App.views.Dashboard)">← Voltar</button>
                <h1>Check-in</h1>
                <select id="vehicle-select" onchange="App.handleVehicleChange(this.value, 'checkin-fields')">
                    <option value="">Selecione o veículo</option>
                    ${manager.data.vehicles.map(v => `<option value="${v.id}">${v.name}</option>`).join('')}
                </select>
                <div id="checkin-fields"></div>
            </div>
        `,
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
        FuelView: () => `
            <div class="container slide-up">
                <button class="secondary btn-small" onclick="App.render(App.views.Dashboard)">← Voltar</button>
                <h1>Abastecimento</h1>
                <select id="fuel-vehicle-select" onchange="App.handleVehicleChange(this.value, 'fuel-form-fields')">
                    <option value="">Selecione o veículo</option>
                    ${manager.data.vehicles.map(v => `<option value="${v.id}">${v.name}</option>`).join('')}
                </select>
                <div id="fuel-form-fields"></div>
            </div>
        `,
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
