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

// Inicializa Firebase apenas se não estiver inicializado
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
                            { id: 1, name: 'Hilux - ABC-1234', plate: 'ABC-1234', model: 'Toyota Hilux', type: 'car', defaultFuel: 'Diesel S10', lastVal: 15200 },
                            { id: 2, name: 'Barco Turbo', plate: 'BRA-9988', model: 'Lancha 24ft', type: 'boat', defaultFuel: 'Gasolina', lastVal: 450 }
                        ],
                        drivers: [
                            { id: 1, name: 'João Silva' },
                            { id: 2, name: 'Maria Santos' },
                            { id: 3, name: 'Leandro Felipe' }
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

    async addVehicle(vehicle) {
        vehicle.id = Date.now();
        this.data.vehicles.push(vehicle);
        await this.saveData();
    }

    async deleteVehicle(id) {
        this.data.vehicles = this.data.vehicles.filter(v => v.id != id);
        await this.saveData();
    }

    async addDriver(name) {
        this.data.drivers.push({ id: Date.now(), name });
        await this.saveData();
    }

    async deleteDriver(id) {
        this.data.drivers = this.data.drivers.filter(d => d.id != id);
        await this.saveData();
    }

    async updateFuelLog(id, newData) {
        const index = this.data.fuelLogs.findIndex(l => l.id == id);
        if (index !== -1) {
            this.data.fuelLogs[index] = { ...this.data.fuelLogs[index], ...newData };
            await this.saveData();
        }
    }

    validateKM(vehicleId, currentVal) {
        const vehicle = this.data.vehicles.find(v => v.id == vehicleId);
        if (!vehicle) return { ok: true };
        const lastVal = vehicle.lastVal || 0;
        if (currentVal < lastVal) return { ok: false, msg: `Valor (${currentVal}) é menor que o último registro (${lastVal}).` };
        if (currentVal > lastVal + 2000) return { ok: false, msg: `Salto muito grande detectado.` };
        return { ok: true };
    }

    simulateAIScan() {
        return new Promise(resolve => {
            setTimeout(() => resolve({
                liters: (Math.random() * 50 + 10).toFixed(2),
                pricePerLiter: (Math.random() * 2 + 5).toFixed(2),
                total: 0 // calc later
            }), 1500);
        });
    }

    exportExcel() {
        // ... (Export code kept as is for brevity, functional but omitted for space if needed)
        const fuelData = this.data.fuelLogs.map((l, index) => {
            const vehicle = this.data.vehicles.find(v => v.id == l.vehicleId);
            const driver = this.data.drivers.find(d => d.id == l.driverId);
            let consumption = "N/A";
            if (l.isFull && vehicle) {
                const previousFull = this.data.fuelLogs.slice(0, index).reverse().find(log => log.vehicleId == l.vehicleId && log.isFull);
                if (previousFull) {
                    const diffVal = l.val - previousFull.val;
                    if (diffVal > 0) consumption = vehicle.type === 'car' ? (diffVal / l.liters).toFixed(2) + " km/L" : (l.liters / diffVal).toFixed(2) + " L/h";
                }
            }
            return { "ID": l.id, "Data": new Date(l.date).toLocaleString(), "Veículo": vehicle?.name, "KM/Horas": l.val, "Litros": l.liters, "Média": consumption };
        });
        const usageData = this.data.usageLogs.flatMap(l => {
            const vehicle = this.data.vehicles.find(v => v.id == l.vehicleId);
            return [
                { "ID": l.id, "Data": new Date(l.startTime).toLocaleString(), "Tipo": "Check-In", "Valor": l.startVal },
                { "ID": l.id, "Data": new Date(l.endTime).toLocaleString(), "Tipo": "Check-Out", "Valor": l.endVal }
            ];
        });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(fuelData), "Abastecimentos");
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(usageData), "Uso");
        XLSX.writeFile(workbook, "relatorio_frota.xlsx");
    }
}

