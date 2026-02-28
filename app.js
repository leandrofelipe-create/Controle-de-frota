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
    async addDriver(name, password) { this.data.drivers.push({ id: Date.now(), name, password: password || 'Essencio123', isAdmin: false }); await this.saveData(); }
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

    exportExcelFiltered(filters = {}) {
        const { vehicleId, driverId, dateFrom, dateTo } = filters;
        const inRange = (dateStr) => {
            if (!dateStr) return true;
            const d = new Date(dateStr);
            if (dateFrom && d < new Date(dateFrom)) return false;
            if (dateTo && d > new Date(dateTo + 'T23:59:59')) return false;
            return true;
        };
        const fuelLogs = this.data.fuelLogs || [];
        const fuelData = fuelLogs.filter(l =>
            (!vehicleId || l.vehicleId == vehicleId) &&
            (!driverId || l.driverId == driverId) &&
            inRange(l.date)
        ).map(l => {
            const v = this.data.vehicles.find(v => v.id == l.vehicleId);
            const d = this.data.drivers.find(d => d.id == l.driverId);
            const metrics = App.calcFuelMetrics(l.vehicleId, l, fuelLogs);
            return {
                "Data": new Date(l.date).toLocaleString(),
                "Veículo": v?.name,
                "Motorista": d?.name,
                "KM/Horas no Abastecimento": l.val,
                "Litros": l.liters,
                "Total R$": l.total,
                "Tanque Cheio": l.isFull ? 'Sim' : 'Não',
                "KM Período De": metrics.periodFrom,
                "KM Período Até": metrics.periodTo,
                "Data Período De": metrics.dateFrom,
                "Data Período Até": metrics.dateTo,
                [`Média Abastecimento (${metrics.unit})`]: metrics.avgThis,
                [`Média Histórica Veículo (${metrics.unit})`]: metrics.avgHistoric
            };
        });
        const usageLogs = this.data.usageLogs || [];
        const usageData = usageLogs.filter(l =>
            (!vehicleId || l.vehicleId == vehicleId) &&
            (!driverId || l.driverId == driverId) &&
            inRange(l.startTime)
        ).map(l => {
            const v = this.data.vehicles.find(v => v.id == l.vehicleId);
            const d = this.data.drivers.find(d => d.id == l.driverId);
            return {
                "Veículo": v?.name,
                "Motorista": d?.name,
                "Início": new Date(l.startTime).toLocaleString(),
                "Fim": new Date(l.endTime).toLocaleString(),
                "KM/h Percorrido": l.sessionDiff
            };
        });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fuelData.length ? fuelData : [{}]), "Abastecimentos");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(usageData.length ? usageData : [{}]), "Uso");
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
                    <div style="display:flex; gap:10px; margin-top:10px">
                        <button class="secondary btn-small" onclick="App.render(App.views.ChangePassword)" style="flex:1; font-size:0.75rem">🔐 Alterar Senha</button>
                        <button class="secondary btn-small" onclick="App.init()" style="flex:1; font-size:0.75rem">🔄 Sincronizar</button>
                    </div>
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
                <button class="secondary" style="margin-top:20px" onclick="App.showExportModal()">📊 Exportar Excel</button>
            </div>
        `,
        ChangePassword: () => `
            <div class="container slide-up">
                <button class="secondary btn-small" onclick="App.render(App.views.Dashboard)">← Voltar</button>
                <h1>Alterar Senha</h1>
                <div class="card">
                    <div class="form-group">
                        <label>Nova Senha</label>
                        <input type="password" id="new-self-pass" placeholder="Mínimo 4 caracteres">
                    </div>
                    <button onclick="App.submitChangePassword()">Salvar Nova Senha</button>
                </div>
            </div>
        `
    },

    login() {
        const id = document.getElementById('login-driver-select').value;
        const pass = document.getElementById('login-pass-input').value;
        const user = manager.data.drivers.find(d => d.id == id);

        // Se senha foi apagada pelo admin, qualquer entrada no campo é aceita
        // e usuário é direcionado para definir nova senha
        if (user?.password === '' || user?.password === null) {
            manager.data.currentUser = id;
            manager.saveData();
            alert('Sua senha foi redefinida. Por favor, cadastre uma nova senha.');
            App.render(App.views.ChangePassword);
            return;
        }

        const userPass = user?.password || 'Essencio123';
        if (pass !== userPass) return alert('Senha de acesso incorreta para este usuário!');

        manager.data.currentUser = id;
        manager.saveData();
        App.render(App.views.Dashboard);
    },

    logout() {
        if (confirm("Sair?")) { manager.data.currentUser = null; App.render(App.views.Login); }
    },

    async submitChangePassword() {
        const newPass = document.getElementById('new-self-pass').value;
        if (newPass.length < 4) return alert("Senha muito curta!");
        const uIdx = manager.data.drivers.findIndex(d => d.id == manager.data.currentUser);
        if (uIdx !== -1) {
            manager.data.drivers[uIdx].password = newPass;
            await manager.saveData();
            alert("Senha alterada com sucesso!");
            App.render(App.views.Dashboard);
        }
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
        // Remove qualquer input anterior para evitar duplicidade
        const existing = document.getElementById('camera-input');
        if (existing) existing.remove();

        // Cria input de arquivo — setAttribute garante compatibilidade com iOS e Android
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.setAttribute('capture', 'environment'); // câmera traseira no celular
        input.setAttribute('id', 'camera-input');
        input.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;width:1px;height:1px';
        document.body.appendChild(input);

        input.addEventListener('change', () => {
            const file = input.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                const preview = document.getElementById('photo-preview');
                if (preview) {
                    preview.innerHTML = `<img src="${e.target.result}" style="width:100%; height:100%; object-fit:cover">`;
                }
                App.currentPhoto = 'photo_' + Date.now();
                App.currentPhotoFile = file;
            };
            reader.readAsDataURL(file);
            input.remove();
        });

        // Disparo direto — precisa estar na mesma pilha de evento do usuário
        input.click();
    },

    async submitCheckIn() {
        const vId = document.getElementById('vehicle-select').value;
        const vehicle = manager.data.vehicles.find(v => v.id == vId);
        const val = vehicle.type === 'boat' ? vehicle.lastVal : parseFloat(document.getElementById('start-val').value);
        if (!App.currentPhoto || isNaN(val)) return alert('Preencha o KM e registre a foto do painel!');
        // Valida que o KM não é menor que o último registrado
        if (vehicle.type === 'car' && val < (vehicle.lastVal || 0)) {
            return alert(`⚠️ KM inválido!\nO KM informado (${val}) é menor que o último registro (${vehicle.lastVal}).\nVerifique e informe o KM correto.`);
        }
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

    calcFuelMetrics(vehicleId, fuelEntry, allFuelLogs) {
        const logs = allFuelLogs || manager.data.fuelLogs || [];
        const vehicle = manager.data.vehicles.find(v => v.id == vehicleId);
        const isBoat = vehicle?.type === 'boat';
        const unit = isBoat ? 'L/h' : 'KM/L';

        // Encontra o abastecimento completo anterior para calcular o período
        const sortedLogs = logs.filter(l => l.vehicleId == vehicleId).sort((a, b) => new Date(a.date) - new Date(b.date));
        const idx = sortedLogs.findIndex(l => l.id === fuelEntry.id);
        let periodFrom = '—', periodTo = '—', dateFrom = '—', dateTo = '—', avgThis = '—';

        if (fuelEntry.isFull && idx > 0) {
            // Busca abastecimento full anterior
            let prevFullIdx = -1;
            for (let i = idx - 1; i >= 0; i--) {
                if (sortedLogs[i].isFull) { prevFullIdx = i; break; }
            }
            if (prevFullIdx >= 0) {
                const prev = sortedLogs[prevFullIdx];
                const kmDiff = fuelEntry.val - prev.val;
                // Soma litros entre os dois abastecimentos full (inclusive o atual)
                let totalLiters = 0;
                for (let i = prevFullIdx + 1; i <= idx; i++) totalLiters += parseFloat(sortedLogs[i].liters);
                periodFrom = prev.val;
                periodTo = fuelEntry.val;
                dateFrom = new Date(prev.date).toLocaleDateString();
                dateTo = new Date(fuelEntry.date).toLocaleDateString();
                if (totalLiters > 0) {
                    avgThis = isBoat ? (totalLiters / (kmDiff / 1)).toFixed(2) : (kmDiff / totalLiters).toFixed(2);
                }
            }
        }

        // Média histórica: usa todos os pares de abastecimentos full
        let avgHistoric = '—';
        const fullLogs = sortedLogs.filter(l => l.isFull);
        if (fullLogs.length >= 2) {
            let totalKm = 0, totalL = 0;
            for (let i = 1; i < fullLogs.length; i++) {
                totalKm += fullLogs[i].val - fullLogs[i - 1].val;
                totalL += parseFloat(fullLogs[i].liters);
            }
            if (totalL > 0) avgHistoric = isBoat ? (totalL / (totalKm / 1)).toFixed(2) : (totalKm / totalL).toFixed(2);
        }

        return { periodFrom, periodTo, dateFrom, dateTo, avgThis, avgHistoric, unit };
    },

    renderAdminLogs() {
        const fuelLogs = manager.data.fuelLogs || [];
        const usageLogs = manager.data.usageLogs || [];
        const fuel = fuelLogs.slice().reverse();
        const usage = usageLogs.slice().reverse();

        let h = `<h4 style="margin-bottom:8px">⛽ Abastecimentos</h4>`;
        h += `<div class="log-table-wrap">`;
        h += `<table class="log-table"><thead><tr>
            <th>Data</th><th>Veículo</th><th>Motorista</th><th>KM/h</th><th>Litros</th><th>R$</th>
            <th>KM De</th><th>KM Até</th><th>Data De</th><th>Data Até</th>
            <th>Média Abast.</th><th>Média Hist.</th>
        </tr></thead><tbody>`;
        if (fuel.length === 0) {
            h += `<tr><td colspan="12" style="text-align:center;color:var(--text-muted)">Nenhum registro</td></tr>`;
        } else {
            h += fuel.map(l => {
                const v = manager.data.vehicles.find(v => v.id == l.vehicleId);
                const d = manager.data.drivers.find(d => d.id == l.driverId);
                const m = App.calcFuelMetrics(l.vehicleId, l, fuelLogs);
                return `<tr>
                    <td>${new Date(l.date).toLocaleString()}</td>
                    <td>${v?.name || '—'}</td>
                    <td>${d?.name || '—'}</td>
                    <td>${l.val}</td>
                    <td>${l.liters}</td>
                    <td>R$ ${l.total}</td>
                    <td>${m.periodFrom}</td>
                    <td>${m.periodTo}</td>
                    <td>${m.dateFrom}</td>
                    <td>${m.dateTo}</td>
                    <td>${m.avgThis} ${m.avgThis !== '—' ? m.unit : ''}</td>
                    <td>${m.avgHistoric} ${m.avgHistoric !== '—' ? m.unit : ''}</td>
                </tr>`;
            }).join('');
        }
        h += `</tbody></table></div>`;

        h += `<h4 style="margin:16px 0 8px">🚗 Uso de Veículos</h4>`;
        h += `<div class="log-table-wrap">`;
        h += `<table class="log-table"><thead><tr>
            <th>Veículo</th><th>Motorista</th><th>Início</th><th>Fim</th><th>KM/h Percorrido</th>
        </tr></thead><tbody>`;
        if (usage.length === 0) {
            h += `<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">Nenhum registro</td></tr>`;
        } else {
            h += usage.map(l => {
                const v = manager.data.vehicles.find(v => v.id == l.vehicleId);
                const d = manager.data.drivers.find(d => d.id == l.driverId);
                return `<tr>
                    <td>${v?.name || '—'}</td>
                    <td>${d?.name || '—'}</td>
                    <td>${new Date(l.startTime).toLocaleString()}</td>
                    <td>${new Date(l.endTime).toLocaleString()}</td>
                    <td>${l.sessionDiff}</td>
                </tr>`;
            }).join('');
        }
        h += `</tbody></table></div>`;
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
        h += `
            <div style="display:grid; gap:5px; margin-bottom:15px">
                <input id="new-d-name" placeholder="Nome Completo">
                <input type="password" id="new-d-pass" placeholder="Senha Inicial">
                <button onclick="App.submitAddDriver()" class="btn-small">Adicionar Usuário</button>
            </div>
            <h4>Usuários Cadastrados</h4>
        `;
        h += manager.data.drivers.map(d => `
            <div class="admin-item">
                <span>${d.name} (${d.isAdmin ? 'Admin' : 'Motor'})${(!d.password && d.password !== undefined) || d.password === '' ? ' <span style="color:var(--danger);font-size:0.7rem">[sem senha]</span>' : ''}</span>
                <div style="display:flex; gap:5px">
                    <button class="secondary btn-small" onclick="App.toggleUserAdmin(${d.id})" style="font-size:0.7rem">Usuário / Adm</button>
                    <button class="secondary btn-small" onclick="App.resetDriverPassword(${d.id})" style="width:35px; cursor:pointer" title="Apagar senha">🔑</button>
                    <button class="danger btn-small" onclick="App.deleteDriver(${d.id})" style="width:35px; cursor:pointer" title="Excluir">🗑️</button>
                </div>
            </div>
        `).join('');
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
        const pass = document.getElementById('new-d-pass').value;
        if (!name) return alert("Digite o nome");
        await manager.addDriver(name, pass);
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

    async resetDriverPassword(id) {
        const d = manager.data.drivers.find(d => d.id == id);
        if (!d) return;
        if (confirm(`Apagar a senha de "${d.name}"?\n\nNo próximo acesso, o usuário será solicitado a cadastrar uma nova senha.`)) {
            d.password = '';
            await manager.saveData();
            App.switchAdminTab('drivers');
        }
    },

    showExportModal() {
        const vehicles = manager.data.vehicles || [];
        const drivers = manager.data.drivers || [];
        const vehicleOpts = vehicles.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
        const driverOpts = drivers.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
        App.showModal(`
            <h3 style="margin-bottom:15px">📊 Exportar Excel</h3>
            <div class="form-group">
                <label>Veículo</label>
                <select id="exp-vehicle" style="margin-bottom:0">
                    <option value="">Todos os veículos</option>
                    ${vehicleOpts}
                </select>
            </div>
            <div class="form-group">
                <label>Motorista</label>
                <select id="exp-driver" style="margin-bottom:0">
                    <option value="">Todos os motoristas</option>
                    ${driverOpts}
                </select>
            </div>
            <div class="form-group">
                <label>Data Início</label>
                <input type="date" id="exp-date-from" style="margin-bottom:0">
            </div>
            <div class="form-group">
                <label>Data Fim</label>
                <input type="date" id="exp-date-to" style="margin-bottom:0">
            </div>
            <button onclick="App.doExport()" style="margin-top:10px">Exportar</button>
        `);
    },

    doExport() {
        const vehicleId = document.getElementById('exp-vehicle').value;
        const driverId = document.getElementById('exp-driver').value;
        const dateFrom = document.getElementById('exp-date-from').value;
        const dateTo = document.getElementById('exp-date-to').value;
        App.closeModal();
        manager.exportExcelFiltered({ vehicleId, driverId, dateFrom, dateTo });
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
