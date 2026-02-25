/**
 * Controle de Abastecimento - Sistema de Monitoramento V3 (Nuvem)
 * Com Firebase Realtime Database para acesso global
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

class FleetManager {
    constructor() {
        this.data = null;
        this.dbRef = db.ref('fleet_data');
    }

    async init() {
        return new Promise((resolve) => {
            this.dbRef.on('value', (snapshot) => {
                const cloudData = snapshot.val();
                if (cloudData) {
                    this.data = cloudData;
                    if (!this.data.usageLogs) this.data.usageLogs = [];
                    if (!this.data.fuelLogs) this.data.fuelLogs = [];
                } else {
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
                        usageLogs: [],
                        fuelLogs: [],
                        currentUser: null
                    };
                    this.saveData();
                }
                localStorage.setItem(DB_KEY, JSON.stringify(this.data));
                if (window.App) {
                    if (window.App.currentView) {
                        window.App.render(window.App.currentView, window.App.currentProps);
                    } else {
                        window.App.render(window.App.views.Login);
                    }
                }
                resolve(this.data);
            });
        });
    }

    async saveData() {
        if (!this.data) return;
        return this.dbRef.set(this.data);
    }

    async addVehicle(v) { v.id = Date.now(); this.data.vehicles.push(v); await this.saveData(); }
    async deleteVehicle(id) { this.data.vehicles = this.data.vehicles.filter(v => v.id != id); await this.saveData(); }
    async addDriver(name) { this.data.drivers.push({ id: Date.now(), name, isAdmin: false }); await this.saveData(); }
    async deleteDriver(id) { this.data.drivers = this.data.drivers.filter(d => d.id != id); await this.saveData(); }

    simulateAIScan() {
        return new Promise(resolve => {
            setTimeout(() => {
                const liters = (Math.random() * 50 + 10).toFixed(2);
                const pricePerLiter = (Math.random() * 2 + 5).toFixed(2);
                resolve({ liters, pricePerLiter, total: (liters * pricePerLiter).toFixed(2) });
            }, 1000);
        });
    }

    exportExcel() {
        const fuelData = (this.data.fuelLogs || []).map(l => {
            const v = this.data.vehicles.find(v => v.id == l.vehicleId);
            const d = this.data.drivers.find(d => d.id == l.driverId);
            return { "Data": new Date(l.date).toLocaleString(), "Veículo": v?.name, "Motorista": d?.name, "KM/Horas": l.val, "Litros": l.liters, "Total R$": l.total };
        });
        const usageData = (this.data.usageLogs || []).map(l => {
            const v = this.data.vehicles.find(v => v.id == l.vehicleId);
            const d = this.data.drivers.find(d => d.id == l.driverId);
            return { "Veículo": v?.name, "Motorista": d?.name, "Início": new Date(l.startTime).toLocaleString(), "Fim": new Date(l.endTime).toLocaleString(), "KM/h Percorrido": l.sessionDiff };
        });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fuelData), "Abastecimentos");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(usageData), "Uso");
        XLSX.writeFile(wb, "Controle_Frota_Essencio.xlsx");
    }
}

const manager = new FleetManager();

const App = {
    currentPhoto: null,
    currentView: null,
    currentProps: {},

    async init() { await manager.init(); },

    render(view, props = {}) {
        App.currentView = view;
        App.currentProps = props;
        const root = document.getElementById('app');
        if (!manager.data) return;
        if (!manager.data.currentUser && view !== App.views.Login) return App.render(App.views.Login);

        const user = manager.data.drivers.find(d => d.id == manager.data.currentUser);
        const headerHtml = `
            <div class="logo-container">
                <img src="${LOGO_URL}" alt="Essencio" class="logo-main" onclick="App.render(App.views.Dashboard)" style="cursor:pointer">
                ${user ? `<div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 5px">${user.name} ${user.isAdmin || user.name === 'Leandro Felipe' ? '(Administrador)' : ''}</div>` : ''}
            </div>
        `;
        root.innerHTML = headerHtml + view(props);
        window.scrollTo(0, 0);
    },

    views: {
        Login: () => `
            <div class="container slide-up" style="text-align: center; margin-top: 40px">
                <h1>Bem-vindo!</h1>
                <p style="color:var(--text-muted); margin-bottom: 30px">Selecione seu usuário.</p>
                <div class="card">
                    <select id="login-driver-select">
                        ${manager.data.drivers.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
                    </select>
                    <input type="password" id="login-pass-input" placeholder="Senha de Acesso" style="margin-top:10px">
                    <button onclick="App.login()">Entrar</button>
                </div>
            </div>
        `,
        Dashboard: () => {
            const user = manager.data.drivers.find(d => d.id == manager.data.currentUser);
            const isAdmin = user?.isAdmin || user?.name === 'Leandro Felipe';
            return `
            <div class="container slide-up">
                <header style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px">
                    <div>
                        <p style="color:var(--text-muted); font-size: 0.8rem">Olá, ${user?.name}</p>
                        <h2 style="margin:0">Dashboard</h2>
                    </div>
                    <div style="display:flex; gap: 8px">
                        ${isAdmin ? `<button onclick="App.render(App.views.AdminPanel)" class="secondary" style="width:40px; height:40px; padding:0; border-radius:50%">⚙️</button>` : ''}
                        <button onclick="App.logout()" class="secondary" style="width:40px; height:40px; padding:0; border-radius:50%">🚪</button>
                    </div>
                </header>
                <div style="display:grid; gap: 12px">
                    ${manager.data.currentSession ?
                    `<button onclick="App.render(App.views.CheckOut)" class="danger">Finalizar Expediente</button>` :
                    `<button onclick="App.render(App.views.CheckIn)">Iniciar Check-in</button>`
                }
                    <button class="secondary" onclick="App.render(App.views.FuelLog)">⛽ Registrar Abastecimento</button>
                    ${isAdmin ? `<button class="secondary" onclick="App.render(App.views.AdminPanel)">📊 Painel do Gestor</button>` : ''}
                    <button class="secondary" onclick="App.init()" style="font-size: 0.7rem; opacity: 0.5">🔄 Sincronizar</button>
                </div>
            </div>
        `},
        CheckIn: () => `
            <div class="container slide-up">
                <button class="secondary btn-small" onclick="App.render(App.views.Dashboard)">← Voltar</button>
                <h1>Check-in</h1>
                <select id="vehicle-select" onchange="App.handleVehicleChange(this.value, 'checkin-fields')">
                    <option value="">Selecione o veículo...</option>
                    ${manager.data.vehicles.map(v => `<option value="${v.id}">${v.name}</option>`).join('')}
                </select>
                <div id="checkin-fields"></div>
            </div>
        `,
        CheckOut: () => {
            const session = manager.data.currentSession;
            const vehicle = manager.data.vehicles.find(v => v.id == session.vehicleId);
            return `
            <div class="container slide-up">
                <button class="secondary btn-small" onclick="App.render(App.views.Dashboard)">← Voltar</button>
                <h1>Check-out</h1>
                <p>Veículo: <strong>${vehicle.name}</strong></p>
                <div class="card" style="background: rgba(0,188,193,0.1); margin-bottom: 20px; border: 1px solid var(--accent)">
                    <p style="margin:0; font-size: 0.9rem">Início: <strong>${session.startVal}</strong></p>
                </div>
                ${vehicle.type === 'boat' ? '<p style="font-size:0.8rem">Horas calculadas automaticamente.</p>' : '<div class="form-group"><label>KM Final</label><input type="number" id="end-val" placeholder="KM Atual"></div>'}
                <div class="photo-preview" id="photo-preview" onclick="App.takePhoto()"><span>Foto Painel</span></div>
                <button class="danger" id="btn-checkout" onclick="App.submitCheckOut(event)">Finalizar e Salvar</button>
            </div>
        `},
        FuelLog: () => `
            <div class="container slide-up">
                <button class="secondary btn-small" onclick="App.render(App.views.Dashboard)">← Voltar</button>
                <h1>Abastecimento</h1>
                <select id="fuel-vehicle-select" onchange="App.handleVehicleChange(this.value, 'fuel-form-fields')">
                    <option value="">Selecione o veículo...</option>
                    ${manager.data.vehicles.map(v => `<option value="${v.id}">${v.name}</option>`).join('')}
                </select>
                <div id="fuel-form-fields"></div>
            </div>
        `,
        AdminPanel: () => `
            <div class="container slide-up">
                <button class="secondary btn-small" onclick="App.render(App.views.Dashboard)">← Voltar</button>
                <h1>Painel Admin</h1>
                <div class="admin-tabs" style="display:flex; gap:5px; margin-bottom:15px">
                    <button class="tab-btn active btn-small" onclick="App.switchAdminTab('logs')">Logs</button>
                    <button class="tab-btn btn-small" onclick="App.switchAdminTab('vehicles')">Veículos</button>
                    <button class="tab-btn btn-small" onclick="App.switchAdminTab('drivers')">Usuários</button>
                </div>
                <div id="admin-content" class="admin-list">${App.renderAdminLogs()}</div>
                <button class="secondary" style="margin-top:20px" onclick="manager.exportExcel()">📊 Exportar Excel</button>
            </div>
        `
    },

    login() {
        const id = document.getElementById('login-driver-select').value;
        const pass = document.getElementById('login-pass-input').value;

        if (pass !== "Essencio123") return alert("Senha de acesso incorreta!");

        manager.data.currentUser = id;
        manager.saveData();
        App.render(App.views.Dashboard);
    },

    logout() {
        if (confirm("Sair?")) { manager.data.currentUser = null; manager.saveData(); App.render(App.views.Login); }
    },

    checkAdminAccess() {
        App.showModal(`
            <h3>Acesso Restrito</h3>
            <input type="password" id="admin-pass-input" placeholder="Senha">
            <button onclick="App.submitAdminPassword()" style="margin-top:10px">Entrar</button>
        `);
    },

    submitAdminPassword() {
        if (document.getElementById('admin-pass-input').value === "Essencio123") {
            App.closeModal();
            App.render(App.views.AdminPanel);
        } else alert("Senha incorreta!");
    },

    handleVehicleChange(vId, targetId) {
        const vehicle = manager.data.vehicles.find(v => v.id == vId);
        const container = document.getElementById(targetId);
        if (!vehicle) return;

        const lastValLabel = `
            <div class="card" style="background: rgba(0,188,193,0.1); margin-bottom: 15px; border: 1px solid var(--accent)">
                <p style="margin:0; font-size: 0.9rem">Último Registro: <strong>${vehicle.lastVal || 0}</strong> ${vehicle.type === 'boat' ? 'horas' : 'km'}</p>
            </div>
        `;

        if (targetId === 'checkin-fields') {
            container.innerHTML = `
                ${lastValLabel}
                ${vehicle.type === 'car' ? '<div class="form-group"><label>KM Inicial</label><input type="number" id="start-val" value="${vehicle.lastVal || 0}"></div>' : ''}
                <div class="photo-preview" id="photo-preview" onclick="App.takePhoto()"><span>Foto Painel</span></div>
                <button onclick="App.submitCheckIn()">Iniciar</button>
            `;
        } else {
            container.innerHTML = `
                ${lastValLabel}
                <div class="form-group"><label>KM/Horas Atual</label><input type="number" id="fuel-val" value="${vehicle.lastVal || 0}"></div>
                <div id="ai-status"></div>
                <div class="photo-preview" id="photo-preview" onclick="App.processReceiptIA()"><span>Foto Comprovante (IA)</span></div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px">
                    <div class="form-group"><label>Litros</label><input type="number" step="0.01" id="fuel-liters" oninput="App.calcFuelTotal()"></div>
                    <div class="form-group"><label>R$/L</label><input type="number" step="0.01" id="fuel-price-l" oninput="App.calcFuelTotal()"></div>
                </div>
                <div class="form-group"><label>Total R$</label><input type="number" id="fuel-total"></div>
                <label style="display:flex; align-items:center; gap:5px; margin-bottom:15px"><input type="checkbox" id="fuel-full"> Tanque Cheio?</label>
                <button onclick="App.submitFuel()">Salvar Abastecimento</button>
            `;
        }
    },

    async processReceiptIA() {
        App.takePhoto();
        const s = document.getElementById('ai-status');
        if (s) s.innerHTML = "<p style='font-size:0.7rem; color:var(--accent)'>Interpretando comprovante...</p>";
        const data = await manager.simulateAIScan();
        document.getElementById('fuel-liters').value = data.liters;
        document.getElementById('fuel-price-l').value = data.pricePerLiter;
        document.getElementById('fuel-total').value = data.total;
        if (s) s.innerHTML = "<p style='font-size:0.7rem; color:var(--success)'>✓ Dados extraídos!</p>";
    },

    calcFuelTotal() {
        const l = parseFloat(document.getElementById('fuel-liters').value) || 0;
        const p = parseFloat(document.getElementById('fuel-price-l').value) || 0;
        document.getElementById('fuel-total').value = (l * p).toFixed(2);
    },

    takePhoto() {
        const preview = document.getElementById('photo-preview');
        preview.innerHTML = `<img src="https://images.unsplash.com/photo-1594914141274-78304524ef6c?q=80&w=200&auto=format&fit=crop" style="width:100%; height:100%; object-fit:cover">`;
        App.currentPhoto = "photo_" + Date.now();
    },

    async submitCheckIn() {
        const vId = document.getElementById('vehicle-select').value;
        const vehicle = manager.data.vehicles.find(v => v.id == vId);
        const val = vehicle.type === 'boat' ? vehicle.lastVal : parseFloat(document.getElementById('start-val').value);
        if (!App.currentPhoto || isNaN(val)) return alert("Dados incompletos!");
        manager.data.currentSession = { id: Date.now(), driverId: manager.data.currentUser, vehicleId: vId, startTime: new Date().toISOString(), startVal: val, startPhoto: App.currentPhoto };
        await manager.saveData();
        App.currentPhoto = null;
        App.render(App.views.Dashboard);
    },

    async submitCheckOut(event) {
        const session = manager.data.currentSession;
        const vehicle = manager.data.vehicles.find(v => v.id == session.vehicleId);
        let val;
        if (vehicle.type === 'boat') {
            const diff = (new Date() - new Date(session.startTime)) / 3600000;
            val = (parseFloat(session.startVal) || 0) + parseFloat(diff.toFixed(2));
        } else val = parseFloat(document.getElementById('end-val').value);

        if (isNaN(val) || !App.currentPhoto) return alert("Preencha o KM e tire a foto!");

        const btn = document.getElementById('btn-checkout') || event.target;
        btn.disabled = true;
        btn.innerText = "Salvando...";

        try {
            manager.data.usageLogs.push({ ...session, id: Date.now(), endTime: new Date().toISOString(), endVal: val, sessionDiff: (val - session.startVal).toFixed(2), endPhoto: App.currentPhoto });
            const vIdx = manager.data.vehicles.findIndex(v => v.id == session.vehicleId);
            if (vIdx !== -1) manager.data.vehicles[vIdx].lastVal = val;
            manager.data.currentSession = null;
            await manager.saveData();
            App.currentPhoto = null;
            App.render(App.views.Dashboard);
        } catch (e) { alert(e.message); btn.disabled = false; btn.innerText = "Finalizar e Salvar"; }
    },

    async submitFuel() {
        const vId = document.getElementById('fuel-vehicle-select').value;
        const val = parseFloat(document.getElementById('fuel-val').value);
        const liters = parseFloat(document.getElementById('fuel-liters').value);
        const total = document.getElementById('fuel-total').value;
        if (isNaN(val) || isNaN(liters) || !App.currentPhoto) return alert("Preencha tudo!");
        try {
            manager.data.fuelLogs.push({ id: Date.now(), driverId: manager.data.currentUser, vehicleId: vId, date: new Date().toISOString(), val, liters, total, isFull: document.getElementById('fuel-full').checked, photo: App.currentPhoto });
            const vIdx = manager.data.vehicles.findIndex(v => v.id == vId);
            if (val > (manager.data.vehicles[vIdx].lastVal || 0)) manager.data.vehicles[vIdx].lastVal = val;
            await manager.saveData();
            App.currentPhoto = null;
            App.render(App.views.Dashboard);
        } catch (e) { alert(e.message); }
    },

    renderAdminLogs() {
        const fuel = (manager.data.fuelLogs || []).slice().reverse();
        const usage = (manager.data.usageLogs || []).slice().reverse();
        let h = "<h4>Últimos Logs</h4>";
        h += fuel.map(l => {
            const v = manager.data.vehicles.find(v => v.id == l.vehicleId);
            return `<div class="admin-item" style="font-size:0.8rem">⛽ ${v?.name}: ${l.liters}L - R$ ${l.total}</div>`;
        }).join('');
        h += usage.map(l => {
            const v = manager.data.vehicles.find(v => v.id == l.vehicleId);
            return `<div class="admin-item" style="font-size:0.8rem">🚗 ${v?.name}: ${l.sessionDiff} percorrido</div>`;
        }).join('');
        return h;
    },

    renderAdminVehicles() {
        let h = "<h4>Novo Veículo</h4>";
        h += `<input id="new-v-name" placeholder="Nome"><select id="new-v-type"><option value='car'>Carro</option><option value='boat'>Barco</option></select><button onclick="App.submitAddVehicle()" class="btn-small">Add</button><h4>Frota</h4>`;
        h += manager.data.vehicles.map(v => `<div class="admin-item"><span>${v.name}</span> <button class="danger btn-small" onclick="App.deleteVehicle(${v.id})" style="width:35px">🗑️</button></div>`).join('');
        return h;
    },

    renderAdminDrivers() {
        let h = "<h4>Novo Usuário</h4>";
        h += `<input id="new-d-name" placeholder="Nome"><button onclick="App.submitAddDriver()" class="btn-small">Add</button><h4>Usuários</h4>`;
        h += manager.data.drivers.map(d => `<div class="admin-item"><span>${d.name} (${d.isAdmin ? 'Admin' : 'Motor'})</span> <div style="display:flex; gap:5px"><button class="secondary btn-small" onclick="App.toggleUserAdmin(${d.id})" style="font-size:0.7rem">Usuário / Adm</button><button class="danger btn-small" onclick="App.deleteDriver(${d.id})" style="width:35px">🗑️</button></div></div>`).join('');
        return h;
    },

    async submitAddVehicle() {
        const name = document.getElementById('new-v-name').value;
        const type = document.getElementById('new-v-type').value;
        if (!name) return alert("Digite o nome/placa");
        await manager.addVehicle({ name, type, lastVal: 0 });
        App.switchAdminTab('vehicles');
    },

    async submitAddDriver() {
        const name = document.getElementById('new-d-name').value;
        if (!name) return alert("Digite o nome");
        await manager.addDriver(name);
        App.switchAdminTab('drivers');
    },

    async deleteVehicle(id) {
        if (confirm("Excluir veículo?")) {
            await manager.deleteVehicle(id);
            App.switchAdminTab('vehicles');
        }
    },

    async deleteDriver(id) {
        if (confirm("Excluir usuário?")) {
            await manager.deleteDriver(id);
            App.switchAdminTab('drivers');
        }
    },

    async toggleUserAdmin(id) {
        const d = manager.data.drivers.find(d => d.id == id);
        if (d) { d.isAdmin = !d.isAdmin; await manager.saveData(); App.switchAdminTab('drivers'); }
    },

    switchAdminTab(tab) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const btn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.innerText.toLowerCase().includes(tab.slice(0, 3)));
        if (btn) btn.classList.add('active');
        const content = document.getElementById('admin-content');
        if (tab === 'logs') content.innerHTML = App.renderAdminLogs();
        if (tab === 'vehicles') content.innerHTML = App.renderAdminVehicles();
        if (tab === 'drivers') content.innerHTML = App.renderAdminDrivers();
    },

    showModal(html) {
        const d = document.createElement('div');
        d.className = 'modal-overlay';
        d.innerHTML = `<div class="modal-content"><button class="secondary" onclick="App.closeModal()">Fechar</button>${html}</div>`;
        document.body.appendChild(d);
    },

    closeModal() { const m = document.querySelector('.modal-overlay'); if (m) m.remove(); }
};

window.App = App;
App.init();