const manager = new FleetManager();

const App = {
    currentPhoto: null,
    currentView: null,
    currentProps: {},

    async init() {
        await manager.init();
    },

    render(view, props = {}) {
        App.currentView = view;
        App.currentProps = props;
        const root = document.getElementById('app');
        if (!manager.data) {
            root.innerHTML = `<div class="loading-screen"><div class="spinner"></div><p>Conectando...</p></div>`;
            return;
        }
        if (!manager.data.currentUser && view !== App.views.Login) return App.render(App.views.Login);
        const headerHtml = `<div class="logo-container"><img src="${LOGO_URL}" alt="Essencio" class="logo-main"></div>`;
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
                    <button onclick="App.login()">Entrar</button>
                </div>
            </div>
        `,
        Dashboard: () => {
            const user = manager.data.drivers.find(d => d.id == manager.data.currentUser);
            const isAdmin = user?.name === 'Leandro Felipe';
            return `
            <div class="container slide-up">
                <header style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px">
                    <div>
                        <p style="color:var(--text-muted); font-size: 0.8rem">Olá, ${user?.name}</p>
                        <h2 style="margin:0">Dashboard</h2>
                    </div>
                    <div style="display:flex; gap: 8px">
                        ${isAdmin ? `<button onclick="App.checkAdminAccess()" class="secondary" style="width:40px; height:40px; padding:0; border-radius:50%">⚙️</button>` : ''}
                        <button onclick="App.logout()" class="secondary" style="width:40px; height:40px; padding:0; border-radius:50%">🚪</button>
                    </div>
                </header>
                <div style="display:grid; gap: 12px">
                    ${manager.data.currentSession ?
                    `<button onclick="App.render(App.views.CheckOut)" class="danger">Finalizar Expediente</button>` :
                    `<button onclick="App.render(App.views.CheckIn)">Iniciar Check-in</button>`
                }
                    <button class="secondary" onclick="App.render(App.views.FuelLog)">⛽ Registrar Abastecimento</button>
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
                <p>Veículo: ${vehicle.name}</p>
                ${vehicle.type === 'boat' ? '<p>Horas calculadas automaticamente.</p>' : '<input type="number" id="end-val" placeholder="KM Final">'}
                <div class="photo-preview" id="photo-preview" onclick="App.takePhoto()"><span>Clique p/ Foto Painel</span></div>
                <button class="danger" onclick="App.submitCheckOut(event)">Finalizar e Salvar</button>
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
                <h1>Admin</h1>
                <div class="admin-tabs" style="display:flex; gap:10px; margin-bottom:15px">
                    <button class="tab-btn active" onclick="App.switchAdminTab('logs')">Logs</button>
                    <button class="tab-btn" onclick="App.switchAdminTab('vehicles')">Veículos</button>
                </div>
                <div id="admin-content" class="admin-list">${App.renderAdminLogs()}</div>
                <button class="secondary" style="margin-top:20px" onclick="manager.exportExcel()">📊 Exportar Excel</button>
            </div>
        `
    },

    async login() {
        manager.data.currentUser = document.getElementById('login-driver-select').value;
        await manager.saveData();
        App.render(App.views.Dashboard);
    },

    async logout() {
        if (confirm("Sair?")) {
            manager.data.currentUser = null;
            await manager.saveData();
            App.render(App.views.Login);
        }
    },

    checkAdminAccess() {
        App.showModal(`
            <h3>Acesso Admin</h3>
            <input type="password" id="admin-pass-input" placeholder="Senha">
            <button onclick="App.submitAdminPassword()" style="margin-top:10px">Entrar</button>
        `);
    },

    submitAdminPassword() {
        if (document.getElementById('admin-pass-input').value === "Essencio123") {
            App.closeModal();
            App.render(App.views.AdminPanel);
        } else alert("Incorreta!");
    },

    handleVehicleChange(vId, targetId) {
        const vehicle = manager.data.vehicles.find(v => v.id == vId);
        const container = document.getElementById(targetId);
        if (!vehicle) return;
        if (targetId === 'checkin-fields') {
            container.innerHTML = `
                ${vehicle.type === 'car' ? '<input type="number" id="start-val" placeholder="KM Inicial">' : ''}
                <div class="photo-preview" id="photo-preview" onclick="App.takePhoto()"><span>Foto Painel</span></div>
                <button onclick="App.submitCheckIn()">Iniciar</button>
            `;
        } else {
            container.innerHTML = `
                <input type="number" id="fuel-val" value="${vehicle.lastVal || 0}" placeholder="KM/Horas">
                <div class="photo-preview" id="photo-preview" onclick="App.takePhoto()"><span>Foto Comprovante</span></div>
                <div style="display:flex; gap:10px">
                    <input type="number" id="fuel-liters" placeholder="Litros" oninput="App.calcFuelTotal()">
                    <input type="number" id="fuel-price-l" placeholder="R$/L" oninput="App.calcFuelTotal()">
                </div>
                <input type="number" id="fuel-total" placeholder="Total R$">
                <div style="display:flex; align-items:center; gap:8px; margin:10px 0">
                    <input type="checkbox" id="fuel-full"> <label>Tanque Cheio?</label>
                </div>
                <button onclick="App.submitFuel()">Salvar Abastecimento</button>
            `;
        }
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
        if (!App.currentPhoto || (vehicle.type === 'car' && isNaN(val))) return alert("Dados incompletos!");
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
        if (isNaN(val) || !App.currentPhoto) return alert("Dados incompletos!");
        const btn = event.target;
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
        } catch (e) { alert(e.message); btn.disabled = false; }
    },

    async submitFuel() {
        const vId = document.getElementById('fuel-vehicle-select').value;
        const val = parseFloat(document.getElementById('fuel-val').value);
        const liters = parseFloat(document.getElementById('fuel-liters').value);
        const total = parseFloat(document.getElementById('fuel-total').value);
        if (isNaN(val) || isNaN(liters) || !App.currentPhoto) return alert("Preencha tudo!");
        try {
            manager.data.fuelLogs.push({ id: Date.now(), driverId: manager.data.currentUser, vehicleId: vId, date: new Date().toISOString(), val, liters, total: total.toFixed(2), isFull: document.getElementById('fuel-full').checked, photo: App.currentPhoto });
            const vIdx = manager.data.vehicles.findIndex(v => v.id == vId);
            if (document.getElementById('fuel-full').checked || val > (manager.data.vehicles[vIdx].lastVal || 0)) manager.data.vehicles[vIdx].lastVal = val;
            await manager.saveData();
            App.currentPhoto = null;
            App.render(App.views.Dashboard);
        } catch (e) { alert(e.message); }
    },

    renderAdminLogs() {
        const fuel = (manager.data.fuelLogs || []).slice().reverse();
        const usage = (manager.data.usageLogs || []).slice().reverse();
        let h = "<h4>Últimos Registros</h4>";
        h += fuel.map(l => `<div class="admin-item"><span>Abast.: ${l.liters}L</span></div>`).join('');
        h += usage.map(l => `<div class="admin-item"><span>Uso: ${l.sessionDiff}</span></div>`).join('');
        return h;
    },

    switchAdminTab(tab) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.innerText.toLowerCase().includes(tab)));
        document.getElementById('admin-content').innerHTML = tab === 'logs' ? App.renderAdminLogs() : '<p>Gestão de veículos em breve.</p>';
    },

    showModal(html) {
        const d = document.createElement('div');
        d.className = 'modal-overlay';
        d.innerHTML = `<div class="modal-content"><button class="secondary" onclick="App.closeModal()">Fechar</button>${html}</div>`;
        document.body.appendChild(d);
    },

    closeModal() {
        const m = document.querySelector('.modal-overlay');
        if (m) m.remove();
    }
};

window.App = App;
App.init();
